// The public books, computed from orders + job receipts (+ the vault on-chain once deployed).
// Counting rules (printed on /books):
//   • revenue = accepted, paid orders only; free (promo) jobs never count as revenue
//   • demo-mode (simulated) data is never mixed with real data
//   • refunds and bonds are costs the day they are paid
import { DRY } from './config.ts';
import { readVault } from './escrow.ts';
import { listOrders, readJob, type Order } from './orders.ts';
import { toolPurchase, jobFunded, jobAccepted, jobRejected, pnl, toBeancount, type Entry } from './ledger.ts';
import { findService } from './services/index.ts';

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
      // the release or refund transaction when there is one (escrow), else the payment reference
      const closed = o.escrow?.closeTx ?? o.refund?.tx ?? o.payment.tx ?? o.payment.mode;
      if (o.decision?.kind === 'accepted') out.push(jobAccepted(o.decision.at, o.id, o.service, o.quote.priceUsd, closed, o.decision.by === 'auto'));
      if (o.refund) out.push(jobRejected(o.refund.at, o.id, o.refund.priceUsd, o.refund.bondUsd, closed));
    }
  }
  return out;
}

async function vaultState() {
  try {
    return await readVault();
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
    const s = (perService[o.service] ??= { jobs: 0, avgCost: 0, price: findService(o.service)?.priceUsd ?? 0, accepted: 0, decided: 0, free: 0 });
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
      // an order counts once work was started (free or paid); quotes nobody took up don't
      orders: orders.filter((o) => o.payment).length,
      customers: new Set(orders.filter((o) => o.payment).map((o) => o.email)).size,
      quotes: orders.length,
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

/** Per-agent activity for the team page: what each character actually did, from the same records as the books. */
export function team() {
  const orders = listOrders().filter((o) => o.demo === DRY);
  const out: Record<string, { jobs: number; steps: number; calls: number; usd: number; vendors: string[]; last?: { at: string; step: string; orderId: string } }> = {};
  const get = (a: string) => (out[a] ??= { jobs: 0, steps: 0, calls: 0, usd: 0, vendors: [] });
  for (const o of orders) {
    const seen = new Set<string>();
    for (const r of o.runs) {
      const j = readJob(r);
      for (const s of j?.steps ?? []) {
        const a = get(s.agent);
        a.steps++;
        if (!seen.has(s.agent)) { seen.add(s.agent); a.jobs++; }
        if (!a.last || s.at > a.last.at) a.last = { at: s.at, step: s.note ? `${s.step} · ${s.note}` : s.step, orderId: o.id };
      }
      for (const p of j?.receipt ?? []) {
        const a = get(p.agent);
        a.calls++; a.usd += p.usd;
        if (!a.vendors.includes(p.vendor)) a.vendors.push(p.vendor);
      }
    }
  }
  return { mode: DRY ? 'demo' : 'live', agents: out };
}
