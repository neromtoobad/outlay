// Contact sheet of sliced frames on a dark background, for eyeballing cut quality.
//   node contact.mjs <framesDir> <name> <out.png> [cols=4]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , dir, name, outFile, colsArg] = process.argv;
const meta = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const cols = Number(colsArg ?? 4), rows = Math.ceil(meta.frames.length / cols);
const w = meta.frameWidth, h = meta.frameHeight;
const composite = meta.frames.map((f, i) => ({ input: join(dir, f.file), left: (i % cols) * w, top: Math.floor(i / cols) * h }));
await sharp({ create: { width: w * cols, height: h * rows, channels: 4, background: { r: 40, g: 44, b: 52, alpha: 1 } } })
  .composite(composite).png().toFile(outFile);
console.log(`contact sheet ${w * cols}×${h * rows} → ${outFile}`);
