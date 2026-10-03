// Deploy InvoiceBook (Syncly Pay) next to the vault and escrow, and record it in deployments/<network>.json.
//   node scripts/deploy-pay.ts local     → the anvil rig from scripts/escrow-local.ts
//   node scripts/deploy-pay.ts arc       → Arc mainnet (the treasury key pays a few cents of gas)
// Owner = the Boss (from the deployment file), fees = 0.5% to SynclyVault, booker = the CFO key.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPublicClient, createWalletClient, http, parseGwei, type Address, type Chain, type Hex } from 'viem';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import { account } from '../src/wallets.ts';
import { ARC } from '../src/config.ts';

const network = process.argv[2] ?? 'local';
if (network !== 'local' && network !== 'arc') { console.error('usage: node scripts/deploy-pay.ts local|arc'); process.exit(1); }
const FEE_BPS = 50; // 0.5%, capped at 1% by the contract

const root = new URL('../../', import.meta.url).pathname;
const depFile = join(root, 'deployments', `${network}.json`);
const dep = JSON.parse(readFileSync(depFile, 'utf8'));
if (dep.invoiceBook) { console.log(`InvoiceBook is already deployed on ${network}: ${dep.invoiceBook}`); process.exit(0); }

execFileSync(join(process.env.HOME!, '.foundry/bin/forge'), ['build', '--silent'], { cwd: join(root, 'contracts'), stdio: 'inherit' });
const art = JSON.parse(readFileSync(join(root, 'contracts/out/InvoiceBook.sol/InvoiceBook.json'), 'utf8'));

const rpc = network === 'arc' ? ARC.rpc : (process.env.LOCAL_RPC ?? dep.rpc ?? 'http://127.0.0.1:8545');
const chain: Chain = network === 'arc' ? CHAIN_CONFIGS.arc.chain : { id: dep.chainId ?? 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const fees = network === 'arc' ? { maxFeePerGas: parseGwei('60'), maxPriorityFeePerGas: parseGwei('1') } : {}; // Arc drops txs under 20 gwei
const deployer = account('treasury');
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc), account: deployer });

const args = [dep.usdc as Address, dep.boss as Address, dep.vault as Address, FEE_BPS, account('cfo').address];
console.log(`deploying InvoiceBook to ${network} from ${deployer.address}\n  owner ${dep.boss} · fees ${FEE_BPS / 100}% to the vault ${dep.vault} · booker (CFO) ${args[4]}`);
const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode.object as Hex, args, ...fees } as any);
const r = await pub.waitForTransactionReceipt({ hash });
if (r.status !== 'success' || !r.contractAddress) throw new Error(`deploy failed: ${hash}`);
dep.invoiceBook = r.contractAddress;
dep.invoiceBookBlock = Number(r.blockNumber);
dep.txs = { ...(dep.txs ?? {}), deployInvoiceBook: hash };
writeFileSync(depFile, JSON.stringify(dep, null, 2));
console.log(`  InvoiceBook → ${r.contractAddress} (gas ${r.gasUsed})${network === 'arc' ? `\n  https://arcscan.app/tx/${hash}` : ''}\n→ deployments/${network}.json`);
process.exit(0);
