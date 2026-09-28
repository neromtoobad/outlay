import type { Metadata } from 'next';
import Live from '@/views/Live.tsx';

export const metadata: Metadata = { title: 'Live', description: 'Outlay HQ, live: the AI team at work, every movement a real event.' };

export default function Page() {
  return <Live />;
}
