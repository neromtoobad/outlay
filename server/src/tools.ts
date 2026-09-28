// Paid tools on Arc mainnet (x402 via Circle Gateway). Prices are the listed amounts from
// Circle's discovery API on 2026-09-22/27; each call is capped a little above list.
import { buy } from './x402.ts';
import { MODELS } from './config.ts';
import type { Job } from './job.ts';
import type { Role } from './wallets.ts';

export const HOSTS = {
  blockrun: 'nano.blockrun.ai',
  orthogonal: 'np.orthogonal.com',
  exa: 'api.exa.ai',
} as const;

// ---------- search & read

export type SearchHit = { title: string; link: string; snippet: string };

export async function webSearch(job: Job, agent: Role, q: string, reason: string): Promise<SearchHit[]> {
  const data = await buy<any>(job, {
    agent, vendor: 'Serper (Orthogonal)', url: `https://${HOSTS.orthogonal}/serper/search`,
    body: { q, num: 10 }, reason, expectUsd: 0.002, maxUsd: 0.005,
    dryData: () => ({ organic: [1, 2, 3].map((i) => ({ title: `Result ${i} for ${q}`, link: `https://example.com/${encodeURIComponent(q)}/${i}`, snippet: `Snippet ${i} about ${q}.` })) }),
  });
  return (data?.organic ?? []).map((o: any) => ({ title: o.title, link: o.link, snippet: o.snippet ?? '' }));
}

export async function neuralSearch(job: Job, agent: Role, query: string, reason: string, numResults = 6): Promise<SearchHit[]> {
  const data = await buy<any>(job, {
    agent, vendor: 'Exa search', url: `https://${HOSTS.exa}/search`,
    body: { query, numResults, type: 'auto', contents: { highlights: true } }, reason, expectUsd: 0.007, maxUsd: 0.012,
    dryData: () => ({ results: [1, 2].map((i) => ({ title: `Exa ${i}: ${query}`, url: `https://example.org/exa/${i}`, highlights: [`Key finding ${i} about ${query}.`] })) }),
  });
  return (data?.results ?? []).map((r: any) => ({ title: r.title ?? r.url, link: r.url, snippet: (r.highlights ?? []).join(' … ') }));
}

export type Page = { url: string; title: string; text: string };

export async function readPages(job: Job, agent: Role, urls: string[], reason: string): Promise<Page[]> {
  if (!urls.length) return [];
  const data = await buy<any>(job, {
    agent, vendor: 'Exa contents', url: `https://${HOSTS.exa}/contents`,
    body: { urls, text: { maxCharacters: 6000 } }, reason, expectUsd: 0.001 * urls.length, maxUsd: 0.002 * urls.length + 0.002,
    dryData: () => ({ results: urls.map((u) => ({ url: u, title: `Page ${u}`, text: `Body text of ${u}. It contains facts, prices and names relevant to the brief.` })) }),
  });
  return (data?.results ?? []).map((r: any) => ({ url: r.url, title: r.title ?? r.url, text: String(r.text ?? '').slice(0, 6000) }));
}

export type Place = { title: string; address?: string; phone?: string; website?: string; rating?: number; ratingCount?: number; category?: string };

export async function mapsSearch(job: Job, agent: Role, q: string, location: string, reason: string): Promise<Place[]> {
  const data = await buy<any>(job, {
    agent, vendor: 'Serper Maps (Orthogonal)', url: `https://${HOSTS.orthogonal}/serper/maps`,
    body: { q: `${q} ${location}` }, reason, expectUsd: 0.006, maxUsd: 0.01,
    dryData: () => ({ places: [1, 2, 3].map((i) => ({ title: `${q} ${i}`, address: `${i} Admiralty Way, ${location}`, phoneNumber: `+234 800 000 000${i}`, rating: 4 + i / 10, ratingCount: 10 * i, category: q })) }),
  });
  return (data?.places ?? []).map((p: any) => ({ title: p.title, address: p.address, phone: p.phoneNumber, website: p.website, rating: p.rating, ratingCount: p.ratingCount, category: p.category ?? p.type }));
}

// ---------- LLM (BlockRun, OpenAI-compatible)

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function llm(job: Job, agent: Role, messages: Msg[], reason: string, opts: { model?: string; maxTokens?: number; json?: boolean; dry?: () => string } = {}): Promise<string> {
  const model = opts.model ?? MODELS.maker;
  const data = await buy<any>(job, {
    agent, vendor: `BlockRun ${model.split('/')[1]}`, url: `https://${HOSTS.blockrun}/api/v1/chat/completions`,
    body: { model, messages, max_tokens: opts.maxTokens ?? 1800, ...(opts.json ? { response_format: { type: 'json_object' } } : {}) },
    reason, expectUsd: 0.01, maxUsd: 0.08,
    dryData: () => ({ choices: [{ message: { content: opts.dry ? opts.dry() : `(dry) ${reason}` } }] }),
  });
  return String(data?.choices?.[0]?.message?.content ?? '');
}

export function parseJson<T>(s: string, fallback: T): T {
  const m = s.match(/\{[\s\S]*\}/);
  try {
    return m ? (JSON.parse(m[0]) as T) : fallback;
  } catch {
    return fallback;
  }
}
