// node scripts/preflight.ts
// Read-only check before the first real job: call each paid tool WITHOUT paying, and confirm it
// answers 402 with a Circle Gateway (batched) payment option on Arc mainnet, at the price we expect.
// Nothing is signed and no money moves.
import { HOSTS } from '../src/tools.ts';
import { MODELS } from '../src/config.ts';

type Probe = { name: string; url: string; method: 'GET' | 'POST'; body?: unknown; expectUsd: number };
const PROBES: Probe[] = [
  { name: 'BlockRun LLM (fast)', url: `https://${HOSTS.blockrun}/api/v1/chat/completions`, method: 'POST', body: { model: MODELS.fast, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 }, expectUsd: 0.01 },
  { name: 'Serper Maps', url: `https://${HOSTS.orthogonal}/serper/maps`, method: 'POST', body: { q: 'cafe Lekki Lagos', page: 1 }, expectUsd: 0.006 },
  { name: 'Serper search', url: `https://${HOSTS.orthogonal}/serper/search`, method: 'POST', body: { q: 'bakery Lagos', num: 10 }, expectUsd: 0.002 },
  { name: 'Exa search', url: `https://${HOSTS.exa}/search`, method: 'POST', body: { query: 'Lagos bakeries', numResults: 2, type: 'auto' }, expectUsd: 0.007 },
  { name: 'Exa contents', url: `https://${HOSTS.exa}/contents`, method: 'POST', body: { urls: ['https://example.com'], text: { maxCharacters: 500 } }, expectUsd: 0.001 },
  { name: 'APEX web-read', url: `https://${HOSTS.apex}/api/x402/web-read?urls=${encodeURIComponent('https://example.com')}`, method: 'GET', expectUsd: 0.003 },
  { name: 'APEX email-verify', url: `https://${HOSTS.apex}/api/x402/email-verify-bulk?emails=${encodeURIComponent('hello@example.com')}`, method: 'GET', expectUsd: 0.009 },
  { name: 'Tomba domain-search', url: `https://${HOSTS.orthogonal}/tomba/v1/domain-search?domain=example.com`, method: 'GET', expectUsd: 0.01 },
];

const decode = (h: string | null) => { if (!h) return null; try { return JSON.parse(Buffer.from(h, 'base64').toString('utf8')); } catch { return null; } };

let ok = 0;
for (const p of PROBES) {
  try {
    const r = await fetch(p.url, { method: p.method, headers: p.body ? { 'content-type': 'application/json' } : {}, body: p.body ? JSON.stringify(p.body) : undefined });
    const fromHeader = decode(r.headers.get('payment-required') ?? r.headers.get('x-payment-required'));
    const fromBody = r.status === 402 ? await r.json().catch(() => null) : null;
    const req = fromHeader ?? fromBody;
    const accepts: any[] = req?.accepts ?? [];
    const arc = accepts.filter((a) => String(a.network).includes('5042') || String(a.network).toLowerCase().includes('arc'));
    const batched = arc.find((a) => /gateway|batch/i.test(JSON.stringify(a.extra ?? {})) || /batch/i.test(String(a.scheme)));
    const pick = batched ?? arc[0];
    const usd = pick ? Number(pick.amount ?? pick.maxAmountRequired) / 1e6 : NaN;
    const good = r.status === 402 && !!batched;
    if (good) ok++;
    console.log(`${good ? '✓' : '✗'} ${p.name.padEnd(20)} ${r.status}  arc options ${arc.length}  batched ${batched ? 'yes' : 'NO'}  price ${Number.isFinite(usd) ? usd.toFixed(4) : '?'} USDC (expected ~${p.expectUsd})${pick ? `  payTo ${String(pick.payTo).slice(0, 10)}…` : ''}`);
    if (!good && accepts.length) console.log(`    networks offered: ${accepts.map((a) => `${a.scheme}@${a.network}`).join(', ')}`);
  } catch (e: any) {
    console.log(`✗ ${p.name.padEnd(20)} request failed: ${e?.message ?? e}`);
  }
}
console.log(`\n${ok}/${PROBES.length} tools ready for Gateway payments on Arc (no money moved)`);
