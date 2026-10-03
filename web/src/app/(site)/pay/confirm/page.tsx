import { Suspense } from 'react';
import type { Metadata } from 'next';
import PayConfirm from '@/views/PayConfirm.tsx';

export const metadata: Metadata = { title: 'Confirm your business', robots: { index: false } };
export default function Page() { return <Suspense><PayConfirm /></Suspense>; }
