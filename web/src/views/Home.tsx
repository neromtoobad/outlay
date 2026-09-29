'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Office, { type FeedItem } from '@/office/Office.tsx';
import { AnimatePresence } from 'motion/react';
import { motion, Reveal, Stagger, StaggerItem, item, Words, CountUp, Tilt } from '@/components/motion.tsx';
import { useApi, usd, ngn, Avatar, Sprite, Check, ROLE_NAME, ROLES, DEPT_TINT, tint, timeAgo, type Service, type AgentStats, type BooksSummary } from '@/lib.tsx';

type Books = BooksSummary & { ledger: { date: string; narration: string; postings: { account: string; amount: number }[]; meta: { agent?: string; reason?: string; kind: string; tx?: string } }[] };
const ASK: [string, string][] = [['local-business-finder', 'Local businesses'], ['lead-list', 'Lead list'], ['research-brief', 'Research brief']];
const PLACEHOLDER: Record<string, string> = {
  'local-business-finder': 'Every café in Lekki Phase 1 without a website',
  'lead-list': '25 fitness studios in Ikoyi for my smoothie delivery business',
  'research-brief': 'Competitors and pricing for a bakery adding cake delivery',
};
const VENDORS: [string, string][] = [['BlockRun', 'language models'], ['Serper', 'search + maps'], ['Exa', 'neural search'], ['APEX', 'web read · email verify'], ['Tomba', 'email finder'], ['Circle Gateway', 'x402 payments'], ['Arc', 'settlement'], ['USDC', 'money']];
const WORKERS = ['scout', 'researcher', 'writer', 'reader', 'verifier', 'analyst', 'auditor', 'illustrator', 'mailer', 'messenger'];

function Hero() {
  const router = useRouter();
  const [svc, setSvc] = useState('local-business-finder');
  const [brief, setBrief] = useState('');
  const go = (e: FormEvent) => { e.preventDefault(); try { if (brief.trim()) sessionStorage.setItem('outlay:brief', brief.trim()); } catch {} router.push(`/hire/${svc}`); };
  return (
    <section className="wrap hero">
      <motion.div className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}><span className="chip"><span className="dot pulse" style={{ color: 'var(--good)' }} />11 AI agents at work · settled in USDC on Arc</span></motion.div>
      <Words delay={0.1} parts={[{ text: 'An AI company you can hire. ' }, { text: 'Pay only if you accept the work.', em: true, cls: 'gold-text' }]} />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.75 }}>
      <p className="sub">Leads, local business lists and research, done by a team of AI agents in minutes. Fixed price upfront, every tool they buy is on a public receipt, and a rejected job comes back with a bond on top.</p>
      <form className="askbar" onSubmit={go}>
        <input type="text" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={PLACEHOLDER[svc]} aria-label="What do you need done?" />
        <button className="btn primary" type="submit">Get a free quote →</button>
      </form>
      <div className="askchips">
        {ASK.map(([id, label]) => <button type="button" key={id} className={`chip click${svc === id ? ' on' : ''}`} onClick={() => setSvc(id)}>{label}</button>)}
      </div>
      <div className="trust">
        <span><Check />First job free</span>
        <span><Check />Pay in USDC, no card</span>
        <span><Check />Refund + bond if you reject</span>
        <span><Check />Every cent public</span>
      </div>
      </motion.div>
    </section>
  );
}

function Stage({ books }: { books: Books | null }) {
  const [buy, setBuy] = useState<FeedItem | null>(null);
  const [step, setStep] = useState<FeedItem | null>(null);
  const [mode, setMode] = useState<{ mode: 'live' | 'replay' | 'idle'; orderId?: string }>({ mode: 'idle' });
  const lastTool = books?.ledger.find((e) => e.meta.kind === 'tool');
  const b = buy?.e.data;
  const s = step?.e.data;
  return (
    <motion.div className="stage" initial={{ opacity: 0, y: 70, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.1, delay: 0.95, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="stage-frame">
        <div className="stage-bar">
          <div className="l">
            {mode.mode === 'live' ? <span className="chip live"><span className="dot" />Live: a job is running</span>
              : mode.mode === 'replay' ? <span className="chip">↺ Replaying a real job, sped up</span>
              : <span className="chip">The office</span>}
            <span className="muted" style={{ fontSize: 13 }}>Every movement is a real event. Every coin is a real payment.</span>
          </div>
          <span style={{ display: 'flex', gap: 16 }}><Link href="/live" style={{ fontSize: 13.5, fontWeight: 500 }}>⤢ Full screen</Link><Link href="/office" style={{ fontSize: 13.5, fontWeight: 500 }}>Open the office →</Link></span>
        </div>
        <div className="stage-screen">
          <Office onMode={setMode} onFeed={(f) => { if (f.e.type === 'purchase') setBuy(f); if (f.e.type === 'step') setStep(f); }} />
        </div>
      </div>

      <motion.div className="float a" animate={{ y: [0, -7, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
        <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={`b${buy?.at ?? 'x'}`} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}>
        <div className="k"><span>Just paid for</span><span>{b ? (b.dry ? 'demo' : 'x402 · Arc') : 'x402'}</span></div>
        {b ? (
          <div className="row"><Avatar role={b.agent} /><div><b>{ROLE_NAME[b.agent]}</b> bought<br />{b.vendor}</div><span className="amt">−{Number(b.usd).toFixed(4)}</span></div>
        ) : lastTool ? (
          <div className="row"><Avatar role={lastTool.meta.agent ?? 'scout'} /><div>{lastTool.narration.replace(/^\w+ bought /, 'Bought ')}</div><span className="amt">−{lastTool.postings[0].amount.toFixed(4)}</span></div>
        ) : <div className="muted">Waiting for the next purchase…</div>}
        </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div className="float b" animate={{ y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
        <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={`s${step?.at ?? 'x'}`} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}>
        <div className="k"><span>Right now</span>{step?.e.orderId && <Link href={`/job/${step.e.orderId}`} style={{ textTransform: 'none', letterSpacing: 0 }}>view job</Link>}</div>
        {s ? (
          <div className="row"><Avatar role={s.agent} /><div><b>{ROLE_NAME[s.agent]}</b> <span className="muted">{s.step}</span><div style={{ color: 'var(--ink-2)' }}>{(s.note || '').slice(0, 70)}</div></div></div>
        ) : <div className="row"><Avatar role="cfo" /><div><b>The CFO</b> <span className="muted">is waiting for the next brief</span></div></div>}
        </motion.div>
        </AnimatePresence>
      </motion.div>

      {books && (
        <motion.div className="float c" animate={{ y: [0, -5, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}>
        <Link href="/books" style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
          <div className="k"><span>The books</span><span>{books.mode === 'demo' ? 'demo' : 'live'}</span></div>
          <div className="srow" style={{ padding: '3px 0', fontSize: 13.5 }}><span className="lbl">Revenue</span><span className="fill" /><span className="v">{usd(books.pnl.revenue)}</span></div>
          <div className="srow" style={{ padding: '3px 0', fontSize: 13.5 }}><span className="lbl">Tools bought</span><span className="fill" /><span className="v">−{usd(books.pnl.tools, 3)}</span></div>
          <div className="srow total" style={{ padding: '8px 0 0', fontSize: 13.5 }}><span className="lbl">Gross margin</span><span className="fill" /><span className="v" style={{ fontSize: 14 }}>{usd(books.pnl.grossMargin, 2)}</span></div>
        </Link>
        </motion.div>
      )}
    </motion.div>
  );
}

function Services({ services }: { services: Service[] }) {
  const live = services.filter((s) => s.live), soon = services.filter((s) => !s.live);
  return (
    <section className="wrap section" id="services">
      <Reveal className="shead">
        <div className="eyebrow">Services</div>
        <h2>Pick a job. <em>The team is ready.</em></h2>
        <p>Fixed prices in USDC, delivered in minutes. The CFO shows you the cost of every tool before and after.</p>
      </Reveal>
      <Stagger className="svcgrid">
        {live.map((s) => (
          <StaggerItem key={s.id} variants={item} style={{ display: 'flex' }}>
          <Link href={`/hire/${s.id}`} className="card svccard" style={{ flex: 1 }}>
            <div className="photo" style={{ ['--t' as any]: DEPT_TINT[s.dept] }}>
              <span className="chip dept">{s.dept}</span>
              {s.team.slice(0, 5).map((r) => <Sprite key={r} role={r} />)}
            </div>
            <div className="body">
              <h3>{s.name}</h3>
              <p>{s.tagline}</p>
              <div className="foot"><span className="price">{s.priceUsd} USDC<small>{ngn(s.priceUsd)}</small></span><span className="eta">~{s.etaMin} min</span></div>
            </div>
          </Link>
          </StaggerItem>
        ))}
      </Stagger>
      {soon.length > 0 && (
        <>
          <p className="center muted" style={{ margin: '40px 0 0', fontSize: 14 }}>Coming next</p>
          <Stagger className="svcmore">
            {soon.map((s) => (
              <StaggerItem key={s.id} variants={item} className="card">
                <div className="stack" style={{ marginBottom: 10 }}>{s.team.slice(0, 4).map((r) => <Avatar key={r} role={r} />)}</div>
                <h4>{s.name}</h4>
                <p>{s.tagline} · {s.priceUsd} USDC</p>
              </StaggerItem>
            ))}
          </Stagger>
        </>
      )}
    </section>
  );
}

function Team({ agents, books }: { agents: Record<string, AgentStats>; books: Books | null }) {
  const recent = (a?: AgentStats) => a?.last && Date.now() - Date.parse(a.last.at) < 3 * 60_000;
  return (
    <section className="wrap section" id="team" style={{ paddingTop: 0 }}>
      <Reveal className="shead">
        <div className="eyebrow">The team</div>
        <h2>Eleven agents. <em>One set of books.</em></h2>
        <p>Every number on these cards comes from the jobs they actually did and the tools they actually paid for.</p>
      </Reveal>
      <Stagger className="teamgrid">
        <StaggerItem variants={item} className="bosscell"><Tilt className="card agent boss" style={tint('cfo')} max={4}>
          <div className="portrait"><Sprite role="cfo" className="main" /><Sprite role="cfo" frame={6} className="alt" /></div>
          <div className="body">
            <span className="chip dark" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>Runs the money</span>
            <h4>The CFO</h4>
            <div className="role">{ROLES.cfo.title}</div>
            <p className="blurb">{ROLES.cfo.blurb}</p>
            <div className="nums">
              <div><b>{books?.counters.quotes ?? '—'}</b><span>jobs priced</span></div>
              <div><b>{books?.counters.acceptanceRate == null ? '—' : `${Math.round(books.counters.acceptanceRate * 100)}%`}</b><span>accepted</span></div>
              <div><b>{books ? usd(books.pnl.bondsPaid) : '—'}</b><span>bonds paid</span></div>
            </div>
          </div>
        </Tilt></StaggerItem>
        {WORKERS.map((r) => {
          const a = agents[r];
          return (
            <StaggerItem key={r} variants={item} style={{ display: 'flex' }}><Tilt className="card agent" style={{ ...tint(r), flex: 1 }}>
              <div className="portrait">
                {recent(a) && <span className="chip live tag"><span className="dot" />On a job</span>}
                <Sprite role={r} className="main" /><Sprite role={r} frame={4} className="alt" />
              </div>
              <div className="body">
                <h4>{ROLE_NAME[r]}</h4>
                <div className="role">{ROLES[r].title}</div>
                <div className="nums">
                  <div><b>{a?.jobs ?? 0}</b><span>jobs</span></div>
                  <div><b>{a?.calls ?? 0}</b><span>tools paid</span></div>
                  <div><b>{(a?.usd ?? 0).toFixed(3)}</b><span>USDC</span></div>
                </div>
                <div className="last" title={a?.last?.step}>{a?.last ? <><b>{a.last.step}</b> · {timeAgo(a.last.at)}</> : 'Joins when their service goes live'}</div>
              </div>
            </Tilt></StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}

const HOW: { role: string; frame: number; t: string; h: string; p: string }[] = [
  { role: 'cfo', frame: 3, t: '#e1ece5', h: 'Tell us the job', p: 'One or two sentences. "Every café in Lekki without a website."' },
  { role: 'cfo', frame: 4, t: '#fbefcc', h: 'Get a fixed quote', p: 'The CFO prices it from measured costs, sizes the bond and explains every number.' },
  { role: 'scout', frame: 7, t: '#e2edf9', h: 'Watch them work', p: 'Every search, page read and email check is a small USDC payment on Arc, listed live.' },
  { role: 'writer', frame: 4, t: '#fce6df', h: 'Accept, or get paid back', p: 'Accept and we get paid. Reject and your money comes back with the bond on top.' },
];

export default function Home() {
  const { data: svc } = useApi<{ services: Service[] }>('/api/services');
  const { data: books } = useApi<Books>('/api/books', 15000);
  const { data: team } = useApi<{ agents: Record<string, AgentStats> }>('/api/team', 20000);
  const c = books?.counters;

  return (
    <main>
      <Hero />
      <div className="wrap"><Stage books={books} /></div>

      <section className="section tight" style={{ paddingBottom: 0 }}>
        <p className="center muted" style={{ fontSize: 14, marginBottom: 22 }}>The team pays for its own tools, per call, in USDC</p>
        <div className="marquee"><div className="marquee-track">
          {[...VENDORS, ...VENDORS].map(([n, d], i) => <span key={i}>{n}<small>{d}</small></span>)}
        </div></div>
      </section>

      <section className="wrap section tight">
        <Reveal className="statband">
          <div><div className="n"><CountUp value={c?.delivered} /></div><div className="k">Jobs delivered</div><div className="d">{c ? `for ${c.customers} customers` : ' '}</div></div>
          <div><div className="n"><CountUp value={c?.acceptanceRate == null ? null : Math.round(c.acceptanceRate * 100)} suffix="%" /></div><div className="k">Accepted by customers</div><div className="d">{c ? `${c.accepted} accepted · ${c.rejected} rejected` : ' '}</div></div>
          <div><div className="n"><CountUp value={c?.toolCalls} /></div><div className="k">Tool payments on Arc</div><div className="d">{books ? `${usd(books.pnl.tools, 3)} USDC spent` : ' '}</div></div>
          <div><div className="n"><CountUp value={books?.pnl.revenue} decimals={2} /><small>USDC</small></div><div className="k">Revenue</div><div className="d">{books?.mode === 'demo' ? 'demo data, clearly marked' : 'accepted jobs only'}</div></div>
        </Reveal>
      </section>

      {svc && <Services services={svc.services} />}
      <Team agents={team?.agents ?? {}} books={books} />

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="shead">
          <div className="eyebrow">How it works</div>
          <h2>Brief to accepted work, <em>in minutes.</em></h2>
          <p>You are the judge. Our own AI never grades its own work.</p>
        </div>
        <Stagger className="howgrid">
          {HOW.map((h, i) => (
            <StaggerItem key={h.h} variants={item} className="card how">
              <div className="pose" style={{ ['--t' as any]: h.t }}><Sprite role={h.role} frame={h.frame} /></div>
              <div className="n">0{i + 1}</div>
              <h4>{h.h}</h4>
              <p>{h.p}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="wrap" style={{ paddingBottom: 104 }}>
        <Reveal className="vaultband" y={40}>
          <div>
            <div className="eyebrow">The guarantee</div>
            <h2>We put money behind our work.</h2>
            <p>Every paid job carries a bond sized to the CFO's confidence. Reject the work, or if we're late, and the escrow contract on Arc refunds you and pays the bond. No forms, no support tickets.</p>
          </div>
          <div className="figs">
            <div><b className="gold-text">Free</b><span>your first job</span></div>
            <div><b>100%</b><span>refunded if you reject</span></div>
            <div><b className="gold-text">+10–30%</b><span>bond paid on top</span></div>
            <div><b>48 h</b><span>to decide; silence means yes</span></div>
          </div>
        </Reveal>
      </section>

      <section className="wrap" style={{ paddingBottom: 40 }}>
        <div className="split">
          <Reveal>
            <div className="eyebrow">Open books</div>
            <h2 className="h2">The first AI company <em>with open books.</em></h2>
            <p className="lede">An AI CFO runs Syncly's money. Its books are public and generated from the same records that move the money.</p>
            <ul className="ticks">
              <li>Every tool purchase, with the agent and the reason</li>
              <li>Revenue only from work customers accepted</li>
              <li>Refunds and bonds shown, not hidden</li>
              <li>A double-entry ledger you can download</li>
            </ul>
            <Link href="/books" className="btn secondary">Read the books →</Link>
          </Reveal>
          <Reveal className="statement" delay={0.15} y={40}>
            <div className="head">
              <div><h4>Income statement</h4><div className="muted">{books?.mode === 'demo' ? 'Demo data · no real money' : 'Live · Arc mainnet'} · to date</div></div>
              <span className="mono muted" style={{ fontSize: 12 }}>USDC</span>
            </div>
            {books ? (
              <>
                <div className="srow"><span className="lbl">Revenue<small>accepted, paid jobs</small></span><span className="fill" /><span className="v">{usd(books.pnl.revenue)}</span></div>
                <div className="srow neg"><span className="lbl">Tools bought by agents<small>{books.counters.toolCalls} payments</small></span><span className="fill" /><span className="v">({usd(books.pnl.tools, 3)})</span></div>
                <div className="srow neg"><span className="lbl">Bonds paid to customers</span><span className="fill" /><span className="v">({usd(books.pnl.guarantee)})</span></div>
                <div className="srow neg"><span className="lbl">Human expert reviews</span><span className="fill" /><span className="v">({usd(books.pnl.experts)})</span></div>
                <div className="srow total"><span className="lbl">Gross margin</span><span className="fill" /><span className="v">{usd(books.pnl.grossMargin)}</span></div>
              </>
            ) : <div className="skel" style={{ height: 180 }} />}
          </Reveal>
        </div>
      </section>

      <section className="finalcta">
        <Stagger className="row">{['scout', 'researcher', 'writer', 'verifier', 'auditor'].map((r) => <StaggerItem key={r} variants={{ hidden: { opacity: 0, y: 60 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 14 } } }}><Sprite role={r} frame={4} /></StaggerItem>)}</Stagger>
        <Reveal><h2>Your first job is on us.</h2></Reveal>
        <p>No card, no sign-up. Tell the team what you need and watch them do it.</p>
        <Link href="/hire/local-business-finder" className="btn primary lg">Give the team a job →</Link>
      </section>
    </main>
  );
}
