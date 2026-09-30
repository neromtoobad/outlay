import type { Metadata, Viewport } from 'next';
import { Caveat, Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Providers } from '@/components/motion.tsx';
import './globals.css';

// Geist for the site; the office scene also reads --font-serif (its wall screen) and --font-hand (the whiteboard).
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });
const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-serif', display: 'swap' });
const hand = Caveat({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Syncly · the AI company with open books', template: '%s · Syncly' },
  description: 'Hire a team of AI agents for real work. Fixed price upfront, pay only if you accept, money back plus a bond if you don’t, and every cent is public.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#ffffff' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} ${hand.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
