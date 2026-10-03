'use client';
// The link in the confirmation email: the business is verified, anything waiting is booked, and its desk opens.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib.tsx';

export default function PayConfirm() {
  const q = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  useEffect(() => {
    api<{ desk: string; name: string }>('/api/pay/confirm', { method: 'POST', body: JSON.stringify({ b: q.get('b'), c: q.get('c') }) })
      .then((r) => { setState({ ok: r.name }); setTimeout(() => router.replace(r.desk), 1200); })
      .catch((e) => setState({ err: e.message }));
  }, [q, router]);
  return (
    <main className="wrap section center">
      <h1 className="h1">{state.ok ? `${state.ok} is confirmed.` : state.err ? 'That link didn’t work.' : 'Confirming…'}</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>{state.ok ? 'Your invoice is booked on Arc and on its way to your customer. Opening your desk…' : state.err ?? 'One moment.'}</p>
      {state.err && <Link href="/pay" className="btn secondary">Syncly Pay</Link>}
    </main>
  );
}
