// node scripts/pay-safety.ts   → checks buy()'s money-safety rules against a fake local seller.
// Nothing is paid: the fake seller only reads the signed payment header, and no real seller is called.
//   1. a dropped connection AFTER signing is not retried (no double pay)
//   2. a seller that says "verification temporarily unavailable" is retried (it took nothing)
//   3. a dropped connection BEFORE signing (the free 402 request) is retried
//   4. a service's payee is pinned on first use, and a changed payee is refused before signing
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.OUTLAY_DATA = mkdtempSync(join(tmpdir(), 'syncly-pay-safety-')) + '/';
process.env.OUTLAY_QUIET = '1';
const { buy } = await import('../src/x402.ts');
const { Job } = await import('../src/job.ts');
const { decisions } = await import('../src/cfo/log.ts');

const A = '0x1111111111111111111111111111111111111111', B = '0x2222222222222222222222222222222222222222';
let mode = '', payTo = A;
const hits = { free: 0, paid: 0 };
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const paid = !!req.headers['payment-signature'];
  paid ? hits.paid++ : hits.free++;
  if (!paid) {
    if (mode === 'drop-before' && hits.free === 1) return req.socket.destroy();
    const required = { x402Version: 2, resource: { url: req.url }, accepts: [{ scheme: 'exact', network: 'eip155:5042', asset: '0x3600000000000000000000000000000000000000', amount: '1000', payTo, maxTimeoutSeconds: 600, extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE' } }] };
    res.writeHead(402, { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(required)).toString('base64'), 'content-type': 'application/json' });
    return res.end('{}');
  }
  if (mode === 'drop-after') return req.socket.destroy();
  if (mode === 'declined' && hits.paid < 3) { res.writeHead(402, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Payment verification temporarily unavailable, please retry' })); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const host = `127.0.0.1:${(server.address() as any).port}`;

async function run(name: string, m: string, path: string, expect: (err: string | null) => boolean, want: string) {
  mode = m; hits.free = 0; hits.paid = 0;
  const job = new Job('test', 'test', { budgetUsd: 1, allowHosts: [host] });
  let err: string | null = null;
  try { await buy(job, { agent: 'scout', vendor: 'Fake seller', url: `http://${host}/${path}`, reason: 'test', maxUsd: 0.01, expectUsd: 0.001, dryData: () => ({}) }); }
  catch (e: any) { err = String(e.message); }
  const ok = expect(err);
  console.log(`${ok ? '✓' : '✗'} ${name}: free ${hits.free}, paid ${hits.paid}${err ? ` · ${err.slice(0, 110)}` : ''}  (want ${want})`);
  return ok;
}

const results = [
  await run('dropped after signing', 'drop-after', 'svc/a', (e) => !!e && /Not retried/.test(e) && hits.paid === 1, '1 paid attempt, no retry'),
  await run('seller declined verification', 'declined', 'svc/b', (e) => !e && hits.paid === 3, 'retried until it went through'),
  await run('dropped before signing', 'drop-before', 'svc/c', (e) => !e && hits.free === 2 && hits.paid === 1, 'retried, paid once'),
  await run('first payment pins the payee', '', 'pinme/x', (e) => !e && hits.paid === 1, 'paid and pinned'),
];
payTo = B;
results.push(await run('payee changed', '', 'pinme/y', (e) => !!e && /pinned/.test(e) && hits.paid === 0, 'refused, nothing signed'));
console.log(`\ndecision log: ${decisions().map((d) => d.kind).join(', ')}`);
server.close();
console.log(results.every(Boolean) ? '\nall money-safety checks passed' : '\nSOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
