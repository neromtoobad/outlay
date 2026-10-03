// Compliance screening. Everyone Syncly and its Pay businesses send USDC to or take it from (suppliers,
// payers, the businesses' own payout addresses, the tool vendors the agents pay) is re-screened every day
// against Circle's USDC blacklist and the operator's own deny list (SCREEN_DENY, comma-separated, e.g.
// addresses from OFAC's SDN list). And one hop out: every USDC transfer those addresses make or receive on
// Arc is read as it happens, and the other side is screened too. A direct hit stops payments to that
// address; a counterparty hit holds autopay for a human. Each finding, and a daily summary, is signed into
// the CFO's log. Nothing here calls a model: it is lookups and rules.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAddress, isAddress, parseAbiItem, type Address } from 'viem';
import { DATA_DIR } from './config.ts';
import { DEP, pub } from './escrow.ts';
import { account, ROLES, type Role } from './wallets.ts';
import { blacklisted } from './payees.ts';
import { loggedWithin, record } from './cfo/log.ts';

export type Watched = { address: Address; label: string; role: 'supplier' | 'payer' | 'business' | 'vendor'; biz?: string };
export type Finding = { address: Address; level: 'stop' | 'warn'; text: string; at: string; tx?: string; counterparty?: Address };
type State = { cursor?: number; lastFull?: string; checked?: number; watched?: number; hop?: number; scannedAt?: string; transfers?: number; findings: Record<string, Finding[]> };

const POLICY = { everyMinutes: 30, fullEveryHours: 20, chunk: 9_999, maxChunks: 40, firstLookback: 14_400, hopFindingDays: 30, maxWatched: 200 };
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const DENY = new Set<string>((process.env.SCREEN_DENY ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => isAddress(s)));
const file = () => join(DATA_DIR, 'screen.json');
const load = (): State => (existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : { findings: {} });
const save = (s: State) => { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(file(), JSON.stringify(s, null, 2)); };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const lc = (a: string) => a.toLowerCase();
/** "Kemi Cakes's payout address (0x12…34)", or for a label ending in a comma, "Ada, who paid Kemi Cakes (0x12…34)," */
const who = (w: Watched) => (w.label.endsWith(',') ? `${w.label.slice(0, -1)} (${short(w.address)}),` : `${w.label} (${short(w.address)})`);

/** Why an address must not be paid, or undefined. */
export async function denied(who: string): Promise<string | undefined> {
  if (DENY.has(lc(who))) return "on the operator's deny list";
  if (await blacklisted(who)) return "on Circle's USDC blacklist";
  return undefined;
}

/** For the public CFO page: when screening last ran and how far it has read the chain. */
export function screeningStatus() {
  const s = load();
  return { lastFull: s.lastFull ?? null, scannedAt: s.scannedAt ?? null, throughBlock: s.cursor ?? null, watched: s.watched ?? 0, oneHop: s.hop ?? 0, transfersSinceFull: s.transfers ?? 0, findings: Object.values(s.findings).flat().length, denyList: DENY.size };
}

/** What screening knows about an address (newest first). */
export const findingsFor = (who: string): Finding[] => load().findings[lc(who)] ?? [];
export function screeningSummary(addresses: string[]) {
  const s = load(), mine = new Set(addresses.map(lc));
  return { at: s.lastFull ?? null, checked: addresses.length, findings: Object.entries(s.findings).filter(([a]) => mine.has(a)).flatMap(([, f]) => f) };
}

/** Our own contracts and keys: money moving between them isn't exposure. */
function ours(): Set<string> {
  const d = DEP as any;
  const own = [d?.vault, d?.escrow, d?.invoiceBook, d?.payVault, d?.gatewayWallet, d?.boss, '0x0000000000000000000000000000000000000000'];
  for (const r of Object.keys(ROLES) as Role[]) { try { own.push(account(r).address); } catch {} }
  return new Set(own.filter(Boolean).map(lc));
}

function add(s: State, f: Finding): boolean {
  const k = lc(f.address), list = (s.findings[k] ??= []);
  if (list.some((x) => x.level === f.level && x.counterparty === f.counterparty)) return false;
  list.unshift(f);
  return true;
}

let running = false;
export async function screenTick(watch: Watched[], opts: { full?: boolean } = {}) {
  if (running) return;
  running = true;
  const s = load();
  try {
    const byAddr = new Map<string, Watched>();
    for (const w of watch) if (isAddress(w.address) && !byAddr.has(lc(w.address))) byAddr.set(lc(w.address), w);
    const own = ours();
    for (const k of own) byAddr.delete(k);
    const list = [...byAddr.values()].slice(0, POLICY.maxWatched);
    const now = new Date().toISOString();

    // 1. The daily re-screen of every address we deal with: a payee that was fine last month may not be today.
    if (opts.full || !s.lastFull || Date.now() - Date.parse(s.lastFull) > POLICY.fullEveryHours * 3600_000) {
      const hits: string[] = [];
      for (const w of list) {
        const why = await denied(w.address);
        const k = lc(w.address);
        if (!why) { if (s.findings[k]) s.findings[k] = s.findings[k].filter((f) => f.level !== 'stop' || f.counterparty); continue; }
        const text = `${who(w)} is ${why}. ${w.role === 'payer' ? 'Check what it paid before using that money.' : 'Payments to it are stopped.'}`;
        hits.push(text);
        if (add(s, { address: w.address, level: 'stop', text, at: now }) && !loggedWithin(`screen-hit:${k}`, 7 * 86400_000)) {
          await record({ kind: 'screen', summary: text, rule: 'never pay a blacklisted or denied address', inputs: { address: w.address, role: w.role, label: w.label, why }, key: `screen-hit:${k}`, status: 'refused' });
        }
      }
      const roles = (['supplier', 'payer', 'business', 'vendor'] as const).map((r) => [r, list.filter((w) => w.role === r).length] as const).filter(([, n]) => n);
      const what = roles.map(([r, n]) => `${n} ${n === 1 ? r : r === 'business' ? 'businesses' : `${r}s`}`).join(', ') || 'no addresses yet';
      await record({
        kind: 'screen', status: 'done', key: `screen-daily:${now.slice(0, 10)}`, rule: 're-screen everyone we pay or are paid by, every day',
        summary: `Daily screening: re-checked ${what} against Circle's USDC blacklist${DENY.size ? ` and the ${DENY.size}-address deny list` : ''}${s.transfers ? `, and screened the other side of ${s.transfers} transfers they made since the last one` : ''}. ${hits.length ? `${hits.length} hit${hits.length === 1 ? '' : 's'}: ${hits.join(' ')}` : 'All clear.'}`,
        inputs: { checked: list.length, roles: Object.fromEntries(roles), denyList: DENY.size, transfersScreened: s.transfers ?? 0, hits },
      });
      Object.assign(s, { lastFull: now, checked: list.length, transfers: 0 });
    }

    // 2. One hop out: read the USDC transfers our addresses made or received since the last look, and screen
    //    whoever was on the other side. The RPC serves 10,000 blocks per query (about 80 minutes on Arc).
    //    Tool vendors are big platforms that trade with thousands of wallets, so they get the daily check only.
    const hop = list.filter((w) => w.role !== 'vendor');
    if (!DEP || !hop.length) return;
    const latest = Number(await pub.getBlockNumber());
    let from = s.cursor ? s.cursor + 1 : Math.max(0, latest - POLICY.firstLookback);
    if (latest - from > POLICY.chunk * POLICY.maxChunks) from = latest - POLICY.chunk * POLICY.maxChunks; // catch up at most ~2 days
    const addrs = hop.map((w) => w.address);
    const usdc = DEP.usdc;
    // a busy RPC or a crowded window: wait and retry once, then split the window in two
    const logs = async (args: { from: Address[] } | { to: Address[] }, a: number, b: number): Promise<any[]> => {
      for (let attempt = 0; ; attempt++) {
        try { return await pub.getLogs({ address: usdc, event: TRANSFER, args, fromBlock: BigInt(a), toBlock: BigInt(b) }); }
        catch (e) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
          if (b - a < 200) throw e;
          const m = Math.floor((a + b) / 2);
          return [...(await logs(args, a, m)), ...(await logs(args, m + 1, b))];
        }
      }
    };
    const lookups = new Map<string, string | undefined>();
    for (let a = from; a <= latest; a += POLICY.chunk + 1) {
      const b = Math.min(latest, a + POLICY.chunk);
      const outs = await logs({ from: addrs }, a, b);
      const ins = await logs({ to: addrs }, a, b);
      for (const l of [...outs, ...ins]) {
        const { from: f, to: t, value } = l.args as { from: Address; to: Address; value: bigint };
        const out = byAddr.has(lc(f)), w = byAddr.get(lc(out ? f : t))!, cp = getAddress(out ? t : f);
        if (own.has(lc(cp)) || byAddr.has(lc(cp))) continue;
        s.transfers = (s.transfers ?? 0) + 1;
        if (!lookups.has(lc(cp))) lookups.set(lc(cp), await denied(cp));
        const why = lookups.get(lc(cp));
        if (!why) continue;
        const amt = (Number(value) / 1e6).toFixed(2);
        const text = `${who(w)} ${out ? `sent ${amt} USDC to` : `received ${amt} USDC from`} ${short(cp)}, which is ${why}. Autopay to it is held for a person to decide.`;
        if (add(s, { address: w.address, level: 'warn', text, at: new Date().toISOString(), tx: l.transactionHash ?? undefined, counterparty: cp })) {
          await record({ kind: 'screen', summary: text, rule: 'screen the other side of every transfer one hop out', inputs: { address: w.address, role: w.role, label: w.label, counterparty: cp, why, amount: Number(amt), direction: out ? 'out' : 'in', tx: l.transactionHash }, key: `screen-hop:${lc(w.address)}:${lc(cp)}`, tx: l.transactionHash ?? undefined, status: 'escalated' });
        }
      }
      s.cursor = b;
    }
    // one-hop findings age out; a direct hit stays until a re-screen clears it
    const cutoff = Date.now() - POLICY.hopFindingDays * 86400_000;
    for (const k of Object.keys(s.findings)) { s.findings[k] = s.findings[k].filter((f) => f.level === 'stop' || Date.parse(f.at) > cutoff); if (!s.findings[k].length) delete s.findings[k]; }
    s.watched = list.length; s.hop = hop.length; s.scannedAt = new Date().toISOString();
  } catch (e: any) {
    if (!loggedWithin('screen-error', 6 * 3600_000)) await record({ kind: 'hold', summary: `Screening couldn't finish: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 160)}`, rule: 'retry next run', inputs: {}, key: 'screen-error', status: 'failed' });
  } finally {
    save(s);
    running = false;
  }
}

export function startScreening(watchlist: () => Watched[]) {
  setTimeout(() => void screenTick(watchlist()), 60_000);
  setInterval(() => void screenTick(watchlist()), POLICY.everyMinutes * 60_000);
}
