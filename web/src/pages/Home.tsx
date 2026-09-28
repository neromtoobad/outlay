import { Link } from 'react-router-dom';
import { useApi, usd, ngn, Avatar, type Service } from '../lib.tsx';

type Books = { mode: string; counters: { delivered: number; accepted: number; acceptanceRate: number | null; toolCalls: number; customers: number }; pnl: { revenue: number; tools: number } };

export default function Home() {
  const { data: svc } = useApi<{ services: Service[] }>('/api/services');
  const { data: books } = useApi<Books>('/api/books', 15000);
  const c = books?.counters;

  return (
    <main>
      <section className="wrap hero">
        <div>
          <div className="eyebrow">An AI company you can hire</div>
          <h1>Real work from an AI team. <em>You only pay if you accept it.</em></h1>
          <p className="sub">
            Leads, research, local business lists and more, done by a team of AI agents in minutes. Every price is fixed upfront,
            every tool they buy is on a public receipt, and if you reject the work you get your money back <b>plus a bond</b>.
          </p>
          <div className="ctas">
            <Link to="/hire/local-business-finder" className="btn primary">Start with a free job</Link>
            <Link to="/books" className="btn secondary">See our books</Link>
          </div>
          <div className="promise">
            <span><i>✓</i>First job free</span>
            <span><i>✓</i>Pay in USDC, no card</span>
            <span><i>✓</i>Refund + bond if rejected</span>
          </div>
        </div>
        <div className="hero-art" style={{ backgroundImage: 'url(/scene/office-bg.png)' }}>
          {/* a few of the team, standing on the office floor (x %, feet at y %, height %) */}
          {([['cfo', 50, 60, 27], ['scout', 22, 80, 25], ['researcher', 34, 88, 26], ['writer', 70, 86, 26], ['auditor', 83, 74, 24]] as const).map(([r, x, y, h]) => (
            <img key={r} src={`/sprites/${r}/${r}-0.png`} alt="" style={{ position: 'absolute', left: `${x}%`, top: `${y - h}%`, height: `${h}%`, transform: 'translateX(-50%)', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.25))' }} />
          ))}
          <span className="tag">The office · every coin is a real payment</span>
        </div>
      </section>

      <section className="wrap">
        <div className="stats">
          <div className="card stat"><div className="k">Jobs delivered</div><div className="v">{c?.delivered ?? '—'}</div><div className="d">{c ? `${c.customers} customers` : ' '}</div></div>
          <div className="card stat"><div className="k">Accepted</div><div className="v">{c?.acceptanceRate == null ? '—' : `${Math.round(c.acceptanceRate * 100)}%`}</div><div className="d">{c ? `${c.accepted} jobs` : ' '}</div></div>
          <div className="card stat"><div className="k">Tools bought on Arc</div><div className="v">{c?.toolCalls ?? '—'}</div><div className="d">{books ? `${usd(books.pnl.tools, 3)} USDC spent` : ' '}</div></div>
          <div className="card stat"><div className="k">Revenue</div><div className="v">{books ? usd(books.pnl.revenue) : '—'}<small>USDC</small></div><div className="d">{books?.mode === 'demo' ? 'demo data' : 'accepted jobs only'}</div></div>
        </div>
      </section>

      <section className="wrap section" id="services">
        <div className="eyebrow">Services</div>
        <h2>What the team does</h2>
        <p className="lede">Fixed prices in USDC. The CFO shows you the cost of every tool before and after.</p>
        <div className="grid">
          {svc?.services.map((s) =>
            s.live ? (
              <Link key={s.id} to={`/hire/${s.id}`} className="card svc">
                <span className="dept">{s.dept}</span>
                <h3>{s.name}</h3>
                <p>{s.tagline}</p>
                <div className="team" style={{ gap: 0 }}>{s.team.slice(0, 5).map((r, i) => <span key={r} style={{ marginLeft: i ? -8 : 0 }}><Avatar role={r} /></span>)}</div>
                <div className="meta"><span className="price">{s.priceUsd} USDC</span><span className="muted">~{s.etaMin} min · {ngn(s.priceUsd)}</span></div>
              </Link>
            ) : (
              <div key={s.id} className="card svc soon">
                <span className="dept">{s.dept}</span>
                <h3>{s.name}</h3>
                <p>{s.tagline}</p>
                <div className="meta"><span className="price">{s.priceUsd} USDC</span><span className="soon-tag">Coming soon</span></div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="eyebrow">How it works</div>
        <h2>From brief to accepted work</h2>
        <p className="lede">The customer is the judge. Our own AI never grades its own work.</p>
        <div className="steps">
          <div className="card step"><h4>Tell us the job</h4><p>One or two sentences. "Every café in Lekki without a website."</p></div>
          <div className="card step"><h4>Get a fixed quote</h4><p>The AI CFO prices it from measured costs, sets the bond and explains every number.</p></div>
          <div className="card step"><h4>Watch the team work</h4><p>Each search, page read and email check is a small USDC payment on Arc, listed as it happens.</p></div>
          <div className="card step"><h4>Accept, revise or reject</h4><p>Accept and we're paid. Reject and your money comes back with the bond on top.</p></div>
        </div>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="band">
          <div>
            <div className="eyebrow" style={{ color: '#f2d28b' }}>The guarantee</div>
            <h2>We put money behind our work.</h2>
            <p>Every paid job carries a bond sized to the CFO's confidence. Reject the work, or if we're late, and the escrow contract refunds you and pays the bond. No forms, no support tickets.</p>
          </div>
          <ul>
            <li><b>0 USDC</b>your first job</li>
            <li><b>100%</b>refund if you reject</li>
            <li><b>+10–30%</b>bond paid on top</li>
            <li><b>48 h</b>to decide; silence means yes</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
