// Outlay API: quotes, orders, live job progress (SSE), the public books.
//   PORT=8790 node src/api.ts          (OUTLAY_DRY=1 for demo mode: no money moves, clearly labelled)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, DRY } from './config.ts';
import { bus, type OutlayEvent } from './bus.ts';
import { CATALOG } from './services/index.ts';
import { autoAcceptDue, createQuote, decide, getOrder, readJob, replay, start } from './orders.ts';
import { books, beancount } from './books.ts';

process.env.OUTLAY_QUIET ??= '1';
const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, mode: DRY ? 'demo' : 'live' }));
app.get('/api/services', (c) => c.json({ mode: DRY ? 'demo' : 'live', services: CATALOG }));

app.post('/api/quote', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const service = String(b.service ?? ''), brief = String(b.brief ?? ''), email = String(b.email ?? '');
  if (brief.trim().length < 12) return c.json({ error: 'Tell us a bit more: at least a sentence.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'A valid email is needed so we can deliver.' }, 400);
  try {
    return c.json(createQuote({ service, brief, email }));
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
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
  const { mode } = await c.req.json().catch(() => ({ mode: 'promo' }));
  try {
    await start(o, mode === 'simulated' ? 'simulated' : 'promo');
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

app.get('/api/orders/:id/files/:name', (c) => {
  const o = getOrder(c.req.param('id'));
  const name = c.req.param('name');
  if (!o || !/^[a-z0-9._-]+$/i.test(name)) return c.text('not found', 404);
  const last = o.runs[o.runs.length - 1];
  const f = last && join(DATA_DIR, 'jobs', last, name);
  if (!f || !existsSync(f)) return c.text('not found', 404);
  c.header('content-type', name.endsWith('.csv') ? 'text/csv' : 'text/markdown');
  c.header('content-disposition', `attachment; filename="${o.id}-${name}"`);
  return c.body(readFileSync(f));
});

app.get('/api/books', async (c) => c.json(await books()));
app.get('/api/replay', (c) => c.json({ mode: DRY ? 'demo' : 'live', orders: replay(Number(c.req.query('limit') ?? 6), c.req.query('order') || undefined) }));
app.get('/api/books.beancount', (c) => {
  c.header('content-type', 'text/plain; charset=utf-8');
  return c.body(beancount());
});

// Live progress of the job currently running for each order (steps + purchases), for the job page.
const liveJobs = new Map<string, { jobId: string; steps: unknown[]; receipt: unknown[] }>();
bus.on('event', (e: OutlayEvent) => {
  if (!e.orderId || !e.jobId) return;
  let l = liveJobs.get(e.orderId);
  if (!l || l.jobId !== e.jobId) liveJobs.set(e.orderId, (l = { jobId: e.jobId, steps: [], receipt: [] }));
  if (e.type === 'step') l.steps.push(e.data);
  if (e.type === 'purchase') l.receipt.push(e.data);
});

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const only = c.req.query('order');
    const send = (e: OutlayEvent) => { if (!only || e.orderId === only) void stream.writeSSE({ data: JSON.stringify(e), event: e.type }); };
    bus.on('event', send);
    const ping = setInterval(() => void stream.writeSSE({ data: '{}', event: 'ping' }), 20_000);
    await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
    clearInterval(ping);
    bus.off('event', send);
  }),
);

// Production: serve the built web app
const webDist = new URL('../../web/dist', import.meta.url).pathname;
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  app.get('*', (c) => c.html(readFileSync(join(webDist, 'index.html'), 'utf8')));
}

setInterval(() => autoAcceptDue(), 60_000);
const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port }, () => console.log(`outlay api on :${port} (${DRY ? 'DEMO mode: no money moves' : 'LIVE'})`));
