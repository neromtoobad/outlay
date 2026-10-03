// node scripts/wallet.ts init      → create ~/.outlay-seed if missing (never printed)
// node scripts/wallet.ts status    → addresses + wallet/Gateway USDC balances on Arc mainnet
// node scripts/wallet.ts deposit <role> <usdc>   → move USDC from the role's wallet into its Gateway balance
// node scripts/wallet.ts fund <usdc> <role...>     → the treasury tops up each role's Gateway balance (depositFor)
// node scripts/wallet.ts send <usdc> <role...>     → the treasury sends USDC to each role's own wallet, for sellers
//                                                    that take a direct transfer (Opus 5 on BlockRun's Arc endpoint)
// node scripts/wallet.ts split <usdc> [--go]       → share <usdc> from the treasury between the agents by how much
//                                                    each spends on the work it does (dry run unless --go)
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from 'viem';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import { initSeed, account, ROLES, SEED_FILE, type Role } from '../src/wallets.ts';
import { gateway } from '../src/x402.ts';
import { ARC } from '../src/config.ts';

const [cmd = 'status', ...rest] = process.argv.slice(2);

if (cmd === 'init') {
  const { created } = initSeed();
  console.log(created ? `created ${SEED_FILE} (mode 600). Back it up somewhere safe; it controls every Syncly wallet.` : 'seed already exists; nothing changed');
  process.exit(0);
}

if (cmd === 'status') {
  const roles = (rest.length ? rest : ['treasury', 'cfo', 'scout', 'reader', 'researcher', 'writer', 'verifier', 'auditor', 'analyst', 'investigator', 'illustrator', 'producer', 'messenger']) as Role[];
  for (const role of roles) {
    const addr = account(role).address;
    try {
      const b = await gateway(role).getBalances();
      console.log(`${role.padEnd(12)} #${String(ROLES[role]).padStart(2)} ${addr}  wallet ${b.wallet.formatted.padStart(10)}  gateway ${b.gateway.formattedAvailable.padStart(10)} USDC`);
    } catch (e: any) {
      console.log(`${role.padEnd(12)} #${String(ROLES[role]).padStart(2)} ${addr}  (balance check failed: ${e?.message ?? e})`);
    }
  }
  process.exit(0);
}

if (cmd === 'deposit') {
  const [role, amount] = rest as [Role, string];
  if (!role || !amount) throw new Error('usage: deposit <role> <usdc>');
  const r = await gateway(role).deposit(amount);
  console.log(`deposited ${r.formattedAmount} USDC for ${role}: approve ${r.approvalTxHash ?? '-'} deposit ${r.depositTxHash}`);
  process.exit(0);
}

if (cmd === 'fund') {
  const [amount, ...roles] = rest as [string, ...Role[]];
  if (!amount || !roles.length || !(Number(amount) > 0)) throw new Error('usage: fund <usdc-each> <role> [role...]   e.g. fund 0.25 researcher scout');
  const t = gateway('treasury');
  const have = Number((await t.getBalances()).wallet.formatted);
  const need = Number(amount) * roles.length;
  if (need > have - 0.05) throw new Error(`treasury has ${have} USDC; funding ${roles.length} × ${amount} needs ${need} plus a little gas`);
  for (const role of roles) {
    const r = await t.depositFor(amount, account(role).address);
    console.log(`funded ${role.padEnd(11)} ${r.formattedAmount} USDC  deposit tx ${r.depositTxHash}  (https://arcscan.app/tx/${r.depositTxHash})`);
  }
  console.log('Gateway balances can take a minute to show up. Check with: node scripts/wallet.ts status ' + roles.join(' '));
  process.exit(0);
}

if (cmd === 'send') {
  const [amount, ...roles] = rest as [string, ...Role[]];
  if (!amount || !roles.length || !(Number(amount) > 0)) throw new Error('usage: send <usdc-each> <role> [role...]   e.g. send 1 illustrator producer');
  const t = gateway('treasury');
  const have = Number((await t.getBalances()).wallet.formatted);
  const need = Number(amount) * roles.length;
  if (need > have - 0.05) throw new Error(`treasury has ${have} USDC; sending ${roles.length} × ${amount} needs ${need} plus a little gas`);
  const w = createWalletClient({ account: account('treasury'), chain: CHAIN_CONFIGS.arc.chain, transport: http(ARC.rpc) });
  for (const role of roles) {
    const hash = await w.writeContract({ address: ARC.usdc as Address, abi: parseAbi(['function transfer(address,uint256) returns (bool)']), functionName: 'transfer', args: [account(role).address, BigInt(Math.round(Number(amount) * 1e6))] });
    console.log(`sent ${amount} USDC to ${role.padEnd(11)} wallet  tx ${hash}  (https://arcscan.app/tx/${hash})`);
  }
  process.exit(0);
}

if (cmd === 'split') {
  const go = rest.includes('--go');
  const amount = Number(rest.find((x) => !x.startsWith('--')));
  if (!(amount > 0)) throw new Error('usage: split <usdc> [--go]   e.g. split 10   (dry run first; add --go to send)');
  const { SPEND } = await import('../src/cfo/spend.ts');
  const { CATALOG } = await import('../src/services/index.ts');
  // The orders we expect: the free first website brings most new customers and the 1 USDC research brief is the
  // cheapest paid job, so they count three and two times; every other live service counts once.
  const MIX: Record<string, number> = { website: 3, 'research-brief': 2 };
  const need: Partial<Record<Role, number>> = {};
  for (const s of CATALOG.filter((x) => x.live)) {
    for (const [r, v] of Object.entries(SPEND[s.id] ?? {})) need[r as Role] = (need[r as Role] ?? 0) + (MIX[s.id] ?? 1) * (v ?? 0);
  }
  const roles = (Object.keys(need) as Role[]).filter((r) => (need[r] ?? 0) > 0);
  const total = roles.reduce((a, r) => a + need[r]!, 0);

  console.log('reading balances on Arc…');
  const t = gateway('treasury');
  const treasury = Number((await t.getBalances()).wallet.formatted);
  // what each agent holds now: its Gateway balance plus its own wallet (the Designer and Producer pay Opus 5 from there)
  const have = Object.fromEntries(await Promise.all(roles.map(async (r) => {
    const b = await gateway(r).getBalances();
    return [r, Number(b.gateway.formattedAvailable) + Number(b.wallet.formatted)] as const;
  }))) as Record<Role, number>;
  const cfoGas = Number((await gateway('cfo').getBalances()).wallet.formatted);
  const KEEP = 0.1; // the treasury keeps this for its own gas
  const CFO_GAS = 0.15; // the CFO pays gas to open and seal every paid job's escrow
  const cfoTop = Math.max(0, Math.round((CFO_GAS - cfoGas) * 100) / 100);
  const pool = Math.floor((Math.min(amount, treasury - KEEP) - cfoTop) * 100) / 100;
  if (pool <= 0) throw new Error(`the treasury has ${treasury} USDC; send it the USDC first (keeps ${KEEP} for gas)`);

  // Each agent's fair share of everything the team holds after this, by its spend; new money fills the gaps.
  const all = pool + roles.reduce((a, r) => a + have[r], 0);
  const rows = roles.map((r) => { const share = need[r]! / total, target = share * all; return { r, share, have: have[r], target, gap: Math.max(0, target - have[r]) }; });
  const gapSum = rows.reduce((a, x) => a + x.gap, 0);
  const OWN: Partial<Record<Role, number>> = { illustrator: 0.25, producer: 0.25 }; // part paid into their own wallet, for Opus 5
  const plan = rows
    .map((x) => { const give = Math.floor((gapSum ? (x.gap / gapSum) * pool : 0) * 100) / 100; const own = Math.min(0.75, Math.round(give * (OWN[x.r] ?? 0) * 100) / 100); return { ...x, give, own, gw: Math.round((give - own) * 100) / 100 }; })
    .sort((a, b) => b.share - a.share);

  const f2 = (n: number) => n.toFixed(2).padStart(6);
  console.log(`\ntreasury ${treasury.toFixed(2)} USDC · sharing ${pool.toFixed(2)}${cfoTop ? ` · ${cfoTop.toFixed(2)} to the CFO for gas` : ''} · keeping ${KEEP.toFixed(2)}\n`);
  console.log('agent          share   has   target   gets  (Gateway + own wallet)');
  for (const x of plan) console.log(`${x.r.padEnd(13)} ${(x.share * 100).toFixed(0).padStart(4)}%  ${f2(x.have)}  ${f2(x.target)}  ${f2(x.give)}  (${x.gw.toFixed(2)}${x.own ? ` + ${x.own.toFixed(2)}` : ''})`);
  console.log(`${''.padEnd(13)}               total ${f2(plan.reduce((a, x) => a + x.give, 0))}`);
  if (!go) { console.log('\ndry run: nothing moved. Run again with --go to send it.'); process.exit(0); }

  const pub = createPublicClient({ chain: CHAIN_CONFIGS.arc.chain, transport: http(ARC.rpc) });
  const w = createWalletClient({ account: account('treasury'), chain: CHAIN_CONFIGS.arc.chain, transport: http(ARC.rpc) });
  const transfer = async (to: Address, usdc: number): Promise<Hex> => {
    const hash = await w.writeContract({ address: ARC.usdc as Address, abi: parseAbi(['function transfer(address,uint256) returns (bool)']), functionName: 'transfer', args: [to, BigInt(Math.round(usdc * 1e6))] });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  };
  if (cfoTop) console.log(`cfo          gas ${cfoTop.toFixed(2)}  https://arcscan.app/tx/${await transfer(account('cfo').address, cfoTop)}`);
  for (const x of plan) {
    if (x.gw >= 0.01) { const r = await t.depositFor(x.gw.toFixed(2), account(x.r).address); console.log(`${x.r.padEnd(12)} Gateway ${x.gw.toFixed(2)}  https://arcscan.app/tx/${r.depositTxHash}`); }
    if (x.own >= 0.01) console.log(`${x.r.padEnd(12)} wallet  ${x.own.toFixed(2)}  https://arcscan.app/tx/${await transfer(account(x.r).address, x.own)}`);
  }
  console.log('done. Gateway balances can take a minute to show. Check with: node scripts/wallet.ts status');
  process.exit(0);
}

console.log('commands: init | status [roles...] | deposit <role> <usdc> | fund <usdc-each> <role...> | send <usdc-each> <role...> | split <usdc> [--go]');
