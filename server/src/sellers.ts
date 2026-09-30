// Sellers beyond the first five tools: DataForSEO and social data through AIsa, more Orthogonal
// sellers, and Serper's other Google verticals. Every call still goes through buy(), so the price
// cap, the host allowlist, payee pins and the receipt apply exactly as they do everywhere else.
import { buy } from './x402.ts';
import type { Job } from './job.ts';
import type { Role } from './wallets.ts';

export const AISA = 'api.aisa.one';
export const ORTHO = 'np.orthogonal.com';

export type Call<T> = { agent: Role; vendor: string; reason: string; expectUsd?: number; maxUsd?: number; dry: () => T };
type Input = { query?: Record<string, string | number | boolean | undefined>; body?: unknown; method?: 'GET' | 'POST' };

const qs = (q?: Input['query']) => {
  if (!q) return '';
  const e = Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]);
  return e.length ? '?' + new URLSearchParams(e).toString() : '';
};

/**
 * Any AIsa endpoint on its x402 mirror (/apis/v2). AIsa lists most endpoints at 0.10 but prices some
 * by how much they return, so the cap defaults a little above list and the 402 decides the rest.
 */
export function aisa<T = any>(job: Job, path: string, input: Input, c: Call<T>): Promise<T> {
  return buy<T>(job, {
    agent: c.agent, vendor: c.vendor, url: `https://${AISA}/apis/v2/${path.replace(/^\//, '')}${qs(input.query)}`,
    method: input.method ?? (input.body === undefined ? 'GET' : 'POST'), body: input.body,
    reason: c.reason, expectUsd: c.expectUsd ?? 0.1, maxUsd: c.maxUsd ?? 0.15, dryData: c.dry,
  });
}

/** Any Orthogonal-proxied seller (np.orthogonal.com/<seller>/...). */
export function ortho<T = any>(job: Job, path: string, input: Input, c: Call<T>): Promise<T> {
  return buy<T>(job, {
    agent: c.agent, vendor: c.vendor, url: `https://${ORTHO}/${path.replace(/^\//, '')}${qs(input.query)}`,
    method: input.method ?? (input.body === undefined ? 'GET' : 'POST'), body: input.body,
    reason: c.reason, expectUsd: c.expectUsd ?? 0.01, maxUsd: c.maxUsd ?? 0.02, dryData: c.dry,
  });
}

/**
 * A DataForSEO "live" endpoint through AIsa: one task in, that task's `result` array out.
 * DataForSEO wraps everything as { status_code, tasks: [{ status_code, status_message, result }] };
 * a task status of 40000 or more is an error even when the HTTP call succeeded (and was paid).
 */
export async function dataforseo<R = any>(job: Job, path: string, task: Record<string, unknown>, c: Call<R[]>): Promise<R[]> {
  const data = await aisa<any>(job, `dataforseo/${path.replace(/^\//, '')}`, { body: [task] }, {
    ...c, dry: () => ({ status_code: 20000, tasks: [{ status_code: 20000, status_message: 'Ok.', result: c.dry() }] }),
  });
  const t = data?.tasks?.[0];
  if (!t) throw new Error(`${c.vendor}: ${data?.status_message ?? 'no task in the response'}`);
  if (t.status_code && t.status_code >= 40000) throw new Error(`${c.vendor}: ${t.status_message ?? t.status_code}`);
  return (t.result ?? []) as R[];
}

/**
 * DataForSEO endpoints that only come as task_post + task_get. Posting and every fetch are each paid,
 * so we wait before the first fetch and try at most `tries` times.
 */
export async function dataforseoTask<R = any>(
  job: Job, postPath: string, getPath: (id: string) => string, task: Record<string, unknown>,
  c: Call<R[]> & { waitMs?: number; tries?: number },
): Promise<R[]> {
  const posted = await aisa<any>(job, `dataforseo/${postPath.replace(/^\//, '')}`, { body: [task] }, {
    ...c, reason: `${c.reason} (post)`, dry: () => ({ status_code: 20000, tasks: [{ id: 'dry-task', status_code: 20100 }] }),
  });
  const id = posted?.tasks?.[0]?.id;
  const st = posted?.tasks?.[0]?.status_code;
  if (!id || (st && st >= 40000)) throw new Error(`${c.vendor}: could not post the task (${posted?.tasks?.[0]?.status_message ?? 'no id'})`);
  const tries = c.tries ?? 3;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, (i === 0 ? c.waitMs ?? 20000 : 15000) * (process.env.OUTLAY_DRY === '1' ? 0 : 1)));
    const got = await aisa<any>(job, `dataforseo/${getPath(id).replace(/^\//, '')}`, {}, {
      ...c, reason: `${c.reason} (fetch ${i + 1})`, dry: () => ({ status_code: 20000, tasks: [{ id, status_code: 20000, result: c.dry() }] }),
    });
    const t = got?.tasks?.[0];
    if (t?.status_code === 20000) return (t.result ?? []) as R[];
    if (t?.status_code && t.status_code >= 40000 && t.status_code !== 40602) throw new Error(`${c.vendor}: ${t.status_message ?? t.status_code}`);
    job.log(c.agent, 'wait', `${c.vendor}: task not ready yet (${t?.status_message ?? 'queued'})`);
  }
  throw new Error(`${c.vendor}: the task was not ready after ${tries} checks`);
}

// ---------- Serper's other Google verticals (Orthogonal)

export type ShopHit = { title: string; source: string; link: string; price?: string; priceValue?: number; delivery?: string; rating?: number; ratingCount?: number; imageUrl?: string };

/** Google Shopping results for a query in a country (gl), $0.004. */
export async function shopping(job: Job, agent: Role, q: string, opts: { gl?: string; num?: number }, reason: string): Promise<ShopHit[]> {
  const data = await ortho<any>(job, 'serper/shopping', { body: { q, gl: opts.gl, num: opts.num ?? 20 } }, {
    agent, vendor: 'Serper Shopping (Orthogonal)', reason, expectUsd: 0.004, maxUsd: 0.008,
    dry: () => ({ shopping: [1, 2, 3, 4].map((i) => ({ title: `${q} (seller ${i})`, source: ['Jumia', 'Konga', 'Slot', 'Jiji'][i - 1], link: `https://example.com/p/${i}`, price: `₦${(40000 + i * 3500).toLocaleString()}`, rating: 4 + i / 10, ratingCount: 10 * i, delivery: i % 2 ? 'Free delivery' : undefined })) }),
  });
  return (data?.shopping ?? []).map((s: any) => ({
    title: s.title, source: s.source, link: s.link, price: s.price, priceValue: typeof s.priceValue === 'number' ? s.priceValue : undefined,
    delivery: s.delivery, rating: s.rating, ratingCount: s.ratingCount, imageUrl: s.imageUrl,
  }));
}

/** Google Lens: what an image shows and where it is sold, $0.006. */
export async function lens(job: Job, agent: Role, imageUrl: string, opts: { gl?: string }, reason: string): Promise<any> {
  return ortho<any>(job, 'serper/lens', { body: { url: imageUrl, gl: opts.gl } }, {
    agent, vendor: 'Serper Lens (Orthogonal)', reason, expectUsd: 0.006, maxUsd: 0.01,
    dry: () => ({ organic: [{ title: 'Matching product', source: 'Example store', link: 'https://example.com/match', price: '₦45,000' }] }),
  });
}
