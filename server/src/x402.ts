// buy(): the only way an Syncly agent spends money. It pays an x402 endpoint from the agent's
// Circle Gateway balance on Arc, enforces a per-call price cap and a host allowlist BEFORE
// signing, and appends a receipt line to the job. No receipt, no spend.
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { ARC, DRY } from './config.ts';
import { privateKey, type Role } from './wallets.ts';
import type { Job } from './job.ts';
import { checkPayee } from './payees.ts';

export type ReceiptLine = {
  at: string;
  agent: Role;
  vendor: string;
  url: string;
  amount: string; // USDC atomic units (6 decimals), as a string
  usd: number;
  transaction: string; // Gateway settlement reference from pay()
  reason: string;
  status: number;
  dry: boolean;
  settledTx?: string; // the Arc transaction that settled this payment (filled in by settle.ts)
  settledAt?: string;
};

export class SpendRefused extends Error {}

// When a retry is safe. Before a payment is signed (the free first request that returns the 402), any
// network hiccup can be retried: nothing was paid. After signing, only a seller that says it did not
// take the payment ("verification temporarily unavailable") is retried; checked on mainnet that such a
// payment never settles. A timeout or dropped connection after signing is ambiguous: the seller may
// already have taken it. Retrying then is how an agent pays twice, so we stop and say so instead.
const TRANSIENT = /temporarily unavailable|please retry|try again|timed? ?out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|socket hang up|\b(429|502|503|504)\b|rate limit/i;
const SELLER_DECLINED = /verification temporarily unavailable|please retry/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One client per agent, with ONE price-cap hook that reads the cap for the call in flight.
// Calls for the same agent are serialized so the cap always belongs to the right call.
type Slot = { client: GatewayClient; capAtomic: bigint; refused?: string; signed: boolean; call?: { url: string; agent: string; vendor: string }; tail: Promise<unknown> };
const slots = new Map<Role, Slot>();

function slot(role: Role): Slot {
  let s = slots.get(role);
  if (s) return s;
  const client = new GatewayClient({ chain: 'arc', privateKey: privateKey(role), rpcUrl: ARC.rpc });
  const created: Slot = { client, capAtomic: 0n, signed: false, tail: Promise.resolve() };
  // Runs just before a payment is signed: price cap, then payee change control and screening.
  client.onBeforePaymentCreation(async (ctx: any) => {
    const amt = BigInt(ctx.selectedRequirements.amount);
    if (amt > created.capAtomic) {
      created.refused = `price ${Number(amt) / 1e6} USDC > cap ${Number(created.capAtomic) / 1e6}`;
      return { abort: true, reason: created.refused };
    }
    const call = created.call!;
    const refusal = await checkPayee(call.url, String(ctx.selectedRequirements.payTo), call);
    if (refusal) {
      created.refused = refusal;
      return { abort: true, reason: refusal };
    }
    created.signed = true;
  });
  slots.set(role, created);
  return created;
}

export function gateway(role: Role): GatewayClient {
  return slot(role).client;
}

export async function buy<T>(
  job: Job,
  opts: {
    agent: Role;
    vendor: string;
    url: string;
    method?: 'GET' | 'POST';
    body?: unknown;
    reason: string;
    maxUsd: number; // hard cap for this single call
    expectUsd: number; // listed price, used for budgeting and dry runs
    dryData: () => T;
  },
): Promise<T> {
  const host = new URL(opts.url).host;
  if (!job.policy.allowHosts.includes(host)) throw new SpendRefused(`${opts.agent}: ${host} is not on the allowlist for ${job.service}`);
  if (job.spentUsd() + opts.expectUsd > job.policy.budgetUsd) {
    throw new SpendRefused(`${opts.agent}: job budget ${job.policy.budgetUsd} USDC would be exceeded`);
  }

  if (DRY) {
    // test hook: OUTLAY_DRY_FAIL="Serper Maps" makes that vendor fail like a seller whose payment check is down
    if (process.env.OUTLAY_DRY_FAIL && opts.vendor.includes(process.env.OUTLAY_DRY_FAIL)) throw new Error('Payment failed: Payment verification temporarily unavailable, please retry');
    // Demo pacing so the live job page shows the team working (OUTLAY_DRY_DELAY ms per purchase).
    const delay = Number(process.env.OUTLAY_DRY_DELAY ?? 0);
    if (delay) await new Promise((r) => setTimeout(r, delay * (0.6 + Math.random() * 0.8)));
    const data = opts.dryData();
    job.addReceipt({
      at: new Date().toISOString(), agent: opts.agent, vendor: opts.vendor, url: opts.url,
      amount: String(Math.round(opts.expectUsd * 1e6)), usd: opts.expectUsd, transaction: 'dry-run',
      reason: opts.reason, status: 200, dry: true,
    });
    return data;
  }

  const s = slot(opts.agent);
  const run = async () => {
    s.capAtomic = BigInt(Math.round(opts.maxUsd * 1e6));
    s.refused = undefined;
    s.call = { url: opts.url, agent: opts.agent, vendor: opts.vendor };
    try {
      let res: Awaited<ReturnType<typeof s.client.pay<T>>> | undefined;
      for (let attempt = 1; ; attempt++) {
        s.signed = false;
        try { res = await s.client.pay<T>(opts.url, { method: opts.method ?? 'POST', body: opts.body }); break; }
        catch (e: any) {
          const msg = String(e?.message ?? e);
          if (s.signed && !SELLER_DECLINED.test(msg)) {
            throw new Error(`${opts.vendor}: the call failed after the payment was signed (${msg.slice(0, 80)}). Not retried, so it can't be paid twice.`);
          }
          if (s.refused || attempt >= 3 || !TRANSIENT.test(msg)) throw e;
          job.log(opts.agent, 'retry', `${opts.vendor}: ${msg.slice(0, 60)}; ${s.signed ? 'the seller did not take the payment' : 'nothing was paid yet'}, trying again`);
          await sleep(attempt * 2500);
        }
      }
      job.addReceipt({
        at: new Date().toISOString(), agent: opts.agent, vendor: opts.vendor, url: opts.url,
        amount: res.amount.toString(), usd: Number(res.amount) / 1e6, transaction: res.transaction,
        reason: opts.reason, status: res.status, dry: false,
      });
      return res.data;
    } catch (e) {
      if (s.refused) throw new SpendRefused(`${opts.agent} refused ${opts.vendor}: ${s.refused}`);
      throw e;
    }
  };
  const p = s.tail.then(run, run);
  s.tail = p.catch(() => undefined);
  return p;
}
