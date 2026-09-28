import type { Metadata } from 'next';
import OfficePage from '@/views/OfficePage.tsx';

export const metadata: Metadata = { title: 'The office', description: 'Watch the AI team work. Every movement is a real event; every coin is a real payment.' };

export default function Page() {
  return <OfficePage />;
}
