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
  // for Content Pack
  platforms?: string[];
  goal?: string;
  competitors?: string[]; // handles
  tone?: string;
  // for Motion Ad and Video Ad
  promote?: string; // what the ad is for
  price?: string;
  cta?: 'whatsapp' | 'call' | 'visit' | 'website' | 'dm';
  format?: 'vertical' | 'square' | 'landscape';
  length?: number;
  // for AI Answer Audit
  questions?: string;
};
export const PLATFORM_CHOICES = ['instagram', 'tiktok', 'whatsapp-status', 'facebook', 'x', 'linkedin'] as const;

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) || undefined : undefined);
const multiline = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) || undefined : undefined);
const url = (v: unknown) => {
  const t = s(v, 300);
  if (!t) return undefined;
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : undefined; } catch { return undefined; }
};
const handle = (v: unknown) => { const t = s(v, 120); if (!t) return undefined; const h = t.replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\/@?/i, '').replace(/^@/, '').replace(/[/?#].*$/, ''); return /^[\w.]{1,60}$/.test(h) ? h : undefined; };

const RELEVANT: Record<string, (keyof BusinessDetails)[]> = {
  website: ['whatsapp', 'phone', 'email', 'address', 'maps', 'instagram', 'tiktok', 'facebook', 'website', 'menu', 'story', 'style', 'colour', 'sections', 'notes', 'logo', 'photos'],
  'content-pack': ['whatsapp', 'instagram', 'tiktok', 'website', 'competitors', 'platforms', 'goal', 'tone', 'colour', 'notes', 'photos'],
  'motion-ad': ['promote', 'price', 'cta', 'whatsapp', 'phone', 'instagram', 'website', 'address', 'format', 'length', 'colour', 'notes', 'logo', 'photos'],
  'video-ad': ['promote', 'price', 'cta', 'whatsapp', 'phone', 'instagram', 'website', 'address', 'colour', 'notes', 'logo', 'photos'],
  'ai-answer-audit': ['website', 'instagram', 'maps', 'menu', 'questions'],
};

/** Throws a plain-English error when something required is missing (what's required depends on the service). */
export function cleanDetails(raw: any, service = 'website'): BusinessDetails {
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
    platforms: Array.isArray(raw?.platforms) ? raw.platforms.filter((x: unknown) => (PLATFORM_CHOICES as readonly string[]).includes(x as string)) : undefined,
    goal: s(raw?.goal, 160), tone: s(raw?.tone, 120),
    competitors: Array.isArray(raw?.competitors) ? raw.competitors.map(handle).filter(Boolean).slice(0, 3) as string[] : typeof raw?.competitors === 'string' ? raw.competitors.split(/[\s,]+/).map(handle).filter(Boolean).slice(0, 3) as string[] : undefined,
    promote: s(raw?.promote, 200), price: s(raw?.price, 60),
    cta: ['whatsapp', 'call', 'visit', 'website', 'dm'].includes(raw?.cta) ? raw.cta : undefined,
    format: ['vertical', 'square', 'landscape'].includes(raw?.format) ? raw.format : undefined,
    length: [12, 16, 20, 24].includes(Number(raw?.length)) ? Number(raw.length) : undefined,
    questions: multiline(raw?.questions, 600),
  };
  // The form keeps one draft across services; keep only what this service uses, so nothing stale leaks in.
  const keep = RELEVANT[service] ?? RELEVANT.website;
  for (const k of Object.keys(d) as (keyof BusinessDetails)[]) if (!['name', 'kind', 'offer', 'area', 'city'].includes(k) && !keep.includes(k)) delete d[k];
  if (service === 'motion-ad' || service === 'video-ad') {
    if (d.cta !== 'call' && d.cta !== 'whatsapp') delete d.whatsapp, delete d.phone;
    if (d.cta !== 'visit') delete d.address;
  }
  const reach = d.whatsapp || d.phone || d.email || d.website;
  if (service === 'website' && !d.whatsapp && !d.phone && !d.email) throw new Error('Add at least one way for customers to reach the business: WhatsApp, phone or email.');
  if ((service === 'motion-ad' || service === 'video-ad') && !reach && !d.instagram) throw new Error('Add how customers should respond to the ad: WhatsApp, phone, website or Instagram.');
  if (service === 'ai-answer-audit' && !d.city && !d.area) throw new Error('Add the area or city: the AI assistants are asked about businesses there.');
  if (service === 'content-pack' && !d.platforms?.length) d.platforms = ['instagram', 'tiktok'];
  return d;
}

/** The details as a readable brief: shown on the quote and the order, and hashed into the escrow terms. */
export function detailsBrief(d: BusinessDetails, service: string): string {
  const what = ({ website: 'A website for', 'content-pack': 'A content pack for', 'motion-ad': 'A motion ad for', 'video-ad': 'A video ad for', 'ai-answer-audit': 'An AI answer audit for' } as Record<string, string>)[service] ?? 'For';
  const ctaText = d.cta ? ({ whatsapp: `Order on WhatsApp ${d.whatsapp ?? d.phone ?? ''}`, call: `Call ${d.phone ?? d.whatsapp ?? ''}`, visit: `Visit us${d.address ? ` at ${d.address}` : ''}`, website: `Order at ${d.website ?? ''}`, dm: `DM us on Instagram @${d.instagram ?? ''}` } as const)[d.cta].trim() : undefined;
  const lines = [
    `${what} ${d.name}: ${d.offer}${d.area || d.city ? ` (${[d.area, d.city].filter(Boolean).join(', ')})` : ''}.`,
    d.promote && `Promote: ${d.promote}`, d.price && `Price: ${d.price}`, ctaText && `Call to action: ${ctaText}`,
    d.format && `Format: ${d.format}${d.length ? `, ${d.length} seconds` : ''}`,
    d.platforms?.length && service === 'content-pack' && `Platforms: ${d.platforms.join(', ')}`, d.goal && `Goal: ${d.goal}`, d.tone && `Tone: ${d.tone}`,
    d.competitors?.length && `Competitors: ${d.competitors.map((c) => `@${c}`).join(', ')}`,
    d.questions && `Questions customers ask:\n${d.questions}`,
    d.whatsapp && `WhatsApp: ${d.whatsapp}`, d.phone && d.phone !== d.whatsapp && `Phone: ${d.phone}`, d.email && `Email: ${d.email}`, d.address && `Address: ${d.address}`,
    d.instagram && `Instagram: @${d.instagram}`, d.tiktok && `TikTok: @${d.tiktok}`, d.facebook && `Facebook: ${d.facebook}`, d.maps && `Google Maps: ${d.maps}`, d.website && `Current website: ${d.website}`,
    d.menu && `Menu / prices:\n${d.menu}`, d.story && `About: ${d.story}`,
    d.style && d.style !== 'auto' && `Look: ${d.style}`, d.colour && `Brand colour: ${d.colour}`,
    service === 'website' && d.sections?.length && d.sections.length < SECTION_CHOICES.length && `Sections wanted: ${d.sections.join(', ')}`,
    (d.photos?.length || d.logo) && `Uploaded: ${d.logo ? 'logo' : ''}${d.logo && d.photos?.length ? ' + ' : ''}${d.photos?.length ? `${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}` : ''}`,
    d.notes && `Notes: ${d.notes}`,
  ];
  return lines.filter(Boolean).join('\n');
}
