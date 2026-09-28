import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi, usd, ngn, Avatar, ROLE_NAME, type Service, type Quote } from '../lib.tsx';

type QuotedOrder = { id: string; status: string; quote: Quote; demo: boolean };

export default function Hire() {
  const { service = '' } = useParams();
  const nav = useNavigate();
  const { data } = useApi<{ services: Service[]; mode: string }>('/api/services');
  const s = data?.services.find((x) => x.id === service);
  const [brief, setBrief] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('outlay:email') ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<QuotedOrder | null>(null);

  if (data && !s) return <main className="wrap section"><h2>Service not found</h2><Link to="/">Back to services</Link></main>;
  if (!s) return <main className="wrap section muted">Loading…</main>;

  async function getQuote() {
    setBusy(true); setErr(null); setOrder(null);
    try {
      localStorage.setItem('outlay:email', email);
      setOrder(await api<QuotedOrder>('/api/quote', { method: 'POST', body: JSON.stringify({ service, brief, email }) }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function begin(mode: 'promo' | 'simulated') {
    if (!order) return;
    setBusy(true); setErr(null);
    try {
      await api(`/api/orders/${order.id}/start`, { method: 'POST', body: JSON.stringify({ mode }) });
      nav(`/job/${order.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const q = order?.quote;

  return (
    <main className="wrap two">
      <section>
        <div className="eyebrow">{s.dept}</div>
        <h1 style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '0 0 8px' }}>{s.name}</h1>
        <p style={{ fontSize: 17, color: 'var(--ink-2)', margin: 0 }}>{s.tagline}</p>
        <ul className="check">{s.youGet.map((g) => <li key={g}>{g}</li>)}</ul>
        <div className="card pad" style={{ boxShadow: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>The team on this job</div>
          <div className="team">{s.team.map((r) => <span key={r} className="who"><Avatar role={r} />{ROLE_NAME[r] ?? r}</span>)}</div>
          <div style={{ display: 'flex', gap: 22, marginTop: 16, fontSize: 14 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Price</div><b className="mono">{s.priceUsd} USDC</b> <span className="muted">{ngn(s.priceUsd)}</span></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Typical tool cost</div><b className="mono">~{s.listedCostUsd} USDC</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Delivery</div><b>~{s.etaMin} min</b></div>
          </div>
        </div>
      </section>

      <section className="card pad">
        {!order || order.status === 'declined' ? (
          <div className="form">
            <label className="field">What do you need?
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={s.example} />
            </label>
            {s.example && <div><span className="chip" onClick={() => setBrief(s.example)}>Use the example: “{s.example.slice(0, 60)}…”</span></div>}
            <label className="field">Your email (we deliver here)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
            </label>
            {err && <div className="error">{err}</div>}
            {order?.status === 'declined' && <div className="error">The CFO declined this job: it can't be done profitably at this price. {order.quote.reasons.at(-1)}</div>}
            <button className="btn primary" disabled={busy || brief.trim().length < 12 || !email.includes('@')} onClick={getQuote}>{busy ? 'Asking the CFO…' : 'Get my quote'}</button>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>You'll see the exact price, the bond and the CFO's reasoning before anything starts.</p>
          </div>
        ) : (
          <div className="form">
            <div className="quote card pad" style={{ boxShadow: 'none' }}>
              <div className="head">
                <div>
                  <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Your quote from the CFO</div>
                  <div className="big">{q!.promo ? 'Free' : `${usd(q!.priceUsd)} USDC`}</div>
                  <div className="ngn">{q!.promo ? 'Your first job is on us' : ngn(q!.priceUsd)}</div>
                </div>
                <Avatar role="cfo" lg />
              </div>
              <div className="terms">
                <div className="term"><div className="k">Bond if rejected</div><div className="v">{q!.promo ? '—' : `${usd(q!.bondUsd)} USDC`}</div></div>
                <div className="term"><div className="k">Est. tool cost</div><div className="v">{usd(q!.estCostUsd, 3)}</div></div>
                <div className="term"><div className="k">Delivery</div><div className="v">~{s.etaMin} min</div></div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Why this price</div>
              <ol className="why">{q!.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
            </div>
            <div className="note" style={{ fontSize: 13.5 }}><b>Your brief:</b> {brief}</div>
            {err && <div className="error">{err}</div>}
            {q!.promo ? (
              <button className="btn primary" disabled={busy} onClick={() => begin('promo')}>Start my free job</button>
            ) : data?.mode === 'demo' ? (
              <>
                <button className="btn primary" disabled={busy} onClick={() => begin('simulated')}>Pay {usd(q!.priceUsd)} USDC (demo: no money moves)</button>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>Demo mode simulates the escrow payment. On the live site this step funds the job's escrow on Arc.</p>
              </>
            ) : (
              <p className="note">Escrow payment on Arc is being switched on. Check back shortly.</p>
            )}
            <button className="btn ghost sm" onClick={() => setOrder(null)}>Change the brief</button>
          </div>
        )}
      </section>
    </main>
  );
}
