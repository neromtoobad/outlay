import { useEffect, useState } from 'react';

export const NGN_PER_USD = 1330; // ≈ market rate, Sep 2026; shown as an approximation only

export const usd = (x: number, d = 2) => `${x.toFixed(d)}`;
export const ngn = (x: number) => `≈ ₦${Math.round(x * NGN_PER_USD).toLocaleString('en-NG')}`;

export const ROLE_NAME: Record<string, string> = {
  cfo: 'The Chartoularios (CFO)', scout: 'Scout', researcher: 'Researcher', writer: 'Writer', illustrator: 'Illustrator',
  verifier: 'Verifier', mailer: 'Mailer', reader: 'Reader', analyst: 'Analyst', messenger: 'Messenger', auditor: 'Auditor',
  producer: 'Producer', bookkeeper: 'Bookkeeper', linguist: 'Linguist', investigator: 'Investigator',
};
const HAS_ART = new Set(['cfo', 'scout', 'researcher', 'writer', 'illustrator', 'verifier', 'mailer', 'reader', 'analyst', 'messenger', 'auditor']);

export function Avatar({ role, lg }: { role: string; lg?: boolean }) {
  const img = HAS_ART.has(role) ? `url(/sprites/${role}/${role}-0.png)` : undefined;
  return <span className={`avatar${lg ? ' lg' : ''}`} style={{ backgroundImage: img }} title={ROLE_NAME[role] ?? role} />;
}

export function Seal({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs><radialGradient id="lead" cx="40%" cy="35%"><stop offset="0" stopColor="#a4a9b0" /><stop offset="1" stopColor="#5d626a" /></radialGradient></defs>
      <circle cx="32" cy="32" r="30" fill="url(#lead)" stroke="#43474e" strokeWidth="2" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#d6dae0" strokeOpacity=".6" strokeWidth="1.5" strokeDasharray="2 3" />
      <text x="32" y="41.5" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="27" fill="#f4f1ea">O</text>
    </svg>
  );
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

export function useApi<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => api<T>(path).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    load();
    const t = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
  }, [path, refreshMs]);
  return { data, error, setData };
}

export const timeAgo = (iso: string) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export type Service = {
  id: string; name: string; dept: string; live: boolean; priceUsd: number; listedCostUsd: number; etaMin: number;
  tagline: string; youGet: string[]; team: string[]; example: string;
};
export type Quote = { priceUsd: number; promo: boolean; bondUsd: number; bondBps: number; estCostUsd: number; pAccept: number; expectedProfitUsd: number; decision: 'quote' | 'decline'; deliverHours: number; reasons: string[] };
export type Receipt = { at: string; agent: string; vendor: string; usd: number; transaction: string; reason: string; dry: boolean };
export type Step = { at: string; agent: string; step: string; note: string };
export type Run = { id: string; status: string; steps: Step[]; receipt: Receipt[]; deliverable: string; files: string[]; qa?: { verdict: string; notes: string; model: string }; spentUsd: number; error?: string };
export type Order = {
  id: string; service: string; brief: string; email: string; createdAt: string; quote: Quote; status: string;
  payment?: { mode: string; at: string; tx?: string }; runs: Run[]; revisionNote?: string; deliveredAt?: string;
  decision?: { kind: string; at: string; by: string; note?: string }; refund?: { priceUsd: number; bondUsd: number }; demo: boolean;
  live: { jobId: string; steps: Step[]; receipt: Receipt[] } | null;
};
