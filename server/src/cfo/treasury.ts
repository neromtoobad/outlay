// The CFO's money loop. Each tick it reads the vault's five buckets, every agent's Gateway balance
// and the work of the past week; decides by fixed rules what the company's money should do; does it
// within the vault's on-chain limits; and writes each decision, with what it saw, to the signed log.
// Anything beyond what it may do alone becomes an on-chain proposal the Boss co-signs.
// No language model touches money: every number here is computed, and every reason is printed.
//
//   OUTLAY_CFO=live     acts
//   OUTLAY_CFO=observe  (default) decides and logs what it would do, sends nothing
import { keccak256, parseAbi, toBytes, type Address, type Hex } from 'viem';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, DRY } from '../config.ts';
import { account, hasSeed, type Role } from '../wallets.ts';
import { DEP, cfoAddress, cfoWrite, pub } from '../escrow.ts';
import { gateway } from '../x402.ts';
import { MAIL } from '../mail.ts';
import { CATALOG } from '../services/index.ts';
import { listOrders, readJob } from '../orders.ts';
import { bus } from '../bus.ts';
import { decisions, loggedWithin, record, type DecisionKind } from './log.ts';

export const MODE = process.env.OUTLAY_CFO === 'live' ? 'live' : 'observe';

export const POLICY = {
  tickMinutes: 10,
  epochDays: 7, // allowances are planned a week at a time
  minJobsPerWeek: 5, // plan for at least this much work, even in a quiet week
  jobsAhead: 5, // fund each agent for this many of its jobs
  lowWaterJobs: 2, // top an agent up when it can afford fewer than this many jobs
  minFloat: 0.05, // smallest float worth planning for an agent that pays for anything
  bondTarget: 3, // bond cover to hold: two jobs at the top bond (30% of a 5 USDC job)
  cfoGasMin: 0.01, // below this the CFO can't send transactions; tell the Boss
  dust: 0.01, // ignore amounts smaller than this
};
// Spend per job before there is history: model calls and searches are about a cent or two.
const PAYING: Role[] = ['researcher', 'scout', 'reader', 'writer', 'verifier', 'auditor', 'messenger'];
const DEFAULT_PER_JOB: Partial<Record<Role, number>> = { researcher: 0.02, scout: 0.03, reader: 0.01, writer: 0.02, verifier: 0.02, auditor: 0.01, messenger: MAIL?.sendUsd ?? 0 };

const BUCKETS = ['operating', 'tools', 'bond', 'reserve', 'promo'] as const;
type Bucket = (typeof BUCKETS)[number];
const B: Record<Bucket, number> = { operating: 0, tools: 1, bond: 2, reserve: 3, promo: 4 };

const VAULT = parseAbi([
  'function balances() view returns (uint256[5])',
  'function total() view returns (uint256)',
  'function bondsOutstanding() view returns (uint256)',
  'function reserveFloor() view returns (uint256)',
  'function maxMove() view returns (uint256)',
  'function epochToolBudget() view returns (uint256)',
  'function epoch() view returns (uint64)',
  'function epochAllocated() view returns (uint256)',
  'function owner() view returns (address)',
  'function agents(address) view returns (bool active, uint64 allowanceEpoch, uint128 allowance, uint128 toppedUp)',
  'function proposalCount() view returns (uint256)',
  'function proposals(uint256) view returns (uint8 kind, address who, uint8 from, uint8 to, uint256 amount, bytes32 reason, bool done)',
  'function sync() returns (uint256)',
  'function move(uint8 from, uint8 to, uint256 amount, bytes32 reason)',
  'function openEpoch(bytes32 allocationCommit)',
  'function closeEpoch(bytes32 recordHash)',
  'function setAllowance(address agent, uint128 amount)',
  'function topUp(address agent, uint256 amount, bytes32 reason)',
  'function propose(uint8 kind, address who, uint8 from, uint8 to, uint256 amount, bytes32 reason) returns (uint256)',
]);
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const MOCK_GATEWAY = parseAbi(['function balanceFor(address) view returns (uint256)']);

const u6 = (x: bigint) => Number(x) / 1e6;
const atomic = (usd: number) => BigInt(Math.round(usd * 1e6));
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const usd = (x: number) => x.toFixed(x < 1 ? 4 : 2);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

export type AgentView = { role: Role; address: Address; balance: number; perJob: number; perJobFrom: string; allowance: number; toppedUp: number; current: boolean };
export type Snapshot = {
  at: string; mode: string;
  buckets: Record<Bucket, number>; vaultUsdc: number; unsynced: number;
  bondsOutstanding: number; reserveFloor: number; maxMove: number; epochToolBudget: number; epoch: number; epochAllocated: number;
  agents: AgentView[]; jobsPerWeek: number; cfoGas: number; owner: Address;
  pending: { id: number; from: Bucket; to: Bucket; amount: number; reason: Hex }[];
  proposals: { total: number; cosigned: number };
};
let last: Snapshot | null = null;
export const snapshot = () => last;
/** A fresh read of the vault for the public page (read-only; at most every two minutes). */
let refreshing: Promise<unknown> | null = null;
export async function freshSnapshot() {
  if (DEP && hasSeed() && !running && (!last || Date.now() - Date.parse(last.at) > 120_000)) {
    refreshing ??= observe().then((s) => { last = s; }).catch(() => {}).finally(() => { refreshing = null; });
    await refreshing;
  }
  return last;
}

// ---------------------------------------------------------------- what the CFO sees

/** Each paying agent's spend per job, from the receipts of the last 20 jobs it worked on. */
function spendHistory() {
  const per: Partial<Record<Role, number[]>> = {};
  const weekAgo = Date.now() - 7 * 86400_000;
  let jobsThisWeek = 0;
  for (const o of listOrders().filter((x) => x.demo === DRY && x.payment)) {
    if (Date.parse(o.payment!.at) > weekAgo) jobsThisWeek++;
    for (const r of o.runs) {
      const byAgent: Partial<Record<Role, number>> = {};
      for (const line of readJob(r)?.receipt ?? []) byAgent[line.agent as Role] = (byAgent[line.agent as Role] ?? 0) + line.usd;
      for (const [a, v] of Object.entries(byAgent)) if (v > 0) (per[a as Role] ??= []).push(v);
    }
  }
  return { per, jobsThisWeek };
}

async function agentBalance(role: Role): Promise<number> {
  if (DEP!.network === 'arc') return Number((await gateway(role).getBalances()).gateway.formattedAvailable);
  return u6(await pub.readContract({ address: DEP!.gatewayWallet, abi: MOCK_GATEWAY, functionName: 'balanceFor', args: [account(role).address] }));
}

async function observe(): Promise<Snapshot> {
  const v = DEP!.vault;
  const read = <T>(functionName: string, args: unknown[] = []) => pub.readContract({ address: v, abi: VAULT, functionName, args } as any) as Promise<T>;
  const [bal, total, bonds, floor, maxMove, budget, epoch, allocated, owner, count, usdcInVault] = await Promise.all([
    read<readonly bigint[]>('balances'), read<bigint>('total'), read<bigint>('bondsOutstanding'), read<bigint>('reserveFloor'),
    read<bigint>('maxMove'), read<bigint>('epochToolBudget'), read<bigint>('epoch'), read<bigint>('epochAllocated'), read<Address>('owner'),
    read<bigint>('proposalCount'), pub.readContract({ address: DEP!.usdc, abi: ERC20, functionName: 'balanceOf', args: [v] }),
  ]);
  const { per, jobsThisWeek } = spendHistory();
  const agents: AgentView[] = [];
  const live = new Set(CATALOG.filter((c) => c.live).flatMap((c) => c.team));
  for (const role of PAYING.filter((r) => live.has(r))) {
    const address = account(role).address;
    const [a, balance] = await Promise.all([read<readonly [boolean, bigint, bigint, bigint]>('agents', [address]), agentBalance(role).catch(() => NaN)]);
    const hist = (per[role] ?? []).slice(-20);
    const perJob = hist.length ? median(hist) : DEFAULT_PER_JOB[role] ?? 0;
    const current = Number(a[1]) === Number(epoch);
    agents.push({ role, address, balance, perJob: r6(perJob), perJobFrom: hist.length ? `median of its last ${hist.length} jobs` : 'starting estimate', allowance: current ? u6(a[2]) : 0, toppedUp: current ? u6(a[3]) : 0, current });
  }
  const pending: Snapshot['pending'] = [];
  let cosigned = 0;
  for (let i = Math.max(0, Number(count) - 25); i < Number(count); i++) {
    const p = await read<readonly [number, Address, number, number, bigint, Hex, boolean]>('proposals', [BigInt(i)]);
    if (p[6]) cosigned++;
    else if (p[0] === 2) pending.push({ id: i, from: BUCKETS[p[2]], to: BUCKETS[p[3]], amount: u6(p[4]), reason: p[5] });
  }
  const buckets = Object.fromEntries(BUCKETS.map((b, i) => [b, u6(bal[i])])) as Record<Bucket, number>;
  return {
    at: new Date().toISOString(), mode: MODE, buckets, vaultUsdc: u6(usdcInVault as bigint), unsynced: r6(u6(usdcInVault as bigint) - u6(total)),
    bondsOutstanding: u6(bonds), reserveFloor: u6(floor), maxMove: u6(maxMove), epochToolBudget: u6(budget), epoch: Number(epoch), epochAllocated: u6(allocated),
    agents, jobsPerWeek: Math.max(POLICY.minJobsPerWeek, jobsThisWeek), cfoGas: Number(await pub.getBalance({ address: cfoAddress() })) / 1e18,
    owner, pending, proposals: { total: Number(count), cosigned },
  };
}

// ---------------------------------------------------------------- acting, and writing it down

type Plan = { kind: DecisionKind; summary: string; rule: string; inputs: Record<string, unknown>; key: string; amount?: number; agent?: string; tx: () => Promise<{ hash: Hex }> };

/** The reason sealed into the vault transaction is the hash of the decision itself, committed before the money moves. */
const reasonOf = (p: Omit<Plan, 'tx'>): Hex => keccak256(toBytes(JSON.stringify({ kind: p.kind, rule: p.rule, amount: p.amount, agent: p.agent, inputs: p.inputs })));

/** Do it (live) or write down what would be done (observe). Returns whether the transaction went through. */
async function act(p: Plan, opts: { escalated?: boolean; proposal?: () => Promise<number> } = {}): Promise<boolean> {
  const stable = p.key.replace(/:\d{10,}$/, ''); // repeats of the same concern share a key
  if (MODE === 'observe') {
    if (!loggedWithin(`would:${stable}`, 6 * 3600_000)) {
      await record({ kind: p.kind, summary: p.summary, rule: p.rule, inputs: { ...p.inputs, reasonHash: reasonOf(p) }, key: `would:${stable}`, amount: p.amount, agent: p.agent, status: 'would-do' });
    }
    return false;
  }
  try {
    const { hash } = await p.tx();
    const proposal = opts.proposal ? await opts.proposal() : undefined;
    await record({ kind: p.kind, summary: p.summary, rule: p.rule, inputs: { ...p.inputs, reasonHash: reasonOf(p) }, key: p.key, amount: p.amount, agent: p.agent, tx: hash, proposal, status: opts.escalated ? 'escalated' : 'done' });
    return true;
  } catch (e: any) {
    if (!loggedWithin(`failed:${stable}`, 6 * 3600_000)) {
      await record({ kind: p.kind, summary: `${p.summary} It failed: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 140)}`, rule: p.rule, inputs: p.inputs, key: `failed:${stable}`, amount: p.amount, agent: p.agent, status: 'failed' });
    }
    return false;
  }
}

async function escalate(key: string, summary: string, rule: string, inputs: Record<string, unknown>) {
  if (loggedWithin(key, 24 * 3600_000)) return;
  await record({ kind: 'escalate', summary, rule, inputs, key, status: 'escalated' });
}

const write = (fn: string, args: unknown[]) => () => cfoWrite(DEP!.vault, VAULT, fn, args);

// ---------------------------------------------------------------- one tick

let running = false;
export async function tick(reason = 'scheduled') {
  if (running || !DEP || !hasSeed()) return;
  running = true;
  try {
    let s = (last = await observe());
    const seen = { buckets: s.buckets, bondsOutstanding: s.bondsOutstanding, trigger: reason };

    // 0. Can the CFO still send transactions?
    if (s.cfoGas < POLICY.cfoGasMin) {
      await escalate('gas', `The CFO has ${usd(s.cfoGas)} USDC for gas, below ${POLICY.cfoGasMin}. It can't open escrows or move money until the Boss sends it some.`, 'keep enough gas to act', { cfoGas: s.cfoGas });
      return;
    }

    // 1. Money that arrived in the vault directly (the Boss funding it) is credited to OPERATING.
    if (s.unsynced >= POLICY.dust) {
      await act({ kind: 'move', summary: `${usd(s.unsynced)} USDC arrived in the vault; credited it to OPERATING.`, rule: 'credit new money to OPERATING', inputs: { vaultUsdc: s.vaultUsdc, booked: r6(s.vaultUsdc - s.unsynced) }, key: `sync:${s.vaultUsdc}`, amount: s.unsynced, tx: write('sync', []) });
      if (MODE === 'live') s = last = await observe();
    }

    // 2. A new week: plan each agent's allowance from its measured spend, seal the plan's hash on-chain first.
    const planFile = join(DATA_DIR, 'cfo', 'epoch.json');
    const plan = existsSync(planFile) ? JSON.parse(readFileSync(planFile, 'utf8')) : null;
    const stale = !plan || plan.vaultEpoch !== s.epoch || Date.now() - Date.parse(plan.openedAt) > POLICY.epochDays * 86400_000;
    if (stale) {
      const want = Object.fromEntries(s.agents.filter((a) => a.perJob > 0).map((a) => [a.role, Math.max(POLICY.minFloat, a.perJob * s.jobsPerWeek)]));
      const sum = Object.values(want).reduce((t, x) => t + x, 0);
      const scale = sum > s.epochToolBudget ? s.epochToolBudget / sum : 1;
      const allowances = Object.fromEntries(Object.entries(want).map(([r, x]) => [r, Math.floor(x * scale * 1e4) / 1e4]));
      const next = { vaultEpoch: s.epoch + 1, openedAt: new Date().toISOString(), jobsPerWeek: s.jobsPerWeek, allowances, perJob: Object.fromEntries(s.agents.map((a) => [a.role, a.perJob])), scale: r6(scale), budget: s.epochToolBudget };
      const commit = keccak256(toBytes(JSON.stringify(next)));
      const lines = Object.entries(allowances).map(([r, x]) => `${r} ${usd(x)}`).join(', ');
      const planned = { kind: 'epoch' as const, summary: `Planned week ${next.vaultEpoch}: ${s.jobsPerWeek} jobs expected, so allowances ${lines}${scale < 1 ? ` (scaled to fit the ${s.epochToolBudget} USDC weekly budget)` : ''}. The plan's hash is sealed on-chain before any money moves.`, rule: 'plan allowances weekly from measured spend per job', inputs: { plan: next, commit }, key: `epoch:${next.vaultEpoch}` };
      if (MODE === 'observe') await act({ ...planned, tx: async () => ({ hash: '0x' as Hex }) });
      else {
        const closing = plan ? keccak256(toBytes(JSON.stringify(decisions(500).filter((d) => Date.parse(d.at) >= Date.parse(plan.openedAt)).map((d) => d.hash)))) : null;
        if (closing) await cfoWrite(DEP.vault, VAULT, 'closeEpoch', [closing]).catch(() => {});
        if (!(await act({ ...planned, tx: write('openEpoch', [commit]) }))) return;
        mkdirSync(join(DATA_DIR, 'cfo'), { recursive: true });
        writeFileSync(planFile, JSON.stringify({ ...next, commit }, null, 2));
        for (const [role, x] of Object.entries(allowances)) {
          await cfoWrite(DEP.vault, VAULT, 'setAllowance', [account(role as Role).address, atomic(x)]).catch((e) =>
            record({ kind: 'allowance', summary: `Setting ${role}'s allowance to ${usd(x)} USDC failed: ${String(e?.shortMessage ?? e?.message).slice(0, 120)}`, rule: 'plan allowances weekly from measured spend per job', inputs: { role, allowance: x }, key: `allowance-failed:${role}:w${next.vaultEpoch}`, agent: role, status: 'failed' }));
        }
        s = last = await observe();
      }
    }

    // 3. Put revenue to work, in order: TOOLS for this week's remaining allowances, BOND to its target,
    //    RESERVE to its floor. The rest stays in OPERATING. Alone, the CFO moves at most maxMove per
    //    bucket pair per week; beyond that it proposes and the Boss co-signs. It never splits a move.
    const toolsNeed = r6(s.agents.reduce((t, a) => t + Math.max(0, a.allowance - a.toppedUp), 0) - s.buckets.tools);
    const wants: [Bucket, number, string][] = [
      ['tools', toolsNeed, `cover the ${usd(toolsNeed + s.buckets.tools)} USDC agents may still draw this week`],
      ['bond', r6(POLICY.bondTarget - s.buckets.bond), `hold ${POLICY.bondTarget} USDC of bond cover, enough for two top-size guarantees`],
      ['reserve', r6(s.reserveFloor - s.buckets.reserve), `keep the reserve at its ${s.reserveFloor} USDC floor`],
    ];
    let operating = s.buckets.operating;
    for (const [to, gap, why] of wants) {
      const amount = r6(Math.min(gap, operating));
      if (amount < POLICY.dust) continue;
      const movedThisWeek = decisions(500).filter((d) => d.kind === 'move' && d.status === 'done' && d.key?.startsWith(`move:operating>${to}:w${s.epoch}`)).reduce((t, d) => t + (d.amount ?? 0), 0);
      const base = { summary: '', rule: 'revenue goes to TOOLS, then BOND, then RESERVE', inputs: { ...seen, gap, movedThisWeek, maxMove: s.maxMove }, amount };
      if (movedThisWeek + amount <= s.maxMove) {
        await act({ ...base, kind: 'move', summary: `Moved ${usd(amount)} USDC from OPERATING to ${to.toUpperCase()} to ${why}.`, key: `move:operating>${to}:w${s.epoch}:${Date.now()}`, tx: write('move', [B.operating, B[to], atomic(amount), reasonOf({ ...base, kind: 'move', key: '' })]) });
      } else if (!s.pending.some((p) => p.from === 'operating' && p.to === to)) {
        const id = s.proposals.total;
        await act({ ...base, kind: 'propose', summary: `Asked the Boss to co-sign moving ${usd(amount)} USDC from OPERATING to ${to.toUpperCase()} to ${why}: more than the ${s.maxMove} USDC a week the CFO moves alone.`, key: `propose:operating>${to}:w${s.epoch}`, tx: write('propose', [2, '0x0000000000000000000000000000000000000000', B.operating, B[to], atomic(amount), reasonOf({ ...base, kind: 'propose', key: '' })]) }, { escalated: true, proposal: async () => id });
      }
      operating = r6(operating - amount);
    }
    if (MODE === 'live') s = last = await observe();

    // 4. Top up any agent that can afford fewer than two of its jobs, from TOOLS, within its allowance.
    let tools = s.buckets.tools;
    const starved: string[] = [];
    for (const a of s.agents) {
      if (!(a.perJob > 0) || !Number.isFinite(a.balance)) continue;
      const low = a.perJob * POLICY.lowWaterJobs, target = Math.max(POLICY.minFloat, a.perJob * POLICY.jobsAhead);
      if (a.balance >= low) continue;
      const want = r6(target - a.balance), left = r6(a.allowance - a.toppedUp);
      const amount = r6(Math.min(want, left, tools));
      const inputs = { balance: a.balance, perJob: a.perJob, perJobFrom: a.perJobFrom, lowWater: r6(low), target: r6(target), allowanceLeft: left, tools };
      if (amount >= POLICY.dust) {
        const after = a.balance + amount, jobs = Math.floor(after / a.perJob + 1e-9);
        const capped = amount < want - 1e-9 ? (amount === left ? ', as far as its weekly allowance goes' : ', all that TOOLS holds') : '';
        await act({ kind: 'top-up', summary: `${a.role} had ${usd(a.balance)} USDC, under two jobs' worth (${usd(low)}). Topped it up by ${usd(amount)} to ${usd(after)}, about ${jobs} jobs' worth${capped}.`, rule: 'keep every agent funded for its next jobs', inputs, key: `topup:${a.role}:${Date.now()}`, amount, agent: a.role, tx: write('topUp', [a.address, atomic(amount), reasonOf({ kind: 'top-up', summary: '', rule: 'keep every agent funded for its next jobs', inputs, key: '', amount, agent: a.role })]) });
        tools = r6(tools - amount);
      } else if (left < POLICY.dust) {
        await escalate(`allowance:${a.role}:w${s.epoch}`, `${a.role} is low (${usd(a.balance)} USDC) and has used its whole allowance for this week. It waits for next week's plan unless the Boss raises the weekly budget.`, 'never top up past the weekly allowance', inputs);
      } else starved.push(`${a.role} (${usd(a.balance)})`);
    }
    if (starved.length) {
      await escalate(`tools-empty:${starved.length}`, `${starved.join(', ')} ${starved.length === 1 ? 'is' : 'are'} low, but the TOOLS bucket is empty and there is no revenue to move into it. The Boss needs to add USDC to the vault.`, 'top-ups come only from TOOLS', { starved, tools, operating: s.buckets.operating });
    }
    last = MODE === 'live' ? await observe() : s;
  } catch (e: any) {
    if (!loggedWithin('tick-error', 6 * 3600_000)) await record({ kind: 'hold', summary: `The CFO couldn't finish a check: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 160)}`, rule: 'retry next tick', inputs: {}, key: 'tick-error', status: 'failed' });
  } finally {
    running = false;
  }
}

/** Tick every few minutes, and soon after money comes in or a job finishes. */
export function startTreasury() {
  if (!DEP) return;
  setTimeout(() => void tick('startup'), 5000);
  setInterval(() => void tick(), POLICY.tickMinutes * 60_000);
  let soon: NodeJS.Timeout | undefined;
  bus.on('event', (e: any) => {
    if (e.type !== 'order' || !['accepted', 'delivered', 'failed', 'rejected'].includes(e.data?.status)) return;
    clearTimeout(soon);
    soon = setTimeout(() => void tick(`order ${e.data.status}`), 30_000);
  });
}
