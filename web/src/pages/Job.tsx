import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { api, usd, ngn, Avatar, ROLE_NAME, SERVICE_NAME, timeAgo, type Order, type Receipt, type Step } from '../lib.tsx';
import Office from '../office/Office.tsx';

function Stepper({ o }: { o: Order }) {
  const st = o.status;
  const working = ['queued', 'running', 'revision'].includes(st);
  const steps: { label: string; note: string; cls: string }[] = [
    { label: 'Ordered', note: o.payment ? (o.payment.mode === 'promo' ? 'Free first job' : o.payment.mode === 'simulated' ? 'Paid (demo)' : 'Paid into escrow') : 'Quoted', cls: 'done' },
    { label: st === 'revision' || (working && o.revisionNote) ? 'Revising' : 'Team working', note: working ? 'Live now' : `${o.runs.length} run${o.runs.length === 1 ? '' : 's'}`, cls: working ? 'now' : 'done' },
    { label: st === 'failed' ? 'Not delivered' : 'Delivered', note: o.deliveredAt ? timeAgo(o.deliveredAt) : st === 'failed' ? 'Refund + bond' : 'Soon', cls: st === 'failed' ? 'bad' : o.deliveredAt ? 'done' : '' },
    {
      label: st === 'accepted' ? 'Accepted' : st === 'rejected' ? 'Rejected' : 'Your decision',
      note: st === 'accepted' ? (o.decision?.by === 'auto' ? 'Auto after 48 h' : 'By you') : st === 'rejected' ? 'Refund + bond paid' : st === 'delivered' ? 'Waiting on you' : '48 h to decide',
      cls: st === 'accepted' ? 'done' : st === 'rejected' ? 'bad' : st === 'delivered' ? 'now' : '',
    },
  ];
  return <div className="stepper">{steps.map((s) => <div key={s.label} className={`s ${s.cls}`}><b>{s.label}</b><span>{s.note}</span></div>)}</div>;
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ul className="timeline">
      {steps.length === 0 && <li><Avatar role="cfo" /><span>The CFO is staffing the job…</span><time /></li>}
      {steps.map((s, i) => (
        <li key={i}><Avatar role={s.agent} /><div><b>{ROLE_NAME[s.agent] ?? s.agent}</b><span>{s.step}{s.note ? ` · ${s.note}` : ''}</span></div><time>{new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>
      ))}
    </ul>
  );
}

function PaperReceipt({ o, receipt }: { o: Order; receipt: Receipt[] }) {
  const q = o.quote;
  const spent = receipt.reduce((s, r) => s + r.usd, 0);
  const price = q.promo ? 0 : q.priceUsd;
  return (
    <div className="receipt">
      <div className="rh"><b>OUTLAY</b><span>{o.id} · {new Date(o.createdAt).toLocaleDateString()}</span></div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>Every tool the team bought for this job</div>
      <hr />
      <div className="scroll">
        {receipt.length === 0 && <div className="empty">Nothing bought yet</div>}
        {receipt.map((r, i) => (
          <div key={i} className="ln">
            <span className="who"><Avatar role={r.agent} />{r.vendor}</span>
            <span className="v">{r.usd.toFixed(4)}</span>
            <span className="why">{r.reason}{r.dry ? ' · demo' : ` · ${r.transaction.slice(0, 10)}…`}</span>
          </div>
        ))}
      </div>
      <hr />
      <div className="tot"><span>Tools ({receipt.length})</span><span>{spent.toFixed(4)}</span></div>
      <div className="tot"><span>You pay{q.promo ? ' (free)' : ''}</span><span>{price.toFixed(2)}</span></div>
      <hr />
      <div className="tot big"><span>Outlay's margin</span><span>{(price - spent).toFixed(4)}</span></div>
      <div className="foot">USDC · {o.demo ? 'demo receipt, no money moved' : 'paid per call via x402 on Arc'}</div>
    </div>
  );
}

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
  const html = useMemo(() => (last?.deliverable ? DOMPurify.sanitize(marked.parse(last.deliverable, { async: false }) as string) : ''), [last?.deliverable]);

  async function decide(action: 'accept' | 'reject' | 'revise') {
    setBusy(true); setErr(null);
    try {
      localStorage.setItem('outlay:email', email);
      setO(await api<Order>(`/api/orders/${id}/${action}`, { method: 'POST', body: JSON.stringify({ email, note }) }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !o) return <main className="wrap section center"><h1 className="h1">Couldn't find this job.</h1><p className="muted" style={{ margin: '12px 0 24px' }}>{err}</p><Link to="/" className="btn secondary">Back to Outlay</Link></main>;
  if (!o) return <main className="wrap section"><div className="skel" style={{ height: 480 }} /></main>;
  const q = o.quote;

  return (
    <main className="wrap">
      <div className="pagehead" style={{ paddingBottom: 0 }}>
        <div className="crumbs"><Link to={`/hire/${o.service}`}>{SERVICE_NAME[o.service] ?? o.service}</Link><span>/</span><span className="mono" style={{ fontSize: 13 }}>{o.id}</span></div>
        <div className="jobhead">
          <div>
            <h1 className="h1">{o.brief.length > 110 ? o.brief.slice(0, 110) + '…' : o.brief}</h1>
            <div className="meta">Ordered {timeAgo(o.createdAt)} by {o.email}{o.demo && ' · demo mode: no real money moved'}</div>
          </div>
          <span className={`badge ${o.status}`}><span className="dot" />{o.status === 'queued' ? 'starting' : o.status}</span>
        </div>
        <Stepper o={o} />
      </div>

      <div className="jobgrid">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, minWidth: 0 }}>
          <div className="minioffice">
            <Office orderId={o.id} team={(o as any).team} idleReplayMs={0} replayToken={replay} />
            <div className="overlay">
              {active ? <span className="chip live"><span className="dot" />Live: the team on your job</span>
                : o.runs.length > 0 && <button className="btn secondary sm" onClick={() => setReplay((x) => x + 1)}>▶ Replay this job</button>}
            </div>
          </div>

          {last?.qa && !active && (
            <div className={`qa ${last.qa.verdict === 'pass' ? 'pass' : 'revise'}`}>
              <Avatar role="auditor" />
              <div><b>Auditor {last.qa.verdict === 'pass' ? 'passed it' : 'flagged issues'}</b> <span style={{ opacity: .75 }}>· checked by {last.qa.model}</span>{last.qa.notes && <div style={{ fontSize: 13.5, marginTop: 2 }}>{last.qa.notes}</div>}</div>
            </div>
          )}

          {html && !active ? (
            <section className="card pad">
              <div className="dochead">
                <h3>Your deliverable</h3>
                <div className="btns">
                  {last!.files.map((f) => <a key={f} className="btn secondary sm" href={`/api/orders/${o.id}/files/${f}`}>↓ {f}</a>)}
                  <a className="btn secondary sm" href={`/api/orders/${o.id}/files/deliverable.md`}>↓ .md</a>
                </div>
              </div>
              <div className="deliverable" dangerouslySetInnerHTML={{ __html: html }} />
              <details style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14.5 }}>How the team did it · {steps.length} steps</summary>
                <div style={{ marginTop: 10 }}><Timeline steps={steps} /></div>
              </details>
            </section>
          ) : (
            <section className="card pad">
              <h3 className="t">{active ? 'The team is working' : 'Work log'} <small>{active ? 'updates live' : ''}</small></h3>
              <Timeline steps={steps} />
            </section>
          )}
        </div>

        <aside>
          <section className="card pad">
            <h3 className="t">Your decision</h3>
            {o.status === 'delivered' ? (
              <div className="form" style={{ gap: 14 }}>
                <p style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
                  {q.promo ? 'This one was free. Tell us if it was good.' : <>Accept to release <b>{usd(q.priceUsd)} USDC</b>. Reject and you get it all back <b>plus a {usd(q.bondUsd)} USDC bond</b>.</>} Silence for 48 h counts as acceptance.
                </p>
                <label className="field">Confirm with your email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
                </label>
                {o.revisionNote === undefined && (
                  <label className="field">Want changes? <span className="hint">One free revision.</span>
                    <textarea style={{ minHeight: 76 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. focus on Ikoyi too, and add opening hours" />
                  </label>
                )}
                <div className="decide">
                  <button className="btn primary block" disabled={busy || !email} onClick={() => decide('accept')}>Accept the work</button>
                  <div className="row">
                    {o.revisionNote === undefined && <button className="btn secondary" disabled={busy || !email || !note.trim()} onClick={() => decide('revise')}>Revise</button>}
                    <button className="btn danger" disabled={busy || !email} onClick={() => decide('reject')} style={o.revisionNote !== undefined ? { gridColumn: 'span 2' } : undefined}>Reject{q.promo ? '' : ' & refund'}</button>
                  </div>
                </div>
                {err && <div className="error">{err}</div>}
              </div>
            ) : o.status === 'accepted' ? (
              <div className="qa pass"><Avatar role="cfo" /><div>Accepted {o.decision?.by === 'auto' ? 'automatically after 48 h' : 'by you'} · {timeAgo(o.decision!.at)}. Thank you.</div></div>
            ) : o.status === 'rejected' ? (
              <div className="qa revise"><Avatar role="cfo" /><div>Rejected{o.refund ? `: ${usd(o.refund.priceUsd)} refunded + ${usd(o.refund.bondUsd)} bond paid` : ''}. The CFO will learn from this.</div></div>
            ) : o.status === 'failed' ? (
              <div className="qa revise"><Avatar role="cfo" /><div>We couldn't deliver this one{o.refund ? `: ${usd(o.refund.priceUsd)} refunded + ${usd(o.refund.bondUsd)} bond paid` : ''}. {last?.error}</div></div>
            ) : (
              <p className="muted" style={{ fontSize: 14.5 }}>You'll decide once the work is delivered, usually within a few minutes. You can close this page; we'll email you.</p>
            )}
          </section>

          <PaperReceipt o={o} receipt={receipt} />

          <section className="card pad" style={{ marginTop: 6 }}>
            <h3 className="t">The deal</h3>
            <div className="srow"><span className="lbl">Price</span><span className="fill" /><span className="v">{q.promo ? 'Free' : `${usd(q.priceUsd)} USDC`}</span></div>
            {!q.promo && <div className="srow"><span className="lbl">In naira</span><span className="fill" /><span className="v">{ngn(q.priceUsd)}</span></div>}
            <div className="srow"><span className="lbl">Bond if rejected</span><span className="fill" /><span className="v">{q.promo ? '—' : `${usd(q.bondUsd)} USDC`}</span></div>
            <div className="srow"><span className="lbl">Paid via</span><span className="fill" /><span className="v" style={{ fontFamily: 'var(--sans)' }}>{o.payment ? (o.payment.mode === 'promo' ? 'Free first job' : o.payment.mode === 'simulated' ? 'Demo escrow' : 'Escrow on Arc') : '—'}</span></div>
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Why the CFO priced it this way</summary>
              <ol className="why">{q.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
            </details>
          </section>
          <p className="muted" style={{ fontSize: 13.5 }}>Every receipt here is public. <Link to="/books">See the company's books →</Link></p>
        </aside>
      </div>
    </main>
  );
}
