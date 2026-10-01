// Syncly API: quotes, orders, live job progress (SSE), the public books.
//   PORT=8790 node src/api.ts          (OUTLAY_DRY=1 for demo mode: no money moves, clearly labelled)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DATA_DIR, DRY } from './config.ts';
import { account, hasSeed } from './wallets.ts';
import { bus, type SynclyEvent } from './bus.ts';
import { CATALOG } from './services/index.ts';
import { cleanDetails, detailsBrief, type BusinessDetails } from './details.ts';
import { MAX_BYTES, allowUpload, readUpload, saveUpload } from './uploads.ts';
import { autoAcceptDue, createQuote, decide, escrowPending, getOrder, noteForRevision, openEscrow, readJob, replay, retry, start, syncEscrow } from './orders.ts';
import { escrowConfig, refreshBondFree } from './escrow.ts';
import { MODE as CFO_MODE, POLICY as CFO_POLICY, freshSnapshot, startTreasury, teamShortfall } from './cfo/treasury.ts';
import { decisions as cfoDecisions, verifyLog } from './cfo/log.ts';
import { tractionReport } from './traction.ts';
import { books, beancount, team } from './books.ts';
import { resolveSettlements } from './settle.ts';

process.env.OUTLAY_QUIET ??= '1';

// First boot on a fresh volume (Railway): restore the live books from OUTLAY_BOOTSTRAP, a base64 gzip
// of { "orders/<id>.json" | "jobs/<job>/<file>": contents }. Skipped once any order exists.
function bootstrap() {
  const b64 = process.env.OUTLAY_BOOTSTRAP?.trim();
  if (!b64 || existsSync(join(DATA_DIR, 'orders'))) return;
  const files: Record<string, string> = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
  let n = 0;
  for (const [rel, body] of Object.entries(files)) {
    if (!/^(orders|jobs\/job_\w+)\/[\w-]+\.(json|md|csv)$/.test(rel)) continue;
    mkdirSync(dirname(join(DATA_DIR, rel)), { recursive: true });
    writeFileSync(join(DATA_DIR, rel), body);
    n++;
  }
  console.log(`restored ${n} files into ${DATA_DIR}`);
}
bootstrap();

const app = new Hono();

/** The treasury's public address proves which seed is loaded without revealing it. */
function treasury() {
  try { return hasSeed() ? account('treasury').address : null; } catch { return 'invalid seed'; }
}
app.get('/api/health', (c) => c.json({ ok: true, mode: DRY ? 'demo' : 'live', keys: DRY || hasSeed(), treasury: treasury() }));
app.get('/api/services', (c) => c.json({ mode: DRY ? 'demo' : 'live', services: CATALOG }));
app.get('/api/escrow', (c) => c.json(escrowConfig()));

app.post('/api/quote', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const service = String(b.service ?? ''), email = String(b.email ?? '');
  let brief = String(b.brief ?? '');
  let details: BusinessDetails | undefined;
  if (b.details) {
    try { details = cleanDetails(b.details, service); } catch (e: any) { return c.json({ error: e.message }, 400); }
    brief = `${detailsBrief(details, service)}${brief.trim() ? `\n\n${brief.trim()}` : ''}`;
  }
  if (brief.trim().length < 12) return c.json({ error: 'Tell us a bit more: at least a sentence.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'A valid email is needed so we can deliver.' }, 400);
  try {
    const unfunded = await teamShortfall(service);
    if (unfunded) return c.json({ error: unfunded }, 409);
    return c.json(createQuote({ service, brief, email, details }));
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Photos and logos for an order: re-encoded on our server (which strips camera metadata) before storing.
app.post('/api/uploads', async (c) => {
  const who = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const body = await c.req.parseBody({ all: true }).catch(() => ({} as Record<string, unknown>));
  const files = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in (f as object)).slice(0, 8);
  if (!files.length) return c.json({ error: 'No image received.' }, 400);
  if (!allowUpload(who, files.length)) return c.json({ error: 'Too many uploads from here in the last hour. Try again later.' }, 429);
  const out = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) return c.json({ error: `${f.name} is over 12 MB.` }, 400);
    try { out.push(await saveUpload(Buffer.from(await f.arrayBuffer()))); } catch (e: any) { return c.json({ error: `${f.name}: ${e.message}` }, 400); }
  }
  return c.json({ uploads: out });
});
app.get('/api/uploads/:id', (c) => {
  const buf = readUpload(c.req.param('id'));
  if (!buf) return c.text('not found', 404);
  c.header('content-type', 'image/jpeg');
  c.header('cache-control', 'public, max-age=31536000, immutable');
  c.header('x-content-type-options', 'nosniff');
  return c.body(buf);
});

/** The public shape of an order: runs expanded, email masked, live job progress attached. */
function view(id: string) {
  const o = getOrder(id)!;
  const runs = o.runs.map((r) => readJob(r)).filter(Boolean);
  return { ...o, email: o.email.replace(/^(.).*(@.*)$/, '$1•••$2'), runs, live: liveJobs.get(o.id) ?? null, team: [...(CATALOG.find((x) => x.id === o.service)?.team ?? [])] };
}

app.post('/api/orders/:id/start', async (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'not found' }, 404);
  if (!DRY && !hasSeed()) return c.json({ error: 'The team is still clocking in. Try again in a few minutes.' }, 503);
  const { mode } = await c.req.json().catch(() => ({ mode: 'promo' }));
  try {
    await start(o, mode === 'simulated' ? 'simulated' : 'promo');
    return c.json(view(o.id));
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Paid jobs: the CFO opens the escrow for the customer's wallet; the browser then approves and funds it.
app.post('/api/orders/:id/escrow', async (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'not found' }, 404);
  if (!DRY && !hasSeed()) return c.json({ error: 'The team is still clocking in. Try again in a few minutes.' }, 503);
  const { customer } = await c.req.json().catch(() => ({}));
  try {
    await openEscrow(o.id, String(customer ?? ''));
    return c.json(view(o.id));
  } catch (e: any) {
    console.error(`escrow open ${o.id}: ${e.shortMessage ?? e.message}`);
    return c.json({ error: e.shortMessage ?? e.message }, 400);
  }
});

// After the customer's wallet acts on the escrow (fund, accept, revise, reject), read the chain and follow it.
// A revision note is sent first, with the email on the order, because the chain only records the request.
app.post('/api/orders/:id/sync', async (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o?.escrow) return c.json({ error: 'not found' }, 404);
  const { tx, note, email } = await c.req.json().catch(() => ({}));
  try {
    if (note) noteForRevision(o, String(email ?? ''), String(note));
    await syncEscrow(o.id, tx ? String(tx) : undefined);
    return c.json(view(o.id));
  } catch (e: any) {
    return c.json({ error: e.shortMessage ?? e.message }, 400);
  }
});

app.post('/api/orders/:id/retry', async (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'not found' }, 404);
  const { email } = await c.req.json().catch(() => ({}));
  if (String(email ?? '').trim().toLowerCase() !== o.email) return c.json({ error: 'Only the customer who placed this order can retry it.' }, 403);
  try {
    retry(o);
    return c.json(view(o.id));
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post('/api/orders/:id/:action{accept|reject|revise}', async (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'not found' }, 404);
  const { note, email } = await c.req.json().catch(() => ({}));
  // Only the customer decides. Until wallet signatures land, the email on the order is the key.
  if (String(email ?? '').trim().toLowerCase() !== o.email) return c.json({ error: 'Only the customer who placed this order can decide on it.' }, 403);
  try {
    decide(o, c.req.param('action') as 'accept' | 'reject' | 'revise', note);
    return c.json(view(o.id));
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get('/api/orders/:id', (c) => {
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'not found' }, 404);
  return c.json(view(o.id));
});

const MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', svg: 'image/svg+xml', zip: 'application/zip', html: 'text/plain; charset=utf-8' };
app.get('/api/orders/:id/files/:name', (c) => {
  const o = getOrder(c.req.param('id'));
  const name = c.req.param('name');
  if (!o || !/^[a-z0-9._-]+$/i.test(name)) return c.text('not found', 404);
  const last = o.runs[o.runs.length - 1];
  const f = last && join(DATA_DIR, 'jobs', last, name);
  if (!f || !existsSync(f)) return c.text('not found', 404);
  const ext = name.split('.').pop()!.toLowerCase();
  const media = MEDIA[ext];
  c.header('content-type', media ?? (ext === 'csv' ? 'text/csv' : 'text/markdown'));
  // Pictures and video open in the browser; data files download.
  c.header('content-disposition', `${media && c.req.query('download') === undefined ? 'inline' : 'attachment'}; filename="${o.id}-${name}"`);
  if (media) c.header('cache-control', 'public, max-age=86400');
  // Generated files never run as our site: no scripts, no same-origin access.
  c.header('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  c.header('x-content-type-options', 'nosniff');
  return c.body(readFileSync(f));
});

// Customer sites built by the web designer: static files, isolated from our own origin by a CSP sandbox.
const SITE_MIME: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', txt: 'text/plain', xml: 'application/xml' };
const site = (c: any) => {
  const slug = c.req.param('slug'), file = c.req.param('file') || 'index.html';
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !/^[a-z0-9._-]{1,80}$/i.test(file)) return c.text('not found', 404);
  const f = join(DATA_DIR, 'sites', slug, file);
  if (!existsSync(f)) return c.text('not found', 404);
  c.header('content-type', SITE_MIME[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
  c.header('content-security-policy', "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src * data: blob: 'unsafe-inline'");
  c.header('x-content-type-options', 'nosniff');
  c.header('cache-control', 'public, max-age=300');
  // Relative asset paths must resolve under the site whether or not the URL has a trailing slash.
  if (f.endsWith('.html')) return c.body(readFileSync(f, 'utf8').replace(/<head([^>]*)>/i, `<head$1><base href="/s/${slug}/">`));
  return c.body(readFileSync(f));
};
app.get('/s/:slug', site);
app.get('/s/:slug/', site);
app.get('/s/:slug/:file', site);

app.get('/api/books', async (c) => c.json(await books()));

// The CFO in public: what it sees, the rules it follows, and every decision it made (signed, hash-chained).
let verified: { at: number; v: Awaited<ReturnType<typeof verifyLog>> } | null = null;
app.get('/api/cfo', async (c) => {
  if (!verified || Date.now() - verified.at > 60_000) verified = { at: Date.now(), v: await verifyLog() };
  const log = cfoDecisions(150);
  const count = (st: string) => log.filter((d) => d.status === st).length;
  const s = await freshSnapshot();
  const planFile = join(DATA_DIR, 'cfo', 'epoch.json');
  return c.json({
    enabled: escrowConfig().enabled, mode: CFO_MODE, policy: CFO_POLICY, snapshot: s, verify: verified.v,
    plan: existsSync(planFile) ? JSON.parse(readFileSync(planFile, 'utf8')) : null,
    metrics: { done: count('done'), escalated: count('escalated'), refused: count('refused'), wouldDo: count('would-do'), proposed: s?.proposals.total ?? 0, cosigned: s?.proposals.cosigned ?? 0 },
    decisions: log,
  });
});
app.get('/api/team', (c) => c.json(team()));
app.get('/api/replay', (c) => c.json({ mode: DRY ? 'demo' : 'live', orders: replay(Number(c.req.query('limit') ?? 6), c.req.query('order') || undefined) }));
app.get('/api/traction.md', (c) => {
  if (DRY) return c.text('Traction is only reported from live books.', 404);
  c.header('content-type', 'text/markdown; charset=utf-8');
  return c.body(tractionReport().md);
});
app.get('/api/traction', (c) => c.json(DRY ? null : tractionReport().summary));
app.get('/api/books.beancount', (c) => {
  c.header('content-type', 'text/plain; charset=utf-8');
  return c.body(beancount());
});

// Live progress of the job currently running for each order (steps + purchases), for the job page.
const liveJobs = new Map<string, { jobId: string; steps: unknown[]; receipt: unknown[] }>();
bus.on('event', (e: SynclyEvent) => {
  if (!e.orderId || !e.jobId) return;
  let l = liveJobs.get(e.orderId);
  if (!l || l.jobId !== e.jobId) liveJobs.set(e.orderId, (l = { jobId: e.jobId, steps: [], receipt: [] }));
  if (e.type === 'step') l.steps.push(e.data);
  if (e.type === 'purchase') l.receipt.push(e.data);
});

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const only = c.req.query('order');
    const send = (e: SynclyEvent) => { if (!only || e.orderId === only) void stream.writeSSE({ data: JSON.stringify(e), event: e.type }); };
    bus.on('event', send);
    const ping = setInterval(() => void stream.writeSSE({ data: '{}', event: 'ping' }), 20_000);
    await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
    clearInterval(ping);
    bus.off('event', send);
  }),
);

// The web app (web/, Next.js) is its own service and proxies /api here (OUTLAY_API_URL).

setInterval(() => autoAcceptDue(), 60_000);
// the CFO's side of every open escrow: start funded jobs, submit deliveries, release, refund, cancel
let ticking = false;
async function escrowTick() {
  if (ticking || !escrowConfig().enabled || (!DRY && !hasSeed())) return;
  ticking = true;
  try {
    await refreshBondFree().catch(() => {});
    for (const id of escrowPending()) await syncEscrow(id).catch((e) => console.error(`escrow ${id}: ${e.shortMessage ?? e.message}`));
  } finally {
    ticking = false;
  }
}
setTimeout(escrowTick, 2000);
startTreasury();
setInterval(escrowTick, 15_000);
// link each live receipt to its on-chain settlement once Circle Gateway has batched it
const settle = () => void resolveSettlements().then((n) => n && console.log(`settled ${n} receipts on Arc`)).catch(() => {});
setTimeout(settle, 3000);
setInterval(settle, 120_000);
const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port }, () => console.log(`outlay api on :${port} (${DRY ? 'DEMO mode: no money moves' : 'LIVE'})`));
