import type { Metadata } from 'next';
import Job from '@/views/Job.tsx';

export const metadata: Metadata = { title: 'Your job' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Job id={id} />;
}
