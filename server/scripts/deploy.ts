// Deploy SynclyVault + JobEscrow and configure them.
//   node scripts/deploy.ts local          → anvil on :8545 (tests the whole sequence)
//   node scripts/deploy.ts arc 0xBoss     → Arc mainnet; ownership handed to the Boss's own wallet (required)
// Deployer = treasury key. CFO + escrow operator = the cfo role. Every agent role is hired.
// Writes deployments/<network>.json (public: addresses and tx hashes only).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPublicClient, createWalletClient, http, parseUnits, parseGwei, type Hex, type Address, type Chain } from 'viem';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import { account, ROLES, type Role } from '../src/wallets.ts';
import { ARC } from '../src/config.ts';

const [network = 'local', bossArg] = process.argv.slice(2);
if (network !== 'local' && !/^0x[0-9a-fA-F]{40}$/.test(bossArg ?? '')) {
  console.error('usage: node scripts/deploy.ts arc 0xBoss   (the Boss owns the vault and must be a wallet outside the server)');
  process.exit(1);
}
const root = new URL('../../', import.meta.url).pathname;
const contractsDir = join(root, 'contracts');
const forge = join(process.env.HOME!, '.foundry/bin/forge');

execFileSync(forge, ['build', '--silent'], { cwd: contractsDir, stdio: 'inherit' });
const art = (name: string) => JSON.parse(readFileSync(join(contractsDir, 'out', `${name}.sol`, `${name}.json`), 'utf8'));
const Vault = art('SynclyVault');
const Escrow = art('JobEscrow');

const LOCAL_RPC = process.env.LOCAL_RPC ?? 'http://127.0.0.1:8545';
const local: Chain = { id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [LOCAL_RPC] } } };
const chain: Chain = network === 'arc' ? CHAIN_CONFIGS.arc.chain : network === 'arc-testnet' ? CHAIN_CONFIGS.arcTestnet.chain : local;
// Testnet goes through the builder's own Canteen RPC key ($RPC from `arc-canteen rpc-url --export`).
// Canteen hosts testnet only, so mainnet uses ARC_RPC (config.ts).
if (network === 'arc-testnet' && !process.env.RPC) {
  console.error('arc-testnet needs your Canteen RPC key: eval "$(arc-canteen rpc-url --export)" first');
  process.exit(1);
}
const rpc = network === 'arc' ? ARC.rpc : network === 'arc-testnet' ? process.env.RPC! : LOCAL_RPC;
const usdc = (network === 'local' ? '0x' + '36'.padEnd(40, '0') : CHAIN_CONFIGS[network === 'arc' ? 'arc' : 'arcTestnet'].usdc) as Address;
const gatewayWallet = (network === 'local' ? '0x' + '77'.padEnd(40, '7') : CHAIN_CONFIGS[network === 'arc' ? 'arc' : 'arcTestnet'].gatewayWallet) as Address;

const deployer = account('treasury');
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc), account: deployer });
// Arc silently drops txs with maxFeePerGas under 20 gwei, so set a floor.
const fees = network === 'local' ? {} : { maxFeePerGas: parseGwei('60'), maxPriorityFeePerGas: parseGwei('1') };

if (network === 'local') {
  await pub.request({ method: 'anvil_setBalance' as any, params: [deployer.address, '0x56BC75E2D63100000'] as any });
}

const cfo = account('cfo').address;
const boss = (bossArg ?? deployer.address) as Address;
const log: Record<string, unknown> = { network, chainId: chain.id, rpc, deployer: deployer.address, cfo, boss, usdc, gatewayWallet, txs: {} as Record<string, Hex> };
const txs = log.txs as Record<string, Hex>;

async function deploy(name: string, a: any, args: unknown[]): Promise<Address> {
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object as Hex, args, ...fees } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  txs[`deploy${name}`] = hash;
  console.log(`  ${name} → ${r.contractAddress} (gas ${r.gasUsed})`);
  return r.contractAddress!;
}
async function call(label: string, address: Address, abi: any, functionName: string, args: unknown[]) {
  const hash = await wallet.writeContract({ address, abi, functionName, args, ...fees } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  txs[label] = hash;
  console.log(`  ${label} ✓`);
}

console.log(`deploying to ${network} (chain ${chain.id}) from ${deployer.address}`);
const vault = await deploy('SynclyVault', Vault, [usdc, gatewayWallet, deployer.address, cfo]);
const escrow = await deploy('JobEscrow', Escrow, [usdc, vault, cfo, boss]);
await call('setEscrow', vault, Vault.abi, 'setEscrow', [escrow]);
// Starting policy for a $10–20 company: reserve ≥ 1, CFO moves ≤ 2 alone, agents ≤ 3/epoch, promo ≤ 2/epoch
const U = (x: string) => parseUnits(x, 6);
await call('setPolicy', vault, Vault.abi, 'setPolicy', [U('1'), U('2'), U('3'), U('2')]);
const agentRoles = (Object.keys(ROLES) as Role[]).filter((r) => r !== 'treasury' && r !== 'cfo');
for (const r of agentRoles) await call(`hire:${r}`, vault, Vault.abi, 'hire', [account(r).address]);
if (boss.toLowerCase() !== deployer.address.toLowerCase()) await call('setOwner→boss', vault, Vault.abi, 'setOwner', [boss]);

Object.assign(log, { vault, escrow, agents: Object.fromEntries(agentRoles.map((r) => [r, account(r).address])), at: new Date().toISOString() });
mkdirSync(join(root, 'deployments'), { recursive: true });
writeFileSync(join(root, 'deployments', `${network}.json`), JSON.stringify(log, null, 2));
console.log(`\nvault ${vault}\nescrow ${escrow}\nowner ${boss}${boss === deployer.address ? ' (still the deployer: pass the Boss address to hand over)' : ''}\n→ deployments/${network}.json`);
