'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, Reveal, Stagger, StaggerItem } from '@/components/motion.tsx';
import { api, useApi, usd, ngn, Avatar, Sprite, Seal, ROLE_NAME, DEPT_TINT, useStored, type Service, type Quote } from '@/lib.tsx';

type QuotedOrder = { id: string; status: string; quote: Quote; demo: boolean };

const EXAMPLES: Record<string, string[]> = {
  'local-business-finder': ['Every café and coffee shop in Lekki Phase 1 that has no website', 'Pharmacies in Yaba, Lagos with a phone number', 'Hair salons in Wuse 2, Abuja rated 4 stars or more'],
  'lead-list': ['25 fitness studios and gyms in Lekki and Ikoyi for my smoothie delivery business', 'Boutique hotels in Victoria Island for our laundry service', 'Private schools in Ikeja for our school-bus app'],
  'research-brief': ['Competitors and pricing for a small bakery in Lekki that wants to add cake delivery', 'Is there demand for solar inverter rentals in Ibadan?', 'How do Lagos co-working spaces price day passes?'],
};

function QuoteDoc({ s, order }: { s: Service; order: QuotedOrder }) {
  const q = order.quote;
  return (
    <motion.div className="quotedoc" initial={{ opacity: 0, y: 40, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
      <div className="top">
        <div><div className="k">Quote from the CFO</div><div className="id">{order.id}</div></div>
      </div>
      <motion.span className="stamp" initial={{ scale: 2.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 0.95, rotate: -12 }} transition={{ delay: 0.55, type: 'spring', stiffness: 420, damping: 16 }}><Seal size={78} /></motion.span>
      <div className="price">{q.promo ? 'Free' : usd(q.priceUsd)}{!q.promo && <small>USDC</small>}</div>
      <div className="ngn">{q.promo ? 'Your first job is on us' : ngn(q.priceUsd)}</div>
      <Stagger className="lines">
        <div className="srow"><span className="lbl">{s.name}</span><span className="fill" /><span className="v">{usd(s.priceUsd)}</span></div>
        {q.promo && <div className="srow"><span className="lbl">First job free</span><span className="fill" /><span className="v">({usd(s.priceUsd)})</span></div>}
        <div className="srow"><span className="lbl">Bond paid to you if you reject<small>{q.promo ? 'n/a on free jobs' : `${Math.round(q.bondBps / 100)}% of price`}</small></span><span className="fill" /><span className="v">{q.promo ? '—' : `+${usd(q.bondUsd)}`}</span></div>
        <div className="srow"><span className="lbl">Tools the team will buy<small>we pay this</small></span><span className="fill" /><span className="v">~{usd(q.estCostUsd, 3)}</span></div>
        <div className="srow"><span className="lbl">Delivery</span><span className="fill" /><span className="v">~{s.etaMin} min</span></div>
        <div className="srow total"><span className="lbl">You pay, only if you accept</span><span className="fill" /><span className="v">{q.promo ? '0.00' : usd(q.priceUsd)} USDC</span></div>
      </Stagger>
      <details>
        <summary>Why the CFO priced it this way</summary>
        <ol className="why">{q.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
      </details>
      <div className="signed">
        <Avatar role="cfo" lg />
        <div><motion.div className="sig" initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 0.9, duration: 0.9, ease: 'easeInOut' }}>The CFO</motion.div><div className="muted">Chief Financial Officer, Outlay · {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
      </div>
    </motion.div>
  );
}

export default function Hire({ service }: { service: string }) {
  const router = useRouter();
  const { data } = useApi<{ services: Service[]; mode: string }>('/api/services');
  const s = data?.services.find((x) => x.id === service);
  const [brief, setBrief] = useState('');
  const [email, setEmail] = useStored('outlay:email');
  // a brief typed into the home page hero arrives here once
  useEffect(() => { try { const b = sessionStorage.getItem('outlay:brief'); if (b) { setBrief(b); sessionStorage.removeItem('outlay:brief'); } } catch {} }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<QuotedOrder | null>(null);

  if (data && !s) return <main className="wrap section center"><h1 className="h1">We don't do that one (yet).</h1><p style={{ margin: '14px 0 24px' }}><Link href="/#services" className="btn secondary">See the services</Link></p></main>;
  if (!s) return <main className="wrap section"><div className="skel" style={{ height: 420 }} /></main>;

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
      router.push(`/job/${order.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const examples = EXAMPLES[s.id] ?? (s.example ? [s.example] : []);
  const q = order?.quote;
  const others = data!.services.filter((x) => x.live && x.id !== s.id);

  return (
    <main className="wrap">
      <div className="pagehead" style={{ paddingBottom: 0 }}>
        <div className="crumbs"><Link href="/#services">Services</Link><span>/</span><span>{s.dept}</span></div>
      </div>
      <div className="hire">
        <section>
          <h1 className="h1">{s.name}</h1>
          <p style={{ fontSize: 19, color: 'var(--ink-2)', marginTop: 12 }}>{s.tagline}</p>

          <Stagger className="teamphoto" style={{ ['--t' as any]: DEPT_TINT[s.dept] }}>
            {s.team.map((r) => <StaggerItem key={r} style={{ display: 'contents' }} variants={{ hidden: {}, show: {} }}><motion.img className="sprite" src={`/sprites/${r}/${r}-0.png`} alt={r} variants={{ hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 18 } } }} /></StaggerItem>)}
          </Stagger>
          <div className="names">{s.team.map((r) => <span key={r} className="chip"><Avatar role={r} />{ROLE_NAME[r] ?? r}</span>)}</div>

          <ul className="youget">{s.youGet.map((g) => <li key={g}><i>✓</i>{g}</li>)}</ul>

          <div className="facts">
            <div><div className="k">Price</div><div className="v">{s.priceUsd} USDC<small>{ngn(s.priceUsd)}</small></div></div>
            <div><div className="k">Tools it usually needs</div><div className="v">~{s.listedCostUsd} USDC<small>paid by us, on a public receipt</small></div></div>
            <div><div className="k">Delivered in</div><div className="v">~{s.etaMin} min<small>you watch it happen</small></div></div>
          </div>
          {others.length > 0 && <p className="muted" style={{ fontSize: 14, marginTop: 22 }}>Need something else? {others.map((o, i) => <span key={o.id}>{i ? ' · ' : ''}<Link href={`/hire/${o.id}`}>{o.name}</Link></span>)}</p>}
        </section>

        <section className="sticky">
          {!order || order.status === 'declined' ? (
            <div className="card pad formcard">
              <h3>Tell the team what you need</h3>
              <p className="muted">One or two sentences is enough. You'll see the exact price before anything starts.</p>
              <div className="form">
                <label className="field">The job
                  <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={examples[0] ?? 'Describe the job'} autoFocus={!brief} />
                </label>
                {examples.length > 0 && <div className="examples">{examples.map((x) => <button type="button" key={x} className="chip click" onClick={() => setBrief(x)}>{x}</button>)}</div>}
                <label className="field">Your email <span className="hint">It's your key to this job: you confirm with it to accept, revise or reject.</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
                </label>
                {err && <div className="error">{err}</div>}
                {order?.status === 'declined' && <div className="error">The CFO declined this job: it can't be done well at this price. {order.quote.reasons.at(-1)}</div>}
                <button className="btn primary lg block" disabled={busy || brief.trim().length < 12 || !email.includes('@')} onClick={getQuote}>{busy ? 'The CFO is pricing it…' : 'Get my quote'}</button>
                <p className="muted center" style={{ fontSize: 13 }}>First job free · no card · refund + bond if you reject</p>
              </div>
            </div>
          ) : (
            <div className="form">
              <QuoteDoc s={s} order={order} />
              <div className="note"><b>Your brief:</b> {brief}</div>
              {err && <div className="error">{err}</div>}
              {q!.promo ? (
                <button className="btn primary lg block" disabled={busy} onClick={() => begin('promo')}>Start my free job →</button>
              ) : data?.mode === 'demo' ? (
                <>
                  <button className="btn primary lg block" disabled={busy} onClick={() => begin('simulated')}>Pay {usd(q!.priceUsd)} USDC into escrow (demo)</button>
                  <p className="muted center" style={{ fontSize: 13 }}>Demo mode simulates the escrow payment. On the live site this funds the job's escrow on Arc.</p>
                </>
              ) : (
                <p className="note">Escrow payment on Arc is being switched on. Check back shortly.</p>
              )}
              <button className="btn ghost sm" style={{ justifySelf: 'center' }} onClick={() => setOrder(null)}>Change the brief</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
