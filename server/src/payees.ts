// Change control on who we pay. Every seller's payout address is pinned per service (payees.json,
// reviewed in git); a new service is pinned on first use. A payee that differs from its pin, or that
// Circle's USDC blacklist flags, is refused before anything is signed, and the refusal is logged.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import { ARC, DATA_DIR } from './config.ts';
import { loggedWithin, record } from './cfo/log.ts';

const REVIEWED: Record<string, string> = JSON.parse(readFileSync(new URL('./payees.json', import.meta.url), 'utf8'));
const pinsFile = () => join(DATA_DIR, 'payees.json');
const pinned = (): Record<string, string> => (existsSync(pinsFile()) ? JSON.parse(readFileSync(pinsFile(), 'utf8')) : {});

/** The service a URL belongs to: its host plus the first path segment (one reseller, many sellers). */
export const serviceOf = (url: string) => { const u = new URL(url); return `${u.host}/${u.pathname.split('/')[1] ?? ''}`; };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const arc = createPublicClient({ chain: CHAIN_CONFIGS.arc.chain, transport: http(ARC.rpc) });
const USDC = parseAbi(['function isBlacklisted(address) view returns (bool)']);
const screened = new Map<string, { blocked: boolean; at: number }>();
/** Circle's USDC blacklist on Arc. Cached for an hour; a failed lookup doesn't block (it is retried next time). */
export async function blacklisted(who: string): Promise<boolean> {
  const k = who.toLowerCase(), hit = screened.get(k);
  if (hit && Date.now() - hit.at < 3600_000) return hit.blocked;
  try {
    const blocked = await arc.readContract({ address: ARC.usdc as Address, abi: USDC, functionName: 'isBlacklisted', args: [who as Address] });
    screened.set(k, { blocked, at: Date.now() });
    return blocked;
  } catch {
    return false;
  }
}

/** Returns a refusal reason, or undefined when the payee is the one we expect and is not blacklisted. */
export async function checkPayee(url: string, payTo: string, ctx: { agent: string; vendor: string }): Promise<string | undefined> {
  const service = serviceOf(url);
  const expected = REVIEWED[service] ?? pinned()[service];
  if (expected && expected.toLowerCase() !== payTo.toLowerCase()) {
    const why = `${ctx.vendor} asked to be paid at ${short(payTo)}, but ${service} is pinned to ${short(expected)}. Refused until someone reviews the change.`;
    if (!loggedWithin(`payee:${service}:${payTo}`, 24 * 3600_000)) await record({ kind: 'payee-refused', summary: why, rule: 'a payee must match the pinned address for its service', inputs: { service, expected, asked: payTo, agent: ctx.agent }, key: `payee:${service}:${payTo}`, agent: ctx.agent, status: 'refused' });
    return why;
  }
  if (await blacklisted(payTo)) {
    const why = `${ctx.vendor}'s payee ${short(payTo)} is on Circle's USDC blacklist. Refused.`;
    if (!loggedWithin(`screen:${payTo}`, 24 * 3600_000)) await record({ kind: 'screen-refused', summary: why, rule: 'never pay a blacklisted address', inputs: { service, payTo, agent: ctx.agent }, key: `screen:${payTo}`, agent: ctx.agent, status: 'refused' });
    return why;
  }
  if (!expected) {
    const pins = pinned();
    pins[service] = payTo;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(pinsFile(), JSON.stringify(pins, null, 2));
    await record({ kind: 'payee-pinned', summary: `First payment to ${service}: pinned its payee ${short(payTo)}. Any later change will be refused.`, rule: 'pin a new service on first use', inputs: { service, payTo, agent: ctx.agent }, key: `pin:${service}`, agent: ctx.agent, status: 'done' });
  }
  return undefined;
}
