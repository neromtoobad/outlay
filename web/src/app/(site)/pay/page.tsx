import type { Metadata } from 'next';
import Pay from '@/views/Pay.tsx';

export const metadata: Metadata = { title: 'Syncly Pay', description: 'Get paid and pay your bills safely: invoices and supplier payments handled by AI agents and booked on Arc in USDC.' };
export default function Page() { return <Pay />; }
