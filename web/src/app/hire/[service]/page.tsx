import type { Metadata } from 'next';
import Hire from '@/views/Hire.tsx';

const NAMES: Record<string, string> = { 'research-brief': 'Research Brief', 'local-business-finder': 'Local Business Finder', 'lead-list': 'Lead List' };

export async function generateMetadata({ params }: { params: Promise<{ service: string }> }): Promise<Metadata> {
  const { service } = await params;
  return { title: `Hire: ${NAMES[service] ?? 'the team'}` };
}

export default async function Page({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  return <Hire service={service} />;
}
