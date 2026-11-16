import type { Metadata } from 'next';
import './globals.css';
import './owner.css';
import './theme.css';
import { Header } from '@/components/Header';

export const metadata: Metadata = { title: 'DHEEHSTORE — Ethiopia’s marketplace', description: 'Discover products from independent Ethiopian shops. Shop local, all in ETB.', manifest: '/manifest.json' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Header/>{children}<footer className="footer"><div className="wrap footerInner"><a className="brand" href="/">DHEEH<span>STORE</span></a><p>Local shops. Nationwide discovery.</p><a href="/support">Help & complaints</a><a href="/owner">Owner console</a><span>Made for Ethiopia · Prices in ETB</span></div></footer></body></html>;
}
