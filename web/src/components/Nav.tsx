'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, MotionGlobalConfig } from 'motion/react';

// Debug switch for screenshots in hidden/throttled browsers: localStorage outlay:still = 1 skips all Motion animations.
if (typeof window !== 'undefined') { try { if (localStorage.getItem('outlay:still') === '1') MotionGlobalConfig.skipAnimations = true; } catch {} }
import { Seal, useApi } from '@/lib.tsx';

const LINKS: [string, string][] = [['/#services', 'Services'], ['/#team', 'The team'], ['/office', 'The office'], ['/books', 'Open books']];

function Links({ onClick }: { onClick?: () => void }) {
  const path = usePathname();
  return (
    <>
      {LINKS.map(([href, label]) => {
        const active = !href.includes('#') && path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? 'active' : ''} onClick={onClick}>
            {active && <motion.span layoutId="navpill" className="navpill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span style={{ position: 'relative' }}>{label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function Nav() {
  const { data } = useApi<{ mode: string }>('/api/health');
  const [menu, setMenu] = useState(false);
  return (
    <div className="navshell">
      <header className="nav">
        <Link href="/" className="brand" aria-label="Outlay home"><Seal size={30} /><span className="wordmark">OUTLAY</span></Link>
        <nav className="navlinks"><Links /></nav>
        <span className="spacer" />
        {data && (data.mode === 'demo'
          ? <span className="chip demo" title="No real money moves in demo mode. Receipts are simulated and marked as such."><span className="dot" />Demo mode</span>
          : <span className="chip live"><span className="dot" />Live on Arc</span>)}
        <Link href="/hire/local-business-finder" className="btn primary sm">Hire the team</Link>
        <button className="menubtn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </header>
      <nav className={`mobilemenu${menu ? ' open' : ''}`}><Links onClick={() => setMenu(false)} /></nav>
    </div>
  );
}
