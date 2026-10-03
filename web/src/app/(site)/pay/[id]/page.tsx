import type { Metadata } from 'next';
import PayInvoice from '@/views/PayInvoice.tsx';

export const metadata: Metadata = { title: 'Invoice' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayInvoice id={id} />;
}
