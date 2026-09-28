// buy(): the only way an Outlay agent spends money. It pays an x402 endpoint from the agent's
// Circle Gateway balance on Arc, enforces a per-call price cap and a host allowlist BEFORE
// signing, and appends a receipt line to the job. No receipt, no spend.
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { ARC, DRY } from './config.ts';
import { privateKey, type Role } from './wallets.ts';
import type { Job } from './job.ts';

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
};

export class SpendRefused extends Error {}

// One client per agent, with ONE price-cap hook that reads the cap for the call in flight.
// Calls for the same agent are serialized so the cap always belongs to the right call.
type Slot = { client: GatewayClient; capAtomic: bigint; refused?: string; tail: Promise<unknown> };
const slots = new Map<Role, Slot>();

function slot(role: Role): Slot {
  let s = slots.get(role);
  if (s) return s;
  const client = new GatewayClient({ chain: 'arc', privateKey: privateKey(role), rpcUrl: ARC.rpc });
  const created: Slot = { client, capAtomic: 0n, tail: Promise.resolve() };
  client.onBeforePaymentCreation(async (ctx: any) => {
    const amt = BigInt(ctx.selectedRequirements.amount);
    if (amt > created.capAtomic) {
      created.refused = `price ${Number(amt) / 1e6} USDC > cap ${Number(created.capAtomic) / 1e6}`;
      return { abort: true, reason: created.refused };
    }
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
    try {
      const res = await s.client.pay<T>(opts.url, { method: opts.method ?? 'POST', body: opts.body });
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
