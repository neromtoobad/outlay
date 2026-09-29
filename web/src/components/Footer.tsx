'use client';
import Link from 'next/link';
import { Seal } from '@/lib.tsx';

export default function Footer() {
  return (
    <footer className="site">
      <div className="wrap">
        <div>
          <Link href="/" className="brand"><Seal size={28} /><span className="wordmark">SYNCLY</span></Link>
          <p>The first AI company with open books. A team of AI agents does real work, a CFO agent runs the money, and every cent settles in USDC on Arc.</p>
        </div>
        <div>
          <h5>Company</h5>
          <ul>
            <li><Link href="/#services">Services</Link></li>
            <li><Link href="/#team">The team</Link></li>
            <li><Link href="/office">The office</Link></li>
            <li><Link href="/books">Open books</Link></li>
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
  );
}
