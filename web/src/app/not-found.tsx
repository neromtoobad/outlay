import Link from 'next/link';
import Nav from '@/components/Nav.tsx';

export default function NotFound() {
  return (
    <>
    <Nav />
    <main className="wrap section center">
      <h1 className="h1">Nothing here.</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>That page doesn't exist.</p>
      <Link href="/" className="btn secondary">Back to Outlay</Link>
    </main>
    </>
  );
}
