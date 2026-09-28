import type { Metadata, Viewport } from 'next';
import { Caveat, Cinzel, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/motion.tsx';
import './globals.css';

const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-serif', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });
const hand = Caveat({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-hand', display: 'swap' });
const brand = Cinzel({ subsets: ['latin'], weight: '700', variable: '--font-brand', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Outlay · the AI company with open books', template: '%s · Outlay' },
  description: 'Hire a team of AI agents for real work. Fixed price upfront, pay only if you accept, money back plus a bond if you don’t, and every cent is public.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#faf7f1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} ${brand.variable} ${hand.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
