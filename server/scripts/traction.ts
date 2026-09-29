// node scripts/traction.ts   → writes ../TRACTION.md from the live books (never demo data)
// Every tool payment is listed with the agent, the reason and its Arc settlement transaction.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listOrders, readJob } from '../src/orders.ts';
import { resolveSettlements } from '../src/settle.ts';

if (process.env.OUTLAY_DRY === '1') { console.error('TRACTION.md is built from live data only; unset OUTLAY_DRY'); process.exit(1); }
await resolveSettlements(200);

const quotes = listOrders().filter((o) => !o.demo);
// an order counts once work was started (free or paid); quotes nobody took up are counted separately
const orders = quotes.filter((o) => o.payment).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const NAME: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };
const rows: string[] = [];
let payments = 0, spent = 0, settled = 0;
const vendors = new Map<string, number>();
for (const o of orders) {
  for (const r of o.runs) {
    const j = readJob(r);
    for (const p of j?.receipt ?? []) {
      if (p.dry) continue;
      payments++; spent += p.usd; if (p.settledTx) settled++;
      vendors.set(p.vendor.split(' ')[0], (vendors.get(p.vendor.split(' ')[0]) ?? 0) + p.usd);
      rows.push(`| ${p.at.slice(0, 16).replace('T', ' ')} | ${o.id} | ${p.agent} | ${p.vendor} | ${p.usd.toFixed(4)} | ${p.reason.replace(/\|/g, '/')} | ${p.settledTx ? `[${p.settledTx.slice(0, 10)}…](https://arcscan.app/tx/${p.settledTx})` : `settling (${p.transaction.slice(0, 8)})`} |`);
    }
  }
}
const delivered = orders.filter((o) => ['delivered', 'accepted', 'rejected'].includes(o.status));
const accepted = orders.filter((o) => o.decision?.kind === 'accepted');
const paidAccepted = accepted.filter((o) => o.payment?.mode !== 'promo');
const revenue = paidAccepted.reduce((s, o) => s + o.quote.priceUsd, 0);

const md = `# Traction

Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from Syncly's live books (Arc mainnet). Demo data is never included.

| | |
|---|---|
| Orders | ${orders.length} (${((n) => `${n} customer${n === 1 ? '' : 's'}`)(new Set(orders.map((o) => o.email)).size)}; ${quotes.length} quotes given) |
| Delivered | ${delivered.length} |
| Accepted by the customer | ${accepted.length} |
| Paid jobs accepted (revenue) | ${paidAccepted.length} · ${revenue.toFixed(2)} USDC |
| Tool payments by agents (x402 via Circle Gateway) | ${payments} · ${spent.toFixed(4)} USDC · ${settled} settled on Arc so far |
| Vendors paid | ${[...vendors.entries()].map(([v, u]) => `${v} ${u.toFixed(4)}`).join(', ') || '—'} |

## Jobs

| Created | Order | Service | Status | Brief |
|---|---|---|---|---|
${orders.map((o) => `| ${o.createdAt.slice(0, 16).replace('T', ' ')} | ${o.id} | ${NAME[o.service] ?? o.service} | ${o.status}${o.payment?.mode === 'promo' ? ' (free first job)' : ''} | ${o.brief.slice(0, 80).replace(/\|/g, '/')} |`).join('\n')}

## Every tool payment

Each line is an x402 payment an agent made from its own Circle Gateway balance on Arc. Circle batches them, so the settlement transaction appears a few minutes after the call.

| When (UTC) | Order | Agent | Vendor | USDC | Why | Settled on Arc |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync(join(import.meta.dirname, '..', '..', 'TRACTION.md'), md);
console.log(`TRACTION.md: ${orders.length} orders, ${payments} payments (${settled} settled), ${spent.toFixed(4)} USDC spent, revenue ${revenue.toFixed(2)}`);
process.exit(0);
