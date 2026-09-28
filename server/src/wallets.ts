// Every Outlay wallet derives from one mnemonic. It lives in OUTLAY_MNEMONIC (Railway) or
// ~/.outlay-seed (local, mode 600). It is never committed.
import { readFileSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts';
import { toHex, type Hex } from 'viem';

export const SEED_FILE = join(homedir(), '.outlay-seed');

/** Wallet index per role. Stable forever: changing an index moves that role's money. */
export const ROLES = {
  treasury: 0,
  cfo: 1,
  scout: 2,
  researcher: 3,
  writer: 4,
  illustrator: 5,
  verifier: 6,
  mailer: 7,
  reader: 8,
  analyst: 9,
  messenger: 10,
  auditor: 11,
  producer: 12,
  bookkeeper: 13,
  linguist: 14,
  investigator: 15,
} as const;
export type Role = keyof typeof ROLES;

let cached: string | undefined;
export function mnemonic(): string {
  if (cached) return cached;
  const fromEnv = process.env.OUTLAY_MNEMONIC?.trim();
  if (fromEnv) return (cached = fromEnv);
  if (existsSync(SEED_FILE)) return (cached = readFileSync(SEED_FILE, 'utf8').trim());
  throw new Error(`No mnemonic: set OUTLAY_MNEMONIC or run scripts/wallet.ts init (writes ${SEED_FILE})`);
}

export function initSeed(): { created: boolean } {
  if (process.env.OUTLAY_MNEMONIC || existsSync(SEED_FILE)) return { created: false };
  writeFileSync(SEED_FILE, generateMnemonic(english) + '\n', { mode: 0o600 });
  chmodSync(SEED_FILE, 0o600);
  return { created: true };
}

export function account(role: Role) {
  return mnemonicToAccount(mnemonic(), { addressIndex: ROLES[role] });
}

export function privateKey(role: Role): Hex {
  const pk = account(role).getHdKey().privateKey;
  if (!pk) throw new Error(`no private key for ${role}`);
  return toHex(pk);
}
