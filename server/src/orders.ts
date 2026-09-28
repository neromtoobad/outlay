// Orders: a customer's request from quote to decision. One order can have several runs (a revision
// re-runs the service with the customer's note). Stored as data/orders/<id>.json.
//
//   quoted → (free | paid) → queued → running → delivered → accepted | revision → … | rejected
//                                            ↘ failed (refund + bond)
// Payment modes: 'promo' (first job free, no escrow), 'simulated' (demo mode only, clearly labelled),
// 'escrow' (JobEscrow on Arc, once deployed).
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DATA_DIR, DRY } from './config.ts';
import { publish } from './bus.ts';
import { quote, type Quote } from './cfo/quote.ts';
import { CATALOG, SERVICES } from './services/index.ts';

export type OrderStatus = 'quoted' | 'queued' | 'running' | 'delivered' | 'revision' | 'accepted' | 'rejected' | 'failed' | 'declined';
export type Order = {
  id: string;
  service: string;
  brief: string;
  email: string;
  createdAt: string;
  quote: Quote;
  status: OrderStatus;
  payment?: { mode: 'promo' | 'simulated' | 'escrow'; at: string; tx?: string };
  runs: string[];
  revisionNote?: string;
  deliveredAt?: string;
  decision?: { kind: 'accepted' | 'rejected'; at: string; by: 'customer' | 'auto'; note?: string };
  refund?: { priceUsd: number; bondUsd: number; at: string };
  demo: boolean;
};

const dir = () => join(DATA_DIR, 'orders');
const file = (id: string) => join(dir(), `${id}.json`);

export function saveOrder(o: Order) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(file(o.id), JSON.stringify(o, null, 2));
  publish({ type: 'order', orderId: o.id, data: { status: o.status, service: o.service } });
}
export function getOrder(id: string): Order | undefined {
  if (!/^ord_[a-z0-9_]+$/.test(id) || !existsSync(file(id))) return undefined;
  return JSON.parse(readFileSync(file(id), 'utf8'));
}
export function listOrders(): Order[] {
  if (!existsSync(dir())) return [];
  return readdirSync(dir()).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir(), f), 'utf8')) as Order)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function readJob(jobId: string): any | undefined {
  const f = join(DATA_DIR, 'jobs', jobId, 'job.json');
  if (!existsSync(f)) return undefined;
  const job = JSON.parse(readFileSync(f, 'utf8'));
  const d = join(DATA_DIR, 'jobs', jobId, 'deliverable.md');
  job.deliverable = existsSync(d) ? readFileSync(d, 'utf8') : '';
  return job;
}

// ---------------------------------------------------------------- history for the CFO

function historyFor(service: string) {
  const orders = listOrders().filter((o) => o.service === service && o.demo === DRY);
  const costs: number[] = [];
  for (const o of orders) for (const r of o.runs) { const j = readJob(r); if (j?.status === 'delivered') costs.push(j.spentUsd); }
  return {
    costs,
    accepted: orders.filter((o) => o.decision?.kind === 'accepted').length,
    rejected: orders.filter((o) => o.decision?.kind === 'rejected').length,
  };
}

/** Free BOND cover. Until the vault is deployed the policy number stands in (3 USDC). */
function bondPoolFree(): number {
  const open = listOrders().filter((o) => o.payment?.mode !== 'promo' && ['queued', 'running', 'delivered', 'revision'].includes(o.status));
  return Math.max(0, 3 - open.reduce((s, o) => s + o.quote.bondUsd, 0));
}
function promoLeft(): number {
  const used = listOrders().filter((o) => o.payment?.mode === 'promo').reduce((s, o) => s + o.quote.estCostUsd, 0);
  return Math.max(0, 2 - used);
}

export function createQuote(input: { service: string; brief: string; email: string }): Order {
  const item = CATALOG.find((c) => c.id === input.service);
  if (!item || !item.live) throw new Error('unknown or not-yet-live service');
  const email = input.email.trim().toLowerCase();
  const firstJob = !listOrders().some((o) => o.email === email && o.payment);
  const q = quote({
    service: item.id, priceUsd: item.priceUsd, listedCostUsd: item.listedCostUsd, history: historyFor(item.id),
    bondPoolFreeUsd: bondPoolFree(), firstJobForCustomer: firstJob, promoLeftUsd: promoLeft(), deliverHours: 1,
  });
  const o: Order = {
    id: `ord_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
    service: item.id, brief: input.brief.trim().slice(0, 2000), email, createdAt: new Date().toISOString(),
    quote: q, status: q.decision === 'decline' ? 'declined' : 'quoted', runs: [], demo: DRY,
  };
  saveOrder(o);
  return o;
}

// ---------------------------------------------------------------- lifecycle

export async function start(o: Order, mode: 'promo' | 'simulated' | 'escrow', tx?: string) {
  if (o.status !== 'quoted') throw new Error(`order is ${o.status}`);
  if (mode === 'promo' && !o.quote.promo) throw new Error('this quote is not free');
  if (mode === 'simulated' && !DRY) throw new Error('simulated payment only exists in demo mode');
  o.payment = { mode, at: new Date().toISOString(), tx };
  o.status = 'queued';
  saveOrder(o);
  void run(o);
}

async function run(o: Order) {
  const svc = SERVICES[o.service];
  o.status = 'running';
  saveOrder(o);
  const brief = o.revisionNote ? `${o.brief}\n\nRevision requested by the customer: ${o.revisionNote}` : o.brief;
  const job = await svc.run(brief, { orderId: o.id });
  const fresh = getOrder(o.id)!;
  fresh.runs.push(job.id);
  if (job.status === 'delivered') {
    fresh.status = 'delivered';
    fresh.deliveredAt = new Date().toISOString();
  } else {
    // We failed to deliver: the guarantee applies (refund + bond) for paid orders.
    fresh.status = 'failed';
    if (fresh.payment?.mode !== 'promo') fresh.refund = { priceUsd: fresh.quote.priceUsd, bondUsd: fresh.quote.bondUsd, at: new Date().toISOString() };
  }
  saveOrder(fresh);
}

export function decide(o: Order, kind: 'accept' | 'reject' | 'revise', note?: string, by: 'customer' | 'auto' = 'customer') {
  if (o.status !== 'delivered') throw new Error(`order is ${o.status}`);
  const at = new Date().toISOString();
  if (kind === 'accept') {
    o.status = 'accepted';
    o.decision = { kind: 'accepted', at, by };
  } else if (kind === 'reject') {
    o.status = 'rejected';
    o.decision = { kind: 'rejected', at, by, note };
    if (o.payment?.mode !== 'promo') o.refund = { priceUsd: o.quote.priceUsd, bondUsd: o.quote.bondUsd, at };
  } else {
    if (o.revisionNote !== undefined) throw new Error('one revision per order');
    o.revisionNote = (note ?? '').slice(0, 800) || 'Please improve it.';
    o.status = 'revision';
    saveOrder(o);
    o.status = 'queued';
    void run(o);
    return;
  }
  saveOrder(o);
}

/** Silence means yes: delivered orders auto-accept after 48h (the escrow does the same on-chain). */
export function autoAcceptDue(windowMs = 48 * 3600_000) {
  for (const o of listOrders()) if (o.status === 'delivered' && o.deliveredAt && Date.now() - Date.parse(o.deliveredAt) > windowMs) decide(o, 'accept', undefined, 'auto');
}
