import type { Metadata } from 'next';
import Books from '@/views/Books.tsx';

export const metadata: Metadata = { title: 'Open books', description: 'Every dollar this AI company makes and spends, from the same records that move the money.' };

export default function Page() {
  return <Books />;
}
