// Scripted customer for the local escrow rig: reject, expiry, auto-release, and failed-job refund.
// usage: node scripts/escrow-e2e.ts <apiBase> reject|accept|expire|auto|fail   (after scripts/escrow-local.ts; "fail" needs an API started with OUTLAY_DRY_FAIL=BlockRun)
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type Address } from 'viem';

const [API = 'http://localhost:8790', scenario = 'reject'] = process.argv.slice(2);
const RPC = 'http://127.0.0.1:8645';
const ME = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
const chain = { id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const pub = createPublicClient({ chain, transport: http(RPC) });
const w = createWalletClient({ chain, transport: http(RPC), account: ME });
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
const ESC = parseAbi(['function fund(bytes32)', 'function reject(bytes32)', 'function accept(bytes32)']);
const VAULT = parseAbi(['function bondsOutstanding() view returns (uint256)']);

const post = async (p: string, body: unknown) => { const r = await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j: any = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j; };
const get = async (p: string) => (await fetch(API + p)).json() as Promise<any>;
const send = async (address: Address, abi: any, functionName: string, args: unknown[]) => { const h = await w.writeContract({ address, abi, functionName, args } as any); await pub.waitForTransactionReceipt({ hash: h }); return h; };
const warp = async (s: number) => { await pub.request({ method: 'evm_increaseTime' as any, params: [s] as any }); await pub.request({ method: 'evm_mine' as any, params: [] as any }); };
const until = async (id: string, ok: (o: any) => boolean, label: string) => { for (let i = 0; i < 60; i++) { const o = await get(`/api/orders/${id}`); if (ok(o)) return o; await new Promise((r) => setTimeout(r, 500)); } throw new Error(`timed out waiting for ${label}`); };
const bal = async (cfg: any) => Number(await pub.readContract({ address: cfg.usdc, abi: ERC20, functionName: 'balanceOf', args: [ME] })) / 1e6;

const cfg = await get('/api/escrow');
const q = await post('/api/quote', { service: 'local-business-finder', brief: `Scenario ${scenario}: tailors in Ikeja, Lagos`, email: 'tester@example.com' });
if (q.quote.promo) throw new Error('expected a paid quote');
const o1 = await post(`/api/orders/${q.id}/escrow`, { customer: ME });
const e = o1.escrow;
const bondsAfterOpen = Number(await pub.readContract({ address: cfg.vault, abi: VAULT, functionName: 'bondsOutstanding' })) / 1e6;
console.log(`${q.id}: price ${q.quote.priceUsd}, bond ${q.quote.bondUsd}, opened ${e.openTx.slice(0, 10)}, bonds outstanding ${bondsAfterOpen}`);

if (scenario === 'expire') {
  await warp(31 * 60);
  const o = await post(`/api/orders/${q.id}/sync`, {});
  const out = Number(await pub.readContract({ address: cfg.vault, abi: VAULT, functionName: 'bondsOutstanding' })) / 1e6;
  console.log(`expire → status ${o.status}, escrow ${o.escrow.state}, cancel tx ${o.escrow.closeTx?.slice(0, 10)}, bonds outstanding ${out}`);
  process.exit(o.status === 'expired' && o.escrow.state === 'Cancelled' ? 0 : 1);
}

const before = await bal(cfg);
await send(cfg.usdc, ERC20, 'approve', [cfg.escrow, BigInt(Math.round(q.quote.priceUsd * 1e6))]);
const fundTx = await send(cfg.escrow, ESC, 'fund', [e.id]);
await post(`/api/orders/${q.id}/sync`, { tx: fundTx });

if (scenario === 'fail') {
  await until(q.id, (o) => o.status === 'failed', 'the job to fail');
  const early = await post(`/api/orders/${q.id}/sync`, {});
  console.log(`failed → escrow ${early.escrow.state}, refund yet? ${!!early.refund}`);
  await warp(2 * 3600);
  const o = await post(`/api/orders/${q.id}/sync`, {});
  const after = await bal(cfg);
  console.log(`after deadline → escrow ${o.escrow.state}, refund tx ${o.refund?.tx?.slice(0, 10)}, customer net ${(after - before).toFixed(2)} (expect +${q.quote.bondUsd})`);
  process.exit(o.escrow.state === 'Refunded' && Math.abs(after - before - q.quote.bondUsd) < 1e-6 ? 0 : 1);
}

await until(q.id, (o) => o.escrow?.state === 'Submitted', 'the delivery to be sealed');
if (scenario === 'reject') {
  const tx = await send(cfg.escrow, ESC, 'reject', [e.id]);
  const o = await post(`/api/orders/${q.id}/sync`, { tx });
  const after = await bal(cfg);
  console.log(`reject → status ${o.status}, escrow ${o.escrow.state}, refund tx matches ${o.refund?.tx === tx}, customer net ${(after - before).toFixed(2)} (expect +${q.quote.bondUsd})`);
  process.exit(o.status === 'rejected' && Math.abs(after - before - q.quote.bondUsd) < 1e-6 ? 0 : 1);
}
if (scenario === 'accept') {
  const tx = await send(cfg.escrow, ESC, 'accept', [e.id]);
  const o = await post(`/api/orders/${q.id}/sync`, { tx });
  console.log(`accept → status ${o.status}, escrow ${o.escrow.state}, release tx ${o.escrow.closeTx?.slice(0, 10)}`);
  process.exit(o.status === 'accepted' ? 0 : 1);
}
if (scenario === 'auto') {
  await warp(49 * 3600);
  const o = await post(`/api/orders/${q.id}/sync`, {});
  console.log(`48 h of silence → status ${o.status} by ${o.decision?.by}, escrow ${o.escrow.state}, release tx ${o.escrow.closeTx?.slice(0, 10)}`);
  process.exit(o.status === 'accepted' && o.decision?.by === 'auto' ? 0 : 1);
}
