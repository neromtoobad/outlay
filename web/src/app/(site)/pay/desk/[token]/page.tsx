import type { Metadata } from 'next';
import PayDesk from '@/views/PayDesk.tsx';

export const metadata: Metadata = { title: 'Your Syncly Pay desk', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayDesk token={token} />;
}
