// Check Before You Pay: before a customer pays a supplier, importer or Instagram vendor upfront, gather
// independent signals and return RED / AMBER / GREEN, each signal cited. Investigator parses the brief
// (phone, site, handle, email and wallet are also pulled out by regex, and a value the model returns is
// kept only if it is really in the brief). Then in parallel: Verifier checks the phone (Twilio fraud
// signals via BlockRun), the domain's registration date (registry RDAP, free; DataForSEO WHOIS only when
// the TLD has no RDAP), the wallet (Circle's USDC blacklist, a free read) and, for large amounts,
// sanctions (Didit AML); Scout runs Google searches for scam reports (Nairaland, Reddit) and a Places
// lookup; Analyst pulls the Instagram account. Reader reads the site and the report pages, and Analyst
// labels each report with a quote that code checks is verbatim. The verdict comes from fixed rules in
// code, never a model. Writer explains it and drafts what to ask; Auditor (another model family) checks
// the wording accuses no one and invents nothing.
import { Job } from '../job.ts';
import { ARC, DRY, MODELS } from '../config.ts';
import { HOSTS, llm, parseJson } from '../tools.ts';
import { AISA, aisa, dataforseo, ortho } from '../sellers.ts';
import { buy } from '../x402.ts';
import { blacklisted } from '../payees.ts';
import { MAIL_BUDGET_USD, MAIL_HOST } from '../mail.ts';
import { fx, scenarioOf, type Scenario } from './vendor-check.fixtures.ts';
import type { Role } from '../wallets.ts';

type Parsed = {
  name?: string; entity?: 'company' | 'person'; country?: string; location?: string; address?: string; phone?: string; website?: string;
  instagram?: string; tiktok?: string; email?: string; bankAccountName?: string; wallet?: string; amount?: number; currency?: string;
  purpose?: string; claimedYears?: number; detailsChanged?: boolean; wantsSanctions?: boolean;
};
type Phone = { e164: string; cc: string; nsn: string; local: string };
type Level = 'red' | 'amber' | 'good' | 'ok' | 'skip';
type Signal = { area: string; check: string; finding: string; level: Level; rule?: string; group?: string; source: string; url?: string };
type Hit = { title: string; link: string; snippet: string; date?: string };
type Place = { title: string; address?: string; phone?: string; website?: string; rating?: number; ratingCount?: number; category?: string; cid?: string };
type Source = { i: number; url: string; host: string; title: string; text: string; date?: string; contact: string[]; name: boolean; acct: boolean; stance?: string; quote?: string };
type Claim = { years: number; text: string; where: string };

// The verdict rules. Any R rule → RED; any A rule → AMBER; GREEN only with 3+ independent positives and no flags.
const RULES: Record<string, { text: string; why: string }> = {
  R1: { text: 'A scam or fraud report names the same phone, handle, website, email or wallet', why: 'Reports tied to the exact contact details you were given point at the same seller, not just a similar name.' },
  R2: { text: 'Scam or fraud reports on two or more separate sites name this business', why: 'Different people on different sites describing problems with the same business is a pattern, not a one-off.' },
  R3: { text: 'Call forwarding is switched on for the phone', why: 'With forwarding on, calls to this number ring somewhere else, so a "confirmation call" may not reach who you think.' },
  R4: { text: "The phone's SIM was swapped in the last 14 days", why: 'A fresh SIM swap is how numbers get hijacked: whoever holds the new SIM gets the calls and the one-time codes.' },
  R5: { text: 'Website or Instagram account under 60 days old while claiming years in business', why: 'Claiming years of trading with an online presence only weeks old is a common pattern in fake online shops.' },
  R6: { text: "The wallet is on Circle's USDC blacklist", why: 'Circle freezes addresses tied to sanctions, hacks or court orders; USDC sent there can be frozen.' },
  R7: { text: 'Sanctions or watchlist match in AML screening', why: 'Paying a sanctioned or watchlisted party can break the law, and the money can be frozen or seized.' },
  R8: { text: 'Payment details were changed by message', why: '"We have a new account" is the core move in invoice and business-email fraud. Confirm by calling a number you already had, never one in the same message.' },
  A1: { text: 'A scam or fraud report names this business (not the same contact details)', why: 'One report can be a dispute or a mix-up, but read it before you pay.' },
  A2: { text: 'Website registered under 60 days ago', why: 'Most fake shops use a freshly registered site. New businesses do too, so weigh it with the rest.' },
  A3: { text: 'The website is not registered or does not load', why: "A site that doesn't exist or doesn't load can't back up anything the seller claims." },
  A4: { text: 'A different phone number is published for this business', why: 'You may be talking to someone using the business\'s name. Call the published number to confirm who you are dealing with.' },
  A5: { text: 'A different or look-alike website or email domain', why: 'A look-alike or second website for the same name is a common impersonation trick.' },
  A6: { text: 'The business could not be confirmed at the address, or looks closed', why: "If you can't confirm them where they say they are, you can't fall back on walking in." },
  A7: { text: 'The phone number is invalid, virtual (VoIP) or from another country', why: "Virtual and invalid numbers aren't tied to a SIM or an address, so they are easy to abandon." },
  A8: { text: "The bank account name doesn't match the business", why: "Paying a business through someone else's personal account removes most of your protection if something goes wrong." },
  A9: { text: 'Instagram account warning signs (new, renamed, private, or followers out of line with posts)', why: 'Bought, renamed or newly made accounts with borrowed followers are common in Instagram vendor fraud.' },
  A10: { text: 'Politically exposed person or adverse-media match in AML screening', why: 'Not proof of wrongdoing, but large payments to politically exposed people or names in adverse media need extra care.' },
};
const GROUP: Record<string, string> = { phone: 'phone checks clear', domain: 'domain 2+ years old', site: 'site shows the same contact details', maps: 'matching Google Maps listing', status: 'confirmed open at the address', reputation: 'a customer vouches for them', social: 'established Instagram account' };
const VERDICT = {
  RED: 'High risk: don\'t pay upfront',
  AMBER: 'Caution: verify before you pay',
  GREEN: 'Low risk on what we could check',
} as const;

// ---------- small helpers

const DAY = 86400_000;
const CC: Record<string, string> = { NG: '234', GH: '233', KE: '254', ZA: '27', UG: '256', TZ: '255', RW: '250', CM: '237', SN: '221', CI: '225', EG: '20', GB: '44', US: '1', CA: '1', AE: '971', IN: '91' };
// Rough rates, used only to decide whether the sanctions screen runs (>= $500).
const USD_PER: Record<string, number> = { USD: 1, USDC: 1, USDT: 1, NGN: 1 / 1500, GHS: 1 / 12, KES: 1 / 129, ZAR: 1 / 18, UGX: 1 / 3700, GBP: 1.3, EUR: 1.1, CAD: 0.73, AED: 0.27, XOF: 1 / 600, EGP: 1 / 48, INR: 1 / 84 };
const DEMONYM: Record<string, string> = { NG: 'Nigerian', GH: 'Ghanaian', KE: 'Kenyan', ZA: 'South African', UG: 'Ugandan', GB: 'UK', US: 'US', CA: 'Canadian' };
const SYMBOL: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };
const GENERIC = new Set(['ltd', 'limited', 'nig', 'nigeria', 'ng', 'enterprise', 'enterprises', 'ventures', 'global', 'services', 'service', 'store', 'stores', 'shop', 'intl', 'international', 'company', 'co', 'inc', 'llc', 'plc', 'and', 'the', 'of', 'hub', 'concept', 'concepts', 'official', 'resources', 'investment', 'investments']);
const SOCIAL = /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|t\.me|linktr\.ee)$/;
const PLATFORM = /(^|\.)(wixsite\.com|myshopify\.com|business\.site|blogspot\.com|wordpress\.com|netlify\.app|vercel\.app|github\.io|carrd\.co|selar\.co|bumpa\.shop|paystack\.shop|flutterwave\.store|square\.site|weebly\.com|godaddysites\.com|mystrikingly\.com|webflow\.io|squarespace\.com)$/;
const AUTOMATED = /scamadviser|scam-?detector|scamdoc|trustscam|websiteoutlook|urlvoid|isitlegit|gridinsoft|trustedsite|scamminder|siteadvisor|webutation|mywot/;
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|aol|proton|protonmail|gmx|zoho)\./;
const SCAMMY = /\b(scam+(?:er|ers|med)?|fraud(?:ster|sters|ulent)?|fake|419|swindl\w*|duped|ripped off|blocked me|blocks? you|ran away|never (?:got|received|delivered)|didn'?t (?:deliver|send)|not delivered|beware|avoid|stole|con ?(?:man|men|artists?))\b/i;
const ACCUSE = /\b(is|are|was|were|be)\s+(?:(?:an?|the|definitely|clearly|obviously|surely|likely|probably)\s+){0,2}(scam(?:mer)?s?|fraud(?:ster)?s?|criminals?|thie(?:f|ves)|con ?(?:man|men|artists?)|fakes?|419)\b/i;

const flat = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (s: string) => flat(s).split(' ').filter((t) => t && !GENERIC.has(t));
const hostOf = (u?: string) => { try { return u ? new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).host.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; } };
const regDomain = (host: string) => { const p = host.split('.'); return p.length > 2 && /^(com|co|org|net|gov|edu|ac|sch|name|biz|info|ltd|plc|or|ne|go|mobi)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2 ? p.slice(-3).join('.') : p.slice(-2).join('.'); };
const digitsJoined = (t: string) => t.replace(/(?<=\d)[\s().\-]+(?=\d)/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const toDate = (v: unknown): Date | undefined => {
  if (v === null || v === undefined || v === '') return;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const s = String(v).replace(/^joined\s+/i, '').trim();
  const d = new Date(/^[A-Za-z]+ \d{4}$/.test(s) ? `1 ${s}` : s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ?([+-]\d{2}:\d{2})$/, '$1T$2$3'));
  return isNaN(d.getTime()) ? undefined : d;
};
const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / DAY);
const ago = (n: number) => (n < 60 ? `${n} days ago` : n < 730 ? `${Math.round(n / 30.4)} months ago` : `${Math.floor(n / 365)} years ago`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : n.toLocaleString('en-US'));
const money = (amount: number, cur: string) => (SYMBOL[cur] ? `${SYMBOL[cur]}${amount.toLocaleString('en-US')}` : `${amount.toLocaleString('en-US')} ${cur}`);
const lev = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length];
};
/** First scalar value under a key matching `key`, anywhere in a nested response (for sellers whose shape we only half know). */
const dig = (o: any, key: RegExp, depth = 0): any => {
  if (!o || typeof o !== 'object' || depth > 6) return undefined;
  for (const [k, v] of Object.entries(o)) if (key.test(k) && v !== null && typeof v !== 'object') return v;
  for (const v of Object.values(o)) { const r = dig(v, key, depth + 1); if (r !== undefined) return r; }
  return undefined;
};

function normPhone(raw: string | undefined, country: string): Phone | undefined {
  if (!raw) return;
  let d = raw.replace(/[^\d+]/g, '').replace(/^00/, '+');
  const codes = [...new Set(Object.values(CC))].sort((a, b) => b.length - a.length);
  let cc: string | undefined;
  if (d.startsWith('+')) cc = codes.find((c) => d.slice(1).startsWith(c));
  else if (CC[country] && d.startsWith(CC[country]) && d.length > 10) { cc = CC[country]; d = '+' + d; }
  else if (d.startsWith('0')) {
    cc = CC[country] ?? (/^0[789][01]\d{8}$/.test(d) ? '234' : undefined);
    if (cc) d = `+${cc}${d.slice(1)}`;
  } else if ((country === 'US' || country === 'CA') && d.length === 10) { cc = '1'; d = '+1' + d; }
  if (!cc || !d.startsWith('+')) return;
  const nsn = d.slice(1 + cc.length);
  if (nsn.length < 7 || nsn.length > 12) return;
  const local = cc === '234' && nsn.length === 10 ? `0${nsn.slice(0, 3)} ${nsn.slice(3, 6)} ${nsn.slice(6)}` : cc === '1' ? nsn : `0${nsn}`;
  return { e164: d, cc, nsn, local };
}

/** "since 2016", "est. 2012", "10+ years of experience": how long a text says the business has traded. */
function claimIn(text: string, where: string): Claim | undefined {
  const now = new Date().getFullYear();
  const y = text.match(/\b(?:since|est\.?|established(?: in)?|founded(?: in)?|in business since)\s*((?:19|20)\d{2})\b/i);
  if (y && +y[1] < now) return { years: now - +y[1], text: y[0], where };
  const n = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|in business|in the business|of service|serving|trading)\b/i);
  if (n && +n[1] >= 1) return { years: +n[1], text: n[0], where };
  return undefined;
}

/** Identifiers straight from the brief. The model's reading is used only where it names something that is really there. */
function settle(brief: string, p: Parsed) {
  const lower = brief.toLowerCase();
  const briefDigits = brief.replace(/\D/g, '');
  const country = (p.country ?? '').toUpperCase().slice(0, 2) || (/₦|naira|lagos|abuja|nigeria|port harcourt|ibadan|kano|\+234/i.test(brief) ? 'NG' : '');
  const phones = [...brief.matchAll(/(?<![\w@₦$£€])(\+?\d[\d\s().-]{7,18}\d)(?!\w)/g)]
    .filter((m) => !/acc(?:oun)?t|acct|nuban|a\/c|iban/i.test(brief.slice(Math.max(0, (m.index ?? 0) - 24), m.index)))
    .map((m) => m[1]).filter((x) => { const n = x.replace(/\D/g, '').length; return n >= 9 && n <= 15; });
  const llmPhone = p.phone && briefDigits.includes(p.phone.replace(/\D/g, '').slice(-9)) ? p.phone : undefined;
  const phoneRaw = llmPhone ?? phones[0];
  const email = brief.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  const urls = [...brief.matchAll(/(?<![@\w.])(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s,)]*)?/gi)]
    .map((m) => ({ host: m[1].toLowerCase(), path: m[2] ?? '' })).filter((u) => !SOCIAL.test(u.host) && !(email && email.endsWith(u.host)));
  const llmSite = p.website && lower.includes(hostOf(p.website)) ? p.website : undefined;
  const site = llmSite ? { host: hostOf(llmSite), path: (() => { try { return new URL(/^https?:/.test(llmSite) ? llmSite : `https://${llmSite}`).pathname.replace(/^\/$/, ''); } catch { return ''; } })() } : urls[0];
  const handles = [...brief.matchAll(/(?:instagram\.com\/|tiktok\.com\/@|(?<![\w.])@)([a-z0-9._]{2,30})/gi)]
    .filter((m) => !email?.includes(m[1].toLowerCase()))
    .map((m) => ({ h: m[1].replace(/\.$/, '').toLowerCase(), tiktok: /tiktok/i.test(brief.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + 12)) }));
  const clean = (h?: string) => h?.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/[/?].*$/, '').toLowerCase() || undefined;
  const inBrief = (h?: string) => (h && lower.includes(h) ? h : undefined);
  const instagram = inBrief(clean(p.instagram)) ?? handles.find((x) => !x.tiktok)?.h;
  const tiktok = inBrief(clean(p.tiktok)) ?? handles.find((x) => x.tiktok)?.h;
  const wallet = brief.match(/\b0x[a-fA-F0-9]{40}\b/)?.[0] ?? brief.match(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/)?.[0] ?? (p.wallet && brief.includes(p.wallet) ? p.wallet : undefined);
  const acct = p.bankAccountName && lower.includes(p.bankAccountName.toLowerCase()) ? p.bankAccountName.trim() : undefined;
  let amount = typeof p.amount === 'number' && p.amount > 0 ? p.amount : undefined, currency = p.currency?.toUpperCase();
  if (!amount) {
    // "₦850,000", "$1.2k", or "2,500 USDC" / "300k naira"
    const before = brief.match(/(₦|NGN|N|\$|USD|USDC|USDT|£|GBP|€|EUR|KES|KSh|GHS|GH₵)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?\b/i);
    const after = brief.match(/\b(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?\s?(USDC|USDT|USD|dollars|NGN|naira|GBP|pounds|EUR|euros|KES|GHS|cedis)\b/i);
    const [num, mult, cur] = before ? [before[2], before[3], before[1]] : after ? [after[1], after[2], after[3]] : [];
    if (num && cur) {
      amount = parseFloat(num.replace(/,/g, '')) * (/^k$/i.test(mult ?? '') ? 1e3 : mult ? 1e6 : 1);
      currency = ({ '₦': 'NGN', N: 'NGN', NAIRA: 'NGN', $: 'USD', DOLLARS: 'USD', '£': 'GBP', POUNDS: 'GBP', '€': 'EUR', EUROS: 'EUR', KSH: 'KES', 'GH₵': 'GHS', CEDIS: 'GHS' } as Record<string, string>)[cur.toUpperCase()] ?? cur.toUpperCase();
    }
  }
  currency = currency || (country === 'NG' ? 'NGN' : 'USD');
  const amountUsd = amount && USD_PER[currency] ? Math.round(amount * USD_PER[currency]) : undefined;
  const host = site?.host;
  const looksLikeAddress = (n: string) => /^(0x[a-f0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})$/i.test(n);
  const name = ([p.name?.trim(), instagram, host && regDomain(host)].find((n) => n && !looksLikeAddress(n)) ?? '').slice(0, 120);
  return {
    name, entity: p.entity === 'person' ? 'person' as const : 'company' as const, country, location: p.location?.trim() || '', address: p.address?.trim() || undefined,
    phoneRaw, phone: normPhone(phoneRaw, country), email, instagram, tiktok, wallet, acct,
    host, domain: host && !PLATFORM.test(host) ? regDomain(host) : undefined, siteUrl: host ? `https://${host}${site?.path ?? ''}` : undefined, platform: host && PLATFORM.test(host) ? host : undefined,
    amount, currency, amountUsd, purpose: p.purpose?.trim() || '', claimedYears: p.claimedYears && p.claimedYears > 0 ? p.claimedYears : undefined,
    detailsChanged: !!p.detailsChanged, wantsSanctions: !!p.wantsSanctions,
  };
}
type Payee = ReturnType<typeof settle>;

// ---------- the paid checks (each returns data; the rules below turn data into signals)

async function phoneLookup(job: Job, sc: Scenario, ph: Phone) {
  const data = await buy<any>(job, {
    agent: 'verifier', vendor: 'BlockRun phone fraud lookup', url: `https://${HOSTS.blockrun}/api/v1/phone/lookup/fraud`, method: 'POST',
    body: { phoneNumber: ph.e164 }, reason: `SIM swap, call forwarding and line type for ${ph.local}`, expectUsd: 0.05, maxUsd: 0.06,
    dryData: () => fx.phone(sc, ph.e164),
  });
  return data?.result ?? data;
}

/** Registration date from the registry's own RDAP server: free and authoritative, no x402 call needed. */
async function rdap(sc: Scenario, domain: string): Promise<{ created?: string; registrar?: string; status?: string[]; notFound?: boolean; noService?: boolean }> {
  if (DRY) return fx.rdap(sc, domain);
  // rdap.org sits behind Cloudflare, which refuses Node's default user agent (403).
  const res = await fetch(`https://rdap.org/domain/${domain}`, { headers: { accept: 'application/rdap+json', 'user-agent': 'Syncly-vendor-check/1.0' }, signal: AbortSignal.timeout(12_000) });
  // rdap.org answers 404 itself when the TLD has no RDAP server; a 404 from the registry means "not registered".
  if (res.status === 404) return hostOf(res.url) === 'rdap.org' ? { noService: true } : { notFound: true };
  if (!res.ok) throw new Error(`RDAP answered ${res.status}`);
  const d: any = await res.json();
  const registrar = d.entities?.find((e: any) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3];
  return { created: d.events?.find((e: any) => e.eventAction === 'registration')?.eventDate, registrar, status: d.status };
}

async function whois(job: Job, sc: Scenario, domain: string) {
  const res = await dataforseo<any>(job, 'domain_analytics/whois/overview/live', { filters: ['domain', '=', domain], limit: 1 }, {
    agent: 'verifier', vendor: 'DataForSEO WHOIS (AIsa)', reason: `registration date of ${domain} (its TLD has no RDAP)`, expectUsd: 0.1, maxUsd: 0.15, dry: () => fx.whois(sc, domain),
  });
  const it = res?.[0]?.items?.[0];
  return { created: it?.created_datetime as string | undefined, registrar: it?.registrar as string | undefined };
}

async function search(job: Job, sc: Scenario, q: string, gl: string): Promise<Hit[]> {
  const d = await ortho<any>(job, 'serper/search', { body: { q, num: 10, ...(gl ? { gl } : {}) } }, {
    agent: 'scout', vendor: 'Serper (Orthogonal)', reason: `Google: ${q}`, expectUsd: 0.002, maxUsd: 0.005, dry: () => fx.search(sc, q),
  });
  return (d?.organic ?? []).map((o: any) => ({ title: String(o.title ?? ''), link: String(o.link ?? ''), snippet: String(o.snippet ?? ''), date: o.date }));
}

async function places(job: Job, sc: Scenario, q: string, gl: string): Promise<Place[]> {
  const d = await ortho<any>(job, 'serper/places', { body: { q, num: 10, ...(gl ? { gl } : {}) } }, {
    agent: 'scout', vendor: 'Serper Places (Orthogonal)', reason: `Google Places: ${q}`, expectUsd: 0.002, maxUsd: 0.005, dry: () => fx.places(sc, q),
  });
  return (d?.places ?? []).map((p: any) => ({ title: String(p.title ?? ''), address: p.address, phone: p.phoneNumber ?? p.phone, website: p.website, rating: p.rating, ratingCount: p.ratingCount ?? p.reviewsCount, category: p.category ?? p.type, cid: p.cid ? String(p.cid) : undefined }));
}

async function readUrls(job: Job, sc: Scenario, urls: string[], reason: string): Promise<{ url: string; final?: string; text: string }[]> {
  const batch = urls.filter((u) => !u.includes(',')).slice(0, 10);
  if (!batch.length) return [];
  const d = await buy<any>(job, {
    agent: 'reader', vendor: 'APEX web-read', url: `https://${HOSTS.apex}/api/x402/web-read?${new URLSearchParams({ urls: batch.join(',') })}`, method: 'GET',
    reason, expectUsd: 0.003, maxUsd: 0.006, dryData: () => fx.pages(sc, batch),
  });
  return (d?.pages ?? d?.results ?? d?.data ?? []).map((p: any) => ({ url: String(p.url ?? p.finalUrl ?? ''), final: p.finalUrl, text: String(p.text ?? p.body ?? p.content ?? '').slice(0, 12000) }));
}

async function instagram(job: Job, sc: Scenario, handle: string) {
  const a = (path: string, what: string, dry: () => any) => aisa<any>(job, path, { query: path.startsWith('instagram/') ? { handle } : { username: handle } }, {
    agent: 'analyst', vendor: `Instagram ${what} (AIsa)`, reason: `@${handle}: ${what}`, expectUsd: 0.1, maxUsd: 0.15, dry,
  });
  const prof = await a('instagram/profile', 'profile', () => fx.igProfile(sc, handle));
  const u = prof?.data?.user ?? prof?.user ?? prof?.data;
  if (!u || (!u.username && !u.id)) return undefined;
  // Account age and renames come from separate endpoints; each is useful alone, so one failing doesn't stop the other.
  const [about, former] = await Promise.all([
    a('tikhub/instagram/v3/get_user_about', 'account age', () => fx.igAbout(sc)).catch((e) => { job.log('analyst', 'skip', `account age unavailable (${String(e?.message ?? e).slice(0, 50)})`); return undefined; }),
    a('tikhub/instagram/v3/get_user_former_usernames', 'name changes', () => fx.igFormer(sc, handle)).catch((e) => { job.log('analyst', 'skip', `name changes unavailable (${String(e?.message ?? e).slice(0, 50)})`); return undefined; }),
  ]);
  const posts: any[] = u.edge_owner_to_timeline_media?.edges ?? [];
  const times = posts.map((e) => e?.node?.taken_at_timestamp).filter((t) => typeof t === 'number').sort((a, b) => a - b);
  const renames = former?.data?.former_username_count ?? dig(former, /former_?username_?count/i);
  return {
    username: String(u.username ?? handle), fullName: u.full_name as string | undefined, bio: String(u.biography ?? ''), externalUrl: u.external_url as string | undefined,
    followers: Number(u.edge_followed_by?.count ?? u.follower_count ?? 0), following: Number(u.edge_follow?.count ?? u.following_count ?? 0),
    posts: Number(u.edge_owner_to_timeline_media?.count ?? u.media_count ?? 0), private: !!u.is_private, verified: !!u.is_verified, business: !!(u.is_business_account ?? u.is_business),
    category: (u.category_name ?? u.category) as string | undefined, oldestRecentPost: times[0] ? new Date(times[0] * 1000) : undefined,
    joined: toDate(dig(about?.data ?? about, /date_?joined|^joined|account_?created|creat(ed|ion)_?(at|date|time)?$/i)),
    basedIn: dig(about?.data ?? about, /^(country|account_?based_?in|based_?in)$/i) as string | undefined,
    renames: typeof renames === 'number' ? renames : undefined,
  };
}

async function amlScreen(job: Job, sc: Scenario, v: Payee) {
  const body = { full_name: v.name, entity_type: v.entity, include_adverse_media: true, ...(v.entity === 'person' && v.country ? { nationality: v.country } : {}) };
  const d = await ortho<any>(job, 'didit/v3/aml', { body }, {
    agent: 'verifier', vendor: 'Didit AML screening (Orthogonal)', reason: `sanctions, watchlists, PEP and adverse media for "${v.name}"`, expectUsd: 0.36, maxUsd: 0.4,
    dry: () => fx.aml(sc, v.name, v.entity),
  });
  return d?.aml ?? d;
}

// ---------- the service

export const vendorCheck = {
  id: 'vendor-check',
  name: 'Check Before You Pay',
  priceUsd: 4,
  // $0.10-0.45 of tools per check (an Instagram handle is $0.30 of that), +$0.36 when the sanctions screen runs;
  // headroom for the WHOIS fallback ($0.10), an auditor-requested rewrite and model price variance.
  policy: { budgetUsd: 1.5 + MAIL_BUDGET_USD, allowHosts: [HOSTS.blockrun, HOSTS.orthogonal, HOSTS.apex, AISA, ...(MAIL_HOST ? [MAIL_HOST] : [])] },

  async run(brief: string, opts: { orderId?: string } = {}): Promise<Job> {
    const job = new Job(this.id, brief, this.policy, opts.orderId);
    const sc = scenarioOf(brief);
    try {
      // 1. Who is being paid, how much, and every contact detail given
      job.log('investigator', 'parse', 'who is being paid, how much, for what, and every contact detail given');
      const parsed = parseJson<Parsed>(
        await llm(job, 'investigator', [
          { role: 'system', content: 'Parse a request to check a vendor, supplier or person before paying them. Reply JSON only: {"name": the business or person being paid, "entity": "company"|"person", "country": ISO-2 country they operate in (e.g. "NG") or "", "location": area and city, "address": street, plaza or market address if given else null, "phone": exactly as written or null, "website": as written or null, "instagram": handle or null, "tiktok": handle or null, "email": or null, "bankAccountName": the account name they gave for payment, or null, "wallet": crypto address or null, "amount": number or null, "currency": ISO code (NGN for ₦ or naira) or null, "purpose": what the payment is for, in a few words, "claimedYears": years in business the vendor claims, only if the message says so, else null, "detailsChanged": true only if the message says the vendor changed or sent new bank/wallet details, "wantsSanctions": true only if the customer asks for a sanctions or AML check}. Copy identifiers exactly; never invent one.' },
          { role: 'user', content: brief },
        ], 'parse the payment and the payee', { model: MODELS.fast, maxTokens: 500, json: true, dry: () => fx.parse(sc, brief) }),
        {},
      );
      const v = settle(brief, parsed);
      if (!v.name && !v.phone && !v.host && !v.instagram) throw new Error('Tell us who you are about to pay: a name plus at least one of phone, website or Instagram handle.');
      const given = [v.phone && 'phone', v.host && 'website', v.instagram && 'Instagram', v.tiktok && 'TikTok', v.email && 'email', v.acct && 'account name', v.wallet && 'wallet', v.address && 'address'].filter(Boolean);
      job.log('investigator', 'payee', `${v.name}${v.amount ? ` · ${money(v.amount, v.currency)}${v.amountUsd && v.currency !== 'USD' ? ` (~$${v.amountUsd})` : ''}` : ''} · given: ${given.join(', ') || 'name only'}`);

      const S: Signal[] = [];
      const gaps: string[] = [];
      const raw: Record<string, unknown> = { payee: v };
      const gl = /^[A-Z]{2}$/.test(v.country) ? v.country.toLowerCase() : '';
      const skip = (area: string, check: string, why: string) => { S.push({ area, check, finding: why, level: 'skip', source: '—' }); gaps.push(`${check}: ${why}`); };
      const errors: string[] = [];
      const failed = (agent: Role, area: string, check: string) => (e: any) => {
        const m = String(e?.message ?? e).slice(0, 120);
        job.log(agent, 'skip', `${check} failed (${m.slice(0, 80)})`);
        errors.push(`${check}: ${m}`);
        skip(area, check, "the provider didn't answer, so this wasn't checked");
        return undefined;
      };

      // 2. Independent checks, in parallel (each agent's calls still go one at a time through buy())
      let tw: any, dom: { created?: Date; registrar?: string; notFound?: boolean; source: string; url?: string } | undefined;
      let ig: Awaited<ReturnType<typeof instagram>>, aml: any, onBlacklist: boolean | undefined;
      const hits: { q: string; h: Hit }[] = [];
      let listings: Place[] = [], searchesOk = 0;
      const phoneQ = v.phone ? [v.phone.local.replace(/\s/g, ''), ...(v.phone.local.includes(' ') ? [v.phone.local] : []), v.phone.e164] : [];
      const nm = v.name ? `"${v.name.replace(/"/g, '')}"` : '';
      const ids = [v.instagram, v.tiktok, v.domain ?? v.host, v.email].filter(Boolean).map((x) => `"${x}"`);
      const acctDiffers = !!v.acct && !tokens(v.acct).some((t) => tokens(v.name).includes(t));
      const queries = [
        nm && `${nm} scam OR fraud OR fake`,
        phoneQ.length && phoneQ.map((p) => `"${p}"`).join(' OR '),
        v.country === 'NG' ? `site:nairaland.com ${[nm, phoneQ[0] && `"${phoneQ[0]}"`, ids[0]].filter(Boolean).join(' OR ')}` : v.domain ? `site:trustpilot.com "${v.domain}"` : '',
        (nm || ids.length) && `site:reddit.com ${[nm, ...ids.slice(0, 2)].filter(Boolean).join(' OR ')}`,
        ids.length && `${ids.join(' OR ')} scam OR fraud OR legit OR review`,
        acctDiffers && `"${v.acct}" scam OR fraud`,
      ].filter((q): q is string => !!q && !/^site:\S+ ?$/.test(q)).slice(0, 6);
      const runAml = (v.amountUsd ?? 0) >= 500 || v.wantsSanctions;

      await Promise.all([
        (async () => {
          if (!v.phone) return v.phoneRaw ? skip('Phone', 'Phone checks', `couldn't tell which country ${v.phoneRaw} is in; give it with the country code`) : undefined;
          job.log('verifier', 'phone', `Twilio fraud signals for ${v.phone.e164}`);
          tw = await phoneLookup(job, sc, v.phone).catch(failed('verifier', 'Phone', 'Phone lookup'));
          // BlockRun forwards Twilio's own answer; an error body (or nothing) means the number wasn't looked up.
          if (tw && (tw.error || tw.message || (tw.valid === undefined && !tw.line_type_intelligence))) { skip('Phone', 'Phone lookup', `no carrier data came back (${String(tw.error ?? tw.message ?? 'empty answer').slice(0, 60)})`); tw = undefined; }
        })(),
        (async () => {
          if (!v.domain) return;
          job.log('verifier', 'domain', `registration date of ${v.domain} from its registry (RDAP, free)`);
          const r = await rdap(sc, v.domain).catch((e) => { job.log('verifier', 'rdap', `RDAP failed (${String(e?.message ?? e).slice(0, 50)}); trying WHOIS`); return { noService: true } as const; });
          if ('noService' in r && r.noService) {
            const w = await whois(job, sc, v.domain).catch(failed('verifier', 'Website', 'Domain age'));
            if (w) dom = { created: toDate(w.created), registrar: w.registrar, source: 'DataForSEO WHOIS via AIsa' };
          } else dom = { created: toDate(r.created), registrar: r.registrar, notFound: r.notFound, source: 'Registry RDAP', url: `https://rdap.org/domain/${v.domain}` };
        })(),
        (async () => {
          if (!v.wallet) return;
          if (!/^0x[a-fA-F0-9]{40}$/.test(v.wallet)) return skip('Wallet', "Circle's USDC blacklist", 'only EVM (0x…) addresses can be checked against USDC on Arc');
          job.log('verifier', 'wallet', `Circle's USDC blacklist for ${v.wallet.slice(0, 8)}…`);
          onBlacklist = await blacklisted(v.wallet);
        })(),
        (async () => {
          if (!runAml) return;
          job.log('verifier', 'aml', `sanctions, watchlists, PEP and adverse media for "${v.name}" (${v.amountUsd ? `~$${v.amountUsd} at stake` : 'you asked'})`);
          aml = await amlScreen(job, sc, v).catch(failed('verifier', 'Sanctions', 'AML screening'));
        })(),
        (async () => {
          if (!v.instagram) return;
          job.log('analyst', 'instagram', `@${v.instagram}: followers, posts, account age and name changes`);
          ig = await instagram(job, sc, v.instagram).catch(failed('analyst', 'Instagram', 'Instagram profile'));
          if (ig === undefined && !S.some((s) => s.area === 'Instagram')) skip('Instagram', 'Instagram profile', `@${v.instagram} was not found or returned no public data`);
        })(),
        (async () => {
          job.log('scout', 'search', `${queries.length} Google searches for reports, incl. ${v.country === 'NG' ? 'Nairaland and ' : ''}Reddit`);
          for (const q of queries) {
            try { for (const h of await search(job, sc, q, gl)) hits.push({ q, h }); searchesOk++; }
            catch (e: any) { job.log('scout', 'skip', `"${q.slice(0, 40)}" failed (${String(e?.message ?? e).slice(0, 50)})`); }
          }
          if (!v.name || v.name === v.instagram) return;
          const q = [v.name, v.location || v.address || ''].join(' ').trim();
          job.log('scout', 'places', `Google Places: "${q}"`);
          listings = (await places(job, sc, q, gl).catch(failed('scout', 'Existence', 'Google Places lookup'))) ?? [];
        })(),
      ]);

      // 3. Which listing (if any) is this business: same phone first, then a name match
      const coreName = tokens(v.name);
      const nameScore = (t: string) => { const a = coreName.length ? coreName : flat(v.name).split(' '); const b = new Set(tokens(t)); return a.length ? a.filter((x) => b.has(x)).length / a.length : 0; };
      const phoneOf = (p?: string) => normPhone(p?.split(/[\/,;]/)[0], v.country);
      const listing = listings.find((p) => v.phone && phoneOf(p.phone)?.nsn === v.phone.nsn) ?? listings.map((p) => ({ p, s: nameScore(p.title) })).filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s || (b.p.ratingCount ?? 0) - (a.p.ratingCount ?? 0))[0]?.p;
      raw.places = listings;
      let voygr: any;
      const vAddress = listing?.address ?? [v.address, v.location].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
      if (v.name && v.name !== v.instagram && vAddress && (listing || v.address)) {
        job.log('verifier', 'status', `does "${listing?.title ?? v.name}" exist and trade at ${vAddress}?`);
        voygr = await ortho<any>(job, 'voygr/v1/business-status', { body: { name: listing?.title ?? v.name, address: vAddress } }, {
          agent: 'verifier', vendor: 'Voygr business status (Orthogonal)', reason: `is "${listing?.title ?? v.name}" at ${vAddress} and open?`, expectUsd: 0.005, maxUsd: 0.01, dry: () => fx.voygr(sc),
        }).catch(failed('verifier', 'Existence', 'Business status'));
      }

      // 4. Read the site and the pages that might be reports, in one call
      const own = (u: string) => { const h = hostOf(u); return (!!v.host && (h === v.host || (!!v.domain && (h === v.domain || h.endsWith('.' + v.domain))))) || (!!v.instagram && u.toLowerCase().includes(`instagram.com/${v.instagram}`)) || (!!v.tiktok && u.toLowerCase().includes(`tiktok.com/@${v.tiktok}`)); };
      const byUrl = new Map<string, Source>();
      for (const { h } of hits) {
        const url = h.link.replace(/#.*$/, '');
        if (!url || own(url) || byUrl.has(url)) continue;
        byUrl.set(url, { i: 0, url, host: hostOf(url), title: h.title, text: `${h.title}\n${h.snippet}`, date: h.date, contact: [], name: false, acct: false });
      }
      const match = (s: Source) => {
        const t = s.text, lower = t.toLowerCase();
        s.contact = [
          v.phone && digitsJoined(t).includes(v.phone.nsn) && 'phone',
          v.instagram && new RegExp(`(^|[^a-z0-9_.])@?${esc(v.instagram)}(?![a-z0-9_])`, 'i').test(t) && 'Instagram handle',
          v.tiktok && lower.includes(v.tiktok) && 'TikTok handle',
          v.domain && lower.includes(v.domain) && 'website',
          v.email && lower.includes(v.email) && 'email',
          v.wallet && lower.includes(v.wallet.toLowerCase()) && 'wallet',
        ].filter((x): x is string => !!x);
        const core = coreName.join(' ');
        s.name = !!v.name && flat(t).includes(core.length >= 5 && (coreName.length >= 2 || core.length >= 7) ? core : flat(v.name));
        s.acct = !!v.acct && acctDiffers && flat(t).includes(flat(v.acct));
        return s;
      };
      const sources = [...byUrl.values()].map(match).filter((s) => !AUTOMATED.test(s.host));
      const readable = sources.filter((s) => (s.contact.length || s.name || s.acct) && !SOCIAL.test(s.host))
        .sort((a, b) => b.contact.length - a.contact.length || Number(SCAMMY.test(b.text)) - Number(SCAMMY.test(a.text)));
      const siteUrls = dom?.notFound ? [] : v.domain ? [`https://${v.host}`, `https://${v.host}/contact`, `https://${v.host}/about`] : v.siteUrl ? [v.siteUrl] : [];
      const toRead = [...siteUrls, ...readable.slice(0, 10 - siteUrls.length).map((s) => s.url)];
      let pages: Awaited<ReturnType<typeof readUrls>> | undefined;
      if (toRead.length) {
        job.log('reader', 'read', `${siteUrls.length ? 'the website and ' : ''}${toRead.length - siteUrls.length} pages that mention the payee`);
        pages = await readUrls(job, sc, toRead, `read ${toRead.length} pages: the site and possible reports`).catch(failed('reader', 'Website', 'Reading pages'));
      }
      for (const p of pages ?? []) { const s = byUrl.get(p.url) ?? byUrl.get(p.final ?? ''); if (s && p.text) { s.text = `${s.title}\n${p.text}`; match(s); } }

      // 5. The website: live? same phone? an address? how long does it claim to have traded?
      const sitePages = (pages ?? []).filter((p) => siteUrls.length && [hostOf(p.url), hostOf(p.final)].includes(v.host!) && p.text.length >= 150);
      const siteText = sitePages.map((p) => p.text).join('\n');
      const claims = [
        v.claimedYears ? { years: v.claimedYears, text: `${v.claimedYears} years in business`, where: 'your message' } : undefined,
        claimIn(siteText, 'the website'), ig && claimIn(ig.bio, 'the Instagram bio'),
      ].filter((c): c is Claim => !!c);
      const claim = claims.sort((a, b) => b.years - a.years)[0];
      const claimNote = claim ? `; ${claim.where} says "${claim.text}"` : '';

      // ---------- signals (every red/amber carries the rule that fired)
      if (tw) {
        const lt = tw.line_type_intelligence ?? {};
        const type = String(lt.type ?? 'unknown'), carrier = lt.carrier_name ?? tw.sim_swap?.carrier_name ?? 'unknown carrier';
        const foreign = v.country && tw.country_code && tw.country_code !== v.country;
        const bad = tw.valid === false || /voip/i.test(type) || foreign;
        S.push({ area: 'Phone', check: 'Line and carrier', finding: tw.valid === false ? `${v.phone!.local} is not a valid, dialable number` : `${v.phone!.local}: ${type.replace('nonFixedVoip', 'virtual (VoIP)')} line on ${carrier}${foreign ? `, registered in ${tw.country_code}` : ''}`, level: bad ? 'amber' : 'ok', rule: bad ? 'A7' : undefined, source: 'Twilio Lookup via BlockRun' });
        const ss = tw.sim_swap, cf = tw.call_forwarding;
        const swapDate = toDate(ss?.last_sim_swap?.last_sim_swap_date);
        const swapped = !ss?.error_code && ss ? ss.last_sim_swap?.swapped_in_period === true || (!!swapDate && daysSince(swapDate) <= 14) : undefined;
        const forwarding = !cf?.error_code && cf ? cf.call_forwarding_status : undefined;
        const bothClear = swapped === false && forwarding === false && tw.valid !== false;
        const kind = DEMONYM[tw.country_code] ?? (tw.country_code ? `${tw.country_code}` : 'these');
        if (swapped === undefined) skip('Phone', 'SIM swap', `Twilio returns no SIM-swap data for ${kind} numbers`);
        else S.push({ area: 'Phone', check: 'SIM swap', finding: swapped ? `SIM swapped ${swapDate ? ago(daysSince(swapDate)) : 'within the checked period'}` : `No recent SIM swap${swapDate ? ` (last one ${ago(daysSince(swapDate))})` : ''}`, level: swapped ? 'red' : bothClear ? 'good' : 'ok', rule: swapped ? 'R4' : undefined, group: 'phone', source: 'Twilio Lookup via BlockRun' });
        if (forwarding === undefined || forwarding === null) skip('Phone', 'Call forwarding', `Twilio returns no call-forwarding data for ${kind} numbers`);
        else S.push({ area: 'Phone', check: 'Call forwarding', finding: forwarding ? 'Call forwarding is ON for this number' : 'Call forwarding is off', level: forwarding ? 'red' : bothClear ? 'good' : 'ok', rule: forwarding ? 'R3' : undefined, group: 'phone', source: 'Twilio Lookup via BlockRun' });
        raw.phone = tw;
      }

      if (dom) raw.domain = { ...dom, created: dom.created?.toISOString() };
      if (v.platform) skip('Website', 'Domain age', `the site is on a shared platform (${v.platform}), so its registration date says nothing about the seller`);
      if (dom) {
        const age = dom.created ? daysSince(dom.created) : undefined;
        const src = { source: dom.source, url: dom.url };
        if (dom.notFound) S.push({ area: 'Website', check: 'Domain registration', finding: `${v.domain} is not a registered domain`, level: 'amber', rule: 'A3', ...src });
        else if (age === undefined) skip('Website', 'Domain age', `no registration date was published for ${v.domain}`);
        else {
          const r5 = age < 60 && !!claim && claim.years >= 1;
          const level: Level = r5 ? 'red' : age < 60 ? 'amber' : age >= 730 ? 'good' : 'ok';
          S.push({ area: 'Website', check: 'Domain age', finding: `${v.domain} registered ${ago(age)} (${ymd(dom.created!)})${dom.registrar ? ` with ${dom.registrar}` : ''}${r5 || age < 365 ? claimNote : ''}`, level, rule: r5 ? 'R5' : age < 60 ? 'A2' : undefined, group: 'domain', ...src });
        }
      }
      if (siteUrls.length && pages) {
        const phonesOnSite = [...siteText.matchAll(/(?<!\d)\+?\d[\d\s().-]{8,16}\d(?!\d)/g)].map((m) => normPhone(m[0], v.country)?.nsn).filter(Boolean) as string[];
        const samePhone = !!v.phone && phonesOnSite.includes(v.phone.nsn);
        const address = /\b\d{1,4}[a-z]?,?\s+[a-z][\w.' -]{2,40}\s(street|st\.?|road|rd\.?|avenue|ave\.?|close|crescent|way|drive|lane|causeway|expressway)\b|\b(plaza|mall|market|estate|shop \d+)\b/i.test(siteText);
        // A brand-new site showing the seller's own number proves nothing, so it only counts once the domain is a year old.
        const siteOld = !dom?.created || daysSince(dom.created) >= 365;
        if (!sitePages.length) S.push({ area: 'Website', check: 'Site is live', finding: `${v.siteUrl} did not load (or showed almost no text)`, level: 'amber', rule: 'A3', source: 'APEX web-read', url: v.siteUrl });
        else if (v.phone && phonesOnSite.length && !samePhone) S.push({ area: 'Website', check: 'Contact details on the site', finding: `The site lists ${[...new Set(phonesOnSite)].slice(0, 2).map((n) => normPhone(`+${v.phone!.cc}${n}`, v.country)?.local).join(', ')}, not the number you were given`, level: 'amber', rule: 'A4', source: 'the website', url: v.siteUrl });
        else S.push({ area: 'Website', check: 'Contact details on the site', finding: `Live; ${samePhone ? 'shows the same phone number' : v.phone ? 'shows no phone number' : 'loads'}${address ? ' and a physical address' : ', no street address'}`, level: siteOld && (samePhone || (!v.phone && address)) ? 'good' : 'ok', group: 'site', source: 'the website', url: v.siteUrl });
      }

      if (v.email) {
        const ed = v.email.split('@')[1];
        if (v.domain && !FREE_MAIL.test(ed) && ed !== v.domain && lev(ed.split('.')[0], v.domain.split('.')[0]) <= 2) S.push({ area: 'Email', check: 'Email domain', finding: `${ed} looks like ${v.domain} but is a different domain`, level: 'amber', rule: 'A5', source: 'your message' });
        else S.push({ area: 'Email', check: 'Email domain', finding: FREE_MAIL.test(ed) ? `A free email address (${ed}); anyone can open one` : v.domain && ed !== v.domain ? `${ed}, a different domain from the website` : `${ed}, the same domain as the website`, level: 'ok', source: 'your message' });
      }

      if (v.name && v.name !== v.instagram) {
        const mapsUrl = listing?.cid ? `https://maps.google.com/?cid=${listing.cid}` : undefined;
        if (!listing) S.push({ area: 'Existence', check: 'Google Maps listing', finding: `No listing matched "${v.name}"${v.location ? ` near ${v.location}` : ''} (${listings.length} place${listings.length === 1 ? '' : 's'} checked)`, level: 'ok', source: 'Google Places via Serper' });
        else {
          const lp = phoneOf(listing.phone), ld = listing.website ? regDomain(hostOf(listing.website)) : undefined;
          const phoneMatch = !!v.phone && lp?.nsn === v.phone.nsn, siteMatch = !!v.domain && ld === v.domain;
          const desc = `"${listing.title}", ${listing.address ?? 'no address'}${listing.rating ? `, ${listing.rating}★ from ${listing.ratingCount ?? 0} reviews` : ''}`;
          S.push({ area: 'Existence', check: 'Google Maps listing', finding: `${desc}${phoneMatch ? '; same phone' : ''}${siteMatch ? '; same website' : ''}`, level: phoneMatch || siteMatch || (!v.phone && !v.domain && (listing.ratingCount ?? 0) >= 10) ? 'good' : 'ok', group: 'maps', source: 'Google Maps', url: mapsUrl });
          if (v.phone && lp && !phoneMatch) S.push({ area: 'Existence', check: 'Phone on Google Maps', finding: `Maps lists ${lp.local} for "${listing.title}", not ${v.phone.local}`, level: 'amber', rule: 'A4', source: 'Google Maps', url: mapsUrl });
          if (v.domain && ld && !siteMatch) S.push({ area: 'Existence', check: 'Website on Google Maps', finding: `Maps lists ${ld} for "${listing.title}", not ${v.domain}${lev(ld, v.domain) <= 3 ? ' (a look-alike)' : ''}`, level: 'amber', rule: 'A5', source: 'Google Maps', url: mapsUrl });
        }
      }
      if (voygr) {
        voygr = voygr.data ?? voygr.result ?? voygr;
        // Orthogonal documents existence_status/open_closed_status; Voygr's own API now answers existence_confidence/operational_status.
        const ex = voygr.existence_status ?? (typeof voygr.existence_confidence === 'number' ? (voygr.existence_confidence >= 0.7 ? 'exists' : voygr.existence_confidence < 0.3 ? 'not_exists' : 'uncertain') : 'uncertain');
        const oc = voygr.open_closed_status ?? voygr.operational_status?.status ?? 'uncertain';
        const where = `"${listing?.title ?? v.name}" at ${vAddress}`;
        const bad = ex === 'not_exists' || oc === 'closed' || oc === 'not_exists';
        S.push({ area: 'Existence', check: 'Business at the address', finding: bad ? `${oc === 'closed' ? 'Looks closed' : 'Could not be confirmed'}: ${where}` : ex === 'exists' && oc === 'open' ? `Exists and open: ${where}` : `Uncertain: ${where}`, level: bad ? 'amber' : ex === 'exists' && oc === 'open' ? 'good' : 'ok', rule: bad ? 'A6' : undefined, group: 'status', source: 'Voygr business status' });
        raw.businessStatus = voygr;
      }

      if (ig) {
        const url = `https://www.instagram.com/${ig.username}/`, src = { source: `Instagram @${ig.username}`, url };
        const lopsided = ig.followers >= 5000 && ig.posts < 20;
        const age = ig.joined ? daysSince(ig.joined) : undefined;
        const r5 = age !== undefined && age < 60 && !!claim && claim.years >= 1;
        const foreign = !!ig.basedIn && !!v.country && !new RegExp(`\\b(${v.country}|${v.country === 'NG' ? 'nigeria' : v.country === 'GB' ? 'united kingdom|uk' : v.country === 'US' ? 'united states|usa' : v.country})\\b`, 'i').test(ig.basedIn);
        S.push({ area: 'Instagram', check: 'Account', finding: `${short(ig.followers)} followers, ${ig.posts} posts${lopsided ? ' (a big following for so few posts)' : ''}${ig.business ? `, business account${ig.category ? ` (${ig.category})` : ''}` : ''}${ig.verified ? ', verified' : ''}${ig.private ? ', private' : ''}`, level: ig.private || lopsided ? 'amber' : 'ok', rule: ig.private || lopsided ? 'A9' : undefined, ...src });
        const ageWarn = (ig.renames ?? 0) >= 2 || (age !== undefined && age < 180) || foreign;
        const established = age !== undefined && age >= 730 && ig.posts >= 30 && (ig.renames ?? 0) < 2 && !ig.private && !foreign;
        S.push({
          area: 'Instagram', check: 'Account age and name changes',
          finding: `${ig.joined ? `Created ${ig.joined.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}` : 'Creation date not available'}; ${ig.renames === undefined ? 'name changes not available' : ig.renames ? `renamed ${ig.renames} time${ig.renames > 1 ? 's' : ''}` : 'never renamed'}${ig.basedIn ? `; based in ${ig.basedIn}` : ''}${r5 ? claimNote : ''}`,
          level: r5 ? 'red' : ageWarn ? 'amber' : established ? 'good' : 'ok', rule: r5 ? 'R5' : ageWarn ? 'A9' : undefined, group: 'social', ...src,
        });
        const bioPhone = normPhone(ig.bio.match(/\+?\d[\d\s().-]{8,16}\d/)?.[0], v.country);
        if (v.phone && bioPhone && bioPhone.nsn !== v.phone.nsn) S.push({ area: 'Instagram', check: 'Phone in bio', finding: `The bio lists ${bioPhone.local}, not ${v.phone.local}`, level: 'ok', ...src });
        raw.instagram = ig;
      }
      if (v.tiktok) gaps.push(`TikTok @${v.tiktok}: we don't pull TikTok profiles; the handle was searched on Google instead`);

      if (v.acct) S.push({ area: 'Payment', check: 'Account name', finding: acctDiffers ? `"${v.acct}" doesn't match "${v.name}"` : `"${v.acct}" matches the business name`, level: acctDiffers && v.entity === 'company' ? 'amber' : 'ok', rule: acctDiffers && v.entity === 'company' ? 'A8' : undefined, source: 'your message' });
      if (v.detailsChanged) S.push({ area: 'Payment', check: 'Changed payment details', finding: 'You said the payee sent new or changed payment details', level: 'red', rule: 'R8', source: 'your message' });
      if (onBlacklist !== undefined) S.push({ area: 'Wallet', check: "Circle's USDC blacklist", finding: onBlacklist ? `${v.wallet} is blacklisted` : `${v.wallet!.slice(0, 10)}… is not on the blacklist (checked on Arc; most addresses aren't, so this is not a positive sign)`, level: onBlacklist ? 'red' : 'ok', rule: onBlacklist ? 'R6' : undefined, source: "Circle's USDC contract on Arc", url: `${ARC.explorer}/address/${v.wallet}` });

      if (!runAml) gaps.push(`Sanctions and watchlist screening: skipped because ${v.amountUsd ? `the amount (~$${v.amountUsd}) is under $500` : 'no amount was given'} and you didn't ask for it`);
      else if (aml) {
        const real = (aml.hits ?? []).filter((h: any) => h.review_status !== 'False Positive');
        const sanction = real.filter((h: any) => h.sanction_matches?.length || h.warning_matches?.length || (h.datasets ?? []).some((d: string) => /sanction|warning|wanted|debar/i.test(d)));
        const soft = real.filter((h: any) => !sanction.includes(h));
        const names = (hs: any[]) => hs.slice(0, 2).map((h) => `"${h.caption}" (${(h.datasets ?? []).slice(0, 2).join(', ') || 'list'}, match ${h.match_score})`).join('; ');
        S.push({
          area: 'Sanctions', check: 'AML screening', source: 'Didit AML screening',
          finding: sanction.length ? `Possible match: ${names(sanction)}` : soft.length ? `Possible PEP or adverse-media match: ${names(soft)}` : `No sanctions, watchlist, PEP or adverse-media match for "${v.name}"${aml.hits?.length ? ` (${aml.hits.length} weak name match${aml.hits.length > 1 ? 'es' : ''} ruled out)` : ''}`,
          level: sanction.length ? 'red' : soft.length ? 'amber' : 'ok', rule: sanction.length ? 'R7' : soft.length ? 'A10' : undefined,
        });
        raw.aml = { status: aml.status, total_hits: aml.total_hits, hits: (aml.hits ?? []).map((h: any) => ({ caption: h.caption, match_score: h.match_score, review_status: h.review_status, datasets: h.datasets })) };
      }

      // 6. Reports: the Analyst labels each page that names the payee; code checks the quote and applies the rules
      const cands = sources.filter((s) => s.contact.length || s.name || s.acct).slice(0, 12);
      cands.forEach((s, k) => (s.i = k + 1));
      const needles = [v.instagram, v.domain, v.name.toLowerCase(), v.phone?.local, v.phone?.local.replace(/\s/g, '')].filter((n): n is string => !!n);
      const excerpt = (t: string) => {
        if (t.length <= 1800) return t;
        const lo = t.toLowerCase(), at = needles.map((n) => lo.indexOf(n)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
        return t.slice(Math.max(0, at - 600), at + 1200);
      };
      if (cands.length) {
        job.log('analyst', 'label', `${cands.length} pages that name ${v.name}: report, warning, praise, or unrelated?`);
        const who = [v.name, v.phone?.local, v.instagram && `@${v.instagram}`, v.domain, v.email].filter(Boolean).join(' · ');
        const lab = parseJson<{ labels: { i: number; stance: string; about: string; quote: string }[] }>(
          await llm(job, 'analyst', [
            { role: 'system', content: 'You label web pages found while checking a vendor before a payment. For each numbered source give "stance": "report" (someone says they, or someone they know, paid this vendor and lost money or never got the goods), "warning" (a person warns others about this specific vendor without describing their own loss), "positive" (a customer says they bought from this vendor and it went well), "question" (someone asks if the vendor is legit and no answer describes an outcome), or "other" (directories, generic scam advice, automated trust scores, or a different business with a similar name). "about": "this_vendor" only if the source is clearly about the vendor described, else "other" or "unclear". "quote": 8-30 words copied VERBATIM from the source that support the label (empty for "other"). Reply JSON only: {"labels":[{"i": number, "stance": string, "about": string, "quote": string}]}' },
            { role: 'user', content: `Vendor: ${who}\n\n${cands.map((s) => `[${s.i}] ${s.url}\n${excerpt(s.text)}`).join('\n\n---\n\n')}` },
          ], 'label pages that name the payee', { model: MODELS.fast, maxTokens: 1500, json: true, dry: () => fx.label(cands.map((s) => ({ i: s.i, text: s.text }))) }),
          { labels: [] },
        );
        for (const l of lab.labels ?? []) {
          const s = cands.find((c) => c.i === l.i);
          if (!s) continue;
          const verbatim = !!l.quote && flat(l.quote).length >= 12 && flat(s.text).includes(flat(l.quote));
          s.stance = l.about === 'this_vendor' && (verbatim || l.stance === 'other') ? l.stance : 'other';
          s.quote = verbatim ? l.quote.trim() : undefined;
        }
      }
      const q = (s: Source) => (s.quote && !flat(s.title).includes(flat(s.quote)) ? `: "${s.quote.length > 160 ? s.quote.slice(0, 157) + '…' : s.quote}"` : '');
      const against = cands.filter((s) => s.stance === 'report' || s.stance === 'warning');
      const tied = against.filter((s) => s.contact.length);
      const byName = against.filter((s) => !s.contact.length && s.name);
      const nameHosts = new Set(byName.map((s) => s.host));
      const distinctive = coreName.length >= 2 || (coreName[0]?.length ?? 0) >= 7;
      for (const s of tied.slice(0, 3)) S.push({ area: 'Reputation', check: `${s.stance === 'report' ? 'Victim report' : 'Warning'} naming the same ${s.contact.join(' and ')}`, finding: `${s.title.slice(0, 90)}${s.date ? ` (${s.date})` : ''}${q(s)}`, level: 'red', rule: 'R1', source: s.host, url: s.url });
      for (const s of byName.slice(0, 2)) S.push({ area: 'Reputation', check: `${s.stance === 'report' ? 'Victim report' : 'Warning'} naming the business`, finding: `${s.title.slice(0, 90)}${s.date ? ` (${s.date})` : ''}${q(s)}`, level: nameHosts.size >= 2 && distinctive ? 'red' : 'amber', rule: nameHosts.size >= 2 && distinctive ? 'R2' : 'A1', source: s.host, url: s.url });
      for (const s of against.filter((x) => !x.contact.length && !x.name && x.acct).slice(0, 1)) S.push({ area: 'Reputation', check: 'Report naming the account holder', finding: `${s.title.slice(0, 90)}${q(s)}`, level: 'amber', rule: 'A1', source: s.host, url: s.url });
      const praise = cands.filter((s) => s.stance === 'positive');
      if (praise.length) S.push({ area: 'Reputation', check: 'Independent customer mention', finding: `${praise.length} independent page${praise.length > 1 ? 's' : ''} describe${praise.length > 1 ? '' : 's'} buying from them${q(praise[0])}`, level: 'good', group: 'reputation', source: praise[0].host, url: praise[0].url });
      const asked = cands.filter((s) => s.stance === 'question');
      if (asked.length) S.push({ area: 'Reputation', check: 'People asking if it is legit', finding: `${asked[0].title.slice(0, 90)} (no answer describes buying from them)`, level: 'ok', source: asked[0].host, url: asked[0].url });
      if (!searchesOk) skip('Reputation', 'Scam and fraud reports', queries.length ? "the search provider didn't answer, so no reports were checked" : 'there was nothing to search for');
      else if (!against.length) S.push({ area: 'Reputation', check: 'Scam and fraud reports', finding: `None found in ${searchesOk} Google searches${v.country === 'NG' ? ' (incl. Nairaland and Reddit)' : ' (incl. Reddit)'}`, level: 'ok', source: 'Google via Serper' });
      if (errors.length) raw.errors = errors;
      raw.sources = cands.map(({ url, title, date, contact, name, stance, quote }) => ({ url, title, date, matches: [...contact, ...(name ? ['name'] : [])], stance: stance ?? 'unlabelled', quote }));
      raw.searches = queries;

      // 7. The verdict: rules in code
      const byRule = (a: Signal, b: Signal) => (a.rule ?? '').localeCompare(b.rule ?? '', 'en', { numeric: true });
      const reds = S.filter((s) => s.level === 'red').sort(byRule), ambers = S.filter((s) => s.level === 'amber').sort(byRule);
      const groups = [...new Set(S.filter((s) => s.level === 'good').map((s) => s.group!))];
      const ruleIds = (xs: Signal[]) => [...new Set(xs.map((s) => s.rule!))];
      const verdict = reds.length ? 'RED' : ambers.length || groups.length < 3 ? 'AMBER' : 'GREEN';
      const fired = verdict === 'RED' ? ruleIds(reds).map((r) => `${r} · ${RULES[r].text}`)
        : ambers.length ? [...ruleIds(ambers).map((r) => `${r} · ${RULES[r].text}`), ...(groups.length < 3 ? [`and G1 not met (${groups.length} of 3 independent positives)`] : [])]
        : verdict === 'AMBER' ? [`G1 not met · ${groups.length ? `only ${groups.length} independent positive signal${groups.length === 1 ? '' : 's'} (${groups.map((g) => GROUP[g]).join(', ')})` : 'no independent positive signals'}; GREEN needs 3 and no flags`]
        : [`G1 · ${groups.length} independent positive signals agree (${groups.map((g) => GROUP[g]).join(', ')}) and nothing was flagged`];
      job.log('investigator', 'verdict', `${verdict}: ${fired.join('; ')}`);
      if (!S.some((s) => s.level !== 'skip')) throw new Error('none of the checks came back, so there is nothing to base a verdict on');

      // 8. Writer explains the verdict and drafts what to ask; Auditor checks the wording
      const facts = {
        payee: v.name, paying: v.amount ? `${money(v.amount, v.currency)}${v.amountUsd && v.currency !== 'USD' ? ` (about $${v.amountUsd})` : ''}` : 'amount not given', for: v.purpose, country: v.country,
        verdict: `${verdict} (${VERDICT[verdict]})`, rulesFired: fired,
        flags: [...reds, ...ambers].map((s) => ({ rule: s.rule, check: `${s.area}: ${s.check}`, finding: s.finding, source: s.source })),
        positives: S.filter((s) => s.level === 'good').map((s) => `${s.area}: ${s.check}: ${s.finding}`),
        notChecked: gaps,
      };
      type Words = { summary: string; questions: string[]; payTips: string[] };
      const writerSys = `You write the plain-English part of a pre-payment vendor check for a small-business owner. The verdict was decided by fixed rules; explain it, never change or soften it. Use only the facts given. Never say or imply that the vendor is a scammer, fraudster, criminal, thief or fake: describe the signals and the risk ("these signals are common in fake-shop fraud", "high risk"). No invented numbers, dates or sources. Short sentences, friendly and direct. ${v.country === 'NG' ? 'For a Nigerian business, a CAC registration (RC or BN) number can be checked free at search.cac.gov.ng.' : ''} Reply JSON only: {"summary": "2-4 sentences: what the verdict means for this payment and the one or two signals that matter most", "questions": [5-7 specific questions to ask the vendor before paying, each tied to a flag or a gap in the facts], "payTips": [2-4 safe-payment steps specific to this purchase, its amount and location]}`;
      const draft = parseJson<Words>(
        await llm(job, 'writer', [{ role: 'system', content: writerSys }, { role: 'user', content: JSON.stringify(facts, null, 1) }], 'explain the verdict and draft what to ask', { maxTokens: 1500, json: true, dry: () => JSON.stringify(fallbackWords(verdict, facts.flags, v.name)) }),
        { summary: '', questions: [], payTips: [] },
      );
      job.log('auditor', 'audit', `checking the wording against the signals with ${MODELS.auditor}`);
      const audit = parseJson<{ verdict: 'pass' | 'revise'; issues: string[] }>(
        await llm(job, 'auditor', [
          { role: 'system', content: 'You are an independent compliance reviewer of a pre-payment vendor check. Compare the draft with the facts. Flag: (1) any sentence that states or implies the vendor IS a scammer, fraudster, criminal, thief or fake (describing signals and risk is fine); (2) any fact, number, date or source that is not in the facts; (3) anything that contradicts or softens the verdict (e.g. suggesting paying upfront is fine when the verdict is RED); (4) any question or tip that would put the customer at risk (sharing OTPs or ID, paying a "verification" or "clearing" fee). Reply JSON only: {"verdict": "pass" | "revise", "issues": [short strings]}.' },
          { role: 'user', content: `Facts:\n${JSON.stringify(facts)}\n\nDraft:\n${JSON.stringify(draft)}` },
        ], 'independent check of the wording', { model: MODELS.auditor, maxTokens: 600, json: true, dry: () => JSON.stringify({ verdict: 'pass', issues: [] }) }),
        { verdict: 'pass', issues: [] },
      );
      let words = draft;
      if (audit.verdict === 'revise' && audit.issues?.length) {
        job.log('writer', 'revise', `${audit.issues.length} issue${audit.issues.length > 1 ? 's' : ''} from the Auditor`);
        words = parseJson<Words>(
          await llm(job, 'writer', [
            { role: 'system', content: writerSys },
            { role: 'user', content: `Facts:\n${JSON.stringify(facts, null, 1)}\n\nYour draft:\n${JSON.stringify(draft)}\n\nFix every one of these auditor issues and reply with the full corrected JSON:\n- ${audit.issues.join('\n- ')}` },
          ], "fix the auditor's issues", { maxTokens: 1500, json: true, dry: () => JSON.stringify(draft) }),
          draft,
        );
      }
      // Belt and braces: whatever the models did, no sentence that calls the payee a fraud reaches the customer.
      const sentences = (t: string) => t.split(/(?<=[.!?])\s+/);
      const scrubbed = sentences(String(words.summary ?? '')).filter((x) => !ACCUSE.test(x)).join(' ').trim();
      const safeQs = (words.questions ?? []).filter((x) => typeof x === 'string' && !ACCUSE.test(x)).slice(0, 7);
      const safeTips = (words.payTips ?? []).filter((x) => typeof x === 'string' && !ACCUSE.test(x)).slice(0, 4);
      const fb = fallbackWords(verdict, facts.flags, v.name);
      const summary = scrubbed.length >= 40 ? scrubbed : fb.summary;
      const questions = safeQs.length >= 3 ? safeQs : fb.questions;
      const tips = safeTips.length ? safeTips : fb.payTips;
      const scrubNotes = [scrubbed.length < 40 && 'summary replaced by the rule-based text', safeQs.length < 3 && 'questions replaced by the rule-based list'].filter(Boolean) as string[];

      // 9. Deterministic QA
      const noSource = S.filter((s) => s.level !== 'skip' && (!s.source || s.source === '—')).length;
      const noRule = S.filter((s) => (s.level === 'red' || s.level === 'amber') && !s.rule).length;
      const issues = [...(audit.verdict === 'revise' ? (audit.issues ?? []).map((i) => `auditor: ${i}`) : []), ...scrubNotes, noSource ? `${noSource} signals without a source` : '', noRule ? `${noRule} flags without a rule` : ''].filter(Boolean);
      job.qa = { verdict: noSource || noRule ? 'revise' : audit.verdict === 'revise' && audit.issues?.length ? 'revise' : 'pass', notes: issues.join(' | ') || `${S.length} signals, every one sourced; verdict from rules`, model: `rules + ${MODELS.auditor}` };

      // 10. The report and the raw signals
      const lvl: Record<Level, string> = { red: '**RED flag**', amber: '**Amber flag**', good: 'Positive', ok: 'Neutral', skip: 'Not checked' };
      const order: Level[] = ['red', 'amber', 'good', 'ok', 'skip'];
      const rows = [...S].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || byRule(a, b));
      const flagged = [...reds, ...ambers];
      const notGiven = [!v.phone && !v.phoneRaw && 'phone number', !v.host && 'website', !v.instagram && 'Instagram handle', !v.email && 'email', !v.acct && 'bank account name', !v.wallet && 'wallet address', !v.address && 'physical address'].filter(Boolean);
      const paying = v.amount ? `**${facts.paying}**` : 'an amount you didn\'t state';
      const counts = `${reds.length} red, ${ambers.length} amber, ${groups.length} independent positive${groups.length === 1 ? '' : 's'}`;
      const advice = [
        verdict === 'RED' ? '**Our advice: don\'t pay upfront.** If you still want to deal with them, pay only in person, at a place you have confirmed, after you have the goods in your hands.' : '',
        'Pay in stages: a small deposit, the rest on delivery or after you inspect the goods.',
        'Use escrow or pay-on-delivery where you can, or pay at the shop after seeing the goods.',
        'Confirm by calling a number you found yourself (their Google Maps listing, their official site, an old invoice), not the one in the chat or on the invoice.',
        'Never pay a changed bank account or wallet without a call to a number you already had.',
        v.entity === 'company' ? 'Pay into an account in the business\'s registered name, not a personal account.' : '',
        'Keep the chat, the invoice and the account details. If something goes wrong, report to your bank at once: fast reports make recalls more likely.',
      ].filter(Boolean);
      job.deliverable = [
        `# Check Before You Pay: ${v.name}`,
        '',
        `> **${verdict} · ${VERDICT[verdict]}**`,
        '>',
        `> Paying ${paying} to **${v.name}**${v.purpose ? ` for ${v.purpose}` : ''}.`,
        `> **Rule${fired.length > 1 ? 's' : ''} that fired:** ${fired.join(' · ')}`,
        `> Checked ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${S.filter((s) => s.level !== 'skip').length} signals · ${counts}`,
        '',
        '## What this means',
        '',
        summary,
        '',
        '## Signals we checked',
        '',
        '| Area | Check | What we found | Signal | Source |',
        '|---|---|---|---|---|',
        ...rows.map((s) => `| ${s.area} | ${cell(s.check)} | ${cell(s.finding)} | ${lvl[s.level]}${s.rule ? ` (${s.rule})` : ''} | ${s.url ? `[${cell(s.source)}](${s.url})` : cell(s.source)} |`),
        '',
        ...(flagged.length ? ['## Red and amber flags explained', '', ...ruleIds(flagged).map((r) => {
          const what = flagged.filter((s) => s.rule === r).map((s) => (s.area === 'Reputation' ? `${s.check} on ${s.source}` : s.finding).replace(/\.$/, '')).join('. ');
          return `- **${r} · ${RULES[r].text}.** ${what}. ${RULES[r].why}`;
        }), ''] : []),
        '## What to ask them before paying',
        '',
        ...questions.map((x, i) => `${i + 1}. ${x}`),
        '',
        '## How to pay safely',
        '',
        ...[...advice, ...tips].map((x) => `- ${x}`),
        '',
        '## What we couldn\'t check',
        '',
        ...gaps.map((g) => `- ${g}`),
        ...(notGiven.length ? [`- Not given, so not checked: ${notGiven.join(', ')}.`] : []),
        '- Who owns the bank account: no public source confirms it. Before you confirm a transfer, check that the account name your bank shows matches the business.',
        '',
        '## How the verdict is decided',
        '',
        '- **RED** if any hard flag fires: R1 a scam report names the same contact details · R2 reports on 2+ sites name the business · R3 call forwarding on · R4 SIM swapped in the last 14 days · R5 website or Instagram under 60 days old while claiming years in business · R6 wallet on Circle\'s USDC blacklist · R7 sanctions or watchlist match · R8 payment details changed by message.',
        '- **AMBER** if any soft flag fires (A1–A10 above), or if fewer than 3 independent positive signals were found.',
        '- **GREEN** only when 3 or more independent positive signals agree (e.g. an old domain, a matching Maps listing, a business confirmed open, a site showing the same phone, a customer vouching) and nothing is flagged.',
        '',
        `_These are signals, not proof. RED means high risk, not that anyone has committed fraud; GREEN can't rule fraud out. The verdict comes from the rules above, not from an AI's opinion. Raw data: \`vendor-check-signals.json\`._`,
      ].join('\n');
      job.files.push({ name: 'vendor-check-signals.json', content: JSON.stringify({ service: 'vendor-check', checkedAt: new Date().toISOString(), verdict, rulesFired: fired, positiveGroups: groups, signals: S, notChecked: gaps, raw }, null, 2) + '\n' });
      job.status = 'delivered';
    } catch (e: any) {
      job.status = 'failed';
      job.error = String(e?.message ?? e);
      console.error('  ✗', job.error);
    }
    job.save();
    return job;
  },
};

/** Rule-based words: the Writer's dry fixture, and the fallback if its text fails the checks. */
function fallbackWords(verdict: 'RED' | 'AMBER' | 'GREEN', flags: { rule?: string; finding: string }[], name: string) {
  const top = [...new Set(flags.map((f) => f.rule ?? ''))].filter((r) => RULES[r]).slice(0, 2).map((r) => RULES[r].text.replace(/^[A-Z](?=[a-z\s])/, (c) => c.toLowerCase())).join('; and ');
  const summary = verdict === 'RED'
    ? `Our checks on ${name} turned up hard warning signs: ${top}. Signals like these are common in advance-payment fraud, so treat this as high risk and don't send money upfront.`
    : verdict === 'AMBER'
      ? `${flags.length ? `Some signals about ${name} need explaining: ${top}.` : `We found too little independent evidence about ${name} to call this low risk.`} Get clear answers to the questions below before you pay, and pay in stages.`
      : `Several independent sources agree that ${name} is an established, reachable business, and nothing we checked raised a flag. Still pay safely: confirm the account by phone and keep your records.`;
  const byRule: Record<string, string> = {
    R1: 'Other buyers have posted reports naming this number or page. Can you explain what happened with those orders?',
    R3: 'Can we do a video call right now from your shop, on the number you gave me?',
    R5: 'Your site is only weeks old. Can you show receipts or invoices from earlier years of trading?',
    R8: 'Why did your payment details change? I will confirm on the number I already have before paying.',
    A4: 'Which number is yours? Google shows a different one for your business.',
    A6: 'Can I come to your shop and pay after I see the goods?',
    A8: 'Why is the account in a personal name and not the business name?',
    A9: 'Why has your Instagram name changed, and can you show older posts or customer reviews?',
  };
  const questions = [...new Set([
    ...flags.map((f) => byRule[f.rule ?? '']).filter(Boolean),
    'What is your CAC registration (RC or BN) number, so I can look it up?',
    'Can I pay part now and the rest on delivery, or through escrow?',
    'What is your physical address, and can I inspect the goods there before paying in full?',
    'Can you send a recent photo or video of the exact items with today\'s date written beside them?',
    'Can you share two past customers I can call?',
  ])].slice(0, 7);
  return { summary, questions, payTips: [] as string[] };
}
