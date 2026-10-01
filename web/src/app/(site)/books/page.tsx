import type { Metadata } from 'next';
import Books from '@/views/Books.tsx';

export const metadata: Metadata = { title: 'Your books', description: 'Private: Syncly\'s money, for the owner only.', robots: { index: false, follow: false } };

export default function Page() {
  return <Books />;
}
