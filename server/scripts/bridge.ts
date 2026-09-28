// Bring USDC into Arc with Circle CCTP (Fast Transfer + Forwarding Service): Circle submits the Arc
// mint and takes its fee from the minted USDC, so the Arc address needs no gas beforehand.
//   node scripts/bridge.ts estimate 15 Base      → fees only, no transaction
//   node scripts/bridge.ts bridge 15 Base        → burn on Base, Circle mints on Arc to the treasury
// The treasury needs the USDC plus a little ETH (≈0.0001) on the source chain for the burn tx.
import { BridgeKit } from '@circle-fin/bridge-kit';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import { privateKey, account } from '../src/wallets.ts';

const [cmd = 'estimate', amount = '15', from = 'Base'] = process.argv.slice(2);
const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({ privateKey: privateKey('treasury') });
const params = {
  from: { adapter, chain: from },
  to: { adapter, chain: 'Arc', useForwarder: true },
  amount,
  config: { transferSpeed: 'FAST' },
} as any;

console.log(`treasury ${account('treasury').address}: ${amount} USDC ${from} → Arc (CCTP Fast + Forwarding)`);
if (cmd === 'estimate') {
  const est = await kit.estimate(params);
  console.log(JSON.stringify(est, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
} else if (cmd === 'bridge') {
  const res = await kit.bridge(params);
  console.log(JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
} else {
  console.log('usage: estimate|bridge <amount> <sourceChain>');
}
