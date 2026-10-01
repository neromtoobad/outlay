// Photos and logos customers upload with an order. Every file is re-encoded on our server (which also
// strips camera metadata such as GPS location) and stored under a random id on the books volume.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DATA_DIR } from './config.ts';
import { prepPhoto } from './site/photos.ts';

const dir = () => join(DATA_DIR, 'uploads');
const ID = /^up_[a-f0-9]{16}$/;
export const MAX_BYTES = 12 * 1024 * 1024;

export const uploadExists = (id: string) => ID.test(id) && existsSync(join(dir(), `${id}.jpg`));
export const uploadPath = (id: string) => (ID.test(id) ? join(dir(), `${id}.jpg`) : undefined);
export const readUpload = (id: string) => { const p = uploadPath(id); return p && existsSync(p) ? readFileSync(p) : undefined; };

/** Re-encode an uploaded image (max 2400 px wide) and store it. Throws if it isn't a readable image. */
export async function saveUpload(buf: Buffer): Promise<{ id: string; w: number; h: number }> {
  if (buf.length > MAX_BYTES) throw new Error('That file is over 12 MB.');
  const img = await prepPhoto(buf, 2400, 3).catch(() => { throw new Error('That file is not an image we can read.'); });
  mkdirSync(dir(), { recursive: true });
  const id = `up_${randomBytes(8).toString('hex')}`;
  writeFileSync(join(dir(), `${id}.jpg`), img.buf);
  return { id, w: img.w, h: img.h };
}

// A small per-address limit so the endpoint can't be used as free storage.
const recent = new Map<string, number[]>();
export function allowUpload(who: string, n: number): boolean {
  const now = Date.now(), list = (recent.get(who) ?? []).filter((t) => now - t < 3600_000);
  if (list.length + n > 60) return false;
  recent.set(who, [...list, ...Array(n).fill(now)]);
  return true;
}
