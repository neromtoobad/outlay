// The public books, computed from orders + job receipts (+ the vault on-chain once deployed).
// Counting rules (printed on /books):
//   • revenue = accepted, paid orders only; free (promo) jobs never count as revenue
//   • demo-mode (simulated) data is never mixed with real data
//   • refunds and bonds are costs the day they are paid
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, http, type Address } from 'viem';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import { DRY, ARC } from './config.ts';
import { listOrders, readJob, type Order } from './orders.ts';
import { toolPurchase, jobFunded, jobAccepted, jobRejected, pnl, toBeancount, type Entry } from './ledger.ts';
import { CATALOG } from './services/index.ts';

const dayOf = (iso: string) => iso.slice(0, 10);

export function entriesFor(orders: Order[]): Entry[] {
  const out: Entry[] = [];
  for (const o of orders) {
    for (const r of o.runs) {
      const j = readJob(r);
      for (const line of j?.receipt ?? []) out.push(toolPurchase(line, o.id));
    }
    if (o.payment && o.payment.mode !== 'promo') {
      out.push(jobFunded(o.payment.at, o.id, o.quote.priceUsd, o.payment.tx ?? o.payment.mode));
      if (o.decision?.kind === 'accepted') out.push(jobAccepted(o.decision.at, o.id, o.service, o.quote.priceUsd, o.payment.tx ?? o.payment.mode, o.decision.by === 'auto'));
      if (o.refund) out.push(jobRejected(o.refund.at, o.id, o.refund.priceUsd, o.refund.bondUsd, o.payment.tx ?? o.payment.mode));
    }
  }
  return out;
}

async function vaultState() {
  const f = new URL('../../deployments/arc.json', import.meta.url).pathname;
  if (!existsSync(f)) return null;
  try {
    const dep = JSON.parse(readFileSync(f, 'utf8'));
    const client = createPublicClient({ chain: CHAIN_CONFIGS.arc.chain, transport: http(ARC.rpc) });
    const abi = [
      { name: 'balances', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256[5]' }] },
      { name: 'bondsOutstanding', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
      { name: 'reserveFloor', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    ] as const;
    const [b, bonds, floor] = await Promise.all([
      client.readContract({ address: dep.vault as Address, abi, functionName: 'balances' }),
      client.readContract({ address: dep.vault as Address, abi, functionName: 'bondsOutstanding' }),
      client.readContract({ address: dep.vault as Address, abi, functionName: 'reserveFloor' }),
    ]);
    const n = (x: bigint) => Number(x) / 1e6;
    return { vault: dep.vault, escrow: dep.escrow, buckets: { operating: n(b[0]), tools: n(b[1]), bond: n(b[2]), reserve: n(b[3]), promo: n(b[4]) }, bondsOutstanding: n(bonds), reserveFloor: n(floor) };
  } catch {
    return null;
  }
}

export async function books() {
  const orders = listOrders().filter((o) => o.demo === DRY);
  const entries = entriesFor(orders);
  const p = pnl(entries);
  const decided = orders.filter((o) => o.decision);
  const accepted = orders.filter((o) => o.decision?.kind === 'accepted');
  const delivered = orders.filter((o) => o.runs.length && ['delivered', 'accepted', 'rejected', 'revision'].includes(o.status));
  const toolCalls = entries.filter((e) => e.meta.kind === 'tool').length;
  const bondsPaid = orders.reduce((s, o) => s + (o.refund?.bondUsd ?? 0), 0);

  // Unit economics per service (delivered runs)
  const perService: Record<string, { jobs: number; avgCost: number; price: number; accepted: number; decided: number; free: number }> = {};
  for (const o of orders) {
    const s = (perService[o.service] ??= { jobs: 0, avgCost: 0, price: CATALOG.find((c) => c.id === o.service)?.priceUsd ?? 0, accepted: 0, decided: 0, free: 0 });
    const cost = o.runs.reduce((t, r) => t + (readJob(r)?.spentUsd ?? 0), 0);
    if (o.runs.length) { s.avgCost = (s.avgCost * s.jobs + cost) / (s.jobs + 1); s.jobs++; }
    if (o.payment?.mode === 'promo') s.free++;
    if (o.decision) { s.decided++; if (o.decision.kind === 'accepted') s.accepted++; }
  }

  // Daily revenue vs costs
  const days: Record<string, { revenue: number; costs: number }> = {};
  for (const e of entries) for (const post of e.postings) {
    const d = (days[e.date] ??= { revenue: 0, costs: 0 });
    if (post.account.startsWith('Income:')) d.revenue += -post.amount;
    if (post.account.startsWith('Expenses:')) d.costs += post.amount;
  }

  return {
    mode: DRY ? 'demo' : 'live',
    asOf: new Date().toISOString(),
    counters: {
      orders: orders.length,
      customers: new Set(orders.map((o) => o.email)).size,
      delivered: delivered.length,
      accepted: accepted.length,
      rejected: orders.filter((o) => o.decision?.kind === 'rejected').length,
      acceptanceRate: decided.length ? accepted.length / decided.length : null,
      freeJobs: orders.filter((o) => o.payment?.mode === 'promo').length,
      toolCalls,
    },
    pnl: { ...p, bondsPaid, refunds: orders.reduce((s, o) => s + (o.refund?.priceUsd ?? 0), 0) },
    perService,
    daily: Object.entries(days).sort().map(([date, v]) => ({ date, ...v })),
    vault: await vaultState(),
    ledger: entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200),
    recentOrders: orders.slice(0, 20).map((o) => ({ id: o.id, service: o.service, status: o.status, price: o.quote.priceUsd, promo: o.quote.promo, createdAt: o.createdAt, cost: o.runs.reduce((t, r) => t + (readJob(r)?.spentUsd ?? 0), 0) })),
  };
}

export function beancount(): string {
  return toBeancount(entriesFor(listOrders().filter((o) => o.demo === DRY)));
}

export { dayOf };
