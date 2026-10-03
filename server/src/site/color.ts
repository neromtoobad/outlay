// Colour for customer sites: pull candidate brand colours out of the business's own photos, then build
// a small palette in OKLCH (so lightness steps look even across hues) with contrast checked in code.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FFMPEG } from '../media.ts';

const run = promisify(execFile);
export type RGB = [number, number, number];

// ---------- sRGB ⇄ OKLab ⇄ OKLCH (Björn Ottosson's matrices)

const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

export function rgbToOklch([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** OKLCH to sRGB, reducing chroma until the colour fits the sRGB gamut (keeps lightness and hue). */
export function oklchToRgb(L: number, C: number, H: number): RGB {
  for (let c = C; c >= 0; c -= 0.004) {
    const lin = oklchToLinear(L, c, H);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return lin.map(toSrgb) as RGB;
  }
  return oklchToLinear(L, 0, H).map(toSrgb) as RGB;
}

export const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string): RGB => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB; };
const lum = (rgb: RGB) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------- candidates from photos

/** Average colours of the main clusters in an image (k-means on a 40×40 thumbnail), biggest first. */
export async function clusters(img: Buffer, k = 5): Promise<{ rgb: RGB; share: number }[]> {
  const dir = mkdtempSync(join(tmpdir(), 'syncly-col-'));
  let raw: Buffer;
  try {
    writeFileSync(join(dir, 'i'), img);
    raw = (await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', join(dir, 'i'), '-vf', 'scale=40:40', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1 << 20 } as any)).stdout as unknown as Buffer;
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const px: RGB[] = [];
  for (let i = 0; i + 2 < raw.length; i += 3) px.push([raw[i], raw[i + 1], raw[i + 2]]);
  if (!px.length) return [];
  let centers = Array.from({ length: k }, (_, i) => px[Math.floor(((i + 0.5) * px.length) / k)]);
  let assign: number[] = [];
  for (let it = 0; it < 8; it++) {
    assign = px.map((p) => { let best = 0, bd = Infinity; centers.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }); return best; });
    centers = centers.map((c, j) => { const m = px.filter((_, i) => assign[i] === j); return m.length ? ([0, 1, 2].map((ch) => Math.round(m.reduce((s, p) => s + p[ch], 0) / m.length)) as RGB) : c; });
  }
  return centers.map((rgb, j) => ({ rgb, share: assign.filter((a) => a === j).length / px.length })).sort((a, b) => b.share - a.share);
}

/**
 * Brand colour candidates: saturated, not near-white or near-black, weighted by how much of the
 * photos they cover. A logo counts double. Returns up to 4 distinct hues as hex.
 */
export async function brandCandidates(images: { buf: Buffer; logo?: boolean }[]): Promise<string[]> {
  const pool: { rgb: RGB; score: number }[] = [];
  for (const im of images.slice(0, 8)) {
    try {
      for (const c of await clusters(im.buf)) {
        const [L, C] = rgbToOklch(c.rgb);
        if (L < 0.25 || L > 0.92 || C < 0.06) continue;
        pool.push({ rgb: c.rgb, score: c.share * C * (im.logo ? 2 : 1) });
      }
    } catch { /* unreadable image */ }
  }
  pool.sort((a, b) => b.score - a.score);
  const out: RGB[] = [];
  for (const p of pool) {
    const h = rgbToOklch(p.rgb)[2];
    if (out.every((o) => Math.min(Math.abs(rgbToOklch(o)[2] - h), 360 - Math.abs(rgbToOklch(o)[2] - h)) > 25)) out.push(p.rgb);
    if (out.length >= 4) break;
  }
  return out.map(hex);
}

// ---------- the palette

export type Palette = { bg: string; surface: string; ink: string; muted: string; line: string; brand: string; onBrand: string; brandInk: string; deep: string; onDeep: string; tint: string };

/**
 * Five roles from one brand colour. The action colour is darkened until white text on it passes
 * 4.5:1; text colours are checked against the background they sit on.
 */
export function palette(brandHex: string, mode: 'light' | 'warm' | 'dark' = 'light', action: 'brand' | 'ink' = 'brand'): Palette {
  const [L0, C0, H] = rgbToOklch(fromHex(brandHex));
  const C = Math.max(0.08, Math.min(C0, 0.19));
  const darkText = oklchToRgb(0.2, 0.03, H);
  // The page itself is neutral paper (cream when warm, warm charcoal when dark): a red or pink brand
  // colour taken from the photos must not turn the whole page pink. Only actions and accents carry it.
  const NH = mode === 'light' ? H : mode === 'warm' ? 75 : 55;
  const nc = mode === 'light' ? 0.004 : 0.013;
  // A bright brand (yellow, lime, sky) keeps its colour and takes dark text; darker ones take white.
  let onBrand: RGB = [255, 255, 255];
  let brand = oklchToRgb(Math.min(Math.max(L0, 0.74), 0.88), C, H);
  if (L0 < 0.72 || contrast(brand, darkText) < 7) {
    let L = 0.6;
    brand = oklchToRgb(L, C, H);
    while (contrast(brand, onBrand) < 4.6 && L > 0.3) { L -= 0.02; brand = oklchToRgb(L, C, H); }
  } else onBrand = darkText;
  const bg = mode === 'dark' ? oklchToRgb(0.18, 0.012, NH) : oklchToRgb(mode === 'warm' ? 0.972 : 0.985, nc, NH);
  const ink = mode === 'dark' ? oklchToRgb(0.95, 0.008, NH) : oklchToRgb(0.21, mode === 'warm' ? 0.014 : 0.02, mode === 'warm' ? 55 : H);
  const muted = mode === 'dark' ? oklchToRgb(0.75, 0.012, NH) : oklchToRgb(0.47, 0.012, NH);
  let brandInk = oklchToRgb(mode === 'dark' ? 0.78 : 0.42, C, H);
  if (contrast(brandInk, bg) < 4.5) brandInk = oklchToRgb(mode === 'dark' ? 0.85 : 0.36, C, H);
  if (action === 'ink') {
    // near-black buttons and bands on light pages, near-white on dark ones; the brand colour stays in the accents
    brand = mode === 'dark' ? oklchToRgb(0.93, 0.012, NH) : oklchToRgb(0.24, 0.018, mode === 'warm' ? 55 : H);
    onBrand = mode === 'dark' ? oklchToRgb(0.2, 0.012, NH) : bg;
  }
  const neutralDeep = action === 'ink' || mode !== 'light';
  return {
    bg: hex(bg), ink: hex(ink), muted: hex(muted), brand: hex(brand), onBrand: hex(onBrand), brandInk: hex(brandInk),
    surface: hex(mode === 'dark' ? oklchToRgb(0.23, 0.014, NH) : oklchToRgb(mode === 'warm' ? 0.94 : 0.955, mode === 'warm' ? 0.016 : 0.006, NH)),
    line: hex(mode === 'dark' ? oklchToRgb(0.32, 0.012, NH) : oklchToRgb(0.885, mode === 'warm' ? 0.016 : 0.008, NH)),
    deep: hex(neutralDeep ? oklchToRgb(0.23, 0.016, mode === 'warm' ? 55 : NH) : oklchToRgb(0.24, Math.min(C, 0.06), H)),
    onDeep: hex(oklchToRgb(0.96, 0.012, NH)),
    tint: hex(mode === 'dark' ? oklchToRgb(0.26, 0.02, NH) : oklchToRgb(mode === 'warm' ? 0.95 : 0.96, mode === 'warm' ? 0.02 : 0.012, mode === 'warm' ? 75 : H)),
  };
}
