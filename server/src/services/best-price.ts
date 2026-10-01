// Best Price Finder: where to buy each item cheapest, delivered, from a seller you can trust.
// Researcher parses the order → Scout searches Google Shopping in the customer's country, plus Google on
// the local marketplaces, on Amazon/AliExpress/Temu and on the open web → Researcher sorts real offers
// from accessories, look-alikes, list pages and guides → Analyst prices everything in the customer's
// currency (live rate from Google) with delivery → Reader re-opens the top offers' pages (APEX fetch; Exa's
// copy for pages that need a browser) and code checks the price is really on the page → rules flag scam
// risks → Auditor (other model family) vets the picks → report + CSV of every offer. The core (shopFrom +
// findPrices) runs inside other jobs too: Buy Smart prices its items with it.
import { Job } from '../job.ts';
import { MODELS } from '../config.ts';
import { buy } from '../x402.ts';
import { HOSTS, llm, parseJson } from '../tools.ts';
import { ortho } from '../sellers.ts';
import { MAIL_BUDGET_USD, MAIL_HOST } from '../mail.ts';
import * as F from './best-price.fixtures.ts';

export type Item = { name: string; query: string; qty: number; condition: 'new' | 'used' | 'any'; mustHave: string[]; imageUrl?: string; identify?: boolean };
export type Spec = { items: Item[]; city: string; country: string; gl: string; currency: string; budget?: Money | null; marketplaces: string[] };
export type Money = { amount: number; currency: string };
export type Tier = 'retailer' | 'marketplace' | 'classifieds' | 'unknown';
export type Cond = 'new' | 'used' | 'refurbished' | 'unknown';
export type Offer = {
  id: string; item: number; via: string; seller: string; host: string; title: string; link: string; snippet: string;
  listed?: Money; deliveryListed?: Money | 'free'; unit?: number; delivery?: number; total?: number; // unit/delivery/total: customer's currency
  match: string; condition: Cond; rating?: number; ratingCount?: number; store?: string; sellerScore?: string;
  tier: Tier; abroad: boolean; checked: string; inStock?: boolean; notes: string[]; risk?: string; rejected?: string; excerpt?: string;
};
export type Page = { text: string; via: 'live' | 'copy' };
type Stats = { n: number; min?: number; med?: number; max?: number };

// ---------- markets and sellers

const MARKETS: Record<string, { cur: string; sites: string[] }> = {
  ng: { cur: 'NGN', sites: ['jumia.com.ng', 'konga.com', 'jiji.ng', 'slot.ng', 'kara.com.ng'] },
  gh: { cur: 'GHS', sites: ['jumia.com.gh', 'jiji.com.gh', 'compughana.com', 'melcom.com'] },
  ke: { cur: 'KES', sites: ['jumia.co.ke', 'kilimall.co.ke', 'jiji.co.ke', 'phoneplacekenya.com'] },
  za: { cur: 'ZAR', sites: ['takealot.com', 'makro.co.za', 'game.co.za', 'incredible.co.za'] },
  eg: { cur: 'EGP', sites: ['jumia.com.eg', 'amazon.eg', 'noon.com', 'btech.com'] },
  us: { cur: 'USD', sites: ['amazon.com', 'walmart.com', 'bestbuy.com', 'target.com', 'ebay.com'] },
  gb: { cur: 'GBP', sites: ['amazon.co.uk', 'argos.co.uk', 'currys.co.uk', 'ebay.co.uk'] },
  in: { cur: 'INR', sites: ['amazon.in', 'flipkart.com', 'croma.com', 'reliancedigital.in'] },
  ae: { cur: 'AED', sites: ['amazon.ae', 'noon.com', 'sharafdg.com'] },
};
const INTL = ['amazon.com', 'aliexpress.com', 'temu.com'];
const HOME: Record<string, string> = { 'amazon.com': 'us', 'amazon.co.uk': 'gb', 'ebay.com': 'us', 'ebay.co.uk': 'gb', 'walmart.com': 'us' };
const FROM_CHINA = /aliexpress|temu\.com|alibaba|shein|dhgate/;

const CLASSIFIEDS = /\bjiji\b|\bolx\b|gumtree|craigslist|facebook|locanto/i;
const MARKETPLACES = /jumia|konga|amazon|aliexpress|\btemu\b|ebay|kilimall|takealot|\bnoon\b|flipkart|etsy/i;
const RETAILERS = /\bslot\b|pointek|3c ?hub|\bkara\b|ogabassey|fouani|walmart|best ?buy|target\.com|argos|currys|john ?lewis|game\.co\.za|makro|incredible|croma|reliance ?digital|sharaf|carrefour|melcom|compu ?ghana|franko|phone ?place|hotpoint|btech/i;
const BRAND_HOST = /(^|\.)(samsung|apple|hp|dell|lenovo|mi|oraimo|lg|sony|nokia|hisense|tecno-mobile|infinixmobility|itel-life)\.com$/i;
const NAMES: [RegExp, string][] = [[/jumia/, 'Jumia'], [/konga/, 'Konga'], [/jiji/, 'Jiji'], [/slot\.ng/, 'Slot'], [/kara\.com/, 'Kara'], [/pointek/, 'Pointek'], [/3chub/, '3CHub'], [/amazon/, 'Amazon'], [/aliexpress/, 'AliExpress'], [/temu/, 'Temu'], [/ebay/, 'eBay'], [/walmart/, 'Walmart'], [/takealot/, 'Takealot'], [/kilimall/, 'Kilimall']];

export const hostOf = (u: string) => { try { return new URL(u).host.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
export const isGoogle = (u: string) => /(^|\.)google\.[a-z.]+$/.test(hostOf(u));
export const nameOf = (host: string) => NAMES.find(([re]) => re.test(host))?.[1] ?? host;
export const tierOf = (seller: string, host: string): Tier => {
  const s = `${seller} ${isGoogle(`https://${host}`) ? '' : host}`;
  return CLASSIFIEDS.test(s) ? 'classifieds' : MARKETPLACES.test(s) ? 'marketplace' : RETAILERS.test(s) || BRAND_HOST.test(host) ? 'retailer' : 'unknown';
};
/** "Slot Systems Limited" on Google Shopping and slot.ng are the same seller; a marketplace store counts on its own. */
export const sellerKey = (o: Offer) => {
  const byHost = isGoogle(o.link) ? undefined : NAMES.find(([re]) => re.test(o.host))?.[1];
  const byName = o.seller.toLowerCase().replace(/\.com(\.\w+)?|\b(nigeria|limited|ltd|plc|systems|online|store|shop|official)\b|[^a-z0-9 ]/g, '').trim().split(/\s+/)[0];
  return (o.store ?? byHost ?? (byName || o.seller)).toLowerCase();
};
const canon = (u: string) => {
  try {
    const x = new URL(u); x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|gclid|srsltid|ref$)/.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/\/$/, '');
  } catch { return u; }
};

// ---------- money

const CODES = 'NGN|USD|GBP|EUR|KES|GHS|ZAR|EGP|INR|AED|CAD|AUD|XOF|UGX|TZS|RWF|MAD';
const NUM = String.raw`\d{1,3}(?:[,.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEY = new RegExp(String.raw`(US\s?\$|C\$|A\$|GH[₵¢]|K[Ss]h|Rs\.?|E£|₦|£|€|₹|\$|\b(?:${CODES})\b|\bN(?=\d)|\bR(?=\s?\d))\s?(${NUM})([kK]\b)?|(${NUM})\s?(\b(?:${CODES})\b)`, 'g');
const DOLLAR = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD']);
export const SYMBOL: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R', INR: '₹', EGP: 'E£', AED: 'AED ' };
export const WHOLE = new Set(['NGN', 'KES', 'INR', 'EGP', 'UGX', 'TZS', 'XOF', 'RWF', 'JPY']);
const SIGN: [RegExp, string][] = [[/^US\s?\$$/, 'USD'], [/^C\$$/, 'CAD'], [/^A\$$/, 'AUD'], [/^₦$/, 'NGN'], [/^GH[₵¢]$/, 'GHS'], [/^K[Ss]h$/, 'KES'], [/^£$/, 'GBP'], [/^€$/, 'EUR'], [/^(₹|Rs\.?)$/, 'INR'], [/^E£$/, 'EGP']];

function num(raw: string): number | undefined {
  let t = raw;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // 1.234.567,89
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.'); // 12,50
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function curOf(sym: string, local: string): string | undefined {
  if (/^[A-Z]{3}$/.test(sym)) return sym;
  if (sym === 'N') return local === 'NGN' ? 'NGN' : undefined; // "N185,000" is how Nigerians write naira
  if (sym === 'R') return local === 'ZAR' ? 'ZAR' : undefined;
  if (sym === '$') return DOLLAR.has(local) ? local : 'USD';
  return SIGN.find(([re]) => re.test(sym))?.[1];
}
export function moneyAll(s: string, local: string): Money[] {
  const out: Money[] = [];
  for (const m of String(s ?? '').matchAll(MONEY)) {
    const currency = curOf((m[1] ?? m[5] ?? '').trim(), local);
    const n = num(m[2] ?? m[4] ?? '');
    if (currency && n) out.push({ amount: m[3] ? n * 1000 : n, currency });
  }
  return out;
}
export const money = (s: unknown, local: string): Money | undefined => moneyAll(String(s ?? ''), local)[0];
export const fmt = (n: number | undefined, cur: string) => n === undefined ? '—'
  : `${SYMBOL[cur] ?? `${cur} `}${n.toLocaleString('en-US', WHOLE.has(cur) || n >= 100000 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtM = (m?: Money) => (m ? fmt(m.amount, m.currency) : '—');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : undefined; };

// ---------- sorting offers

const USED = /\b(used|pre-?owned|second[- ]hand|tokunbo|uk[- ]used|london[- ]used|fairly[- ]used|open[- ]box)\b/i;
const REFURB = /\b(refurb\w*|renewed|reconditioned)\b/i;
const ACCESSORY = /\b(case|cover|screen protector|tempered glass|protector|charger|cable|pouch|skin|holder|stand|strap|replacement|lcd|housing|back glass|film)\b/i;
const FAKE = /\b(replica|clone|master copy|first copy|high copy|dummy|display model|non[- ]working)\b/i;
const LIST_PAGE = /\/catalog\/|[?&](q|k|query|search|keyword)=|\/search\b|\/category\/|for sale ▷|prices? on jiji|\d+ ads for/i;
const GUIDE = /gsmarena|nigeriaprice|pricepadi|naijatechguide|techcabal|gadgets360|youtube|wikipedia|reddit|quora|tiktok|instagram|x\.com|twitter|pinterest|nairaland/i;
const RISK = /bank transfer|transfer (to|into)|whatsapp|western union|gift ?card|crypto|bitcoin|pay (first|before)|no refund|advance payment|no pay on delivery/i;
const OUT = /out of stock|sold out|currently unavailable|no longer available|not available|unavailable/i;
const IN = /in stock|add to (cart|bag|basket)|buy now|available|only \d+ left/i;
const CODE: Record<string, string> = { E: 'exact', V: 'variant', A: 'accessory', B: 'bundle', L: 'list', G: 'guide', F: 'fake', O: 'other' };
const CONDS: Record<string, Cond> = { N: 'new', U: 'used', R: 'refurbished' };

const condOf = (s: string): Cond => (REFURB.test(s) ? 'refurbished' : USED.test(s) ? 'used' : /\bbrand[- ]new\b|\bnew\b|\bsealed\b/i.test(s) ? 'new' : 'unknown');
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !['the', 'and', 'for', 'with', 'new', 'buy', 'price'].includes(w));
const overlap = (a: string, b: string) => { const x = words(a), y = new Set(words(b)); return x.length ? x.filter((w) => y.has(w)).length / x.length : 0; };
/** Rules a model can't overrule: list pages, guides and fakes are never offers. Also the fallback sort. */
function guess(o: Offer, it: Item): string {
  if (GUIDE.test(o.host)) return 'guide';
  if (LIST_PAGE.test(isGoogle(o.link) ? o.title : `${o.link} ${o.title}`)) return 'list';
  if (FAKE.test(o.title)) return 'fake';
  if (!words(it.query).every((w) => words(o.title).includes(w))) return 'other';
  return ACCESSORY.test(o.title) ? 'accessory' : 'exact';
}
const condOk = (o: Offer, it: Item) => it.condition !== 'new' || o.condition === 'new' || o.condition === 'unknown';

// "Buy X | Konga Online Shopping", "X : Amazon.com" → "X" (colours like "- Black" stay)
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanTitle = (t: string, host: string) => t.replace(/^buy\s+/i, '').replace(/\s+\|\s+.*$/, '')
  .replace(new RegExp(String.raw`\s+[:–-]\s+(${escRe(nameOf(host))}(\.\w+)*|[\w-]+\.(com|ng|net|org|co\.\w+)(\.\w+)?)$`, 'i'), '').trim();

function offerFrom(item: number, via: string, h: any, local: string): Offer {
  const link = canon(String(h?.link ?? h?.url ?? '')), host = hostOf(link), title = cleanTitle(String(h?.title ?? '').trim(), host);
  const seller = String(h?.source ?? nameOf(host)).slice(0, 60), d = String(h?.delivery ?? '');
  const explicit = [h?.price, h?.priceRange, h?.attributes?.Price, h?.attributes?.price].filter(Boolean).join(' ');
  return {
    id: '', item, via, seller, host, title, link, snippet: String(h?.snippet ?? '').slice(0, 240),
    listed: money(explicit, local) ?? (typeof h?.priceValue === 'number' ? { amount: h.priceValue, currency: local } : money(`${h?.snippet ?? ''} ${title}`, local)),
    deliveryListed: /free/i.test(d) ? 'free' : money(d, local),
    match: '', condition: condOf(`${title} ${h?.condition ?? ''}`), rating: Number(h?.rating) || undefined, ratingCount: Number(h?.ratingCount ?? h?.reviews) || undefined,
    tier: tierOf(seller, host), abroad: false, checked: 'listing price only', notes: [],
  };
}

// Same offer seen twice (Shopping + a site search): keep one, and prefer the store's own link over Google's.
function dedupe(list: Offer[]): Offer[] {
  const out: Offer[] = [];
  for (const o of list) {
    const twin = out.find((x) => x.item === o.item && (x.link === o.link || (!!x.listed && !!o.listed && x.listed.currency === o.listed.currency
      && Math.abs(x.listed.amount - o.listed.amount) < 1 && sellerKey(x) === sellerKey(o) && overlap(x.title, o.title) >= 0.6)));
    if (!twin) { out.push(o); continue; }
    if (isGoogle(twin.link) && !isGoogle(o.link)) { twin.link = o.link; twin.host = o.host; twin.tier = tierOf(twin.seller, o.host); }
    twin.rating ??= o.rating; twin.ratingCount ??= o.ratingCount; twin.deliveryListed ??= o.deliveryListed;
  }
  return out;
}

// ---------- pricing and ranking

function price(o: Offer, it: Item, fx: Map<string, number>) {
  const conv = (m?: Money) => (m && fx.has(m.currency) ? m.amount * fx.get(m.currency)! : undefined);
  o.unit = conv(o.listed);
  o.delivery = o.deliveryListed === 'free' ? 0 : conv(o.deliveryListed);
  o.total = o.unit === undefined ? undefined : o.unit * it.qty + (o.delivery ?? 0); // one delivery fee per order
}
function stats(offers: Offer[], i: number, it: Item): Stats {
  const xs = offers.filter((o) => o.item === i && o.match === 'exact' && o.unit !== undefined && condOk(o, it) && !o.rejected).map((o) => o.unit!);
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, min: s[0], med: median(s), max: s.at(-1) };
}
const tooCheap = (o: Offer, st: Stats) => st.n >= 3 && o.unit !== undefined && o.unit < 0.5 * st.med!;
const eligible = (o: Offer, it: Item, st: Stats) => o.match === 'exact' && o.total !== undefined && condOk(o, it) && o.inStock !== false && !o.rejected && !tooCheap(o, st);
export const confirmed = (o: Offer) => o.checked.startsWith('yes');
/** A seller we know, no warning signs, a landed cost we can state, and a page that didn't contradict the listing. */
export const trusted = (o: Offer) => (o.tier === 'retailer' || o.tier === 'marketplace') && !o.risk && !(o.abroad && o.delivery === undefined) && !o.checked.startsWith('no:');
const safe = (o: Offer) => confirmed(o) && trusted(o);
function rank(offers: Offer[], i: number, it: Item) {
  const st = stats(offers, i, it);
  // an offer that hides its delivery fee must not win on that: rank it as if it charged the typical known fee
  const typical = median(offers.filter((o) => o.item === i && o.match === 'exact' && !o.abroad && o.delivery !== undefined).map((o) => o.delivery!)) ?? 0;
  const key = (o: Offer) => o.total! + (o.delivery === undefined && !o.abroad ? typical : 0);
  const ranked = offers.filter((o) => o.item === i && eligible(o, it, st)).sort((a, b) => key(a) - key(b));
  // what real sellers ask: the spread shown to the customer leaves scam-flagged prices out (st still counts them)
  const real = offers.filter((o) => o.item === i && o.match === 'exact' && o.unit !== undefined && condOk(o, it) && !o.rejected && !tooCheap(o, st)).map((o) => o.unit!).sort((a, b) => a - b);
  const spread: Stats = { n: real.length, min: real[0], med: median(real), max: real.at(-1) };
  // prefer a price we saw on the page, unless a trusted offer we couldn't open is more than 10% cheaper
  const pick = (xs: Offer[]) => {
    const top = xs.find(trusted), checked = xs.find(safe);
    return (checked && top && key(checked) > key(top) * 1.1 ? top : checked) ?? top ?? xs.find(confirmed) ?? xs[0];
  };
  const best = pick(ranked);
  const runner = best && pick(ranked.filter((o) => o !== best && sellerKey(o) !== sellerKey(best)));
  return { st, spread, ranked, best, runner, key, typical };
}
function flagsOf(o: Offer, it: Item, st: Stats, cur: string): string[] {
  const pct = st.med && o.unit !== undefined ? Math.round((1 - o.unit / st.med) * 100) : 0;
  return [
    o.rejected && `auditor: ${o.rejected}`,
    tooCheap(o, st) && `SCAM RISK: too good to be true (${pct}% below the median)`,
    o.risk && `SCAM RISK: ${o.risk}`,
    o.tier === 'unknown' && !((o.ratingCount ?? 0) >= 20) && 'unknown seller',
    o.tier === 'classifieds' && 'classified ad: inspect before paying',
    o.condition === 'used' && 'used', o.condition === 'refurbished' && 'refurbished',
    it.condition === 'new' && !condOk(o, it) && 'not new',
    o.inStock === false && 'out of stock',
    o.abroad && `ships from abroad: import duty may apply${o.delivery === undefined ? ', shipping not included' : ''}`,
    !o.abroad && o.unit !== undefined && o.delivery === undefined && 'delivery not stated',
    o.listed && o.listed.currency !== cur && (o.unit !== undefined ? `converted from ${o.listed.currency}` : `${o.listed.currency} price not converted`),
    !o.listed && 'no price shown',
    ...o.notes,
  ].filter((x): x is string => !!x);
}

// ---------- paid calls (all through buy(): Serper via Orthogonal, APEX, Exa, BlockRun)

const google = (job: Job, q: string, gl: string, reason: string, dry: () => unknown) =>
  ortho<any>(job, 'serper/search', { body: { q, gl, num: 10 } }, { agent: 'scout', vendor: 'Serper (Orthogonal)', reason, expectUsd: 0.002, maxUsd: 0.005, dry });
const thin = (t: string) => t.replace(/\s+/g, ' ').length < 200 || /automated access|captcha|are you a robot|enable javascript|access denied|verify you are human/i.test(t.slice(0, 1500));

/** Offer pages as text: APEX first (a plain fetch, 10 pages per $0.003); what needs a browser, from Exa's copy. */
async function openPages(job: Job, urls: string[]): Promise<Map<string, Page>> {
  const got = new Map<string, Page>();
  const fetchable = urls.filter((u) => !u.includes(','));
  for (let i = 0; i < fetchable.length; i += 10) {
    const batch = fetchable.slice(i, i + 10);
    try {
      const d = await buy<any>(job, {
        agent: 'reader', vendor: 'APEX web-read', url: `https://${HOSTS.apex}/api/x402/web-read?${new URLSearchParams({ urls: batch.join(',') })}`, method: 'GET',
        reason: `open ${batch.length} offer pages to check price and stock`, expectUsd: 0.003, maxUsd: 0.006, dryData: () => F.apex(batch),
      });
      const arr: any[] = d?.data?.results ?? d?.results ?? d?.pages ?? (Array.isArray(d?.data) ? d.data : []);
      arr.forEach((p, k) => {
        const url = batch.find((u) => u === p?.url || canon(u) === canon(String(p?.url ?? '')) || canon(u) === canon(String(p?.finalUrl ?? ''))) ?? batch[k];
        const text = String(p?.text ?? p?.body ?? p?.content ?? p?.markdown ?? '');
        if (url && p?.ok !== false && !p?.thin && !thin(text)) got.set(url, { text: text.slice(0, 30000), via: 'live' });
      });
    } catch (e: any) { job.log('reader', 'skip', `page fetch failed (${String(e?.message ?? e).slice(0, 60)}); trying Exa for those pages`); }
  }
  const rest = urls.filter((u) => !got.has(u)).slice(0, 12);
  if (rest.length) {
    job.log('reader', 'exa', `${rest.length} pages came back empty or blocked (they need a browser); reading Exa's copy`);
    try {
      const d = await buy<any>(job, {
        agent: 'reader', vendor: 'Exa contents', url: `https://${HOSTS.exa}/contents`, body: { urls: rest, text: { maxCharacters: 8000 } },
        reason: `read ${rest.length} pages a plain fetch could not`, expectUsd: 0.001 * rest.length, maxUsd: 0.002 * rest.length + 0.002, dryData: () => F.exa(rest),
      });
      for (const r of d?.results ?? []) {
        const url = rest.find((u) => canon(u) === canon(String(r?.url ?? ''))), text = String(r?.text ?? '');
        if (url && !thin(text)) got.set(url, { text, via: 'copy' });
      }
    } catch (e: any) { job.log('reader', 'skip', `Exa failed (${String(e?.message ?? e).slice(0, 60)}); those offers stay "listing price only"`); }
  }
  return got;
}

/** The parts of a page that matter for an offer: the top, and every line near a price, stock or seller word. */
function excerpt(text: string, max = 1600): string {
  const t = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
  const spans: [number, number][] = [[0, 400]];
  const re = /[₦$£€₹]|\b(?:NGN|USD|KSh|GH₵)\b|price|deliver|shipping|in stock|out of stock|sold out|unavailable|add to (?:cart|bag|basket)|buy now|sold by|seller|warranty|whatsapp|transfer|condition|used|refurb|swap|pay on delivery/gi;
  for (const m of t.matchAll(re)) {
    const a = Math.max(0, m.index! - 100), b = Math.min(t.length, m.index! + 140), last = spans.at(-1)!;
    if (a <= last[1]) last[1] = Math.max(last[1], b); else spans.push([a, b]);
    if (spans.reduce((s, [x, y]) => s + y - x, 0) > max) break;
  }
  return spans.map(([a, b]) => t.slice(a, b)).join(' … ').slice(0, max);
}

/** The model reads the page; code keeps only what the page text actually contains. */
function applyPage(o: Offer, page: Page | undefined, f: any, local: string) {
  if (!page) { o.checked = isGoogle(o.link) ? 'listing price only (no direct link)' : 'listing price only (page could not be read)'; return; }
  const found = moneyAll(page.text, local);
  const has = (m?: Money) => !!m && found.some((x) => x.currency === m.currency && Math.abs(x.amount - m.amount) <= Math.max(0.01, m.amount * 0.005));
  const yes = page.via === 'live' ? 'yes' : "yes (Exa's copy of the page)";
  const shown = money(f?.price, local);
  if (o.listed && shown && shown.currency === o.listed.currency && has(shown) && Math.abs(shown.amount / o.listed.amount - 1) < 0.6) {
    if (Math.abs(shown.amount - o.listed.amount) > o.listed.amount * 0.005) {
      o.notes.push(`listing said ${fmtM(o.listed)}; the page shows ${fmtM(shown)}`);
      o.listed = shown;
      o.checked = `${yes}, price updated from the page`;
    } else o.checked = yes;
  } else if (o.listed && has(o.listed)) o.checked = yes;
  else o.checked = 'no: listed price not found on the page';
  if (f?.inStock === false && OUT.test(page.text)) o.inStock = false;
  else if (f?.inStock === true && IN.test(page.text)) o.inStock = true;
  const d = String(f?.delivery ?? '');
  if (/^free/i.test(d) && /free (delivery|shipping)/i.test(page.text)) o.deliveryListed = 'free';
  else { const m = money(d, local); if (m && has(m) && (!o.listed || m.amount < o.listed.amount)) o.deliveryListed = m; }
  if (f?.seller && page.text.includes(String(f.seller).slice(0, 24))) o.store = String(f.seller).slice(0, 40);
  const score = String(f?.sellerScore ?? '').match(/\d[\d.,/]*%?/)?.[0];
  if (score && page.text.includes(score)) o.sellerScore = String(f.sellerScore).slice(0, 40);
  if (/^(used|refurbished)$/.test(f?.condition) && o.condition !== 'refurbished' && (USED.test(page.text) || REFURB.test(page.text))) o.condition = f.condition;
  if (f?.risk && RISK.test(page.text)) o.risk = String(f.risk).slice(0, 90);
  o.excerpt = excerpt(page.text, 500);
}

// ---------- report

export const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/[\n\r]+/g, ' ');
export const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const linkMd = (text: string, url: string) => `[${short(text).replace(/[[\]]/g, '')}](${url})`;
export const csvCell = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const who = (o: Offer) => (o.store && o.store.toLowerCase() !== o.seller.toLowerCase() ? `${o.seller} (${o.store})` : o.seller);
const score = (o: Offer) => (o.sellerScore ? (/seller/i.test(o.sellerScore) ? o.sellerScore : `seller rating ${o.sellerScore}`) : '');
const condLabel = (c: Cond) => (c === 'unknown' ? 'not stated' : c);
export const trust = (o: Offer) => o.tier === 'marketplace' ? `marketplace${o.sellerScore ? `, ${score(o)}` : ''}`
  : o.tier === 'retailer' ? 'known retailer' : o.tier === 'classifieds' ? 'classified ad' : 'unknown seller';

function whyBest(o: Offer, it: Item, r: ReturnType<typeof rank>, cur: string): string {
  const cond = it.condition === 'any' ? '' : `${it.condition} `;
  const lower = r.ranked.some((x) => x !== o && r.key(x) < r.key(o));
  const bits = [lower ? `the cheapest of the ${r.ranked.length} ${cond}offers we could price that we can also recommend` : `lowest delivered total among the ${r.ranked.length} ${cond}offer${r.ranked.length === 1 ? '' : 's'} we could price and rank`];
  bits.push(confirmed(o) ? 'price confirmed on the seller\'s page' : 'listing price only: we could not confirm it on the page');
  if (o.inStock) bits.push('in stock');
  if (o.tier === 'marketplace') bits.push(`sold on ${nameOf(o.host)}${o.store ? ` by ${o.store}` : ''}${o.sellerScore ? ` (${score(o)})` : ''}`);
  else if (o.tier === 'retailer') bits.push(`${o.seller} is a known retailer`);
  if (o.delivery === undefined) bits.push('delivery fee not stated: ask before paying');
  if (r.spread.med && o.unit !== undefined && r.spread.n >= 3) {
    const d = r.spread.med - o.unit;
    bits.push(d >= 0 ? `${fmt(d, cur)} (${Math.round((d / r.spread.med) * 100)}%) below the median price` : `${fmt(-d, cur)} above the median price`);
  }
  const skipped = r.ranked.filter((x) => r.key(x) < r.key(o) && x !== o).slice(0, 2).map((x) => `${who(x)} at ${fmt(x.total, cur)} (${[
    !confirmed(x) && 'price not confirmed on its page', x.tier === 'unknown' && 'unknown seller', x.tier === 'classifieds' && 'classified ad',
    x.risk && 'warning signs on its page', x.abroad && x.delivery === undefined && 'import costs unknown',
  ].filter(Boolean).join(', ')})`);
  const alt = !confirmed(o) && r.ranked.find(safe);
  return `${bits.join('; ')}.${skipped.length ? ` Cheaper but not recommended: ${skipped.join('; ')}.` : ''}${alt ? ` The cheapest price we could confirm on a page: ${who(alt)} at ${fmt(alt.total, cur)}.` : ''}`;
}

function whyRunner(o: Offer, best: Offer, cur: string): string {
  const d = o.total! - best.total!;
  return [d >= 0 ? `${fmt(d, cur)} more than the best pick${o.delivery === undefined ? ' before its delivery fee' : ''}` : `${fmt(-d, cur)} cheaper than the best pick, but less certain`,
    confirmed(o) ? 'price confirmed on the page' : 'listing price only',
    o.inStock ? 'in stock' : '', trust(o), o.delivery === undefined ? 'delivery fee not stated' : ''].filter(Boolean).join('; ') + '.';
}

// ---------- the core: runs inside any job (Best Price Finder, Buy Smart)

/** The parse prompt for a shopping request. Buy Smart extends it with the sellers. */
export const SHOP_PARSE = 'You parse a shopping request for a price-comparison team. Reply JSON only: {"items": [{"name": short product name, "query": Google Shopping query: brand + model + any spec the customer insisted on (no words like cheap/best/buy), "qty": number (default 1), "condition": "new"|"used"|"any" (default "new"; "tokunbo"/"UK used" = used), "mustHave": [specs the customer insisted on, e.g. "128GB", "5G"], "imageUrl": product image URL if given else null, "identify": true only if the customer gave a photo but no clear product name}] (1-5 items), "city": delivery area and city, "country": country, "gl": 2-letter country code, "currency": ISO 4217 code of the customer\'s currency, "budget": {"amount": number, "currency": ISO code} or null (total for the whole order; "400k" = 400000), "marketplaces": [3-5 domains of the biggest online shops in that country]}. If no country is named, infer it from the city or currency.';
export const EMPTY_SPEC: Spec = { items: [], city: '', country: '', gl: 'us', currency: 'USD', budget: null, marketplaces: [] };

/** A parsed request, cleaned: up to 5 items, the market to search, the customer's currency and budget. */
export type Shop = { items: Item[]; gl: string; cur: string; locals: string[]; intl: string[]; where: string; city: string; country: string; budget?: Money };

export function shopFrom(raw: Spec): Shop {
  const items: Item[] = (Array.isArray(raw.items) ? raw.items : []).filter((it: any) => it?.name || it?.query).slice(0, 5).map((it: any) => ({
    name: String(it.name ?? it.query).slice(0, 80), query: String(it.query ?? it.name).slice(0, 100),
    qty: Math.min(100, Math.max(1, Math.round(Number(it.qty) || 1))), condition: ['new', 'used', 'any'].includes(it.condition) ? it.condition : 'new',
    mustHave: Array.isArray(it.mustHave) ? it.mustHave.map(String).slice(0, 4) : [],
    imageUrl: /^https?:\/\//.test(String(it.imageUrl ?? '')) ? String(it.imageUrl) : undefined, identify: !!it.identify,
  }));
  if (!items.length) throw new Error('could not tell from the brief what to price');
  const gl = /^[a-z]{2}$/i.test(String(raw.gl)) ? String(raw.gl).toLowerCase() : 'us';
  const market = MARKETS[gl];
  const cur = market?.cur ?? (/^[A-Z]{3}$/.test(String(raw.currency)) ? String(raw.currency) : 'USD');
  const locals = market?.sites ?? (raw.marketplaces ?? []).map((d) => String(d).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 5);
  const intl = INTL.filter((d) => !locals.includes(d) && HOME[d] !== gl);
  const where = [raw.city, raw.country].filter(Boolean).join(', ');
  const budget = raw.budget && Number(raw.budget.amount) > 0 ? { amount: Number(raw.budget.amount), currency: /^[A-Z]{3}$/.test(String(raw.budget.currency)) ? String(raw.budget.currency) : cur } : undefined;
  return { items, gl, cur, locals, intl, where, city: raw.city || '', country: raw.country || '', budget };
}

export type Ranked = ReturnType<typeof rank>;
export type Prices = {
  shop: Shop; found: Offer[]; exact: Offer[]; results: Ranked[]; toCheck: Offer[]; pages: Map<string, Page>;
  fx: Map<string, number>; fxNotes: string[]; date: string; basket?: number; budgetLocal?: number;
  bugs: string[]; notes: string[]; hardFail: boolean; auditRan: boolean;
  qa: { verdict: 'pass' | 'revise'; notes: string; model: string };
  /** The report in parts, so another service can re-arrange them; `full` is Best Price Finder's report. */
  md: { title: string; intro: string; basket: string; table: string; items: { heading: string; body: string }[]; warnings: string[]; method: string; full: string };
  csv: string;
};
export const itemLabel = (it: Item) => `${it.name}${it.qty > 1 ? ` × ${it.qty}` : ''}`;

/** Search, sort, price, open the pages, audit, rank and write up. Throws only when there is nothing to compare. */
export async function findPrices(job: Job, shop: Shop): Promise<Prices> {
  const { items, gl, cur, locals, intl, where, budget } = shop;
  const abroadOf = (host: string) => FROM_CHINA.test(host) || Object.entries(HOME).some(([d, c]) => (host === d || host.endsWith(`.${d}`)) && c !== gl);
  job.log('researcher', 'spec', `${items.map((it) => `${it.qty} × ${it.name} (${it.condition})`).join('; ')} → ${where || gl.toUpperCase()}, prices in ${cur}${budget ? `, budget ${fmtM(budget)}` : ''}`);

  // 2. Search: Google Shopping in-country, the local marketplaces, imports, and the open web (local stores)
  let found: Offer[] = [];
  const tryCall = async <T>(label: string, f: () => Promise<T>): Promise<T | undefined> => {
    try { return await f(); } catch (e: any) { job.log('scout', 'skip', `${label} failed (${String(e?.message ?? e).slice(0, 60)}); moving on`); return undefined; }
  };
  // Only parsing the brief is essential; the other model steps have a rules-based fallback
  let auditRan = true;
  const soft = async (agent: 'researcher' | 'reader' | 'auditor', label: string, then: string, f: () => Promise<string>) => {
    try { return await f(); } catch (e: any) {
      if (agent === 'auditor') auditRan = false;
      job.log(agent, 'skip', `${label} failed (${String(e?.message ?? e).slice(0, 60)}); ${then}`);
      return '';
    }
  };
  for (const [i, it] of items.entries()) {
    if (it.imageUrl) {
      job.log('scout', 'lens', `Google Lens on the photo of "${it.name}"`);
      const d = await tryCall('Lens', () => ortho<any>(job, 'serper/lens', { body: { url: it.imageUrl, gl } }, {
        agent: 'scout', vendor: 'Serper Lens (Orthogonal)', reason: `identify item ${i + 1} from its photo`, expectUsd: 0.006, maxUsd: 0.01, dry: () => F.lens(it.query),
      }));
      const hits: any[] = (d?.organic ?? d?.visual_matches ?? d?.visualMatches ?? []).filter((h: any) => h?.title && h?.link);
      if (it.identify && hits[0]) { it.query = String(hits[0].title).split(/\s[|\-–:]\s/)[0].split(/\s+/).slice(0, 8).join(' '); job.log('analyst', 'identify', `the photo looks like "${it.query}"`); }
      found.push(...hits.slice(0, 10).map((h) => offerFrom(i, 'lens', h, cur)));
    }
    job.log('scout', 'search', `"${it.query}": Google Shopping (${gl.toUpperCase()}), ${locals.length} local marketplaces, imports, open web`);
    const shopRes = await tryCall('Google Shopping', () => ortho<any>(job, 'serper/shopping', { body: { q: it.query, gl, num: 20 } }, {
      agent: 'scout', vendor: 'Serper Shopping (Orthogonal)', reason: `Google Shopping ${gl.toUpperCase()}: "${it.query}"`, expectUsd: 0.004, maxUsd: 0.008, dry: () => F.shopping(it.query),
    }));
    const shopHits: any[] = shopRes?.shopping ?? [];
    if (shopRes && !shopHits.length) job.log('scout', 'note', `Google Shopping has no listings for "${it.query}" in ${gl.toUpperCase()}; relying on the marketplaces`);
    found.push(...shopHits.map((h) => offerFrom(i, 'shopping', h, cur)));
    const searches: [string, 'local' | 'intl' | 'general', string][] = [
      ...(locals.length ? [[`${it.query} price ${locals.map((d) => `site:${d}`).join(' OR ')}`, 'local', 'local marketplaces'] as [string, 'local', string]] : []),
      ...(intl.length ? [[`${it.query} price ${intl.map((d) => `site:${d}`).join(' OR ')}`, 'intl', 'imports'] as [string, 'intl', string]] : []),
      [`${it.query} price in ${shop.city || shop.country || gl.toUpperCase()}`, 'general', 'local stores on the open web'],
    ];
    for (const [q, kind, label] of searches) {
      const d = await tryCall(`search (${label})`, () => google(job, q, gl, `Google: "${it.query}" on ${label}`, () => F.google(q, it.query, kind)));
      found.push(...(d?.organic ?? []).map((h: any) => offerFrom(i, `google ${kind}`, h, cur)));
    }
  }
  found = dedupe(found.filter((o) => o.title && o.host));
  found.forEach((o, k) => { o.id = `o${k + 1}`; o.abroad = abroadOf(o.host); });
  if (!found.length) throw new Error('no search came back with offers; nothing to compare');

  // 3. Sort real offers from accessories, look-alikes, list pages and guides
  job.log('researcher', 'sort', `${found.length} listings: which are the item itself, which are accessories, used, list pages or look-alikes`);
  const block = items.map((it, i) => `ITEM ${i + 1}: ${it.name} (search "${it.query}"; wanted: ${it.condition}${it.mustHave.length ? `; must have ${it.mustHave.join(', ')}` : ''})\n` +
    found.filter((o) => o.item === i).map((o) => `${o.id} | ${o.seller} | ${o.title} | ${fmtM(o.listed)} | ${isGoogle(o.link) ? 'google shopping' : `${o.host}${o.link.split(o.host)[1]?.slice(0, 50) ?? ''}`} | ${o.snippet.slice(0, 90)}`).join('\n')).join('\n\n');
  const sorted = parseJson<{ c: Record<string, string> }>(
    await soft('researcher', 'sorting', 'sorting by rules instead', () => llm(job, 'researcher', [
      { role: 'system', content: 'You sort search results for a price comparison. For every id give a 2-letter code. First letter, what it is: E = an offer for exactly the item asked for (same brand and model; colour does not matter; storage/size only matters if the customer specified it), V = same product line but another model or spec than asked (e.g. 5G vs 4G, Pro vs base), A = accessory or spare part (case, charger, screen), B = bundle or several units for one price, L = a category/search page or a list of many ads rather than one offer, G = price guide, review or article (not a seller), F = fake, replica, clone, copy or dummy, O = a different product. Second letter, condition: N = new, U = used (incl. UK used, tokunbo, swap, pre-owned, open box), R = refurbished/renewed, ? = not stated. Reply JSON only: {"c": {"<id>": "<code>"}}.' },
      { role: 'user', content: block },
    ], `sort ${found.length} listings into offers and noise`, {
      model: MODELS.fast, maxTokens: 400 + found.length * 12, json: true,
      dry: () => JSON.stringify({ c: Object.fromEntries(found.map((o) => [o.id, `${Object.entries(CODE).find(([, v]) => v === guess(o, items[o.item]))![0]}${o.condition === 'used' ? 'U' : o.condition === 'refurbished' ? 'R' : o.condition === 'new' ? 'N' : '?'}`])) }),
    })),
    { c: {} },
  );
  for (const o of found) {
    const c = String(sorted.c?.[o.id] ?? '').toUpperCase(), rule = guess(o, items[o.item]);
    o.match = ['list', 'guide', 'fake'].includes(rule) ? rule : CODE[c[0]] ?? rule;
    if (o.condition === 'unknown' || (o.condition === 'new' && CONDS[c[1]] && CONDS[c[1]] !== 'new')) o.condition = CONDS[c[1]] ?? o.condition;
  }
  const exact = found.filter((o) => o.match === 'exact');
  job.log('analyst', 'sorted', `${exact.length} offers for the items themselves; set aside ${found.length - exact.length} (accessories, other models, list pages, guides, fakes)`);

  // 4. One currency: live rates from Google for anything not priced in the customer's currency
  const fx = new Map<string, number>([[cur, 1]]);
  const fxNotes: string[] = [];
  const foreign = [...new Set([...exact.flatMap((o) => [o.listed?.currency, typeof o.deliveryListed === 'object' ? o.deliveryListed.currency : undefined]), budget?.currency])]
    .filter((c): c is string => !!c && c !== cur).slice(0, 3);
  for (const c of foreign) {
    const d = await tryCall(`rate ${c}→${cur}`, () => google(job, `1 ${c} to ${cur}`, gl, `exchange rate ${c} → ${cur}`, () => F.fx(c, cur)));
    const box = `${d?.answerBox?.answer ?? d?.answerBox?.snippet ?? ''}`.replace(/,/g, '');
    const alt = (d?.organic ?? []).map((h: any) => String(h.snippet ?? '').replace(/,/g, '').match(new RegExp(`1\\s*${c}\\s*=\\s*(\\d+(?:\\.\\d+)?)`, 'i'))?.[1]).find(Boolean);
    const rate = Number(box.match(/\d+(?:\.\d+)?/)?.[0] ?? alt);
    const shown = `1 ${c} = ${SYMBOL[cur] ?? `${cur} `}${rate.toLocaleString('en-US', rate < 10 ? { maximumSignificantDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (rate > 0) { fx.set(c, rate); fxNotes.push(shown); job.log('analyst', 'fx', `${shown} (Google)`); }
    else job.log('analyst', 'skip', `no ${c}→${cur} rate found; ${c} offers are listed but not ranked`);
  }
  const reprice = () => found.forEach((o) => price(o, items[o.item], fx));
  reprice();

  // 5. Open the top offers' pages (plus the suspiciously cheap ones) and check what they really say
  const per = Math.min(8, Math.floor(28 / items.length));
  const toCheck = [...new Set(items.flatMap((it, i) => {
    const r = rank(found, i, it);
    const cheapest = found.filter((o) => o.item === i && o.match === 'exact' && condOk(o, it) && tooCheap(o, r.st)).sort((a, b) => a.unit! - b.unit!).slice(0, 2);
    return [...r.ranked.slice(0, per), ...cheapest];
  }))];
  const needLink = toCheck.filter((o) => isGoogle(o.link)).slice(0, 6);
  if (needLink.length) job.log('scout', 'resolve', `${needLink.length} Google Shopping results link to Google, not the store; finding the store's own page`);
  for (const o of needLink) {
    const site = [...locals, ...intl].find((d) => o.seller.toLowerCase().includes(d.split('.')[0]));
    const q = site ? `${o.title} site:${site}` : `${o.title} ${o.seller}`;
    const d = await tryCall(`link for ${o.seller}`, () => google(job, q, gl, `find ${o.seller}'s own page for the offer`, () => F.resolve(o.title, site)));
    const hit = (d?.organic ?? []).find((h: any) => { const host = hostOf(h.link); return host && !isGoogle(h.link) && (site ? host.endsWith(site) : !GUIDE.test(host) && overlap(o.title, h.title) >= 0.5); });
    if (hit && !found.some((x) => x !== o && x.link === canon(hit.link))) { o.link = canon(hit.link); o.host = hostOf(hit.link); o.tier = tierOf(o.seller, o.host); o.abroad = abroadOf(o.host); }
  }
  const urls = [...new Set(toCheck.filter((o) => !isGoogle(o.link)).map((o) => o.link))];
  job.log('reader', 'open', `${urls.length} offer pages: is the price there, is it in stock, what does delivery cost`);
  const pages = await openPages(job, urls);
  const readable = toCheck.filter((o) => pages.has(o.link));
  const facts = readable.length ? parseJson<{ p: Record<string, any> }>(
    await soft('reader', 'reading the pages', 'checking listed prices against the page text only', () => llm(job, 'reader', [
      { role: 'system', content: 'For each page excerpt, report what the page says about THIS offer (not other products on the page). Copy prices exactly as written, with the currency sign. Reply JSON only: {"p": {"<id>": {"price": main selling price now, or null, "inStock": true|false|null, "delivery": delivery/shipping fee as written (e.g. "₦1,500") or "free", or null, "seller": seller or store name as written, or null, "sellerScore": seller rating/score as written (e.g. "94% Seller Score", "4.6/5 (1,208 ratings)"), or null, "condition": "new"|"used"|"refurbished"|null, "risk": a warning sign such as payment by bank transfer only, WhatsApp-only orders or no refunds, in under 15 words, or null}}}' },
      { role: 'user', content: readable.map((o) => `[${o.id}] ${o.title} (listed at ${fmtM(o.listed)} by ${o.seller})\n${excerpt(pages.get(o.link)!.text)}`).join('\n\n') },
    ], `read ${readable.length} offer pages`, { model: MODELS.fast, maxTokens: 300 + readable.length * 90, json: true, dry: () => F.facts(readable.map((o) => ({ id: o.id, text: pages.get(o.link)!.text }))) })),
    { p: {} },
  ) : { p: {} };
  for (const o of toCheck) applyPage(o, pages.get(o.link), facts.p?.[o.id], cur);
  reprice();
  const ok = toCheck.filter(confirmed).length, moved = toCheck.filter((o) => o.checked.includes('updated')).length, gone = toCheck.filter((o) => o.inStock === false).length;
  job.log('reader', 'checked', `${ok} of ${toCheck.length} prices confirmed on the page (${moved} changed since the listing), ${gone} out of stock`);

  // 6. Independent check of what we'd recommend, by a different model family
  const review = [...new Set(items.flatMap((it, i) => { const r = rank(found, i, it); return [...r.ranked.slice(0, 4), r.best, r.runner].filter((o): o is Offer => !!o); }))];
  job.log('auditor', 'audit', `${review.length} top offers checked against what the customer asked for, with ${MODELS.auditor}`);
  const audit = parseJson<{ verdict: 'pass' | 'revise'; reject: { id: string; reason: string }[]; issues: string[] }>(
    await soft('auditor', 'the independent check', 'delivering on the rules alone and saying so', () => llm(job, 'auditor', [
      { role: 'system', content: 'You are an independent auditor for a price comparison. For each candidate offer decide whether it really is the product the customer asked for, in the condition they asked for, as a single-unit offer from a seller. Reject a candidate only for a concrete reason visible in its title or page text: another model or spec than asked, an accessory or part, used/refurbished/swap/tokunbo when the customer asked for new, a counterfeit/copy/clone, a bundle or wrong quantity, or not a seller\'s offer. Reply JSON only: {"verdict": "pass"|"revise", "reject": [{"id": string, "reason": under 15 words}], "issues": [short strings about anything else that looks wrong, not already covered by a rejection]}.' },
      { role: 'user', content: items.map((it, i) => `ITEM ${i + 1}: ${it.qty} × ${it.name}, wanted ${it.condition}${it.mustHave.length ? `, must have ${it.mustHave.join(', ')}` : ''}\n` +
        review.filter((o) => o.item === i).map((o) => `${o.id} | ${who(o)} | ${o.title} | ${fmtM(o.listed)} each | condition ${o.condition} | ${o.checked}\n   page: ${(o.excerpt ?? o.snippet).slice(0, 400)}`).join('\n')).join('\n\n') },
    ], 'independent check of the recommended offers', { model: MODELS.auditor, maxTokens: 700, json: true, dry: () => F.audit(review.map((o) => ({ id: o.id, title: o.title, excerpt: o.excerpt ?? '', wanted: items[o.item].condition }))) })),
    { verdict: 'pass', reject: [], issues: [] },
  );
  for (const x of Array.isArray(audit.reject) ? audit.reject : []) {
    const o = review.find((r) => r.id === x?.id);
    if (o) { o.rejected = String(x.reason ?? 'not the item asked for').slice(0, 100); job.log('auditor', 'reject', `${who(o)} "${short(o.title, 50)}": ${o.rejected}`); }
  }

  // 7. Final ranking + deterministic QA
  job.log('analyst', 'rank', 'delivered totals, price spread, scam and trust flags');
  const results = items.map((it, i) => rank(found, i, it));
  const bugs: string[] = [], notes: string[] = [];
  results.forEach((r, i) => {
    const it = items[i], b = r.best;
    if (!b) { notes.push(`no offer we could price and trust for ${it.name}`); return; }
    if (b.match !== 'exact' || !condOk(b, it) || b.inStock === false || b.rejected || tooCheap(b, r.st)) bugs.push(`best pick for ${it.name} breaks the ranking rules`);
    if (Math.abs(b.total! - (b.unit! * it.qty + (b.delivery ?? 0))) > 0.01) bugs.push(`${it.name}: delivered total does not add up`);
    if (r.ranked.some((o) => safe(o) && r.key(o) < r.key(b))) bugs.push(`${it.name}: a cheaper safe offer was passed over`);
    if (!confirmed(b)) notes.push(`${it.name}: the best pick's price could not be confirmed on its page`);
    if (r.st.n < 3) notes.push(`${it.name}: only ${r.st.n} comparable offers, so the scam check has little to compare against`);
  });
  if (new Set(found.map((o) => o.link)).size !== found.length) bugs.push('duplicate offers in the list');
  notes.push(...(Array.isArray(audit.issues) ? audit.issues.map((x) => `auditor: ${String(x).slice(0, 160)}`) : []));
  if (!auditRan) notes.push('the independent auditor could not run, so only the rules checked the picks');
  const hardFail = bugs.length > 0 || results.every((r) => !r.best);
  job.log('auditor', 'check', hardFail ? [...bugs, ...notes].join('; ') : `pass${notes.length ? ` (note: ${notes.join('; ')})` : ''}`);
  const qa = { verdict: hardFail ? 'revise' as const : 'pass' as const, notes: [...bugs, ...notes, ...found.filter((o) => o.rejected).map((o) => `removed ${who(o)}: ${o.rejected}`)].join(' | '), model: auditRan ? `${MODELS.auditor} + deterministic rules` : 'deterministic rules' };

  // 8. Report + CSV
  job.log('writer', 'report', 'best pick and runner-up per item, ranked tables, warnings, method');
  const date = new Date().toISOString().slice(0, 10);
  const label = itemLabel;
  const basket = results.every((r) => r.best) ? results.reduce((s, r) => s + r.best!.total!, 0) : undefined;
  const budgetLocal = budget && fx.has(budget.currency) ? budget.amount * fx.get(budget.currency)! : undefined;
  const title = `# Best prices: ${items.map(label).join(', ')}`;
  const intro = `Delivered to ${where || gl.toUpperCase()} · all prices in ${cur} · checked ${date}`;
  let basketLine = '';
  if (basket !== undefined) {
    basketLine = `**Cheapest trustworthy basket: ${fmt(basket, cur)}** including the delivery fees we could find.`;
    const yours = budget && budget.currency !== cur ? `${fmtM(budget)} (${fmt(budgetLocal, cur)})` : fmtM(budget);
    if (budgetLocal !== undefined) basketLine += basket <= budgetLocal ? ` Within your ${yours} budget, with ${fmt(budgetLocal - basket, cur)} to spare.` : ` That is ${fmt(basket - budgetLocal, cur)} over your ${yours} budget.`;
  }
  const table = `| Item | Best pick | Delivered total | Runner-up | Delivered total |\n|---|---|---|---|---|\n` + results.map((r, i) =>
    `| ${cell(label(items[i]))} | ${r.best ? cell(who(r.best)) : 'none found'} | ${fmt(r.best?.total, cur)} | ${r.runner ? cell(who(r.runner)) : '—'} | ${fmt(r.runner?.total, cur)} |`).join('\n') + '\n';

  const sections = results.map((r, i) => {
    const it = items[i], b = r.best;
    let body = '';
    if (b) {
      body += `**Best pick: ${who(b)}, ${fmt(b.total, cur)} delivered** (${fmt(b.unit, cur)} each${b.delivery !== undefined ? ` + ${b.delivery ? fmt(b.delivery, cur) : 'free'} delivery` : ', delivery not stated'}). ${linkMd('Open the offer', b.link)}\n\nWhy: ${whyBest(b, it, r, cur)}\n\n`;
      if (r.runner) body += `**Runner-up: ${who(r.runner)}, ${fmt(r.runner.total, cur)} delivered** (${fmt(r.runner.unit, cur)} each${r.runner.delivery !== undefined ? ` + ${r.runner.delivery ? fmt(r.runner.delivery, cur) : 'free'} delivery` : ', delivery not stated'}). ${linkMd('Open the offer', r.runner.link)}\n\nWhy: ${whyRunner(r.runner, b, cur)}\n\n`;
    } else body += `We found no ${it.condition === 'any' ? '' : `${it.condition} `}offer we could price and trust for this item. The offers we did see are in \`offers.csv\`.\n\n`;
    const sp = r.spread, dropped = r.st.n - sp.n;
    if (sp.n) body += `Price spread across ${sp.n} ${it.condition === 'new' ? 'new (or unstated condition) ' : ''}offer${sp.n === 1 ? '' : 's'}, each: cheapest ${fmt(sp.min, cur)} · median ${fmt(sp.med, cur)} · most expensive ${fmt(sp.max, cur)}${dropped ? ` (not counting ${dropped} flagged as too good to be true)` : ''}.\n\n`;
    const others = found.filter((o) => o.item === i && o.match === 'exact' && !r.ranked.includes(o)).sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity));
    const rows = [...r.ranked, ...others].slice(0, 12);
    body += `| # | Seller | Listing | Each | Delivery | Total (× ${it.qty}) | Condition | Seller type | Checked on page | Flags |\n|---|---|---|---|---|---|---|---|---|---|\n` +
      rows.map((o) => `| ${r.ranked.includes(o) ? r.ranked.indexOf(o) + 1 : '—'} | ${cell(who(o))} | ${linkMd(cell(short(o.title)), o.link)} | ${fmt(o.unit, cur)}${o.listed && o.listed.currency !== cur ? ` (${fmtM(o.listed)})` : ''} | ${o.delivery === undefined ? '?' : o.delivery ? fmt(o.delivery, cur) : 'free'} | ${fmt(o.total, cur)} | ${condLabel(o.condition)} | ${cell(trust(o))} | ${cell(o.checked)} | ${cell(flagsOf(o, it, r.st, cur).join('; '))} |`).join('\n') + '\n';
    const more = r.ranked.length + others.length - rows.length;
    if (more > 0) body += `\n${more} more offers in \`offers.csv\`.\n`;
    return { heading: `${i + 1}. ${label(it)} (${it.condition})`, body };
  });

  const warn: string[] = [];
  const cls = new Set<string>(), imp = new Set<string>();
  let impNoShip = false;
  results.forEach((r, i) => {
    const it = items[i], mine = found.filter((o) => o.item === i && o.match === 'exact'), tag = items.length > 1 ? `${it.name}: ` : '';
    for (const o of mine.filter((o) => tooCheap(o, r.st) || o.risk)) {
      warn.push(`**Scam risk, ${it.name}: ${who(o)} at ${fmt(o.unit, cur)} each.** ${[tooCheap(o, r.st) && `That is ${Math.round((1 - o.unit! / r.st.med!) * 100)}% below the median`, o.tier === 'unknown' && 'the seller is unknown', o.risk && `warning sign on its page: ${o.risk.replace(/\.$/, '')}`].filter(Boolean).join('; ')}. Don't pay before you have the item in hand.`);
    }
    for (const o of mine.filter((o) => o.rejected)) warn.push(`${tag}the auditor removed ${who(o)} (${fmt(o.unit, cur)}, "${short(o.title, 50)}"): ${o.rejected}.`);
    for (const o of mine.filter((o) => o.checked.includes('updated'))) warn.push(`${tag}${who(o)}: ${o.notes.find((n) => n.startsWith('listing said')) ?? 'price changed'}. We used the page price.`);
    const oos = mine.filter((o) => o.inStock === false);
    if (oos.length) warn.push(`${tag}out of stock, so not ranked: ${oos.map((o) => `${who(o)} (${fmt(o.unit, cur)})`).join(', ')}.`);
    const notNew = mine.filter((o) => !condOk(o, it));
    const low = [...notNew].sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity))[0];
    if (low) warn.push(`${notNew.length} used or refurbished offer${notNew.length > 1 ? 's' : ''} for ${it.name} left out of the ranking because you asked for new (cheapest: ${who(low)} at ${fmt(low.unit, cur)}).`);
    for (const o of mine) {
      if (o.tier === 'classifieds' && condOk(o, it)) cls.add(nameOf(o.host));
      if (o.abroad) { imp.add(nameOf(o.host)); impNoShip ||= o.delivery === undefined; }
    }
  });
  if (cls.size) warn.push(`${[...cls].join(', ')} listings are classified ads: meet in a public place, inspect the item and pay only on collection.`);
  if (imp.size) warn.push(`${[...imp].join(' and ')} ship${imp.size === 1 ? 's' : ''} from abroad: the prices exclude import duty${impNoShip ? ' (and shipping, where the page does not state it)' : ''}, and delivery can take weeks.`);
  const noDelivery = results.map((r) => r.best).filter((b): b is Offer => !!b && b.delivery === undefined);
  if (noDelivery.length) warn.push(`Delivery fee not stated for ${noDelivery.map(who).join(', ')}: ask for the fee to ${shop.city || 'your address'} before paying.`);
  if (notes.length) warn.push(...notes.filter((n) => !warn.some((w) => w.includes(n))).map((n) => `${n[0].toUpperCase()}${n.slice(1)}.`));
  const warnings = warn.length ? warn.map((w) => `- ${w.replace(/^(\*\*)?([a-z])/, (_, b, c) => `${b ?? ''}${c.toUpperCase()}`)}`) : ['- None beyond the usual: prices move, so confirm at checkout.'];

  const via = (v: string) => found.filter((o) => o.via.startsWith(v)).length;
  const copies = toCheck.filter((o) => o.checked.includes("Exa's copy")).length;
  const method =
    `- **Searched** Google Shopping for ${shop.country || gl.toUpperCase()} (${via('shopping')} listings), Google on ${locals.join(', ') || 'local shops'} (${via('google local')})${intl.length ? `, on ${intl.join(', ')} for imports (${via('google intl')})` : ''} and the open web for local stores (${via('google general')})${via('lens') ? `, and Google Lens on your photo (${via('lens')})` : ''}. After removing duplicates: ${found.length} listings, of which ${exact.length} were offers for the items themselves; the rest were accessories, other models, list pages, price guides or fakes.\n` +
    `- **One currency.** ${fxNotes.length ? `Converted at ${fxNotes.join(', ')} (Google, ${date}).` : `Every ranked price was already in ${cur}.`} Delivered total = price × quantity + one delivery fee per order.${results.some((r) => r.ranked.some((o) => o.delivery === undefined && !o.abroad)) ? ` Offers that don't state delivery are ranked as if they charged the typical fee of the others (${[...new Set(results.map((r) => fmt(r.typical, cur)))].join(' / ')}), so hiding the fee can't win.` : ''}\n` +
    `- **Opened the pages** of the ${toCheck.length} best-placed and suspiciously cheap offers${copies ? ` (${copies} through Exa's copy because ${copies === 1 ? 'the page needs' : 'those pages need'} a browser)` : ''}. "Checked on page" means the same amount appears in the page text: ${ok} confirmed, ${moved} changed price since the listing, ${gone} out of stock. Delivery fees are what the page shows for its default location and can differ for your address.\n` +
    `- **Scam and trust rules.** Too good to be true = under 50% of the median for the same item and condition (needs at least 3 prices). Unknown seller = not a marketplace or retailer we recognise and fewer than 20 ratings. Classified ads (e.g. Jiji) are never the recommended pick when a checked shop offer exists. Seller scores are copied from the page only when the number is on it.\n` +
    (auditRan ? `- **Independent check.** ${MODELS.auditor} (a different model family from the one that sorted the listings) reviewed the top offers against your request${found.some((o) => o.rejected) ? ` and removed ${found.filter((o) => o.rejected).length}` : ' and found nothing to remove'}.\n`
      : `- **Independent check.** The auditor model was unavailable for this job, so the picks rest on the rules above.\n`) +
    `- Prices and stock change quickly: confirm at checkout. Every offer we saw is in \`offers.csv\`.\n`;

  const full = `${title}\n\n${intro}\n\n${basketLine ? `${basketLine}\n\n` : ''}${table}` +
    sections.map((s) => `\n## ${s.heading}\n\n${s.body}`).join('') +
    `\n## Warnings\n\n${warnings.join('\n')}\n` +
    `\n## How we checked\n\n${method}`;

  const header = ['item', 'seller', 'title', 'price', 'currency', `unit_${cur}`, `delivery_${cur}`, `total_${cur}`, 'condition', 'rating', 'link', 'checked_on_page', 'flags', 'match', 'seller_type'];
  const order = (o: Offer) => { const r = results[o.item], k = r.ranked.indexOf(o); return o.item * 1e6 + (k >= 0 ? k : 1000 + (o.match === 'exact' ? 0 : 1000)); };
  const csv = [header.join(','), ...[...found].sort((a, b) => order(a) - order(b) || (a.unit ?? Infinity) - (b.unit ?? Infinity)).map((o) => {
    const it = items[o.item], round = (n?: number) => (n === undefined ? '' : WHOLE.has(cur) ? Math.round(n) : n.toFixed(2));
    return [label(it), who(o), o.title, o.listed?.amount, o.listed?.currency, round(o.unit), o.delivery === undefined ? '' : round(o.delivery), round(o.total), condLabel(o.condition),
      [o.rating ? `${o.rating}/5${o.ratingCount ? ` (${o.ratingCount} reviews)` : ''}` : '', score(o)].filter(Boolean).join('; '),
      o.link, o.checked, o.match === 'exact' ? flagsOf(o, it, results[o.item].st, cur).join('; ') : '', o.match, trust(o)].map(csvCell).join(',');
  })].join('\n') + '\n';

  return {
    shop, found, exact, results, toCheck, pages, fx, fxNotes, date, basket, budgetLocal, bugs, notes, hardFail, auditRan, qa,
    md: { title, intro, basket: basketLine, table, items: sections, warnings, method, full }, csv,
  };
}

// ---------- the service (retired from the menu; old orders can still be revised)

export const bestPrice = {
  id: 'best-price',
  name: 'Best Price Finder',
  priceUsd: 3,
  policy: { budgetUsd: 0.4 + MAIL_BUDGET_USD, allowHosts: [HOSTS.blockrun, HOSTS.orthogonal, HOSTS.apex, HOSTS.exa, ...(MAIL_HOST ? [MAIL_HOST] : [])] },

  async run(brief: string, opts: { orderId?: string } = {}): Promise<Job> {
    const job = new Job(this.id, brief, this.policy, opts.orderId);
    try {
      // 1. What to buy, how many, where it goes
      job.log('researcher', 'parse', 'items, quantity, condition, delivery city, budget');
      const raw = parseJson<Spec>(
        await llm(job, 'researcher', [
          { role: 'system', content: SHOP_PARSE },
          { role: 'user', content: brief },
        ], 'parse the shopping request', { model: MODELS.fast, maxTokens: 600, json: true, dry: F.parse }),
        { ...EMPTY_SPEC },
      );
      // 2-8. Search, sort, price, check the pages, audit, rank, write up
      const p = await findPrices(job, shopFrom(raw));
      job.qa = p.qa;
      job.deliverable = p.md.full;
      job.files.push({ name: 'offers.csv', content: p.csv });
      job.status = p.hardFail ? 'failed' : 'delivered';
      if (p.hardFail) job.error = `QA failed: ${[...p.bugs, ...p.notes].join('; ')}`;
    } catch (e: any) {
      job.status = 'failed';
      job.error = String(e?.message ?? e);
      console.error('  ✗', job.error);
    }
    job.save();
    return job;
  },
};
