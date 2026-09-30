/* ui-motion-reel engine
 * One shape, never cut. Every value is a spring stepped at 8x the frame rate, simulated once
 * up front, then rendered deterministically per frame (window.renderFrame(f)). The score and
 * UI sound design are scheduled from the same timeline (window.renderAudio()).
 *
 * A scene calls Reel.define(config). See references/api.md for the full config reference.
 */
(function () {
  'use strict';

  /* ---------------- math ---------------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  // Analytic spring step response. zeta < 1 overshoots slightly (0.86 is ~1%); zeta = 1 is critically damped.
  function sp(t, w = 16, z = 0.86) {
    if (t <= 0) return 0;
    if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  // Smootherstep: used only for scripted paths (cursor drags, reveal wipes), never for UI state.
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
  const hex = (h) => { const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb = (a) => `rgb(${a.map((v) => Math.round(v)).join(',')})`;
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

  /* ---------------- icons: one 24 grid, one stroke weight ---------------- */
  const ICONS = {
    camera: '<path d="M4 8.5h2.6l1.7-2.6h7.4l1.7 2.6H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    external: '<path d="M8 16L16 8M9.5 8H16v6.5"/>',
    shield: '<path d="M12 3l7.5 3v5.6c0 4.6-3.2 8-7.5 9.4-4.3-1.4-7.5-4.8-7.5-9.4V6L12 3Z"/><path d="M8.8 12.2l2.3 2.3 4.2-4.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.2 2.2M14.8 14.8L17 17M17 7l-2.2 2.2M9.2 14.8L7 17"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 14.5h3"/>',
    chart: '<path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7"/>',
    send: '<path d="M4 12l16-7-5.5 16-3-6.5L4 12Z"/>',
  };
  function icon(name, size = 24, stroke = 1.75) {
    return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" style="stroke-width:${stroke}">${ICONS[name] || ''}</svg>`;
  }
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 24, +(el.dataset.stroke || 1.75));
      el.style.display = 'inline-flex';
    });
  }

  /* ---------------- odometer counter ---------------- */
  function odo(el, template) {
    el.innerHTML = [...template].map((ch) => (/\d/.test(ch)
      ? `<span class="col" style="display:flex;flex-direction:column">${'01234567890'.split('').map((d) => `<span style="display:block;text-align:center">${d}</span>`).join('')}</span>`
      : `<span style="display:block">${ch}</span>`)).join('');
    el.style.display = 'inline-flex'; el.style.overflow = 'hidden';
    el._cols = [...el.querySelectorAll('.col')];
  }
  function setOdo(el, value, decimals, lineH) {
    const n = el._cols.length, N = Math.max(0, value) * 10 ** decimals;
    for (let i = 0; i < n; i++) {
      const p = 10 ** (n - 1 - i);
      const pos = p === 1 ? N % 10 : (Math.floor(N / p) % 10) + clamp((N % p) - (p - 1));
      el._cols[i].style.transform = `translateY(${-pos * lineH}px)`;
    }
  }

  /* ============================================================ */
  function define(cfg) {
    const FPS = cfg.fps || 60, DUR = cfg.duration || 60, N = Math.round(FPS * DUR), BPM = cfg.bpm || 120;
    const [VW, VH] = cfg.size || [1920, 1080];
    const SUB = 8, dt = 1 / (FPS * SUB);
    const FILLS = Object.fromEntries(Object.entries(cfg.fills || { ink: '#0b0b0b', paper: '#ffffff' }).map(([k, v]) => [k, Array.isArray(v) ? v : hex(v)]));
    const HOME = cfg.cursorHome || [240, 120];
    const LEAN = cfg.camLean ?? 0.045;
    const SPR = Object.assign({ size: [15, 0.86], radius: [15, 0.9], fill: [30, 1], zoomOut: 12, zoomIn: 7, cursor: [11, 1], press: 45, lean: [7, 1] }, cfg.springs || {});
    const shadow = cfg.shadow || '0 0 0 1px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.05), 0 24px 56px -18px rgba(0,0,0,.28)';
    const PLAN = cfg.states.map((s) => ({ advance: 'click', ...s, content: s.content || s.id }));
    let t0 = 0;
    PLAN.forEach((s, i) => { s.t0 = t0; if (s.dur == null) s.dur = DUR - t0; if (i === PLAN.length - 1) s.advance = 'none'; t0 += s.dur; });
    if (Math.abs(t0 - DUR) > 1e-6) console.warn('[reel] states add up to', t0, 'not', DUR);

    const world = document.getElementById('world');
    const shape = document.getElementById('shape');
    const cursor = document.getElementById('cursor');
    const contents = {};
    document.querySelectorAll('.content').forEach((el) => {
      const w = +el.dataset.w, h = +el.dataset.h;
      Object.assign(el.style, { width: w + 'px', height: h + 'px', marginLeft: -w / 2 + 'px', marginTop: -h / 2 + 'px', display: 'none' });
      contents[el.id.replace(/^c-/, '')] = el;
    });
    const el = (id) => document.getElementById(id.replace(/^#/, ''));

    /* ---------- measure every id'd element in world units (shape centre = origin) ---------- */
    const M = {};
    function measure(s) {
      world.style.transform = 'none';
      Object.assign(shape.style, { left: -s.w / 2 + 'px', top: -s.h / 2 + 'px', width: s.w + 'px', height: s.h + 'px' });
      Object.values(contents).forEach((c) => (c.style.display = 'none'));
      const c = contents[s.content];
      if (!c) throw new Error('[reel] no .content with id c-' + s.content);
      Object.assign(c.style, { display: 'block', transform: 'none', filter: 'none', opacity: 1 });
      const base = world.getBoundingClientRect();
      c.querySelectorAll('[id]').forEach((n) => {
        const r = n.getBoundingClientRect();
        M['#' + n.id] = { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2, w: r.width, h: r.height, state: s.id, left: r.left - base.left, top: r.top - base.top };
      });
    }

    /* ---------- cursor script ---------- */
    let MOVES = [], PRESSES = [], DRAGS = [], HOLDS = [], CLICKS = [];
    const resolve = (target, stateId) => {
      if (Array.isArray(target)) return target;
      if (typeof target === 'string') target = { sel: target };
      if (target.along) { const m = M[target.along]; if (!m) throw new Error('[reel] measure missing ' + target.along); return [m.left + m.w * (target.f ?? 0.5) + (target.dx || 0), m.y + (target.dy || 0)]; }
      const m = M[target.sel];
      if (!m) throw new Error(`[reel] measure missing ${target.sel} (state ${stateId})`);
      return [m.x + (target.dx || 0), m.y + (target.dy || 0)];
    };
    function buildScript() {
      MOVES = [{ t: 0, to: HOME }]; PRESSES = []; DRAGS = []; HOLDS = []; CLICKS = [];
      PLAN.forEach((s, i) => {
        for (const ev of s.cursor || []) {
          const [kind, a] = ev, t = s.t0 + a;
          if (kind === 'move') MOVES.push({ t, to: resolve(ev[2], s.id) });
          else if (kind === 'click') { PRESSES.push([t, t + 0.11]); CLICKS.push({ t, state: s.id }); }
          else if (kind === 'drag') {
            const d = { t0: t, t1: s.t0 + ev[2], from: resolve(ev[3], s.id), to: resolve(ev[4], s.id), state: s.id };
            DRAGS.push(d); PRESSES.push([t - 0.06, d.t1 + 0.06]);
            MOVES.push({ t: d.t1 + 0.1, to: d.to }); // the pointer stays where it dropped
          }
          else if (kind === 'hold') { HOLDS.push({ t0: t, t1: s.t0 + ev[2], state: s.id }); PRESSES.push([t, s.t0 + ev[2]]); }
        }
        if (s.advance === 'click' && i < PLAN.length - 1) {
          const te = s.t0 + s.dur;
          PRESSES.push([te - 0.13, te - 0.02]); CLICKS.push({ t: te - 0.13, state: s.id, advances: true });
        }
      });
      MOVES.sort((a, b) => a.t - b.t);
    }
    const stateAt = (t) => { let k = 0; for (let i = 0; i < PLAN.length; i++) if (PLAN[i].t0 <= t + 1e-9) k = i; return k; };
    function cursorTarget(t) {
      for (const d of DRAGS) if (t >= d.t0 && t <= d.t1 + 0.1) { const k = ease((t - d.t0) / (d.t1 - d.t0)); return [lerp(d.from[0], d.to[0], k), lerp(d.from[1], d.to[1], k)]; }
      let to = HOME;
      for (const e of MOVES) if (e.t <= t) to = e.to;
      return to;
    }
    const pressedAt = (t) => PRESSES.some(([a, b]) => t >= a && t <= b);
    const inside = (m, x, y, pad = 2) => m && Math.abs(x - m.x) <= m.w / 2 + pad && Math.abs(y - m.y) <= m.h / 2 + pad;
    const HOVER = cfg.hover || [];
    const PRESSABLE = [...new Set(HOVER.concat(cfg.press || []))];

    /* ---------- simulation ---------- */
    const ch = {};
    const C = (name, x, w, z = 1) => (ch[name] = { x, v: 0, tg: x, w, z });
    const step = (c) => { const acc = c.w * c.w * (c.tg - c.x) - 2 * c.z * c.w * c.v; c.v += acc * dt; c.x += c.v * dt; };
    const CUSTOM = cfg.channels || {};
    let FRAMES = [];
    const clickLog = []; // resolved clicks: {t, state, sel}

    function api(t) {
      const si = stateAt(t), s = PLAN[si];
      return {
        t, si, state: s.id, lt: t - s.t0, last: si === PLAN.length - 1,
        cursor: { x: ch.cx.x, y: ch.cy.x }, pressed: pressedAt(t), M,
        dragging: (stateId) => DRAGS.find((d) => (!stateId || d.state === stateId) && t >= d.t0 && t <= d.t1 + 0.06) || null,
        dragFrac: (sel) => { const m = M[sel]; return clamp((ch.cx.x - m.left) / m.w); },
        clicked: (sel) => clickLog.some((c) => c.t <= t && c.sel === sel),
        clickedIn: (stateId, n = 1) => clickLog.filter((c) => c.t <= t && c.state === stateId).length >= n,
        holding: () => HOLDS.find((h) => t >= h.t0 && t <= h.t1) || null,
        holdProgress: (stateId) => { const h = HOLDS.find((x) => x.state === stateId); return h ? clamp((t - h.t0) / (h.t1 - h.t0 - 0.1)) : 0; },
        hovering: (sel) => inside(M[sel], ch.cx.x, ch.cy.x),
      };
    }

    const fillName = (s, a) => (typeof s.fill === 'function' ? s.fill(a) : s.fill);
    function simulate() {
      buildScript();
      const s0 = PLAN[0];
      C('cx', HOME[0], ...SPR.cursor); C('cy', HOME[1], ...SPR.cursor); C('press', 0, SPR.press, 1);
      const f0 = FILLS[fillName(s0, api(0))];
      C('w', s0.w, ...SPR.size); C('h', s0.h, ...SPR.size); C('r', s0.r, ...SPR.radius);
      C('fr', f0[0], ...SPR.fill); C('fg', f0[1], ...SPR.fill); C('fb', f0[2], ...SPR.fill);
      C('zoom', s0.zoom, SPR.zoomIn, 1); C('camx', LEAN * HOME[0], ...SPR.lean); C('camy', LEAN * HOME[1], ...SPR.lean);
      for (const [k, c] of Object.entries(CUSTOM)) C(k, c.init ?? 0, c.w ?? 18, c.z ?? 1);
      HOVER.forEach((h) => C('hv' + h, 0, 22, 1));
      FRAMES = []; clickLog.length = 0;
      let nextClick = 0;
      const clicksSorted = [...CLICKS].sort((a, b) => a.t - b.t);
      for (let f = 0; f < N; f++) {
        for (let k = 0; k < SUB; k++) {
          const t = f / FPS + k * dt, si = stateAt(t), s = PLAN[si];
          // resolve which element each click lands on, from the cursor's simulated position
          while (nextClick < clicksSorted.length && clicksSorted[nextClick].t <= t) {
            const c = clicksSorted[nextClick++];
            const sel = PRESSABLE.find((p) => M[p] && M[p].state === c.state && inside(M[p], ch.cx.x, ch.cy.x)) || null;
            clickLog.push({ t: c.t, state: c.state, sel, advances: !!c.advances });
          }
          const fc = FILLS[fillName(s, api(t))];
          if (!fc) throw new Error(`[reel] unknown fill in state ${s.id}`);
          ch.w.tg = s.w; ch.h.tg = s.h; ch.r.tg = s.r; ch.zoom.tg = s.zoom;
          ch.zoom.w = s.zoom < ch.zoom.x ? SPR.zoomOut : SPR.zoomIn; // pull out fast when growing, push in gently
          ch.fr.tg = fc[0]; ch.fg.tg = fc[1]; ch.fb.tg = fc[2];
          const [tx, ty] = cursorTarget(t);
          ch.cx.tg = tx; ch.cy.tg = ty;
          ch.camx.tg = LEAN * ch.cx.x; ch.camy.tg = LEAN * ch.cy.x;
          ch.press.tg = pressedAt(t) ? 1 : 0;
          const a = api(t);
          for (const [k, c] of Object.entries(CUSTOM)) {
            if (a.last && c.reset !== false) { ch[k].tg = c.init ?? 0; continue; } // final state mirrors the first
            const v = c.target ? c.target(a) : null;
            if (v !== null && v !== undefined) ch[k].tg = v;
          }
          for (const h of HOVER) ch['hv' + h].tg = M[h] && M[h].state === s.id && a.lt > 0.3 && inside(M[h], ch.cx.x, ch.cy.x) ? 1 : 0;
          Object.values(ch).forEach(step);
        }
        const snap = {}; for (const k in ch) snap[k] = ch[k].x; FRAMES.push(snap);
      }
      // seamless loop: pin the last 0.4 s onto frame 0 (the springs are already within a pixel)
      const first = FRAMES[0], L = Math.round(0.4 * FPS);
      for (let f = N - L; f < N; f++) { const k = ease((f - (N - L)) / (L - 1)); for (const key in first) FRAMES[f][key] = lerp(FRAMES[f][key], first[key], k); }
    }

    /* ---------- render ---------- */
    function contentVis(i, t) {
      const s = PLAN[i], next = PLAN[i + 1];
      const kin = i === 0 || (!next && t >= DUR - 0.4) ? 1 : sp(t - (s.t0 + 0.1), 17, 1);
      const kout = next ? clamp((t - next.t0) / 0.11) : 0;
      return { k: kin * (1 - kout), blurIn: (1 - kin) * 10, blurOut: kout * 10, active: t >= s.t0 - 1e-9 && (!next || t < next.t0 + 0.12) };
    }
    const UPDATE = cfg.update || {};
    function apply(f) {
      const t = f / FPS, S = FRAMES[f], si = stateAt(t), zoom = S.zoom, sid = PLAN[si].id;
      world.style.transform = `translate(${VW / 2 - S.camx * zoom}px, ${VH / 2 - S.camy * zoom}px) scale(${zoom})`;
      const overShape = Math.abs(S.cx) <= S.w / 2 && Math.abs(S.cy) <= S.h / 2;
      const onButton = PRESSABLE.some((h) => M[h] && M[h].state === sid && inside(M[h], S.cx, S.cy));
      Object.assign(shape.style, {
        left: -S.w / 2 + 'px', top: -S.h / 2 + 'px', width: S.w + 'px', height: S.h + 'px',
        borderRadius: Math.min(S.r, S.w / 2, S.h / 2) + 'px', background: rgb([S.fr, S.fg, S.fb]),
        transform: `scale(${1 - 0.028 * (overShape && !onButton ? S.press : 0)})`, boxShadow: typeof shadow === 'function' ? shadow(S, t) : shadow,
      });
      const vis = {};
      PLAN.forEach((p, i) => { const v = contentVis(i, t); if (v.active && (!vis[p.content] || v.k > vis[p.content].k)) vis[p.content] = { ...v, i }; });
      const helpers = { el, sp, ease, clamp, lerp, mix, rgb, setOdo, hover: (sel) => S['hv' + sel] || 0, fill: (name) => FILLS[name], t };
      for (const id in contents) {
        const c = contents[id], v = vis[id];
        if (!v || v.k <= 0.001) { c.style.display = 'none'; continue; }
        c.style.display = 'block'; c.style.opacity = v.k;
        const blur = Math.max(v.blurIn, v.blurOut);
        c.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
        const kk = Math.min(1, v.k + v.blurOut / 10);
        c.style.transform = `translateY(${(1 - kk) * 8}px) scale(${0.985 + 0.015 * kk})`;
        const fn = UPDATE[PLAN[v.i].id] || UPDATE[id];
        if (fn) fn(t - PLAN[v.i].t0, S, helpers);
      }
      for (const h of PRESSABLE) {
        const m = M[h], n = el(h);
        if (!m || !n) continue;
        const hv = S['hv' + h] || 0;
        const pressed = m.state === sid && inside(m, S.cx, S.cy) ? S.press : 0;
        const bg = n.querySelector('[data-hover-bg]');
        if (bg) { bg.style.opacity = hv; continue; } // rows: fade a highlight instead of scaling
        n.style.transform = `scale(${1 - 0.04 * pressed})`;
        if (!HOVER.includes(h)) continue; // toggles and segments own their colours
        const base = n.dataset.base || (n.dataset.base = getComputedStyle(n).backgroundColor);
        const transparent = /rgba\([^)]*,\s*0\)$/.test(base) || base === 'transparent';
        if (hv > 0.001 && base.startsWith('rgb') && !transparent) {
          const c = base.match(/\d+/g).map(Number).slice(0, 3);
          const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
          n.style.background = rgb(mix(c, lum > 0.5 ? mix(c, [0, 0, 0], 0.12) : mix(c, [255, 255, 255], 0.14), hv));
        } else n.style.background = '';
      }
      if (cfg.frame) cfg.frame(t, S, helpers); // global per-frame hook: canvas colour, theme flips, overlays
      const sx = VW / 2 + (S.cx - S.camx) * zoom, sy = VH / 2 + (S.cy - S.camy) * zoom;
      cursor.style.transform = `translate(${sx - 8.2}px, ${sy - 5.3}px) scale(${1 - 0.1 * S.press})`;
    }

    /* ---------- boot ---------- */
    const reel = { PLAN, FRAMES: () => FRAMES, M, FPS, N, BPM, DUR, stateAt, at: (id) => PLAN.find((p) => p.id === id).t0, PRESSES: () => PRESSES, HOLDS: () => HOLDS, clicks: () => clickLog };
    window.READY = (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((im) => (im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 50));
      const seen = new Set();
      for (const s of PLAN) if (!seen.has(s.content)) { measure(s); seen.add(s.content); }
      Object.values(contents).forEach((c) => { c.style.display = 'none'; c.style.transform = ''; });
      simulate();
      window.renderFrame = (f) => apply(Math.max(0, Math.min(N - 1, f)));
      window.TOTAL_FRAMES = N; window.FPS = FPS; window.__starts = PLAN.slice(1).map((s) => s.t0);
      const q = new URLSearchParams(location.search);
      apply(q.has('t') ? Math.round(+q.get('t') * FPS) : 0);
      if (q.has('play')) { const st = performance.now(); const loop = () => { apply(Math.floor((((performance.now() - st) / 1000) * FPS) % N)); requestAnimationFrame(loop); }; loop(); }
      return true;
    })();
    window.renderAudio = () => (window.ReelScore ? window.ReelScore.render(reel, cfg.score || {}, cfg.sfx) : Promise.reject(new Error('score.js not loaded')));
    return reel;
  }

  window.Reel = { define, sp, ease, clamp, lerp, mix, rgb, hex, icon, ICONS, hydrateIcons, odo, setOdo };
})();
