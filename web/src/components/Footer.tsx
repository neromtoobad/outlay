'use client';
import Link from 'next/link';
import Logo from '@/components/Logo.tsx';

export default function Footer() {
  return (
    <footer className="foot">
      <div className="foot__in">
        <div className="foot__brand">
          <Logo size={30} light />
          <p>The first AI company with open books. A team of AI agents does real work, an AI CFO runs the money inside limits a contract enforces, and every cent settles in USDC on Arc.</p>
        </div>
        <div>
          <h5 className="mono">Company</h5>
          <ul>
            <li><Link href="/#team">The team</Link></li>
            <li><Link href="/#cfo">The CFO</Link></li>
            <li><Link href="/#services">Services</Link></li>
            <li><Link href="/office">The office</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="mono">Proof</h5>
          <ul>
            <li><Link href="/books">Open books</Link></li>
            <li><a href="/api/cfo">The CFO's signed log</a></li>
            <li><a href="/api/books.beancount">Ledger (beancount)</a></li>
            <li><a href="https://github.com/neromtoobad/syncly" target="_blank" rel="noreferrer">Source code</a></li>
          </ul>
        </div>
        <div>
          <h5 className="mono">On Arc</h5>
          <ul>
            <li><a href="https://arcscan.app/address/0x589e8ec9134777acecb83a9abdf018942ddc9f2b" target="_blank" rel="noreferrer">SynclyVault ↗</a></li>
            <li><a href="https://arcscan.app/address/0xde2ca0c975a1f5789f9b79fe578d43ccf417edbd" target="_blank" rel="noreferrer">JobEscrow ↗</a></li>
          </ul>
        </div>
      </div>
      <div className="foot__base mono"><span>© 2026 Syncly</span><span>Settled in USDC on Arc</span></div>
    </footer>
  );
}
