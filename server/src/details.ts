// Business details from the order form: who the business is, how customers reach it, its links, what
// it sells, its photos, and how the owner wants it to look. Cleaned here (lengths, URLs, colours, ids)
// and turned into a readable brief, so the quote, the escrow terms and the email all show what was asked.
import { THEMES } from './site/themes.ts';
import { uploadExists } from './uploads.ts';

export const SECTION_CHOICES = ['offer', 'gallery', 'reviews', 'about', 'steps', 'location', 'faq'] as const;
export const KIND_CHOICES = ['food', 'beauty', 'creative', 'health', 'retail', 'professional', 'events', 'other'] as const;

export type BusinessDetails = {
  name: string;
  kind: (typeof KIND_CHOICES)[number];
  offer: string;
  area?: string;
  city?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  address?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  maps?: string;
  website?: string;
  menu?: string; // "one per line: item – price"
  story?: string;
  style?: string; // a theme id, or "auto"
  colour?: string; // #rrggbb, or empty to take it from their photos
  sections?: string[];
  notes?: string;
  logo?: string; // upload id
  photos?: string[]; // upload ids
};

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) || undefined : undefined);
const multiline = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) || undefined : undefined);
const url = (v: unknown) => {
  const t = s(v, 300);
  if (!t) return undefined;
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : undefined; } catch { return undefined; }
};
const handle = (v: unknown) => { const t = s(v, 120); if (!t) return undefined; const h = t.replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\/@?/i, '').replace(/^@/, '').replace(/[/?#].*$/, ''); return /^[\w.]{1,60}$/.test(h) ? h : undefined; };

/** Throws a plain-English error when something required is missing. */
export function cleanDetails(raw: any): BusinessDetails {
  const name = s(raw?.name, 80), offer = s(raw?.offer, 220);
  if (!name) throw new Error('Add the business name.');
  if (!offer) throw new Error('Say in one line what the business sells.');
  const kind = (KIND_CHOICES as readonly string[]).includes(raw?.kind) ? raw.kind : 'other';
  const style = raw?.style === 'auto' || raw?.style in THEMES ? raw.style : 'auto';
  const colour = typeof raw?.colour === 'string' && /^#[0-9a-f]{6}$/i.test(raw.colour) ? raw.colour.toLowerCase() : undefined;
  const sections = Array.isArray(raw?.sections) ? raw.sections.filter((x: unknown) => (SECTION_CHOICES as readonly string[]).includes(x as string)) : undefined;
  const photos = Array.isArray(raw?.photos) ? raw.photos.filter((x: unknown) => typeof x === 'string' && uploadExists(x)).slice(0, 12) : undefined;
  const d: BusinessDetails = {
    name, kind, offer, area: s(raw?.area, 80), city: s(raw?.city, 60),
    whatsapp: s(raw?.whatsapp, 30), phone: s(raw?.phone, 30), email: s(raw?.email, 120), address: s(raw?.address, 200),
    instagram: handle(raw?.instagram), tiktok: handle(raw?.tiktok), facebook: handle(raw?.facebook), maps: url(raw?.maps), website: url(raw?.website),
    menu: multiline(raw?.menu, 2500), story: multiline(raw?.story, 800), style, colour, sections, notes: multiline(raw?.notes, 600),
    logo: typeof raw?.logo === 'string' && uploadExists(raw.logo) ? raw.logo : undefined, photos,
  };
  if (!d.whatsapp && !d.phone && !d.email) throw new Error('Add at least one way for customers to reach the business: WhatsApp, phone or email.');
  return d;
}

/** The details as a readable brief: shown on the quote and the order, and hashed into the escrow terms. */
export function detailsBrief(d: BusinessDetails, service: string): string {
  const lines = [
    `${service === 'website' ? 'A website for' : 'For'} ${d.name}: ${d.offer}${d.area || d.city ? ` (${[d.area, d.city].filter(Boolean).join(', ')})` : ''}.`,
    d.whatsapp && `WhatsApp: ${d.whatsapp}`, d.phone && d.phone !== d.whatsapp && `Phone: ${d.phone}`, d.email && `Email: ${d.email}`, d.address && `Address: ${d.address}`,
    d.instagram && `Instagram: @${d.instagram}`, d.tiktok && `TikTok: @${d.tiktok}`, d.facebook && `Facebook: ${d.facebook}`, d.maps && `Google Maps: ${d.maps}`, d.website && `Current website: ${d.website}`,
    d.menu && `Menu / prices:\n${d.menu}`, d.story && `About: ${d.story}`,
    d.style && d.style !== 'auto' && `Look: ${d.style}`, d.colour && `Brand colour: ${d.colour}`,
    d.sections?.length && d.sections.length < SECTION_CHOICES.length && `Sections wanted: ${d.sections.join(', ')}`,
    (d.photos?.length || d.logo) && `Uploaded: ${d.logo ? 'logo' : ''}${d.logo && d.photos?.length ? ' + ' : ''}${d.photos?.length ? `${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}` : ''}`,
    d.notes && `Notes: ${d.notes}`,
  ];
  return lines.filter(Boolean).join('\n');
}
