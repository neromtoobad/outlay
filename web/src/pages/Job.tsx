import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { api, usd, ngn, Avatar, ROLE_NAME, timeAgo, type Order, type Receipt, type Step } from '../lib.tsx';
import Office from '../office/Office.tsx';

const SERVICE_NAME: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };

export default function Job() {
  const { id = '' } = useParams();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState(() => localStorage.getItem('outlay:email') ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(0);

  const load = () => api<Order>(`/api/orders/${id}`).then(setO).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  const active = o && ['queued', 'running', 'revision'].includes(o.status);
  // A delivered order can still change from elsewhere (another tab, the 48 h auto-accept), so keep listening.
  const listening = active || o?.status === 'delivered';
  useEffect(() => {
    if (!listening) return;
    const es = new EventSource(`/api/events?order=${id}`);
    const bump = () => load();
    es.addEventListener('step', bump);
    es.addEventListener('purchase', bump);
    es.addEventListener('order', bump);
    const t = active ? setInterval(load, 4000) : undefined;
    return () => { es.close(); clearInterval(t); };
  }, [id, listening, active]);

  const last = o?.runs.at(-1);
  const running = o?.live && (!last || last.id !== o.live.jobId) && active ? o.live : null;
  const steps: Step[] = running?.steps ?? last?.steps ?? [];
  const receipt: Receipt[] = running?.receipt ?? last?.receipt ?? [];
  const spent = receipt.reduce((s, r) => s + r.usd, 0);
  const html = useMemo(() => (last?.deliverable ? DOMPurify.sanitize(marked.parse(last.deliverable, { async: false }) as string) : ''), [last?.deliverable]);

  async function decide(action: 'accept' | 'reject' | 'revise') {
    setBusy(true); setErr(null);
    try {
      localStorage.setItem('outlay:email', email);
      setO(await api<Order>(`/api/orders/${id}/${action}`, { method: 'POST', body: JSON.stringify({ email, note }) }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !o) return <main className="wrap section"><h2>Couldn't load this job</h2><p className="muted">{err}</p><Link to="/">Back to services</Link></main>;
  if (!o) return <main className="wrap section muted">Loading…</main>;
  const q = o.quote;
  const price = q.promo ? 0 : q.priceUsd;

  return (
    <main className="wrap">
      <div className="jobhead">
        <div>
          <div className="eyebrow">{SERVICE_NAME[o.service] ?? o.service} · {o.id}</div>
          <h1>{o.brief.length > 90 ? o.brief.slice(0, 90) + '…' : o.brief}</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Ordered {timeAgo(o.createdAt)} by {o.email}{o.demo && ' · demo mode: no real money moved'}</div>
        </div>
        <span className={`badge ${o.status}`}><span className="dot" />{o.status === 'queued' ? 'starting' : o.status}</span>
      </div>

      <div className="jobgrid">
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="minioffice">
            <Office orderId={o.id} team={(o as any).team} idleReplayMs={0} replayToken={replay} />
            <div className="overlay">
              {active ? <span className="pill live"><span className="dot" />Live: the team on your job</span>
                : o.runs.length > 0 && <button className="btn secondary sm" onClick={() => setReplay((x) => x + 1)}>▶ Replay this job</button>}
            </div>
          </div>
          {last?.qa && o.status !== 'running' && (
            <div className={`qa ${last.qa.verdict === 'pass' ? 'pass' : 'revise'}`}>
              <Avatar role="auditor" />
              <div><b>Auditor: {last.qa.verdict === 'pass' ? 'passed' : 'flagged issues'}</b> <span style={{ opacity: .8 }}>· checked by {last.qa.model}</span>{last.qa.notes && <div style={{ fontSize: 13, marginTop: 2 }}>{last.qa.notes}</div>}</div>
            </div>
          )}

          {html ? (
            <section className="card pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Your deliverable</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {last!.files.map((f) => <a key={f} className="btn secondary sm" href={`/api/orders/${o.id}/files/${f}`}>Download {f}</a>)}
                  <a className="btn secondary sm" href={`/api/orders/${o.id}/files/deliverable.md`}>Download .md</a>
                </div>
              </div>
              <div className="deliverable" dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          ) : (
            <section className="card pad">
              <h3>The team is working</h3>
              <ul className="timeline">
                {steps.length === 0 && <li><Avatar role="cfo" /><span>The CFO is staffing the job…</span><time /></li>}
                {steps.map((s, i) => (
                  <li key={i}><Avatar role={s.agent} /><div><b>{ROLE_NAME[s.agent] ?? s.agent}</b> <span>{s.step}{s.note ? ` · ${s.note}` : ''}</span></div><time>{new Date(s.at).toLocaleTimeString()}</time></li>
                ))}
              </ul>
            </section>
          )}

          <section className="card pad">
            <h3>Receipt <small>every tool the team bought for this job</small></h3>
            <div className="tblwrap">
              <table className="tbl">
                <thead><tr><th>Agent</th><th>Bought</th><th>Why</th><th className="num">USDC</th></tr></thead>
                <tbody>
                  {receipt.length === 0 && <tr><td colSpan={4} className="muted">Nothing bought yet.</td></tr>}
                  {receipt.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Avatar role={r.agent} />{ROLE_NAME[r.agent] ?? r.agent}</span></td>
                      <td>{r.vendor}<div className="ref">{r.dry ? 'demo · no payment' : `x402 · ${r.transaction.slice(0, 14)}…`}</div></td>
                      <td style={{ color: 'var(--ink-2)' }}>{r.reason}</td>
                      <td className="num">{usd(r.usd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Tool cost</td><td className="num">{usd(spent, 4)}</td></tr>
                  <tr><td colSpan={3}>You pay{q.promo ? ' (first job free)' : ''}</td><td className="num">{usd(price, 2)}</td></tr>
                  <tr><td colSpan={3}>Outlay's margin</td><td className="num">{usd(price - spent, 4)}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: 18 }}>
          <section className="card pad">
            <h3>Your decision</h3>
            {o.status === 'delivered' ? (
              <div className="form">
                <p className="note" style={{ margin: 0 }}>
                  {q.promo ? 'This one was free. Tell us if it was good.' : <>Accept to release {usd(price)} USDC. Reject and you get it all back <b>plus a {usd(q.bondUsd)} USDC bond</b>.</>} Silence for 48 h counts as acceptance.
                </p>
                <label className="field">Confirm with the email you ordered with
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
                </label>
                {o.revisionNote === undefined && (
                  <label className="field">Want changes? (one free revision)
                    <textarea style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. focus on Ikoyi too, and add opening hours" />
                  </label>
                )}
                <div className="decide">
                  <button className="btn primary" disabled={busy || !email} onClick={() => decide('accept')}>Accept</button>
                  {o.revisionNote === undefined && <button className="btn secondary" disabled={busy || !email || !note.trim()} onClick={() => decide('revise')}>Request revision</button>}
                  <button className="btn danger" disabled={busy || !email} onClick={() => decide('reject')}>Reject{q.promo ? '' : ' & refund'}</button>
                </div>
                {err && <div className="error">{err}</div>}
              </div>
            ) : o.status === 'accepted' ? (
              <p className="qa pass" style={{ margin: 0 }}>Accepted {o.decision?.by === 'auto' ? 'automatically after 48 h' : 'by you'} · {timeAgo(o.decision!.at)}. Thank you.</p>
            ) : o.status === 'rejected' ? (
              <p className="qa revise" style={{ margin: 0 }}>Rejected{o.refund ? `: ${usd(o.refund.priceUsd)} refunded + ${usd(o.refund.bondUsd)} bond paid` : ''}. The CFO will learn from this.</p>
            ) : o.status === 'failed' ? (
              <p className="qa revise" style={{ margin: 0 }}>We couldn't deliver this one{o.refund ? `: ${usd(o.refund.priceUsd)} refunded + ${usd(o.refund.bondUsd)} bond paid` : ''}. {last?.error}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>You'll decide once the work is delivered. Usually a few minutes.</p>
            )}
          </section>

          <section className="card pad">
            <h3>The deal</h3>
            <table className="tbl">
              <tbody>
                <tr><td>Price</td><td className="num">{q.promo ? 'Free' : `${usd(q.priceUsd)} USDC`}</td></tr>
                {!q.promo && <tr><td>Naira</td><td className="num">{ngn(q.priceUsd)}</td></tr>}
                <tr><td>Bond if rejected</td><td className="num">{q.promo ? '—' : `${usd(q.bondUsd)} USDC`}</td></tr>
                <tr><td>Paid via</td><td className="num">{o.payment ? (o.payment.mode === 'promo' ? 'free first job' : o.payment.mode === 'simulated' ? 'demo (simulated)' : 'escrow on Arc') : '—'}</td></tr>
              </tbody>
            </table>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Why the CFO priced it this way</summary>
              <ol className="why" style={{ marginTop: 8 }}>{q.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
            </details>
          </section>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Share this page: every receipt is public. <Link to="/books">See the company's books →</Link></p>
        </aside>
      </div>
    </main>
  );
}
