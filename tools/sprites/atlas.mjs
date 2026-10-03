// Packs each sprite folder's frames into one WebP atlas, so the office loads one image per character
// instead of eight or more PNGs. Writes <id>.atlas.webp and <id>.atlas.json next to the frames
// (the PNG frames stay: the site's avatars use them).
//   node atlas.mjs            → every folder in assets/sprites that has <id>.json
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../assets/sprites/', import.meta.url).pathname;
const PAD = 2;
let before = 0, after = 0;
for (const id of readdirSync(ROOT)) {
  const dir = join(ROOT, id), metaFile = join(dir, `${id}.json`);
  if (!statSync(dir).isDirectory() || !existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const frames = await Promise.all(meta.frames.map(async (f) => {
    const file = join(dir, f.file); before += statSync(file).size;
    const m = await sharp(file).metadata();
    return { file, w: m.width, h: m.height };
  }));
  // rows no wider than 4000 px: some phone GPUs can't hold a texture over 4096 px on a side
  const MAXW = 4000, rowH = Math.max(...frames.map((f) => f.h)) + PAD;
  let x = 0, y = 0, W = 0;
  const rects = frames.map((f) => {
    if (x > 0 && x + f.w > MAXW) { x = 0; y += rowH; }
    const r = [x, y, f.w, f.h]; x += f.w + PAD; W = Math.max(W, x); return r;
  });
  const H = y + rowH;
  const out = join(dir, `${id}.atlas.webp`);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((f, i) => ({ input: f.file, left: rects[i][0], top: rects[i][1] })))
    .webp({ quality: 88, alphaQuality: 92, effort: 6, smartSubsample: true })
    .toFile(out);
  writeFileSync(join(dir, `${id}.atlas.json`), JSON.stringify({ image: `${id}.atlas.webp`, rects }));
  after += statSync(out).size;
  console.log(id.padEnd(16), `${frames.length} frames`, `${W}x${H}`, `${Math.round(statSync(out).size / 1024)} KB`);
}
console.log(`PNG frames ${Math.round(before / 1024)} KB → atlases ${Math.round(after / 1024)} KB`);
