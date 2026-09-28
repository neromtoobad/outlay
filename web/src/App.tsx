import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { Seal, useApi } from './lib.tsx';
import Home from './pages/Home.tsx';
import Hire from './pages/Hire.tsx';
import Job from './pages/Job.tsx';
import Books from './pages/Books.tsx';
import OfficePage from './pages/OfficePage.tsx';

export default function App() {
  const { data } = useApi<{ mode: string }>('/api/health');
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link to="/" className="brand"><Seal /><span className="wordmark">OUTLAY</span></Link>
          <nav className="nav">
            <NavLink to="/" end>Services</NavLink>
            <NavLink to="/office">The office</NavLink>
            <NavLink to="/books">Open books</NavLink>
          </nav>
          <span className="spacer" />
          {data && (data.mode === 'demo'
            ? <span className="pill demo" title="No real money moves in demo mode. Receipts are simulated."><span className="dot" />Demo mode</span>
            : <span className="pill live"><span className="dot" />Live on Arc</span>)}
          <Link to="/hire/research-brief" className="btn primary sm">Hire the team</Link>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/hire/:service" element={<Hire />} />
        <Route path="/job/:id" element={<Job />} />
        <Route path="/books" element={<Books />} />
        <Route path="/office" element={<OfficePage />} />
        <Route path="*" element={<div className="wrap section"><h2>Not found</h2><Link to="/">Back to services</Link></div>} />
      </Routes>
      <footer>
        <div className="wrap">
          <span>Outlay · the AI company with open books · settled in USDC on Arc</span>
          <span><Link to="/books">Open books</Link> · <a href="https://github.com/neromtoobad/outlay">Source</a></span>
        </div>
      </footer>
    </>
  );
}
