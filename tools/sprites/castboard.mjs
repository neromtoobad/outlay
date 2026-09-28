// Cast board: one row per character, 8 frames each, normalised to the same height.
//   node castboard.mjs <spritesDir> <out.png> <id> [id...]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , dir, outFile, ...ids] = process.argv;
const ROW_H = 200, CELL_W = 150, LABEL_W = 110;
const composite = [];
for (const [r, id] of ids.entries()) {
  const meta = JSON.parse(readFileSync(join(dir, id, `${id}.json`), 'utf8'));
  const label = Buffer.from(`<svg width="${LABEL_W}" height="${ROW_H}"><text x="10" y="${ROW_H / 2}" font-family="Helvetica" font-size="18" font-weight="700" fill="#e9e4d8">${id}</text></svg>`);
  composite.push({ input: label, left: 0, top: r * ROW_H });
  for (const [c, f] of meta.frames.entries()) {
    const img = await sharp(join(dir, id, f.file)).resize({ height: ROW_H - 10, width: CELL_W - 6, fit: 'inside' }).toBuffer();
    const { width } = await sharp(img).metadata();
    composite.push({ input: img, left: LABEL_W + c * CELL_W + Math.round((CELL_W - width) / 2), top: r * ROW_H + 5 });
  }
}
await sharp({ create: { width: LABEL_W + 8 * CELL_W, height: ids.length * ROW_H, channels: 4, background: { r: 40, g: 44, b: 52, alpha: 1 } } })
  .composite(composite).png().toFile(outFile);
console.log(`cast board → ${outFile}`);
