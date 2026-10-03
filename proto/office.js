// Outlay office prototype. The scene, characters and UI are real; the money events are
// SIMULATED. In the product every event comes from an Arc transaction via the chain watcher.
(async () => {
  const W = 1344, H = 752;
  const A = '../assets';

  // ---------------------------------------------------------------- cast & layout
  const WORKERS = [
    { id: 'scout', role: 'Scout', css: '#d9a520', buys: [['Serper search', 0.002], ['Exa search', 0.007]], q: 1.9, desk: [225, 540] },
    { id: 'researcher', role: 'Researcher', css: '#b0394f', buys: [['Exa contents', 0.001], ['BlockRun LLM', 0.003]], q: 1.6, desk: [420, 540] },
    { id: 'writer', role: 'Writer', css: '#e8735f', buys: [['BlockRun LLM', 0.003]], q: 1.4, desk: [990, 540] },
    { id: 'auditor', role: 'Auditor', css: '#8a55a8', buys: [['BlockRun LLM (other family)', 0.003]], q: 1.2, desk: [1195, 540], fixed: true },
    { id: 'illustrator', role: 'Illustrator', css: '#9b84d6', buys: [['BlockRun image', 0.042]], q: 1.1, desk: [118, 742] },
    { id: 'verifier', role: 'Verifier', css: '#7fb8e6', buys: [['APEX email verify', 0.001]], q: 2.3, desk: [305, 742] },
    { id: 'mailer', role: 'Mailer', css: '#f07a1a', buys: [['AgentMail send', 0.01]], q: 0.35, desk: [492, 742] },
    { id: 'reader', role: 'Reader', css: '#8a9a40', buys: [['APEX web read', 0.003], ['APEX PDF→text', 0.003]], q: 1.5, desk: [679, 742] },
    { id: 'analyst', role: 'Analyst', css: '#3a62e0', buys: [['CRA chain data', 0.002], ['CoinGecko via AIsa', 0.012]], q: 1.7, desk: [866, 742] },
    { id: 'messenger', role: 'Messenger', css: '#d23a2e', buys: [['SMS', 0.03]], q: 0.9, desk: [1053, 742] },
  ];
  const CFO_HOME = { x: 672, y: 442 };
  const VAULT = { x: 1262, y: 232 };
  const STALL = { x: 1252, y: 746 };
  const STALL_TRAY = { x: 1232, y: 630 };
  const BOSS_DOOR = { x: 40, y: 418 };
  const CHAR_SCALE = 0.42, DESK_SCALE = 0.21, STALL_SCALE = 0.2;
  const SEAT_DX = 26, SEAT_DY = -138, STAND_OFFSET = 100; // relative to desk bottom-centre
  const WF = { idle: 0, walkA: 1, walkB: 2, type: 3, cheer: 4, sad: 5, box: 6, coin: 7 };
  const CF = { idle: 0, walkA: 1, walkB: 2, talk: 3, stamp: 4, stern: 5, thumbs: 6, deny: 7 };
  const EPOCH_MS = 16000;

  // ---------------------------------------------------------------- pixi setup
  await document.fonts.ready;
  const app = new PIXI.Application();
  await app.init({ width: W, height: H, background: 0x0d0f12, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
  document.getElementById('stage').appendChild(app.canvas);

  async function loadFrames(dir, id) {
    const meta = await (await fetch(`${A}/${dir}/${id}.json`)).json();
    const tex = await Promise.all(meta.frames.map((f) => PIXI.Assets.load(`${A}/${dir}/${f.file}`)));
    return { meta, tex };
  }
  const [bgTex, deskFrames, stallFrames, ...charFrames] = await Promise.all([
    PIXI.Assets.load(`${A}/scene/office-bg.png`),
    loadFrames('scene', 'desk'), loadFrames('scene', 'stall'),
    ...[...WORKERS.map((w) => w.id), 'cfo'].map((id) => loadFrames(`sprites/${id}`, id)),
  ]);
  const chars = Object.fromEntries([...WORKERS.map((w) => w.id), 'cfo'].map((id, i) => [id, charFrames[i]]));

  const world = new PIXI.Container(); app.stage.addChild(world);
  const bg = new PIXI.Sprite(bgTex); bg.width = W; bg.height = H; world.addChild(bg);

  // gradient helper textures
  function radialTex(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size); return PIXI.Texture.from(c);
  }
  const glowTex = radialTex(256, [[0, 'rgba(255,214,140,0.55)'], [0.4, 'rgba(255,190,110,0.18)'], [1, 'rgba(255,190,110,0)']]);
  const dotTex = radialTex(32, [[0, 'rgba(255,240,210,1)'], [1, 'rgba(255,240,210,0)']]);

  // ambient: lamp glows + dust motes in the sunbeams
  const ambient = new PIXI.Container(); world.addChild(ambient);
  const lamps = [[287, 70], [672, 70], [1057, 70]].map(([x, y]) => {
    const s = new PIXI.Sprite(glowTex); s.anchor.set(0.5); s.position.set(x, y + 20); s.scale.set(1.3); s.blendMode = 'add'; ambient.addChild(s); return s;
  });
  const motes = Array.from({ length: 46 }, () => {
    const s = new PIXI.Sprite(dotTex); s.anchor.set(0.5); s.blendMode = 'add';
    s.position.set(Math.random() * 1000, 120 + Math.random() * 520); s.scale.set(0.08 + Math.random() * 0.14);
    s.alpha = 0.15 + Math.random() * 0.35; s.vx = 0.05 + Math.random() * 0.15; s.vy = -0.03 - Math.random() * 0.08; s.ph = Math.random() * 6;
    ambient.addChild(s); return s;
  });

  const floorLayer = new PIXI.Container(); floorLayer.sortableChildren = true; world.addChild(floorLayer);
  const fx = new PIXI.Container(); world.addChild(fx);
  const vignette = new PIXI.Sprite(radialTex(512, [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(6,5,4,0.55)']]));
  vignette.width = W * 1.25; vignette.height = H * 1.45; vignette.anchor.set(0.5); vignette.position.set(W / 2, H / 2 - 20); world.addChild(vignette);
  const hud = new PIXI.Container(); app.stage.addChild(hud);

  const txt = (text, style) => new PIXI.Text({ text, style: { fontFamily: 'Inter', ...style } });

  // stall (x402 vendors)
  const stall = new PIXI.Sprite(stallFrames.tex[0]); stall.anchor.set(0.5, 1); stall.scale.set(STALL_SCALE);
  stall.position.set(STALL.x, STALL.y); stall.zIndex = STALL.y; floorLayer.addChild(stall);
  const stallSign = new PIXI.Container();
  const ss = txt('AGORA · x402', { fontSize: 11, fontWeight: '800', fill: 0x0e2a27, letterSpacing: 1.5 }); ss.anchor.set(0.5);
  stallSign.addChild(new PIXI.Graphics().roundRect(-52, -11, 104, 22, 11).fill(0x7fd6c8).stroke({ width: 2, color: 0xf0cf85 }), ss);
  stallSign.position.set(STALL.x - 8, STALL.y - 222); stallSign.zIndex = STALL.y + 1; floorLayer.addChild(stallSign);

  // vault label
  const vaultTag = new PIXI.Container();
  const vtxt = txt('', { fontSize: 13, fontWeight: '700', fill: 0xf0cf85, fontFamily: 'JetBrains Mono' }); vtxt.anchor.set(0.5);
  const vcap = txt('TREASURY', { fontSize: 9, fontWeight: '800', fill: 0xc9c1ae, letterSpacing: 2 }); vcap.anchor.set(0.5); vcap.y = -15;
  vaultTag.addChild(new PIXI.Graphics().roundRect(-62, -26, 124, 44, 10).fill({ color: 0x121418, alpha: 0.78 }).stroke({ width: 1.5, color: 0xd6ad57 }), vcap, vtxt);
  vaultTag.position.set(VAULT.x - 2, 84); hud.addChild(vaultTag);
  const bossTag = new PIXI.Container();
  const btxt = txt('THE BOSS', { fontSize: 10, fontWeight: '800', fill: 0xefe8d8, letterSpacing: 2 }); btxt.anchor.set(0.5);
  bossTag.addChild(new PIXI.Graphics().roundRect(-44, -12, 88, 24, 12).fill({ color: 0x121418, alpha: 0.75 }), btxt);
  bossTag.position.set(65, 44); hud.addChild(bossTag);

  // ---------------------------------------------------------------- state
  const S = {
    treasury: 18.4, spent: 0, pays: 0, epoch: 41, nextReview: performance.now() + 2500, inbox: [], decisions: [],
    agreeYes: 0, agreeTotal: 0, dupBlocked: 0,
  };
  const byId = {};

  // ---------------------------------------------------------------- actors
  class Actor {
    constructor(id, frames, x, y, scale) {
      this.id = id; this.c = chars[id]; this.F = frames; this.scale = scale;
      this.box = new PIXI.Container(); this.box.position.set(x, y);
      this.shadow = new PIXI.Graphics().ellipse(0, 0, 30, 8).fill({ color: 0x1a0f05, alpha: 0.32 });
      this.sprite = new PIXI.Sprite(this.c.tex[0]); this.sprite.anchor.set(this.c.meta.anchor.x, 1);
      this.box.addChild(this.shadow, this.sprite); floorLayer.addChild(this.box);
      this.state = 'idle'; this.t = 0; this.facing = 1; this.path = []; this.onArrive = null; this.walkFrame = 'walk';
      this.box.eventMode = 'static'; this.box.cursor = 'pointer';
      this.box.hitArea = new PIXI.Rectangle(-45, -165, 90, 170);
    }
    set(state) { this.state = state; this.t = 0; }
    walk(points, then, carryBox = false) { this.path = points.map((p) => ({ ...p })); this.onArrive = then; this.walkFrame = carryBox ? 'box' : 'walk'; this.set('walk'); }
    update(dt) {
      this.t += dt; const t = this.t, F = this.F;
      let frame = F.idle, dy = 0, sy = 1, sx = 1, rot = 0, shadow = true;
      switch (this.state) {
        case 'idle': sy = 1 + 0.012 * Math.sin(t * 0.07 + this.box.x); break;
        case 'type': frame = F.type; dy = Math.sin(t * 0.9 + this.box.x) > 0.75 ? -1 : 0; shadow = false; break;
        case 'cheer': { frame = F.cheer; const hop = Math.abs(Math.sin(t * 0.12)); dy = -hop * 12; sy = 1 + hop * 0.04; if (t > 110) this.set(this.seat ? 'type' : 'idle'); break; }
        case 'sad': frame = F.sad; sy = 1 - 0.012 * Math.sin(t * 0.05); if (t > 170) this.set(this.seat ? 'type' : 'idle'); break;
        case 'walk': {
          frame = this.walkFrame === 'box' ? F.box : (Math.floor(t / 10) % 2 ? F.walkA : F.walkB);
          dy = -Math.abs(Math.sin(t * 0.314)) * 5;
          const p = this.path[0];
          if (!p) { const cb = this.onArrive; this.onArrive = null; this.set('idle'); cb && cb(); break; }
          const dx = p.x - this.box.x, dyy = p.y - this.box.y, d = Math.hypot(dx, dyy);
          if (Math.abs(dx) > 1) this.facing = dx > 0 ? -1 : 1;
          const sp = 2.3 * dt;
          if (d <= sp) { this.box.position.set(p.x, p.y); this.path.shift(); } else { this.box.x += (dx / d) * sp; this.box.y += (dyy / d) * sp; }
          break;
        }
        case 'talk': frame = F.talk; dy = -Math.abs(Math.sin(t * 0.2)) * 2; if (t > 130) this.set('idle'); break;
        case 'stamp':
          frame = F.stamp;
          if (t < 36) { const k = t / 36; dy = -14 * k; sy = 1 + 0.06 * k; }
          else if (t < 44) { const k = (t - 36) / 8; dy = -14 + 20 * k; sy = 1.06 - 0.2 * k; sx = 0.97 + 0.12 * k; if (t - dt < 40 && t >= 40) this.onSlam && this.onSlam(); }
          else if (t < 70) { const k = (t - 44) / 26; dy = 6 * (1 - k); sy = 0.86 + 0.14 * k; sx = 1.09 - 0.09 * k; }
          else { frame = F.thumbs; if (t > 110) this.set('idle'); }
          break;
        case 'thumbs': frame = F.thumbs; if (t > 100) this.set('idle'); break;
        case 'stern': frame = F.stern; if (t > 150) this.set('idle'); break;
        case 'deny': frame = F.deny; rot = 0.05 * Math.sin(t * 0.45) * Math.max(0, 1 - t / 60); if (t > 110) this.set('idle'); break;
      }
      const atDesk = this.seat && (this.state === 'cheer' || this.state === 'sad');
      if (atDesk) shadow = false;
      this.sprite.texture = this.c.tex[frame];
      this.sprite.scale.set(this.scale * sx * this.facing, this.scale * sy);
      this.sprite.y = dy + (atDesk ? STAND_OFFSET : 0); this.sprite.rotation = rot;
      this.shadow.visible = shadow;
      this.box.zIndex = this.seat ? this.seat.deskY - 1 : this.box.y;
    }
  }

  // desks, plaques and seated workers
  const workers = WORKERS.map((w) => {
    const [dx, dy] = w.desk;
    const desk = new PIXI.Sprite(deskFrames.tex[0]); desk.anchor.set(0.5, 1); desk.scale.set(DESK_SCALE);
    desk.position.set(dx, dy); desk.zIndex = dy; floorLayer.addChild(desk);
    const a = new Actor(w.id, WF, dx + SEAT_DX, dy + SEAT_DY, CHAR_SCALE);
    a.cfg = w; a.seat = { x: dx + SEAT_DX, y: dy + SEAT_DY, deskX: dx, deskY: dy };
    a.budget = 1.0 + Math.random() * 0.8; a.allowance = 2.0; a.spent = 0; a.value = 0; a.pays = 0; a.status = 'working';
    a.hist = [a.budget]; a.feed = []; a.probation = 0; a.roiHist = [];
    a.set('type');
    // brass plaque on the desk front
    const plaque = new PIXI.Container();
    const name = txt(w.role.toUpperCase(), { fontSize: 10, fontWeight: '800', fill: 0xf6efdf, letterSpacing: 1 }); name.anchor.set(0.5, 0); name.y = -9;
    const barBg = new PIXI.Graphics().roundRect(-34, 6, 68, 5, 3).fill(0x0f1114);
    const bar = new PIXI.Graphics();
    plaque.addChild(new PIXI.Graphics().roundRect(-44, -13, 88, 30, 8).fill({ color: 0x15181c, alpha: 0.82 }).stroke({ width: 1.5, color: PIXI.Color.shared.setValue(w.css).toNumber() }), name, barBg, bar);
    plaque.position.set(dx - 14, dy - 46); plaque.zIndex = dy + 2; floorLayer.addChild(plaque);
    plaque.eventMode = 'static'; plaque.cursor = 'pointer'; plaque.on('pointertap', () => openFile(w.id));
    a.plaque = plaque; a.bar = bar;
    a.box.on('pointertap', () => openFile(w.id));
    a.box.on('pointerover', () => showTag(a)); a.box.on('pointerout', hideTag);
    byId[w.id] = a;
    return a;
  });
  const cfo = new Actor('cfo', CF, CFO_HOME.x, CFO_HOME.y, CHAR_SCALE * 1.04);
  cfo.box.on('pointertap', () => switchTab('decisions'));
  cfo.box.on('pointerover', () => showTag(cfo, 'The Chartoularios · CFO', 'Allocates, reviews, seals decisions')); cfo.box.on('pointerout', hideTag);
  const actors = [...workers, cfo];

  function drawPlaque(a) {
    const k = Math.max(0, Math.min(1, a.budget / a.allowance));
    a.bar.clear(); if (k > 0) a.bar.roundRect(-34, 6, 68 * k, 5, 3).fill(k < 0.25 ? 0xe0655c : 0x3fb8a8);
    a.plaque.alpha = a.status === 'gone' ? 0.35 : 1;
  }
  workers.forEach(drawPlaque);

  // hover tag
  const tag = new PIXI.Container(); tag.visible = false; hud.addChild(tag);
  const tagBg = new PIXI.Graphics(), tagT1 = txt('', { fontSize: 13, fontWeight: '700', fill: 0xefe8d8 }), tagT2 = txt('', { fontSize: 11, fill: 0x9aa3ad });
  tagT2.y = 17; tag.addChild(tagBg, tagT1, tagT2);
  let tagFor = null;
  function showTag(a, t1, t2) {
    tagFor = a;
    tagT1.text = t1 ?? `${a.cfg.role} · ${roi(a).toFixed(2)}× ROI`;
    tagT2.text = t2 ?? `${a.budget.toFixed(3)} USDC left · ${a.pays} payments`;
    const w = Math.max(tagT1.width, tagT2.width) + 20;
    tagBg.clear().roundRect(-10, -8, w, 44, 9).fill({ color: 0x121418, alpha: 0.9 }).stroke({ width: 1, color: 0x363d48 });
    tag.visible = true;
  }
  function hideTag() { tag.visible = false; tagFor = null; }

  // ---------------------------------------------------------------- effects
  const parts = [];
  function burst(x, y, n, color, speed = 5, grav = 0.3, life = 50, size = 4) {
    for (let i = 0; i < n; i++) {
      const g = new PIXI.Graphics().circle(0, 0, size * (0.6 + Math.random() * 0.6)).fill(color); g.position.set(x, y); fx.addChild(g);
      const an = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      parts.push({ g, vx: Math.cos(an) * s, vy: Math.sin(an) * s - speed * 0.6, grav, life, max: life });
    }
  }
  function coin(from, to, delay = 0, arc = 90, onLand, size = 7) {
    const g = new PIXI.Graphics().circle(0, 0, size).fill(0xf0c75e).stroke({ width: 2, color: 0x9c7a2b }).circle(0, 0, size * 0.45).stroke({ width: 1, color: 0xb8922f });
    g.visible = false; fx.addChild(g);
    parts.push({ g, coin: { from, to, t: -delay, dur: 42, arc, onLand } });
  }
  function cloud(a) {
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().circle(-13, 0, 12).circle(0, -7, 15).circle(15, 0, 12).rect(-24, 0, 50, 11).fill(0x7d8591));
    fx.addChild(c); parts.push({ g: c, cloud: { a, t: 0 } });
  }
  function sealDecal(x, y, hash) {
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().circle(0, 0, 30).fill(0x70747c).stroke({ width: 3, color: 0x4a4d53 }).circle(0, 0, 22).stroke({ width: 1.5, color: 0x9da1a8 }));
    const s = txt('SEALED', { fontSize: 10, fontWeight: '800', fill: 0xf2efe6 }); s.anchor.set(0.5, 1); s.y = 2;
    const h = txt(hash, { fontSize: 8, fill: 0xdfe2e6, fontFamily: 'JetBrains Mono' }); h.anchor.set(0.5, 0); h.y = 3;
    c.addChild(s, h); c.position.set(x, y); c.alpha = 0; fx.addChild(c); parts.push({ g: c, decal: { t: 0 } });
  }
  let bubble = null;
  function say(a, text, frames = 150) {
    if (bubble) fx.removeChild(bubble.c);
    const t = txt(text, { fontSize: 14, fontWeight: '600', fill: 0x1d2127, wordWrap: true, wordWrapWidth: 250 });
    const c = new PIXI.Container(), pad = 10;
    c.addChild(new PIXI.Graphics().roundRect(0, 0, t.width + pad * 2, t.height + pad * 2, 11).fill(0xf8f2e3).stroke({ width: 1, color: 0xd6ad57 })
      .poly([16, t.height + pad * 2, 32, t.height + pad * 2, 14, t.height + pad * 2 + 11]).fill(0xf8f2e3));
    t.position.set(pad, pad); c.addChild(t); fx.addChild(c); bubble = { c, a, life: frames };
  }
  const hex = (n = 4) => '0x' + [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let shake = 0;

  // ---------------------------------------------------------------- UI (DOM)
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 3) => v.toFixed(d);
  const roi = (a) => (a.value + 0.02) / (a.spent + 0.02);
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function renderKpis() {
    $('k-treasury').innerHTML = `${fmt(S.treasury, 2)}<small>USDC</small>`;
    $('k-spent').innerHTML = `${fmt(S.spent, 3)}<small>USDC</small>`;
    $('k-pays').textContent = S.pays.toLocaleString();
    $('k-epoch').textContent = S.epoch;
    vtxt.text = `${fmt(S.treasury, 2)} USDC`;
    const n = S.inbox.length; $('inbox-count').textContent = n; $('inbox-btn').classList.toggle('has', n > 0);
  }
  const ICON = { pay: '🪙', seal: '🔏', raise: '📈', probation: '🌧️', fire: '📦', hire: '👋', boss: '✍️', topup: '💧' };
  function pushEvent(ev) {
    ev.at = Date.now();
    const li = document.createElement('li'); li.className = `ev ${ev.type}`;
    li.innerHTML = `<div class="ico">${ICON[ev.type] ?? '•'}</div>
      <div><div class="ttl">${ev.title}</div><div class="meta">${ev.meta ?? ''}</div></div>
      <div class="amt">${ev.amount ?? ''}<small>${ev.tx ? `<a href="#" title="Simulated. In the product this opens the Arc explorer">${ev.tx} ↗</a>` : 'just now'}</small></div>`;
    const feed = $('feed'); feed.prepend(li); while (feed.children.length > 80) feed.lastChild.remove();
    if (ev.worker) { const a = byId[ev.worker]; a.feed.unshift(ev); a.feed.length = Math.min(a.feed.length, 12); if (drawerFor === ev.worker) renderFile(); }
  }
  function renderRoster() {
    const sorted = [...workers].sort((a, b) => roi(b) - roi(a));
    $('roster').innerHTML = sorted.map((a) => {
      const k = Math.max(0, Math.min(1, a.budget / a.allowance));
      const chip = a.status === 'working' ? '' : `<span class="chip ${a.status}">${a.status === 'gone' ? 'fired' : a.status}</span>`;
      return `<li class="row" data-id="${a.id}">
        <div class="avatar" style="--c:${a.cfg.css};background-image:url(${A}/sprites/${a.id}/${a.id}-0.png)"></div>
        <div><div class="name">${a.cfg.role} ${chip}</div><div class="sub">${fmt(a.budget)} of ${fmt(a.allowance, 2)} USDC · ${a.pays} pays</div>
          <div class="bar ${k < 0.25 ? 'low' : ''}"><i style="width:${k * 100}%"></i></div></div>
        <div class="roi">${roi(a).toFixed(2)}×<small>ROI</small></div></li>`;
    }).join('');
  }
  $('roster').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) openFile(r.dataset.id); });
  function switchTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    for (const p of ['activity', 'workforce', 'decisions']) $(`p-${p}`).classList.toggle('hidden', p !== name);
    if (name === 'workforce') renderRoster();
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  function pushDecision(d) {
    const list = $('decisions'); if (list.querySelector('.empty')) list.innerHTML = '';
    const li = document.createElement('li'); li.className = 'dec';
    li.innerHTML = `<header><h4>Epoch ${d.epoch}</h4><span class="hash">sealed ${d.hash}</span></header>
      <ul>${d.lines.map((l) => `<li>${l}</li>`).join('')}</ul><div class="why">${d.why}</div>`;
    list.prepend(li);
    $('last-dec').innerHTML = `<h4>Epoch ${d.epoch}</h4><div class="hash">sealed ${d.hash} · hash committed before money moved</div>
      <ul>${d.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
  }

  // cards under the stage
  const EPOCH_BUDGET = 24;
  function renderGuards() {
    const alloc = workers.filter((w) => w.status !== 'gone').reduce((s, w) => s + w.allowance, 0);
    const agree = S.agreeTotal ? `${Math.round((S.agreeYes / S.agreeTotal) * 100)}%` : '—';
    $('guards').innerHTML = [
      ['CFO can move money between agents, never out of the vault', '0 withdrawals'],
      ['Sum of allowances ≤ epoch budget', `${fmt(alloc, 2)} / ${EPOCH_BUDGET}`],
      ['Fire / hire / big raise needs the Boss', `${S.agreeTotal} asked`],
      ['Human agreement with the CFO', agree],
      ['Double-pay on retry blocked (idempotency key)', `${S.dupBlocked} blocked`],
      ["Auditor's budget set by the owner, not the CFO", 'fixed'],
    ].map(([t, v]) => `<li><i>✓</i><span>${t}</span><b>${v}</b></li>`).join('');
  }
  function renderSpend() {
    const max = Math.max(0.001, ...workers.map((w) => w.spent));
    $('spend').innerHTML = [...workers].sort((a, b) => b.spent - a.spent).map((w) =>
      `<div class="s"><span>${w.cfg.role}</span><div class="t"><i style="width:${(w.spent / max) * 100}%;background:${w.cfg.css}"></i></div><b>${fmt(w.spent)}</b></div>`).join('');
  }

  // worker file (drawer)
  let drawerFor = null;
  function openFile(id) { drawerFor = id; renderFile(); $('drawer').classList.add('open'); $('scrim').classList.add('open'); }
  function closeFile() { drawerFor = null; $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); }
  $('d-close').onclick = closeFile; $('scrim').onclick = closeFile;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeFile(); closeInbox(); } });
  function renderFile() {
    const a = byId[drawerFor]; if (!a) return;
    $('d-hero').style.setProperty('--c', a.cfg.css);
    $('d-img').src = `${A}/sprites/${a.id}/${a.id}-${a.status === 'gone' ? 6 : 0}.png`;
    $('d-name').textContent = a.cfg.role;
    const st = { working: 'Working', probation: 'On probation', gone: 'Fired · budget returned to treasury', new: 'New hire · probation envelope' }[a.status];
    $('d-tag').textContent = `${st}${a.cfg.fixed ? ' · budget fixed by the owner, not the CFO' : ''}`;
    $('d-budget').textContent = `${fmt(a.budget)} USDC`;
    $('d-spent').textContent = `${fmt(a.spent)} USDC`;
    $('d-roi').textContent = `${roi(a).toFixed(2)}×`;
    $('d-pays').textContent = a.pays;
    $('d-buys').innerHTML = a.cfg.buys.map(([n, p]) => `<span>${n}<b>$${p}</b></span>`).join('');
    const h = a.hist.slice(-60), max = Math.max(a.allowance, ...h), pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1)) * 300},${60 - (v / max) * 54}`).join(' ');
    $('d-spark').innerHTML = `<polyline points="${pts}" fill="none" stroke="${a.cfg.css}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
    $('d-feed').innerHTML = a.feed.map((ev) => `<li class="ev ${ev.type}"><div class="ico">${ICON[ev.type]}</div><div><div class="ttl">${ev.title}</div><div class="meta">${ev.meta ?? ''}</div></div><div class="amt">${ev.amount ?? ''}</div></li>`).join('') || '<li class="empty">No activity yet.</li>';
  }

  // boss inbox
  function openInbox() { renderInbox(); $('modal').classList.add('open'); }
  function closeInbox() { $('modal').classList.remove('open'); }
  $('inbox-btn').onclick = openInbox; $('m-close').onclick = closeInbox;
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeInbox(); });
  function renderInbox() {
    $('m-list').innerHTML = S.inbox.length ? S.inbox.map((r) => `<div class="req"><b>${r.title}</b><div>${r.detail}</div>
      <div class="row2"><span>Proposed by the CFO · ${r.hash}</span><span>auto-approves in ${Math.max(0, Math.ceil((r.deadline - performance.now()) / 1000))}s (demo)</span></div>
      <div class="actions"><button class="btn no" data-deny="${r.id}">Deny</button><button class="btn ok" data-ok="${r.id}">Co-sign</button></div></div>`).join('')
      : '<div class="empty">Nothing waiting for you. The CFO is inside its limits.</div>';
  }
  $('m-list').addEventListener('click', (e) => {
    const ok = e.target.dataset.ok, no = e.target.dataset.deny;
    if (ok) resolveRequest(ok, true, 'you'); if (no) resolveRequest(no, false, 'you');
  });

  // ---------------------------------------------------------------- director (SIMULATED events)
  let busy = false;
  function spendTick() {
    const seated = workers.filter((w) => w.state === 'type' && w.status !== 'gone' && w.budget > 0.05);
    if (!seated.length) return;
    const w = seated[Math.floor(Math.random() * seated.length)];
    const [svc, price] = w.cfg.buys[Math.floor(Math.random() * w.cfg.buys.length)];
    w.budget -= price; w.spent += price; w.pays++; S.spent += price; S.pays++;
    w.value += price * w.cfg.q * (0.6 + Math.random() * 0.8);
    w.hist.push(w.budget); drawPlaque(w);
    coin({ x: w.box.x - 24, y: w.box.y - 70 }, STALL_TRAY, 0, 80, () => burst(STALL_TRAY.x, STALL_TRAY.y, 4, 0x7fd6c8, 2, 0.1, 20, 2.5), 6);
    pushEvent({ type: 'pay', worker: w.id, title: `${w.cfg.role} paid ${svc}`, meta: 'x402 · Gateway batch', amount: `−${fmt(price)}`, tx: hex(3) });
    renderKpis(); flash($('k-pays'));
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function review() {
    if (busy) return; busy = true; S.epoch++; renderKpis();
    const hash = hex(4) + '…';
    cfo.set('talk'); say(cfo, `Epoch ${S.epoch} review. The allocator ran; the debate moved it +4% (within ±15%).`);
    await wait(2200);
    cfo.onSlam = () => {
      shake = 10; sealDecal(cfo.box.x - 62, cfo.box.y + 14, hash.slice(0, 10));
      burst(cfo.box.x - 62, cfo.box.y + 10, 14, 0xb9a47a, 4, 0.2, 35, 2.5);
      pushEvent({ type: 'seal', title: `Epoch ${S.epoch} decision sealed`, meta: 'commit hash stored on Arc before any money moves', tx: hash.slice(0, 8) });
    };
    cfo.set('stamp'); say(cfo, 'Sealed on Arc.', 90);
    await wait(1900);

    const active = workers.filter((w) => w.status !== 'gone' && !w.cfg.fixed);
    const ranked = [...active].sort((a, b) => roi(b) - roi(a));
    const [t1, t2] = ranked; const worst = ranked[ranked.length - 1];
    const lines = [];
    const headroom = EPOCH_BUDGET - workers.filter((w) => w.status !== 'gone').reduce((s, w) => s + w.allowance, 0);
    const raiseAmt = Math.floor(Math.min(0.3, headroom / 2) * 100) / 100;
    if (raiseAmt < 0.05) lines.push('No raises: the allowances are at the epoch budget cap');
    for (const w of raiseAmt >= 0.05 ? [t1, t2] : []) {
      const amt = raiseAmt; w.allowance = +(w.allowance + amt).toFixed(2); w.set('cheer'); S.treasury -= amt;
      for (let i = 0; i < 5; i++) coin(VAULT, { x: w.box.x, y: w.box.y - 50 }, i * 5, 110, i === 4 ? () => { w.budget = Math.min(w.allowance, w.budget + amt); w.hist.push(w.budget); drawPlaque(w); } : null);
      pushEvent({ type: 'raise', worker: w.id, title: `Raise: ${w.cfg.role}`, meta: `ROI ${roi(w).toFixed(2)}× vs holdout · allowance ${fmt(w.allowance, 2)}`, amount: `+${fmt(amt, 2)}` });
      lines.push(`Raise <b>${w.cfg.role}</b> +${fmt(amt, 2)} (ROI ${roi(w).toFixed(2)}×)`);
    }
    renderKpis(); flash($('k-treasury'));
    await wait(1500);
    // quiet top-ups for everyone else, up to their allowance
    let topped = 0;
    for (const w of workers) if (w.status !== 'gone' && w !== t1 && w !== t2) { const add = Math.min(0.15, w.allowance - w.budget); if (add > 0) { w.budget += add; topped += add; w.hist.push(w.budget); drawPlaque(w); } }
    if (topped > 0) { S.treasury -= topped; pushEvent({ type: 'topup', title: 'Epoch top-ups', meta: 'Gateway balances refilled up to each allowance', amount: `−${fmt(topped, 2)}` }); lines.push(`Top-ups ${fmt(topped, 2)} USDC across the team`); }
    renderKpis();

    if (roi(worst) < 1.05) {
      worst.probation++;
      if (worst.probation >= 2 && worst.status === 'probation') {
        lines.push(`Propose <b>fire ${worst.cfg.role}</b>. Two weak epochs; needs the Boss.`);
        pushDecision({ epoch: S.epoch, hash, lines, why: 'The allocator is deterministic and seeded. The LLM debate may move it at most ±15%, and claims without a document ID are dropped.' });
        await proposeFire(worst, hash);
      } else {
        worst.status = 'probation'; worst.allowance = +(worst.allowance * 0.6).toFixed(2); worst.budget = Math.min(worst.budget, worst.allowance);
        worst.set('sad'); cloud(worst); drawPlaque(worst); worst.hist.push(worst.budget);
        pushEvent({ type: 'probation', worker: worst.id, title: `Probation: ${worst.cfg.role}`, meta: `ROI ${roi(worst).toFixed(2)}× below holdout · allowance −40%`, amount: `${fmt(worst.allowance, 2)} cap` });
        lines.push(`Probation <b>${worst.cfg.role}</b> (ROI ${roi(worst).toFixed(2)}×) · allowance −40%`);
        pushDecision({ epoch: S.epoch, hash, lines, why: 'The allocator is deterministic and seeded. The LLM debate may move it at most ±15%, and claims without a document ID are dropped.' });
      }
    } else {
      pushDecision({ epoch: S.epoch, hash, lines, why: 'Nobody under the holdout baseline this epoch.' });
    }
    if (drawerFor) renderFile();
    S.nextReview = performance.now() + EPOCH_MS;
    busy = false;
  }

  let reqSeq = 0;
  function proposeFire(w, hash) {
    return new Promise((resolve) => {
      const r = { id: String(++reqSeq), w, hash: hash.slice(0, 10), title: `Fire the ${w.cfg.role}`, detail: `ROI ${roi(w).toFixed(2)}× for two epochs, below holdout. ${fmt(w.budget)} USDC would return to the treasury.`, deadline: performance.now() + 25000, resolve };
      S.inbox.push(r); renderKpis();
      pushEvent({ type: 'boss', worker: w.id, title: `Needs your co-sign: fire ${w.cfg.role}`, meta: 'SpendQueued · above the CFO\'s authority' });
      cfo.walk([{ x: BOSS_DOOR.x + 70, y: BOSS_DOOR.y }], () => { cfo.set('talk'); say(cfo, `Boss, the ${w.cfg.role} has had two weak epochs. I need your co-sign to let them go.`, 200); });
    });
  }
  async function resolveRequest(id, approve, who) {
    const i = S.inbox.findIndex((r) => r.id === id); if (i < 0) return;
    const [r] = S.inbox.splice(i, 1); renderKpis(); renderInbox();
    S.agreeTotal++; if (approve) S.agreeYes++;
    const w = r.w;
    if (!approve) {
      cfo.set('deny'); say(cfo, 'Understood. Probation continues.', 100);
      w.probation = 1;
      pushEvent({ type: 'boss', worker: w.id, title: `Boss denied firing ${w.cfg.role}`, meta: `probation continues · decided by ${who}` });
      cfo.walk([CFO_HOME]); r.resolve(); return;
    }
    cfo.set('thumbs'); say(cfo, 'Co-signed. Executing.', 90); shake = 4;
    pushEvent({ type: 'boss', worker: w.id, title: `Boss co-signed: fire ${w.cfg.role}`, meta: `SpendCoSigned · by ${who}`, tx: hex(3) });
    const back = w.budget; w.budget = 0; w.status = 'gone'; drawPlaque(w);
    coin({ x: w.seat.x, y: w.seat.y - 40 }, VAULT, 0, 140, () => { S.treasury += back; renderKpis(); flash($('k-treasury')); }, 8);
    pushEvent({ type: 'fire', worker: w.id, title: `${w.cfg.role} fired`, meta: 'AgentFired · leftover budget returned to treasury', amount: `+${fmt(back)}`, tx: hex(3) });
    // stand up, walk round the desk, carry the box out of the front-left
    const { deskX, deskY } = w.seat; const seat = w.seat; w.seat = null;
    w.box.position.set(deskX + 98, deskY - 40);
    w.walk([{ x: deskX + 98, y: deskY + 12 }, { x: Math.max(40, deskX - 40), y: Math.min(H + 10, deskY + 30) }, { x: -70, y: Math.min(H + 20, deskY + 40) }], () => {
      w.box.visible = false;
      setTimeout(() => hire(w, seat), 5000);
    }, true);
    await wait(1200); cfo.walk([CFO_HOME]); r.resolve();
    if (drawerFor === w.id) renderFile();
  }
  function hire(w, seat) {
    w.box.visible = true; w.box.position.set(-70, Math.min(H + 20, seat.deskY + 40));
    w.status = 'new'; w.probation = 0; w.value = 0; w.spent = 0; w.allowance = 0.8;
    pushEvent({ type: 'hire', worker: w.id, title: `New ${w.cfg.role} hired`, meta: 'probation envelope · small allowance, wide prior', amount: '0.50 cap' });
    w.walk([{ x: seat.deskX - 40, y: seat.deskY + 30 }, { x: seat.deskX + 98, y: seat.deskY + 12 }, { x: seat.deskX + 98, y: seat.deskY - 40 }], () => {
      w.seat = seat; w.box.position.set(seat.x, seat.y); w.budget = 0.5; S.treasury -= 0.5; w.hist.push(w.budget); drawPlaque(w); renderKpis(); w.set('cheer');
    });
  }

  // auto-approve pending requests after their demo deadline
  setInterval(() => {
    for (const r of [...S.inbox]) if (performance.now() > r.deadline) resolveRequest(r.id, true, 'demo auto-approve');
    if ($('modal').classList.contains('open')) renderInbox();
  }, 1000);

  // ---------------------------------------------------------------- loops
  renderKpis(); renderRoster();
  setTimeout(() => { const h = document.querySelector('.stage-hint'); if (h) h.style.opacity = '0'; }, 9000);
  pushEvent({ type: 'seal', title: 'Office opened', meta: 'simulated demo: every event here is generated in the browser' });
  setInterval(spendTick, 700);
  setInterval(() => { if (!document.querySelector('#p-workforce.hidden')) renderRoster(); renderGuards(); renderSpend(); }, 1200);
  renderGuards(); renderSpend();
  // Simulate a retried request now and then: the vault rejects the duplicate idempotency key.
  setInterval(() => {
    const w = workers[Math.floor(Math.random() * workers.length)]; if (w.status === 'gone') return;
    S.dupBlocked++;
    pushEvent({ type: 'boss', worker: w.id, title: `Retry of ${w.cfg.role}'s payment rejected`, meta: 'same idempotency key (doc hash, payee, amount), already paid once' });
  }, 23000);
  setInterval(() => { if (!busy && performance.now() >= S.nextReview) review(); }, 250);

  const ring = $('k-ring'), C = 2 * Math.PI * 15;
  app.ticker.add((tk) => {
    const dt = tk.deltaTime, now = performance.now();
    for (const a of actors) a.update(dt);
    // ambient
    for (const [i, l] of lamps.entries()) l.alpha = 0.85 + 0.08 * Math.sin(now / 900 + i * 2);
    for (const m of motes) {
      m.x += m.vx * dt; m.y += m.vy * dt + Math.sin(now / 1200 + m.ph) * 0.05;
      if (m.x > 1050 || m.y < 100) { m.x = Math.random() * 400; m.y = 250 + Math.random() * 420; }
    }
    // epoch ring
    const k = busy ? 1 : Math.max(0, Math.min(1, 1 - (S.nextReview - now) / EPOCH_MS));
    ring.style.strokeDashoffset = String(C * (1 - k));
    // shake
    if (shake > 0) { world.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; if (shake < 0.5) { shake = 0; world.position.set(0, 0); } }
    // hover tag follows
    if (tagFor) {
      const b = tagFor.box, atDesk = tagFor.seat && tagFor.state !== 'type';
      tag.position.set(Math.min(W - 230, b.x - 40), b.y - (tagFor.seat ? 125 : 205) + (atDesk ? 60 : 0));
    }
    // bubble follows its speaker
    if (bubble) {
      bubble.c.position.set(Math.min(W - bubble.c.width - 10, bubble.a.box.x - 18), bubble.a.box.y - 175 - bubble.c.height);
      if (--bubble.life <= 0) { fx.removeChild(bubble.c); bubble = null; }
    }
    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.coin) {
        const c = p.coin; c.t += dt; if (c.t < 0) continue; p.g.visible = true; const q = Math.min(1, c.t / c.dur);
        const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        p.g.position.set(c.from.x + (c.to.x - c.from.x) * e, c.from.y + (c.to.y - c.from.y) * e - Math.sin(q * Math.PI) * c.arc);
        p.g.scale.x = Math.cos(c.t * 0.3);
        if (q >= 1) { c.onLand && c.onLand(); fx.removeChild(p.g); parts.splice(i, 1); }
      } else if (p.decal) {
        const d = p.decal; d.t += dt; const q = Math.min(1, d.t / 8); p.g.alpha = q; p.g.scale.set(1.8 - 0.8 * q);
        if (d.t > 160) p.g.alpha = Math.max(0, 1 - (d.t - 160) / 40); if (d.t > 200) { fx.removeChild(p.g); parts.splice(i, 1); }
      } else if (p.cloud) {
        const cl = p.cloud; cl.t += dt; const b = cl.a.box;
        p.g.position.set(b.x + 4, b.y - 60 + Math.sin(cl.t * 0.1) * 3);
        if (Math.random() < 0.35) burst(b.x + 4 + (Math.random() - 0.5) * 40, b.y - 48, 1, 0x7fb8e6, 0.5, 0.35, 20, 2);
        if (cl.t > 170) { fx.removeChild(p.g); parts.splice(i, 1); }
      } else {
        p.vy += p.grav * dt; p.g.x += p.vx * dt; p.g.y += p.vy * dt; p.life -= dt; p.g.alpha = Math.max(0, p.life / p.max);
        if (p.life <= 0) { fx.removeChild(p.g); parts.splice(i, 1); }
      }
    }
  });
})();
