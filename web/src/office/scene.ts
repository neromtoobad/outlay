// The Outlay office, driven only by real events (SSE from the API, or a labelled replay of recorded
// ones). Nothing here is simulated: an agent types because it just took a step, a coin flies because a
// purchase was just paid, the seal slams because a job just started.
import * as PIXI from 'pixi.js';

export type OfficeEvent = { type: 'step' | 'purchase' | 'order'; orderId?: string; jobId?: string; at?: string; data: any };

const W = 1344, H = 752;
const WORKERS = [
  { id: 'scout', role: 'Scout', css: '#d9a520', desk: [225, 540] },
  { id: 'researcher', role: 'Researcher', css: '#b0394f', desk: [420, 540] },
  { id: 'writer', role: 'Writer', css: '#e8735f', desk: [990, 540] },
  { id: 'auditor', role: 'Auditor', css: '#8a55a8', desk: [1195, 540] },
  { id: 'illustrator', role: 'Illustrator', css: '#9b84d6', desk: [118, 742] },
  { id: 'verifier', role: 'Verifier', css: '#7fb8e6', desk: [305, 742] },
  { id: 'mailer', role: 'Mailer', css: '#f07a1a', desk: [492, 742] },
  { id: 'reader', role: 'Reader', css: '#8a9a40', desk: [679, 742] },
  { id: 'analyst', role: 'Analyst', css: '#3a62e0', desk: [866, 742] },
  { id: 'messenger', role: 'Messenger', css: '#d23a2e', desk: [1053, 742] },
] as const;
const SERVICE: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };
const CFO_HOME = { x: 672, y: 442 }, VAULT = { x: 1262, y: 232 }, STALL = { x: 1252, y: 746 }, TRAY = { x: 1232, y: 630 }, DOOR = { x: 70, y: 420 };
const CHAR_SCALE = 0.42, DESK_SCALE = 0.21, STALL_SCALE = 0.2, SEAT_DX = 26, SEAT_DY = -138, STAND_OFFSET = 100;
const WF = { idle: 0, walkA: 1, walkB: 2, type: 3, cheer: 4, sad: 5, box: 6, coin: 7 };
const CF = { idle: 0, walkA: 1, walkB: 2, talk: 3, stamp: 4, stern: 5, thumbs: 6, deny: 7 };

type Frames = { meta: any; tex: PIXI.Texture[] };
async function loadFrames(dir: string, id: string): Promise<Frames> {
  const meta = await (await fetch(`/${dir}/${id}.json`)).json();
  const tex = await Promise.all(meta.frames.map((f: any) => PIXI.Assets.load(`/${dir}/${f.file}`)));
  return { meta, tex };
}

class Actor {
  box = new PIXI.Container();
  shadow = new PIXI.Graphics().ellipse(0, 0, 30, 8).fill({ color: 0x1a0f05, alpha: 0.32 });
  sprite: PIXI.Sprite;
  state = 'idle';
  t = 0;
  facing = 1;
  seat: { x: number; y: number; deskY: number } | null = null;
  activeUntil = 0;
  lastAction = '';
  path: { x: number; y: number }[] = [];
  onArrive: (() => void) | null = null;
  onSlam: (() => void) | null = null;
  constructor(public id: string, public c: Frames, public F: Record<string, number>, x: number, y: number, public scale: number) {
    this.sprite = new PIXI.Sprite(c.tex[0]);
    this.sprite.anchor.set(c.meta.anchor.x, 1);
    this.box.addChild(this.shadow, this.sprite);
    this.box.position.set(x, y);
    this.box.eventMode = 'static';
    this.box.cursor = 'pointer';
    this.box.hitArea = new PIXI.Rectangle(-45, -165, 90, 170);
  }
  set(s: string) { this.state = s; this.t = 0; }
  walk(points: { x: number; y: number }[], then?: () => void) { this.path = [...points]; this.onArrive = then ?? null; this.set('walk'); }
  update(dt: number, now: number) {
    this.t += dt;
    const t = this.t, F = this.F;
    let frame = F.idle, dy = 0, sy = 1, sx = 1, rot = 0, shadow = true;
    if (this.seat && (this.state === 'rest' || this.state === 'type')) this.state = now < this.activeUntil ? 'type' : 'rest';
    switch (this.state) {
      case 'idle': sy = 1 + 0.012 * Math.sin(t * 0.07 + this.box.x); break;
      case 'rest': frame = F.type; sy = 1 + 0.008 * Math.sin(t * 0.05 + this.box.x); shadow = false; break;
      case 'type': frame = F.type; dy = Math.sin(t * 0.9 + this.box.x) > 0.7 ? -1.2 : 0; shadow = false; break;
      case 'cheer': { frame = F.cheer; const hop = Math.abs(Math.sin(t * 0.12)); dy = -hop * 12; sy = 1 + hop * 0.04; if (t > 120) this.set(this.seat ? 'rest' : 'idle'); break; }
      case 'sad': frame = F.sad; sy = 1 - 0.012 * Math.sin(t * 0.05); if (t > 200) this.set(this.seat ? 'rest' : 'idle'); break;
      case 'walk': {
        frame = Math.floor(t / 10) % 2 ? F.walkA : F.walkB;
        dy = -Math.abs(Math.sin(t * 0.314)) * 5;
        const p = this.path[0];
        if (!p) { const cb = this.onArrive; this.onArrive = null; this.set('idle'); cb?.(); break; }
        const ddx = p.x - this.box.x, ddy = p.y - this.box.y, d = Math.hypot(ddx, ddy);
        if (Math.abs(ddx) > 1) this.facing = ddx > 0 ? -1 : 1;
        const sp = 2.6 * dt;
        if (d <= sp) { this.box.position.set(p.x, p.y); this.path.shift(); } else { this.box.x += (ddx / d) * sp; this.box.y += (ddy / d) * sp; }
        break;
      }
      case 'talk': frame = F.talk; dy = -Math.abs(Math.sin(t * 0.2)) * 2; if (t > 150) this.set('idle'); break;
      case 'stamp':
        frame = F.stamp;
        if (t < 36) { const k = t / 36; dy = -14 * k; sy = 1 + 0.06 * k; }
        else if (t < 44) { const k = (t - 36) / 8; dy = -14 + 20 * k; sy = 1.06 - 0.2 * k; sx = 0.97 + 0.12 * k; if (t - dt < 40 && t >= 40) this.onSlam?.(); }
        else if (t < 70) { const k = (t - 44) / 26; dy = 6 * (1 - k); sy = 0.86 + 0.14 * k; sx = 1.09 - 0.09 * k; }
        else { frame = F.thumbs; if (t > 110) this.set('idle'); }
        break;
      case 'thumbs': frame = F.thumbs; if (t > 110) this.set('idle'); break;
      case 'stern': frame = F.stern; if (t > 160) this.set('idle'); break;
      case 'deny': frame = F.deny; rot = 0.05 * Math.sin(t * 0.45) * Math.max(0, 1 - t / 60); if (t > 120) this.set('idle'); break;
    }
    const atDesk = this.seat && (this.state === 'cheer' || this.state === 'sad');
    if (atDesk) shadow = false;
    this.sprite.texture = this.c.tex[frame];
    this.sprite.scale.set(this.scale * sx * this.facing, this.scale * sy);
    this.sprite.y = dy + (atDesk ? STAND_OFFSET : 0);
    this.sprite.rotation = rot;
    this.shadow.visible = shadow;
    this.box.zIndex = this.seat ? this.seat.deskY - 1 : this.box.y;
  }
}

export class OfficeScene {
  app = new PIXI.Application();
  private world = new PIXI.Container();
  private floor = new PIXI.Container();
  private fx = new PIXI.Container();
  private hud = new PIXI.Container();
  private actors = new Map<string, Actor>();
  private decor = new Map<string, PIXI.Container[]>(); // desk + plaque per worker, for focus dimming
  private parts: any[] = [];
  private bubbles = new Map<string, { c: PIXI.Container; life: number }>();
  private shake = 0;
  private tag = new PIXI.Container();
  private tagFor: Actor | null = null;
  private destroyed = false;
  onAgentClick?: (id: string) => void;

  static async create(el: HTMLElement): Promise<OfficeScene> {
    const s = new OfficeScene();
    await s.init(el);
    return s;
  }

  private txt(text: string, style: Record<string, unknown>) {
    return new PIXI.Text({ text, style: { fontFamily: 'Inter, sans-serif', ...style } as any });
  }

  private async init(el: HTMLElement) {
    await document.fonts.ready;
    await this.app.init({ width: W, height: H, background: 0x0d0f12, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    if (this.destroyed) return;
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.app.canvas.style.display = 'block';
    el.appendChild(this.app.canvas);

    const [bgTex, desk, stall, ...chars] = await Promise.all([
      PIXI.Assets.load('/scene/office-bg.png'), loadFrames('scene', 'desk'), loadFrames('scene', 'stall'),
      ...[...WORKERS.map((w) => w.id), 'cfo'].map((id) => loadFrames(`sprites/${id}`, id)),
    ]);
    if (this.destroyed) return;
    const byId = Object.fromEntries([...WORKERS.map((w) => w.id), 'cfo'].map((id, i) => [id, chars[i] as Frames]));

    this.app.stage.addChild(this.world);
    const bg = new PIXI.Sprite(bgTex as PIXI.Texture); bg.width = W; bg.height = H; this.world.addChild(bg);

    // ambient light
    const radial = (size: number, stops: [number, string][]) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d')!, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr; g.fillRect(0, 0, size, size); return PIXI.Texture.from(c);
    };
    const glow = radial(256, [[0, 'rgba(255,214,140,0.5)'], [0.4, 'rgba(255,190,110,0.16)'], [1, 'rgba(255,190,110,0)']]);
    for (const [x, y] of [[287, 90], [672, 90], [1057, 90]]) { const s = new PIXI.Sprite(glow); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(1.3); s.blendMode = 'add'; this.world.addChild(s); }
    const dot = radial(32, [[0, 'rgba(255,240,210,1)'], [1, 'rgba(255,240,210,0)']]);
    const motes = Array.from({ length: 40 }, () => {
      const s: any = new PIXI.Sprite(dot); s.anchor.set(0.5); s.blendMode = 'add';
      s.position.set(Math.random() * 1000, 120 + Math.random() * 520); s.scale.set(0.08 + Math.random() * 0.14); s.alpha = 0.15 + Math.random() * 0.3;
      s.vx = 0.05 + Math.random() * 0.15; s.vy = -0.03 - Math.random() * 0.08; s.ph = Math.random() * 6; this.world.addChild(s); return s;
    });

    this.floor.sortableChildren = true;
    this.world.addChild(this.floor, this.fx);
    const vig = new PIXI.Sprite(radial(512, [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(6,5,4,0.5)']]));
    vig.width = W * 1.25; vig.height = H * 1.45; vig.anchor.set(0.5); vig.position.set(W / 2, H / 2 - 20); this.world.addChild(vig);
    this.app.stage.addChild(this.hud);

    // stall (x402 vendors) + label
    const st = new PIXI.Sprite(stall.tex[0]); st.anchor.set(0.5, 1); st.scale.set(STALL_SCALE); st.position.set(STALL.x, STALL.y); st.zIndex = STALL.y; this.floor.addChild(st);
    const sign = new PIXI.Container();
    const signT = this.txt('AGORA · x402 vendors', { fontSize: 11, fontWeight: '800', fill: 0x0e2a27, letterSpacing: 1 }); signT.anchor.set(0.5);
    sign.addChild(new PIXI.Graphics().roundRect(-72, -11, 144, 22, 11).fill(0x7fd6c8).stroke({ width: 2, color: 0xf0cf85 }), signT);
    sign.position.set(STALL.x - 14, STALL.y - 222); sign.zIndex = STALL.y + 1; this.floor.addChild(sign);
    const vt = new PIXI.Container();
    const vtT = this.txt('TREASURY', { fontSize: 10, fontWeight: '800', fill: 0xf0cf85, letterSpacing: 2 }); vtT.anchor.set(0.5);
    vt.addChild(new PIXI.Graphics().roundRect(-48, -12, 96, 24, 12).fill({ color: 0x121418, alpha: 0.78 }), vtT); vt.position.set(VAULT.x - 2, 84); this.hud.addChild(vt);
    const bt = new PIXI.Container();
    const btT = this.txt('THE BOSS', { fontSize: 10, fontWeight: '800', fill: 0xefe8d8, letterSpacing: 2 }); btT.anchor.set(0.5);
    bt.addChild(new PIXI.Graphics().roundRect(-44, -12, 88, 24, 12).fill({ color: 0x121418, alpha: 0.75 }), btT); bt.position.set(65, 44); this.hud.addChild(bt);

    // desks, plaques, seated workers
    for (const w of WORKERS) {
      const [dx, dy] = w.desk;
      const d = new PIXI.Sprite(desk.tex[0]); d.anchor.set(0.5, 1); d.scale.set(DESK_SCALE); d.position.set(dx, dy); d.zIndex = dy; this.floor.addChild(d);
      const plaque = new PIXI.Container();
      const name = this.txt(w.role.toUpperCase(), { fontSize: 10, fontWeight: '800', fill: 0xf6efdf, letterSpacing: 1 }); name.anchor.set(0.5);
      plaque.addChild(new PIXI.Graphics().roundRect(-44, -11, 88, 22, 8).fill({ color: 0x15181c, alpha: 0.82 }).stroke({ width: 1.5, color: new PIXI.Color(w.css).toNumber() }), name);
      plaque.position.set(dx - 14, dy - 40); plaque.zIndex = dy + 2; this.floor.addChild(plaque);
      const a = new Actor(w.id, byId[w.id], WF, dx + SEAT_DX, dy + SEAT_DY, CHAR_SCALE);
      a.seat = { x: dx + SEAT_DX, y: dy + SEAT_DY, deskY: dy };
      a.set('rest');
      a.lastAction = 'waiting for work';
      this.floor.addChild(a.box);
      this.actors.set(w.id, a);
      this.decor.set(w.id, [d, plaque]);
      a.box.on('pointertap', () => this.onAgentClick?.(w.id));
      a.box.on('pointerover', () => this.showTag(a, w.role)); a.box.on('pointerout', () => this.hideTag());
    }
    const cfo = new Actor('cfo', byId.cfo, CF, CFO_HOME.x, CFO_HOME.y, CHAR_SCALE * 1.04);
    cfo.lastAction = 'watching the books';
    this.floor.addChild(cfo.box);
    this.actors.set('cfo', cfo);
    cfo.box.on('pointerover', () => this.showTag(cfo, 'The Chartoularios · CFO')); cfo.box.on('pointerout', () => this.hideTag());

    this.tag.visible = false; this.hud.addChild(this.tag);

    this.app.ticker.add((tk) => {
      const dt = tk.deltaTime, now = performance.now();
      for (const a of this.actors.values()) a.update(dt, now);
      for (const m of motes) { m.x += m.vx * dt; m.y += m.vy * dt + Math.sin(now / 1200 + m.ph) * 0.05; if (m.x > 1050 || m.y < 100) { m.x = Math.random() * 400; m.y = 250 + Math.random() * 420; } }
      if (this.shake > 0) { this.world.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= 0.85; if (this.shake < 0.5) { this.shake = 0; this.world.position.set(0, 0); } }
      if (this.tagFor) { const b = this.tagFor.box; this.tag.position.set(Math.min(W - 250, b.x - 40), b.y - (this.tagFor.seat ? 118 : 205)); }
      for (const [id, bub] of this.bubbles) {
        const a = this.actors.get(id)!;
        const above = a.seat ? (a.state === 'cheer' || a.state === 'sad' ? 132 : 108) : 190;
        bub.c.position.set(Math.max(8, Math.min(W - bub.c.width - 8, a.box.x - 20)), a.box.y - above - bub.c.height);
        if ((bub.life -= dt) <= 0) { this.fx.removeChild(bub.c); this.bubbles.delete(id); } else if (bub.life < 20) bub.c.alpha = bub.life / 20;
      }
      this.tickParts(dt);
    });
  }

  // ---------------------------------------------------------------- effects
  private tickParts(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.coin) {
        const c = p.coin; c.t += dt; if (c.t < 0) continue; p.g.visible = true; const q = Math.min(1, c.t / c.dur);
        const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        p.g.position.set(c.from.x + (c.to.x - c.from.x) * e, c.from.y + (c.to.y - c.from.y) * e - Math.sin(q * Math.PI) * c.arc);
        p.g.scale.x = Math.cos(c.t * 0.3);
        if (q >= 1) { c.onLand?.(); this.fx.removeChild(p.g); this.parts.splice(i, 1); }
      } else if (p.float) {
        p.float.t += dt; p.g.y -= 0.45 * dt; p.g.alpha = Math.max(0, 1 - p.float.t / 110);
        if (p.float.t > 110) { this.fx.removeChild(p.g); this.parts.splice(i, 1); }
      } else if (p.decal) {
        const d = p.decal; d.t += dt; const q = Math.min(1, d.t / 8); p.g.alpha = q; p.g.scale.set(1.8 - 0.8 * q);
        if (d.t > 170) p.g.alpha = Math.max(0, 1 - (d.t - 170) / 40); if (d.t > 210) { this.fx.removeChild(p.g); this.parts.splice(i, 1); }
      } else if (p.cloud) {
        const cl = p.cloud; cl.t += dt; const b = cl.a.box;
        p.g.position.set(b.x + 4, b.y - 70 + Math.sin(cl.t * 0.1) * 3);
        if (Math.random() < 0.35) this.burst(b.x + 4 + (Math.random() - 0.5) * 40, b.y - 58, 1, 0x7fb8e6, 0.5, 0.35, 20, 2);
        if (cl.t > 200) { this.fx.removeChild(p.g); this.parts.splice(i, 1); }
      } else {
        p.vy += p.grav * dt; p.g.x += p.vx * dt; p.g.y += p.vy * dt; p.life -= dt; p.g.alpha = Math.max(0, p.life / p.max);
        if (p.life <= 0) { this.fx.removeChild(p.g); this.parts.splice(i, 1); }
      }
    }
  }
  private burst(x: number, y: number, n: number, color: number, speed = 5, grav = 0.3, life = 50, size = 4) {
    for (let i = 0; i < n; i++) {
      const g = new PIXI.Graphics().circle(0, 0, size * (0.6 + Math.random() * 0.6)).fill(color); g.position.set(x, y); this.fx.addChild(g);
      const an = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      this.parts.push({ g, vx: Math.cos(an) * s, vy: Math.sin(an) * s - speed * 0.6, grav, life, max: life });
    }
  }
  private coin(from: { x: number; y: number }, to: { x: number; y: number }, delay = 0, arc = 90, onLand?: () => void, gold = false) {
    const g = new PIXI.Graphics().circle(0, 0, 7).fill(gold ? 0xe8b43a : 0xf0c75e).stroke({ width: 2, color: 0x9c7a2b }); g.visible = false; this.fx.addChild(g);
    this.parts.push({ g, coin: { from, to, t: -delay, dur: 42, arc, onLand } });
  }
  private float(x: number, y: number, text: string, color = 0xf6efdf) {
    const t = this.txt(text, { fontSize: 14, fontWeight: '800', fill: color, fontFamily: 'JetBrains Mono, monospace', stroke: { color: 0x15181c, width: 4 } });
    t.anchor.set(0.5); t.position.set(x, y); this.fx.addChild(t); this.parts.push({ g: t, float: { t: 0 } });
  }
  private cloud(a: Actor) {
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().circle(-13, 0, 12).circle(0, -7, 15).circle(15, 0, 12).rect(-24, 0, 50, 11).fill(0x7d8591));
    this.fx.addChild(c); this.parts.push({ g: c, cloud: { a, t: 0 } });
  }
  private seal(x: number, y: number, label: string) {
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().circle(0, 0, 30).fill(0x70747c).stroke({ width: 3, color: 0x4a4d53 }).circle(0, 0, 22).stroke({ width: 1.5, color: 0x9da1a8 }));
    const s = this.txt('SEALED', { fontSize: 10, fontWeight: '800', fill: 0xf2efe6 }); s.anchor.set(0.5, 1); s.y = 2;
    const h = this.txt(label, { fontSize: 8, fill: 0xdfe2e6, fontFamily: 'JetBrains Mono, monospace' }); h.anchor.set(0.5, 0); h.y = 3;
    c.addChild(s, h); c.position.set(x, y); c.alpha = 0; this.fx.addChild(c); this.parts.push({ g: c, decal: { t: 0 } });
  }
  private say(id: string, text: string, frames = 170) {
    const a = this.actors.get(id); if (!a) return;
    const old = this.bubbles.get(id); if (old) this.fx.removeChild(old.c);
    const short = text.length > 54 ? text.slice(0, 52) + '…' : text;
    const t = this.txt(short, { fontSize: 12, fontWeight: '600', fill: 0x1d2127, wordWrap: true, wordWrapWidth: id === 'cfo' ? 230 : 165, lineHeight: 15 });
    const c = new PIXI.Container(), pad = 8;
    c.addChild(new PIXI.Graphics().roundRect(0, 0, t.width + pad * 2, t.height + pad * 2, 9).fill(0xf8f2e3).stroke({ width: 1, color: 0xd6ad57 })
      .poly([14, t.height + pad * 2, 28, t.height + pad * 2, 12, t.height + pad * 2 + 9]).fill(0xf8f2e3));
    t.position.set(pad, pad); c.addChild(t); this.fx.addChild(c); this.bubbles.set(id, { c, life: frames });
  }
  private showTag(a: Actor, title: string) {
    this.tagFor = a;
    this.tag.removeChildren();
    const t1 = this.txt(title, { fontSize: 13, fontWeight: '700', fill: 0xefe8d8 });
    const t2 = this.txt(a.lastAction, { fontSize: 11, fill: 0xb4bac4 }); t2.y = 17;
    const w = Math.max(t1.width, t2.width) + 20;
    this.tag.addChild(new PIXI.Graphics().roundRect(-10, -8, w, 44, 9).fill({ color: 0x121418, alpha: 0.92 }), t1, t2);
    this.tag.visible = true;
  }
  private hideTag() { this.tag.visible = false; this.tagFor = null; }
  private deskOf(id: string) { const a = this.actors.get(id); return a ? { x: a.box.x - 24, y: a.box.y - 70 } : CFO_HOME; }

  // ---------------------------------------------------------------- public API: real events in
  /** Dim everyone not on this team (the job page's mini office). */
  focus(team: string[] | null) {
    for (const [id, a] of this.actors) {
      const on = !team || id === 'cfo' || team.includes(id);
      a.box.alpha = on ? 1 : 0.35;
      for (const d of this.decor.get(id) ?? []) d.alpha = on ? 1 : 0.45;
    }
  }

  handle(e: OfficeEvent) {
    if (this.destroyed || !this.actors.size) return;
    const d = e.data ?? {};
    if (e.type === 'step') {
      const a = this.actors.get(d.agent);
      if (!a) return;
      a.activeUntil = performance.now() + 9000;
      a.lastAction = `${d.step}${d.note ? ` · ${d.note}` : ''}`;
      this.say(d.agent, a.lastAction);
    } else if (e.type === 'purchase') {
      const a = this.actors.get(d.agent);
      if (!a) return;
      a.activeUntil = performance.now() + 9000;
      a.lastAction = `bought ${d.vendor} for ${Number(d.usd).toFixed(4)}`;
      const from = this.deskOf(d.agent);
      this.coin(from, TRAY, 0, 80, () => { this.burst(TRAY.x, TRAY.y, 4, 0x7fd6c8, 2, 0.1, 20, 2.5); this.float(TRAY.x - 10, TRAY.y - 30, `−${Number(d.usd).toFixed(3)}`); });
    } else if (e.type === 'order') {
      const cfo = this.actors.get('cfo')!;
      const team: string[] = (d.team ?? []).filter((r: string) => this.actors.has(r));
      const name = SERVICE[d.service] ?? d.service;
      if (d.status === 'queued') {
        cfo.set('talk');
        this.say('cfo', `New job: ${name} · ${d.promo ? 'free first job' : `${Number(d.price).toFixed(2)} USDC, bond ${Number(d.bond).toFixed(2)}`}`, 150);
        setTimeout(() => {
          cfo.onSlam = () => { this.shake = 9; this.seal(cfo.box.x - 62, cfo.box.y + 14, (e.orderId ?? '').slice(-8)); this.burst(cfo.box.x - 62, cfo.box.y + 10, 12, 0xb9a47a, 4, 0.2, 35, 2.5); };
          cfo.set('stamp');
        }, 1600);
        for (const r of team) { const a = this.actors.get(r)!; a.activeUntil = performance.now() + 4000; }
      } else if (d.status === 'delivered') {
        for (const r of team) this.actors.get(r)!.set('cheer');
        this.say(team.includes('auditor') ? 'auditor' : 'cfo', 'Checked and delivered. Over to the customer.', 150);
      } else if (d.status === 'accepted') {
        cfo.set('thumbs');
        if (!d.promo) {
          for (let i = 0; i < 5; i++) this.coin(TRAY, VAULT, i * 6, 150, i === 4 ? () => this.float(VAULT.x, VAULT.y + 30, `+${Number(d.price).toFixed(2)} USDC`, 0xf0cf85) : undefined);
          this.say('cfo', d.by === 'auto' ? `Auto-accepted after 48 h: +${Number(d.price).toFixed(2)} revenue` : `Accepted: +${Number(d.price).toFixed(2)} USDC revenue`, 160);
        } else this.say('cfo', 'Free job accepted. A happy first customer.', 150);
      } else if (d.status === 'rejected' || d.status === 'failed') {
        cfo.set('stern');
        for (const r of team) { const a = this.actors.get(r)!; a.set('sad'); this.cloud(a); }
        if (d.refund) {
          for (let i = 0; i < 4; i++) this.coin(VAULT, DOOR, i * 6, 120);
          for (let i = 0; i < 3; i++) this.coin(VAULT, DOOR, 26 + i * 6, 140, i === 2 ? () => this.float(DOOR.x + 60, DOOR.y - 40, `−${Number(d.refund.priceUsd).toFixed(2)} −${Number(d.refund.bondUsd).toFixed(2)} bond`, 0xf2a39b) : undefined, true);
          this.say('cfo', `${d.status === 'failed' ? 'We missed it' : 'Rejected'}: refund + ${Number(d.refund.bondUsd).toFixed(2)} bond paid.`, 170);
        } else this.say('cfo', d.status === 'failed' ? "We couldn't deliver this one." : 'Rejected. We learn from it.', 150);
      } else if (d.status === 'revision') {
        cfo.set('talk');
        this.say('cfo', 'Revision requested. Back to work.', 130);
        for (const r of team) this.actors.get(r)!.activeUntil = performance.now() + 6000;
      }
    }
  }

  destroy() {
    this.destroyed = true;
    try { this.app.destroy(true, { children: true }); } catch { /* not initialised yet */ }
  }
}
