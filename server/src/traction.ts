// The traction report, built from the live books (never demo data): orders, every tool payment with
// its Arc settlement, the escrow jobs, the CFO's decisions, and the contracts. Served at
// /api/traction.md; scripts/traction.ts writes it to TRACTION.md.
import { listOrders, readJob } from './orders.ts';
import { DEP } from './escrow.ts';
import { decisions } from './cfo/log.ts';

const NAME: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };
const tx = (h?: string) => (h ? `[${h.slice(0, 10)}…](https://arcscan.app/tx/${h})` : '');
const addr = (a: string) => `[\`${a}\`](https://arcscan.app/address/${a})`;
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');

export function tractionReport() {
  const quotes = listOrders().filter((o) => !o.demo);
  // an order counts once work was started (free or paid); quotes nobody took up are counted separately
  const orders = quotes.filter((o) => o.payment).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows: string[] = [];
  let payments = 0, spent = 0, settled = 0;
  const vendors = new Map<string, number>();
  for (const o of orders) for (const r of o.runs) for (const p of readJob(r)?.receipt ?? []) {
    if (p.dry) continue;
    payments++; spent += p.usd; if (p.settledTx) settled++;
    const v = p.vendor.split(' ')[0];
    vendors.set(v, (vendors.get(v) ?? 0) + p.usd);
    rows.push(`| ${p.at.slice(0, 16).replace('T', ' ')} | ${o.id} | ${p.agent} | ${p.vendor} | ${p.usd.toFixed(4)} | ${cell(p.reason)} | ${p.settledTx ? tx(p.settledTx) : `settling (${p.transaction.slice(0, 8)})`} |`);
  }
  const escrowJobs = orders.filter((o) => o.escrow);
  const escrowIn = escrowJobs.filter((o) => o.escrow!.fundTx).reduce((s, o) => s + o.quote.priceUsd, 0);
  const delivered = orders.filter((o) => ['delivered', 'accepted', 'rejected'].includes(o.status));
  const accepted = orders.filter((o) => o.decision?.kind === 'accepted');
  const paidAccepted = accepted.filter((o) => o.payment?.mode !== 'promo');
  const revenue = paidAccepted.reduce((s, o) => s + o.quote.priceUsd, 0);
  const refunded = orders.filter((o) => o.refund && o.payment?.mode !== 'promo').reduce((s, o) => s + o.refund!.priceUsd + o.refund!.bondUsd, 0);
  const log = decisions(1000);
  const cfoDone = log.filter((d) => d.status === 'done');
  const customers = new Set(orders.map((o) => o.email)).size;

  const summary = { orders: orders.length, quotes: quotes.length, customers, delivered: delivered.length, accepted: accepted.length, paidJobs: escrowJobs.length, escrowIn, revenue, refunded, toolPayments: payments, toolSpend: spent, settled, cfoDecisions: cfoDone.length, cfoEscalated: log.filter((d) => d.status === 'escalated').length };
  const md = `# Traction

Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from Syncly's live books on Arc mainnet (chain 5042). Demo data is never included. Live copy: https://synclyhq.up.railway.app/api/traction.md

| | |
|---|---|
| Jobs started | ${orders.length} (${customers} customer${customers === 1 ? '' : 's'}; ${quotes.length} quotes given) |
| Delivered · accepted by the customer | ${delivered.length} · ${accepted.length} |
| Paid jobs through JobEscrow | ${escrowJobs.length} · ${escrowIn.toFixed(2)} USDC paid in by customers |
| Revenue (accepted, paid jobs) | ${revenue.toFixed(2)} USDC |
| Refunds + bonds paid to customers | ${refunded.toFixed(2)} USDC |
| Tool payments by agents (x402 via Circle Gateway) | ${payments} · ${spent.toFixed(4)} USDC · ${settled} settled on Arc so far |
| Vendors paid | ${[...vendors.entries()].map(([v, u]) => `${v} ${u.toFixed(4)}`).join(', ') || '—'} |
| CFO decisions carried out on-chain | ${cfoDone.length} (${summary.cfoEscalated} escalated to the Boss) |

## Contracts and wallets (Arc mainnet)

| | |
|---|---|
| SynclyVault (the treasury's five buckets) | ${DEP ? addr(DEP.vault) : '—'} |
| JobEscrow (paid jobs) | ${DEP ? addr(DEP.escrow) : '—'} |
| Boss (vault owner, a human's wallet) | ${DEP ? addr(DEP.boss) : '—'} |
| CFO (escrow operator, vault CFO key) | ${addr('0xB95dd6425d19BF09d206dc780a758e1C2EF4f1a9')} |
| Treasury (deployer, funds agents' Gateway balances) | ${addr('0x102AdC546dAE682B7cDD9aB6d624822fdD3DC209')} |

## Jobs

| Created | Order | Service | Status | Paid | Brief |
|---|---|---|---|---|---|
${orders.map((o) => `| ${o.createdAt.slice(0, 16).replace('T', ' ')} | [${o.id}](https://synclyhq.up.railway.app/job/${o.id}) | ${NAME[o.service] ?? o.service} | ${o.status} | ${o.payment?.mode === 'promo' ? 'free first job' : o.escrow ? `${o.quote.priceUsd} USDC escrow ${tx(o.escrow.fundTx)}` : o.payment?.mode ?? ''} | ${cell(o.brief.slice(0, 70))} |`).join('\n')}

## The CFO's decisions

${cfoDone.length ? `| When (UTC) | Decision | Transaction |\n|---|---|---|\n${cfoDone.slice(0, 50).map((d) => `| ${d.at.slice(0, 16).replace('T', ' ')} | ${cell(d.summary)} | ${tx(d.tx)} |`).join('\n')}` : 'None yet.'}

Every decision, with what the CFO saw and the rule it applied, is in the signed log at https://synclyhq.up.railway.app/api/cfo

## Every tool payment

Each line is an x402 payment an agent made from its own Circle Gateway balance on Arc. Circle batches them, so the settlement transaction appears a few minutes after the call.

| When (UTC) | Order | Agent | Vendor | USDC | Why | Settled on Arc |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
  return { md, summary };
}
