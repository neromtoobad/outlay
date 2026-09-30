// node scripts/pay-safety.ts   → checks buy()'s money-safety rules against a fake local seller.
// Nothing is paid: the fake seller only reads the signed payment header, and no real seller is called.
//   1. a dropped connection AFTER signing is not retried (no double pay)
//   2. a seller that says "verification temporarily unavailable" is retried (it took nothing)
//   3. a dropped connection BEFORE signing (the free 402 request) is retried
//   4. a service's payee is pinned on first use, and a changed payee is refused before signing
//   5. a seller that only takes a direct USDC transfer is refused when the agent's wallet can't cover it
//   6. an async seller (video) is polled with the same payment and receipted once, when it finishes
//   7. an async job that fails is not receipted (the seller settles only on a finished result)
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
const hits = { free: 0, paid: 0, polls: 0 };
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const paid = !!req.headers['payment-signature'];
  if (req.url?.startsWith('/poll/')) {
    hits.polls++;
    if (!paid) { res.writeHead(402); return res.end('{}'); }
    const status = mode === 'async-fail' ? 'failed' : hits.polls < 2 ? 'processing' : 'completed';
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status, data: status === 'completed' ? [{ url: 'https://example.com/v.mp4' }] : undefined }));
  }
  paid ? hits.paid++ : hits.free++;
  if (!paid) {
    if (mode === 'drop-before' && hits.free === 1) return req.socket.destroy();
    const extra = mode === 'direct' ? { name: 'USDC', version: '2', assetTransferMethod: 'eip3009' } : { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE' };
    const required = { x402Version: 2, resource: { url: req.url }, accepts: [{ scheme: 'exact', network: 'eip155:5042', asset: '0x3600000000000000000000000000000000000000', amount: '1000', payTo, maxTimeoutSeconds: 600, extra }] };
    res.writeHead(402, { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(required)).toString('base64'), 'content-type': 'application/json' });
    return res.end('{}');
  }
  if (mode === 'drop-after') return req.socket.destroy();
  if (mode === 'declined' && hits.paid < 3) { res.writeHead(402, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Payment verification temporarily unavailable, please retry' })); }
  if (mode.startsWith('async')) { res.writeHead(202, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: 'v1', poll_url: '/poll/v1', status: 'queued' })); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const host = `127.0.0.1:${(server.address() as any).port}`;

let receipts = 0;
async function run(name: string, m: string, path: string, expect: (err: string | null) => boolean, want: string, extra: { direct?: boolean; poll?: (d: any) => string | undefined } = {}) {
  mode = m; hits.free = 0; hits.paid = 0; hits.polls = 0;
  const job = new Job('test', 'test', { budgetUsd: 1, allowHosts: [host] });
  let err: string | null = null;
  try { await buy(job, { agent: 'scout', vendor: 'Fake seller', url: `http://${host}/${path}`, reason: 'test', maxUsd: 0.01, expectUsd: 0.001, dryData: () => ({}), ...extra }); }
  catch (e: any) { err = String(e.message); }
  receipts = job.receipt.length;
  const ok = expect(err);
  console.log(`${ok ? '✓' : '✗'} ${name}: free ${hits.free}, paid ${hits.paid}, polls ${hits.polls}, receipts ${receipts}${err ? ` · ${err.slice(0, 110)}` : ''}  (want ${want})`);
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
payTo = A;
const poll = (d: any) => d?.poll_url;
results.push(
  await run('direct seller, empty wallet', 'direct', 'direct/a', (e) => !!e && /can't pay/.test(e) && hits.paid === 0, 'refused before signing', { direct: true }),
  await run('async seller finishes', 'async', 'async/a', (e) => !e && hits.paid === 1 && hits.polls === 2 && receipts === 1, 'paid once, polled, one receipt', { poll }),
  await run('async seller fails', 'async-fail', 'async/b', (e) => !!e && /not charged/.test(e) && receipts === 0, 'no receipt', { poll }),
);
console.log(`\ndecision log: ${decisions().map((d) => d.kind).join(', ')}`);
server.close();
console.log(results.every(Boolean) ? '\nall money-safety checks passed' : '\nSOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
