// The company's float on Arc, moved by the treasury key (never by the server on its own).
//   node scripts/vault.ts status          → vault buckets, bonds outstanding, CFO gas balance
//   node scripts/vault.ts gas <usdc>      → treasury sends the CFO USDC for gas (it opens and submits escrows)
//   node scripts/vault.ts bond <usdc>     → treasury moves USDC into the vault; the CFO puts it in the BOND bucket
// Uses deployments/<OUTLAY_ESCROW_NET or arc>.json.
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, stringToHex, type Hex } from 'viem';
import { DEP, RPC, chain, FEES, VAULT_ABI } from '../src/escrow.ts';
import { account } from '../src/wallets.ts';

if (!DEP) { console.error('no escrow deployment found (deployments/<net>.json); run scripts/deploy.ts first'); process.exit(1); }
const [cmd = 'status', amount] = process.argv.slice(2);
const ERC20 = parseAbi(['function transfer(address to, uint256 value) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const MOVE = parseAbi(['function sync() returns (uint256)', 'function move(uint8 from, uint8 to, uint256 amount, bytes32 reason)', 'function maxMove() view returns (uint256)']);
const pub = createPublicClient({ chain, transport: http(RPC) });
const as = (role: 'treasury' | 'cfo') => createWalletClient({ chain, transport: http(RPC), account: account(role) });
const u = (x: string) => parseUnits(x, 6);
const f = (x: bigint) => formatUnits(x, 6);

async function write(role: 'treasury' | 'cfo', label: string, address: Hex, abi: any, functionName: string, args: unknown[]) {
  const w = as(role);
  const hash = await w.writeContract({ address, abi, functionName, args, chain, account: w.account, ...FEES } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  console.log(`  ${label} ✓ ${hash}`);
}

if (cmd === 'status') {
  const [b, bonds, t, c] = await Promise.all([
    pub.readContract({ address: DEP.vault, abi: VAULT_ABI, functionName: 'balances' }),
    pub.readContract({ address: DEP.vault, abi: VAULT_ABI, functionName: 'bondsOutstanding' }),
    pub.readContract({ address: DEP.usdc, abi: ERC20, functionName: 'balanceOf', args: [account('treasury').address] }),
    pub.readContract({ address: DEP.usdc, abi: ERC20, functionName: 'balanceOf', args: [account('cfo').address] }),
  ]);
  const names = ['operating', 'tools', 'bond', 'reserve', 'promo'];
  console.log(`vault ${DEP.vault}\n${names.map((n, i) => `  ${n.padEnd(10)} ${f(b[i])}`).join('\n')}\n  bonds outstanding ${f(bonds)}\ntreasury ${f(t)} USDC · cfo (gas) ${f(c)} USDC`);
} else if (cmd === 'gas' && Number(amount) > 0) {
  await write('treasury', `send ${amount} USDC to the CFO for gas`, DEP.usdc, ERC20, 'transfer', [account('cfo').address, u(amount)]);
} else if (cmd === 'bond' && Number(amount) > 0) {
  const max = await pub.readContract({ address: DEP.vault, abi: MOVE, functionName: 'maxMove' });
  if (u(amount) > max) { console.error(`the CFO can move at most ${f(max)} USDC alone; larger moves need the Boss's co-sign`); process.exit(1); }
  await write('treasury', `send ${amount} USDC to the vault`, DEP.usdc, ERC20, 'transfer', [DEP.vault, u(amount)]);
  await write('cfo', 'sync (credits OPERATING)', DEP.vault, MOVE, 'sync', []);
  await write('cfo', `move ${amount} OPERATING → BOND`, DEP.vault, MOVE, 'move', [0, 2, u(amount), stringToHex('bond float', { size: 32 })]);
} else {
  console.error('usage: vault.ts status | gas <usdc> | bond <usdc>');
  process.exit(1);
}
process.exit(0);
