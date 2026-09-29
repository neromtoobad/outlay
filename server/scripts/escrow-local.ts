// Local escrow rig for testing the paid flow end to end with fake money:
//   ~/.foundry/bin/anvil &                       (chain 31337 on :8545; set LOCAL_RPC for another port)
//   node scripts/escrow-local.ts [0xCustomer]    → mock USDC at Arc's address, contracts, a funded BOND bucket
// Then run the API with OUTLAY_DRY=1 OUTLAY_ESCROW_NET=local. The customer (default: anvil account 0) gets 20 USDC.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, encodeFunctionData, http, parseAbi, parseUnits, type Hex } from 'viem';
import { account } from '../src/wallets.ts';

const rpc = (process.env.LOCAL_RPC ??= 'http://127.0.0.1:8545');
const root = new URL('../../', import.meta.url).pathname;
const customer = (process.argv[2] ?? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') as Hex;
const USDC = '0x3600000000000000000000000000000000000000' as Hex;
const pub = createPublicClient({ transport: http(rpc) });
const rpcCall = (method: string, params: unknown[]) => pub.request({ method: method as any, params: params as any });

execFileSync(join(process.env.HOME!, '.foundry/bin/forge'), ['build', '--silent'], { cwd: join(root, 'contracts'), stdio: 'inherit' });
const mock = JSON.parse(readFileSync(join(root, 'contracts/out/Syncly.t.sol/MockUSDC.json'), 'utf8'));
await rpcCall('anvil_setCode', [USDC, mock.deployedBytecode.object]);
// Circle's GatewayWallet stand-in at the local gateway address (the vault's top-ups call depositFor on it).
const GATEWAY = ('0x' + '77'.padEnd(40, '7')) as Hex;
const mockGateway = JSON.parse(readFileSync(join(root, 'contracts/out/Syncly.t.sol/MockGateway.json'), 'utf8'));
await rpcCall('anvil_setCode', [GATEWAY, mockGateway.deployedBytecode.object]);
await rpcCall('anvil_setStorageAt', [GATEWAY, '0x0', '0x' + USDC.slice(2).padStart(64, '0')]); // slot 0: its usdc
for (const r of ['treasury', 'cfo'] as const) await rpcCall('anvil_setBalance', [account(r).address, '0x56BC75E2D63100000']);

execFileSync(process.execPath, ['scripts/deploy.ts', 'local'], { cwd: join(root, 'server'), stdio: 'inherit' });

const mint = parseAbi(['function mint(address to, uint256 v)']);
const [dev] = (await rpcCall('eth_accounts', [])) as Hex[];
for (const [to, amt] of [[account('treasury').address, '10'], [customer, '20']] as const) {
  await rpcCall('eth_sendTransaction', [{ from: dev, to: USDC, data: encodeFunctionData({ abi: mint, functionName: 'mint', args: [to, parseUnits(amt, 6)] }) }]);
}
execFileSync(process.execPath, ['scripts/vault.ts', 'bond', '2'], { cwd: join(root, 'server'), stdio: 'inherit', env: { ...process.env, OUTLAY_ESCROW_NET: 'local' } });
execFileSync(process.execPath, ['scripts/vault.ts', 'status'], { cwd: join(root, 'server'), stdio: 'inherit', env: { ...process.env, OUTLAY_ESCROW_NET: 'local' } });
console.log(`\ncustomer ${customer} has 20 USDC on the local chain`);
process.exit(0);
