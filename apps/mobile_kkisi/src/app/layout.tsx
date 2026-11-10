import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Sans } from 'next/font/google';
import { PwaRuntime } from '@/components/pwa/PwaRuntime';
import './globals.css';

// Fonts of the approved mockup, self-hosted by next/font at build time (no request to Google from the member's device).
const archivo = Archivo({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-archivo', display: 'swap' });
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'S-MART KKISI TB2', template: '%s · S-MART KKISI TB2' },
  description: 'Aplikasi anggota Koperasi Karyawan KKISI Tambun 2.',
  applicationName: 'S-MART KKISI TB2',
  appleWebApp: { capable: true, title: 'S-MART TB2', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }], apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${archivo.variable} ${plex.variable}`}>
      <body>
        <a className="skip-link" href="#main">Langsung ke konten</a>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
