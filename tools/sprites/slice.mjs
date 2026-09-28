// Slice a Higgsfield pose sheet (poses on a white background) into transparent,
// feet-aligned frames. No credits: pure local image processing.
//
//   node slice.mjs <sheet.png> <outDir> <name> [expectedPoses=8]
//
// Output: <outDir>/<name>-<i>.png (all frames share one canvas size, feet on
// the bottom edge, horizontally anchored on the feet) + <outDir>/<name>.json.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [src, outDir, name, expectedArg] = args.filter((a) => !a.startsWith('--'));
if (!src || !outDir || !name) {
  console.error('usage: node slice.mjs <sheet.png> <outDir> <name> [expectedPoses] [--shadow-bottom=0.3] [--anchor=head]');
  process.exit(1);
}
const expected = Number(expectedArg ?? 8);
// Props only: pale grey "floor shadow" pixels in the bottom fraction of each object
// become a translucent dark shadow instead of a white smudge. Don't use on characters
// (white sneakers live down there).
const shadowBottom = flags['shadow-bottom'] ? Number(flags['shadow-bottom']) : 0;

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (x, y) => (y * W + x) * 4;

// 1. Background = near-white, low-saturation pixels connected to the border.
const HARD = 226; // min channel to count as background
const SAT = 16;   // max - min channel spread
const bg = new Uint8Array(W * H);
const isBgCandidate = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn >= HARD && mx - mn <= SAT;
};
const queue = new Int32Array(W * H);
let qh = 0, qt = 0;
const seed = (x, y) => {
  const k = y * W + x;
  if (!bg[k] && isBgCandidate(k * 4)) { bg[k] = 1; queue[qt++] = k; }
};
for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
while (qh < qt) {
  const k = queue[qh++], x = k % W, y = (k / W) | 0;
  if (x > 0) seed(x - 1, y);
  if (x < W - 1) seed(x + 1, y);
  if (y > 0) seed(x, y - 1);
  if (y < H - 1) seed(x, y + 1);
}

// 1b. Enclosed holes (e.g. the gap between striding legs) never touch the border.
// Any enclosed near-white patch bigger than an eye-white is background too.
const HOLE_MIN = 200;
const seen = new Uint8Array(W * H);
for (let k0 = 0; k0 < W * H; k0++) {
  if (bg[k0] || seen[k0] || !isBgCandidate(k0 * 4)) continue;
  const region = [];
  qh = 0; qt = 0; queue[qt++] = k0; seen[k0] = 1;
  while (qh < qt) {
    const k = queue[qh++], x = k % W, y = (k / W) | 0;
    region.push(k);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!bg[n] && !seen[n] && isBgCandidate(n * 4)) { seen[n] = 1; queue[qt++] = n; }
    }
  }
  if (region.length >= HOLE_MIN) for (const k of region) bg[k] = 1;
}

// 2. Alpha: background → 0; a 2-pixel soft ring around it, where bright pixels
// fade out and are un-mixed from white so edges don't keep a white halo.
const out = Buffer.from(data);
for (let k = 0; k < W * H; k++) if (bg[k]) out[k * 4 + 3] = 0;
const SOFT_LO = 150;
for (let ring = 0; ring < 2; ring++) {
  const edge = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (bg[k]) continue;
    if (bg[k - 1] || bg[k + 1] || bg[k - W] || bg[k + W]) edge.push(k);
  }
  for (const k of edge) {
    const i = k * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b);
    if (mn > SOFT_LO) {
      const a = Math.max(0.05, Math.min(1, (255 - mn) / (255 - SOFT_LO)));
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - a) * 255) / a)));
      }
      out[i + 3] = Math.round(a * 255);
    }
    bg[k] = 2; // next ring treats this as edge
  }
}

// 3. Connected components of opaque pixels.
const label = new Int32Array(W * H).fill(-1);
const comps = [];
for (let k = 0; k < W * H; k++) {
  if (label[k] !== -1 || out[k * 4 + 3] === 0) continue;
  const id = comps.length;
  let minX = W, minY = H, maxX = 0, maxY = 0, area = 0;
  qh = 0; qt = 0; queue[qt++] = k; label[k] = id;
  while (qh < qt) {
    const c = queue[qh++], x = c % W, y = (c / W) | 0;
    area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (n < 0 || n >= W * H) continue;
      if (Math.abs((n % W) - x) > 1) continue;
      if (label[n] === -1 && out[n * 4 + 3] > 0) { label[n] = id; queue[qt++] = n; }
    }
  }
  comps.push({ id, minX, minY, maxX, maxY, area });
}
const big = comps.filter((c) => c.area > 1500).sort((a, b) => b.area - a.area).slice(0, expected);
if (big.length < expected) console.warn(`warning: found ${big.length} poses, expected ${expected}`);
// Merge small fragments (e.g. a detached prop edge) into the nearest pose.
const owner = new Map(big.map((c) => [c.id, c]));
for (const c of comps) {
  if (owner.has(c.id) || c.area < 25) continue;
  let best = null, bestD = 24;
  for (const p of big) {
    const dx = Math.max(p.minX - c.maxX, 0, c.minX - p.maxX);
    const dy = Math.max(p.minY - c.maxY, 0, c.minY - p.maxY);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    owner.set(c.id, best);
    best.minX = Math.min(best.minX, c.minX); best.maxX = Math.max(best.maxX, c.maxX);
    best.minY = Math.min(best.minY, c.minY); best.maxY = Math.max(best.maxY, c.maxY);
  }
}

// 4. Reading order: rows by vertical centre, then left → right.
const rowSplit = H / 2;
const poses = [...big].sort((a, b) => {
  const ra = (a.minY + a.maxY) / 2 > rowSplit ? 1 : 0, rb = (b.minY + b.maxY) / 2 > rowSplit ? 1 : 0;
  return ra - rb || a.minX - b.minX;
});

// 5. Anchor: horizontal centre of opaque pixels in the bottom 12% of each pose (the feet), or with
//    --anchor=head the top 22% (the head), which stays steady through a walk cycle while the feet swap.
const PAD = 6;
const headAnchor = flags.anchor === 'head';
const frames = poses.map((p) => {
  const band = Math.round((p.maxY - p.minY) * (headAnchor ? 0.22 : 0.12));
  const y0 = headAnchor ? p.minY : p.maxY - band, y1 = headAnchor ? p.minY + band : p.maxY;
  let sx = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = p.minX; x <= p.maxX; x++) {
    const k = y * W + x;
    if (owner.get(label[k])?.id === p.id) { sx += x; n++; }
  }
  return { ...p, footX: n ? sx / n : (p.minX + p.maxX) / 2 };
});
const left = Math.max(...frames.map((f) => f.footX - f.minX)) + PAD;
const right = Math.max(...frames.map((f) => f.maxX - f.footX)) + PAD;
const fw = Math.ceil(left + right);
const fh = Math.max(...frames.map((f) => f.maxY - f.minY + 1)) + PAD;

mkdirSync(outDir, { recursive: true });
const meta = { name, source: src, frameWidth: fw, frameHeight: fh, anchor: { x: left / fw, y: 1 }, frames: [] };
for (const [i, f] of frames.entries()) {
  const buf = Buffer.alloc(fw * fh * 4);
  const ox = Math.round(left - f.footX), oy = fh - (f.maxY + 1);
  for (let y = f.minY; y <= f.maxY; y++) for (let x = f.minX; x <= f.maxX; x++) {
    const k = y * W + x;
    if (owner.get(label[k])?.id !== f.id) continue;
    const tx = x + ox, ty = y + oy;
    if (tx < 0 || ty < 0 || tx >= fw || ty >= fh) continue;
    const o = (ty * fw + tx) * 4;
    out.copy(buf, o, k * 4, k * 4 + 4);
    if (shadowBottom && y >= f.maxY - (f.maxY - f.minY) * shadowBottom) {
      const r = data[k * 4], g = data[k * 4 + 1], b = data[k * 4 + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (mx - mn <= 32 && mn >= 140) {
        const a = Math.max(0, Math.min(0.45, (255 - mn) / 230));
        buf[o] = 30; buf[o + 1] = 22; buf[o + 2] = 14; buf[o + 3] = Math.round(a * 255);
      }
    }
  }
  const file = `${name}-${i}.png`;
  await sharp(buf, { raw: { width: fw, height: fh, channels: 4 } }).png().toFile(join(outDir, file));
  meta.frames.push({ index: i, file, bbox: [f.minX, f.minY, f.maxX, f.maxY] });
}
writeFileSync(join(outDir, `${name}.json`), JSON.stringify(meta, null, 2));
console.log(`${frames.length} frames → ${outDir} (${fw}×${fh}, anchor x=${meta.anchor.x.toFixed(2)})`);
