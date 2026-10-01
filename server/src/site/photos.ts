// Photos for customer sites: resized and recompressed on our server (the hero stays well under 200 KB,
// since most visitors are on paid mobile data), with their real pixel size so the page never jumps.
import { ffmpeg } from '../media.ts';

/** Width and height from a JPEG's frame header (no image library needed). */
export function jpegSize(b: Buffer): { w: number; h: number } | undefined {
  if (b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return undefined;
}

/** Any image in, a progressive JPEG out, at most `maxW` wide. */
export async function prepPhoto(buf: Buffer, maxW: number, quality = 5): Promise<{ buf: Buffer; w: number; h: number }> {
  const out = await ffmpeg({ 'in': buf }, (f, o) => ['-i', f['in'], '-vf', `scale='min(${maxW},iw)':-2:flags=lanczos,format=yuvj420p`, '-q:v', String(quality), '-frames:v', '1', o], 'jpg');
  const size = jpegSize(out) ?? { w: maxW, h: Math.round(maxW * 0.75) };
  return { buf: out, ...size };
}
