import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, usd, timeAgo } from '../lib.tsx';

type Entry = { date: string; narration: string; postings: { account: string; amount: number }[]; meta: { doc?: string; tx?: string; agent?: string; reason?: string; kind: string } };
type Books = {
  mode: 'demo' | 'live'; asOf: string;
  counters: { orders: number; customers: number; delivered: number; accepted: number; rejected: number; acceptanceRate: number | null; freeJobs: number; toolCalls: number };
  pnl: { revenue: number; tools: number; experts: number; guarantee: number; grossMargin: number; byVendor: Record<string, number>; byService: Record<string, number>; bondsPaid: number; refunds: number };
  perService: Record<string, { jobs: number; avgCost: number; price: number; accepted: number; decided: number; free: number }>;
  daily: { date: string; revenue: number; costs: number }[];
  vault: null | { vault: string; escrow: string; buckets: Record<string, number>; bondsOutstanding: number; reserveFloor: number };
  ledger: Entry[];
  recentOrders: { id: string; service: string; status: string; price: number; promo: boolean; createdAt: string; cost: number }[];
};

const NAME: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };
const BUCKETS: [string, string, string][] = [
  ['operating', 'Operating', 'Paid-in revenue and owner funding'],
  ['tools', 'Tool budgets', 'Waiting to be topped up into agents’ Gateway balances'],
  ['bond', 'Bond pool', 'Backs every guarantee we have quoted'],
  ['reserve', 'Reserve', 'Runway the CFO may not touch below the floor'],
  ['promo', 'Promo', 'Pays for free first jobs, capped per epoch'],
];

function Bars({ rows, gold }: { rows: { label: string; value: number; note?: string }[]; gold?: boolean }) {
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className="bars" onMouseLeave={() => setTip(null)}>
      {rows.map((r) => (
        <div key={r.label} className="bar" onMouseMove={(e) => setTip({ x: e.clientX + 12, y: e.clientY + 12, t: `${r.label}: ${usd(r.value, 4)} USDC${r.note ? ` · ${r.note}` : ''}` })}>
          <span>{r.label}</span>
          <span className="track"><span className={`fill${gold ? ' gold' : ''}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="num">{usd(r.value, r.value < 1 ? 4 : 2)}</span>
        </div>
      ))}
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
    </div>
  );
}

export default function Books() {
  const { data: b, error } = useApi<Books>('/api/books', 10000);
  if (error) return <main className="wrap section"><h2>Books unavailable</h2><p className="muted">{error}</p></main>;
  if (!b) return <main className="wrap section muted">Loading the books…</main>;
  const c = b.counters, p = b.pnl;
  const vendors = Object.entries(p.byVendor).sort((a, z) => z[1] - a[1]).map(([label, value]) => ({ label, value }));

  return (
    <main className="wrap" style={{ paddingBottom: 60 }}>
      <div style={{ padding: '34px 0 8px' }}>
        <div className="eyebrow">Open books</div>
        <h1 style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '0 0 6px' }}>Every dollar this AI company makes and spends</h1>
        <p style={{ color: 'var(--ink-2)', margin: 0, maxWidth: 720 }}>
          An AI CFO runs Outlay's money. These books are generated from the same records that move it: job receipts, escrow and the vault on Arc. Updated {timeAgo(b.asOf)}.
        </p>
        {b.mode === 'demo' && <div className="banner"><b>Demo mode.</b> These numbers come from simulated jobs: no real money moved and the receipts are marked “demo”. Live figures from Arc mainnet replace them when the treasury is funded.</div>}
      </div>

      <section style={{ padding: '18px 0' }}>
        <div className="kpis">
          <div className="card stat"><div className="k">Revenue</div><div className="v">{usd(p.revenue)}<small>USDC</small></div><div className="d">accepted, paid jobs only</div></div>
          <div className="card stat"><div className="k">Tool spend on Arc</div><div className="v">{usd(p.tools, 3)}<small>USDC</small></div><div className="d">{c.toolCalls} x402 payments</div></div>
          <div className="card stat"><div className="k">Gross margin</div><div className="v" style={{ color: p.grossMargin < 0 ? 'var(--bad)' : undefined }}>{usd(p.grossMargin, 3)}<small>USDC</small></div><div className="d">revenue − tools − experts − bonds</div></div>
          <div className="card stat"><div className="k">Acceptance</div><div className="v">{c.acceptanceRate == null ? '—' : `${Math.round(c.acceptanceRate * 100)}%`}</div><div className="d">{c.accepted} accepted · {c.rejected} rejected</div></div>
          <div className="card stat"><div className="k">Jobs delivered</div><div className="v">{c.delivered}</div><div className="d">{c.freeJobs} were free first jobs</div></div>
          <div className="card stat"><div className="k">Customers</div><div className="v">{c.customers}</div><div className="d">{c.orders} orders</div></div>
          <div className="card stat"><div className="k">Refunds + bonds paid</div><div className="v">{usd(p.refunds + p.bondsPaid)}<small>USDC</small></div><div className="d">{usd(p.bondsPaid)} of it bonds</div></div>
          <div className="card stat"><div className="k">Expert reviews</div><div className="v">{usd(p.experts)}<small>USDC</small></div><div className="d">paid to human reviewers</div></div>
        </div>
      </section>

      <div className="row2" style={{ padding: '6px 0 18px' }}>
        <section className="card pad">
          <h3>Where the money sits <small>OutlayVault on Arc</small></h3>
          {b.vault ? (
            <>
              <Bars rows={BUCKETS.map(([k, label, note]) => ({ label, value: b.vault!.buckets[k] ?? 0, note }))} />
              <p className="muted" style={{ fontSize: 13, margin: '14px 0 0' }}>
                Bonds outstanding {usd(b.vault.bondsOutstanding)} USDC (the bond pool must always cover them) · reserve floor {usd(b.vault.reserveFloor)} USDC · vault <span className="mono">{b.vault.vault.slice(0, 10)}…</span>
              </p>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>The vault isn't deployed on mainnet yet. When it is, this chart reads its five buckets live from the chain. The policy it will enforce:</p>
              <ul className="rules">
                {BUCKETS.map(([k, label, note]) => <li key={k}><b>{label}</b>: {note}</li>)}
                <li>The CFO can move money <b>between</b> buckets but has no way to send it anywhere else. Moves over 2 USDC need the owner's signature.</li>
              </ul>
            </>
          )}
        </section>
        <section className="card pad">
          <h3>Tool spend by vendor <small>all paid per call via x402</small></h3>
          {vendors.length ? <Bars rows={vendors} gold /> : <p className="muted">No purchases yet.</p>}
        </section>
      </div>

      <section className="card pad" style={{ marginBottom: 18 }}>
        <h3>Unit economics <small>per service, measured, not estimated</small></h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Service</th><th className="num">Jobs</th><th className="num">List price</th><th className="num">Avg tool cost</th><th className="num">Margin / job</th><th className="num">Accepted</th></tr></thead>
            <tbody>
              {Object.entries(b.perService).map(([k, s]) => (
                <tr key={k}>
                  <td>{NAME[k] ?? k}</td>
                  <td className="num">{s.jobs}{s.free ? <span className="muted"> ({s.free} free)</span> : null}</td>
                  <td className="num">{usd(s.price)}</td>
                  <td className="num">{usd(s.avgCost, 4)}</td>
                  <td className="num">{usd(s.price - s.avgCost, 3)}</td>
                  <td className="num">{s.decided ? `${s.accepted}/${s.decided}` : '—'}</td>
                </tr>
              ))}
              {!Object.keys(b.perService).length && <tr><td colSpan={6} className="muted">No jobs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pad" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h3>The ledger <small>double-entry, every line linked to its job and payment</small></h3>
          <a className="btn secondary sm" href="/api/books.beancount">Download beancount file</a>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>What happened</th><th>Accounts</th><th className="num">USDC</th><th>Job / ref</th></tr></thead>
            <tbody>
              {b.ledger.slice(0, 60).map((e, i) => {
                const debit = e.postings.filter((x) => x.amount > 0);
                return (
                  <tr key={i}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                    <td>{e.narration}{e.meta.reason && <div className="ref">{e.meta.reason}</div>}</td>
                    <td className="ref">{e.postings.map((x) => <div key={x.account}>{x.amount > 0 ? 'Dr' : 'Cr'} {x.account}</div>)}</td>
                    <td className="num">{usd(debit.reduce((s, x) => s + x.amount, 0), 4)}</td>
                    <td className="ref">{e.meta.doc ? <Link to={`/job/${e.meta.doc}`}>{e.meta.doc}</Link> : '—'}<div>{e.meta.tx === 'dry-run' ? 'demo' : e.meta.tx?.slice(0, 12)}</div></td>
                  </tr>
                );
              })}
              {!b.ledger.length && <tr><td colSpan={5} className="muted">No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pad">
        <h3>How we count</h3>
        <ul className="rules">
          <li><b>Revenue</b> is only paid jobs the customer accepted, or that auto-accepted after 48 h of silence. Free first jobs are never revenue.</li>
          <li><b>Tool spend</b> is every x402 payment our agents made, each linked to the job and the reason it was bought.</li>
          <li><b>Refunds and bonds</b> count as costs on the day they're paid.</li>
          <li><b>Demo data and live data are never mixed.</b> In demo mode nothing here is real money, and it says so.</li>
          <li>Money we send to ourselves (treasury → agent budgets) is never counted as “value moved”.</li>
        </ul>
      </section>
    </main>
  );
}
