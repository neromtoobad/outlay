import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { Seal, useApi } from './lib.tsx';
import Home from './pages/Home.tsx';
import Hire from './pages/Hire.tsx';
import Job from './pages/Job.tsx';
import Books from './pages/Books.tsx';
import OfficePage from './pages/OfficePage.tsx';

const LINKS: [string, string][] = [['/#services', 'Services'], ['/#team', 'The team'], ['/office', 'The office'], ['/books', 'Open books']];

function Links({ onClick }: { onClick?: () => void }) {
  const { pathname, hash } = useLocation();
  return (
    <>
      {LINKS.map(([to, label]) => {
        const active = to.includes('#') ? pathname === '/' && hash === to.slice(1) : pathname.startsWith(to);
        return to.includes('#')
          ? <Link key={to} to={to} className={active ? 'active' : ''} onClick={onClick}>{label}</Link>
          : <NavLink key={to} to={to} onClick={onClick}>{label}</NavLink>;
      })}
    </>
  );
}

export default function App() {
  const { data } = useApi<{ mode: string }>('/api/health');
  const { pathname, hash } = useLocation();
  const [menu, setMenu] = useState(false);

  // new page → top; in-page link → that section
  useEffect(() => {
    if (hash) { const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return () => clearTimeout(t); }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  return (
    <>
      <div className="navshell">
        <header className="nav">
          <Link to="/" className="brand" aria-label="Outlay home"><Seal size={30} /><span className="wordmark">OUTLAY</span></Link>
          <nav className="navlinks"><Links /></nav>
          <span className="spacer" />
          {data && (data.mode === 'demo'
            ? <span className="chip demo" title="No real money moves in demo mode. Receipts are simulated and marked as such."><span className="dot" />Demo mode</span>
            : <span className="chip live"><span className="dot" />Live on Arc</span>)}
          <Link to="/hire/local-business-finder" className="btn primary sm">Hire the team</Link>
          <button className="menubtn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>
        </header>
        <nav className={`mobilemenu${menu ? ' open' : ''}`}><Links onClick={() => setMenu(false)} /></nav>
      </div>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/hire/:service" element={<Hire />} />
        <Route path="/job/:id" element={<Job />} />
        <Route path="/books" element={<Books />} />
        <Route path="/office" element={<OfficePage />} />
        <Route path="*" element={<main className="wrap section center"><h1 className="h1">Nothing here.</h1><p className="muted" style={{ margin: '12px 0 24px' }}>That page doesn't exist.</p><Link to="/" className="btn secondary">Back to Outlay</Link></main>} />
      </Routes>

      <footer className="site">
        <div className="wrap">
          <div>
            <Link to="/" className="brand"><Seal size={28} /><span className="wordmark">OUTLAY</span></Link>
            <p>The first AI company with open books. A team of AI agents does real work, a CFO agent runs the money, and every cent settles in USDC on Arc.</p>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link to="/#services">Services</Link></li>
              <li><Link to="/#team">The team</Link></li>
              <li><Link to="/office">The office</Link></li>
              <li><Link to="/books">Open books</Link></li>
            </ul>
          </div>
          <div>
            <h5>Proof</h5>
            <ul>
              <li><a href="/api/books.beancount">Ledger (beancount)</a></li>
              <li><a href="https://arcscan.app" target="_blank" rel="noreferrer">Arc explorer</a></li>
              <li><a href="https://github.com/neromtoobad/outlay" target="_blank" rel="noreferrer">Source code</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
