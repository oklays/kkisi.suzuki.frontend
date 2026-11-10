import { requireMember } from '@/lib/auth/session.server';
import { ServiceUnavailableError } from '@/lib/errors/service-errors';
import { PrivacyProvider } from '@/providers/PrivacyProvider';
import { CartProvider } from '@/providers/CartProvider';
import { RouteTracker } from '@/components/navigation/RouteTracker';
import { Icon } from '@/components/ui/Icon';
import { RetryButton } from '@/components/feedback/RetryButton';

/** Member data is per request: never prerendered, never cached. */
export const dynamic = 'force-dynamic';

/**
 * Every screen in this group is for an authenticated member only. This is the first check; each page's data loader repeats it
 * through the same per-request memoised requireMember(), because layouts and pages render in parallel.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireMember();
  } catch (e) {
    if (!(e instanceof ServiceUnavailableError)) throw e;
    return (
      <div className="app">
        <main id="main" className="content state-page">
          <div className="empty error" role="alert">
            <span className="empty-icon" aria-hidden="true"><Icon name="info" /></span>
            <h1 style={{ fontSize: 18 }}>{e.code === 'NOT_CONFIGURED' ? 'Layanan belum tersedia' : 'Layanan sedang terganggu'}</h1>
            <p>{e.code === 'NOT_CONFIGURED' ? 'Aplikasi anggota belum selesai dikonfigurasi oleh pengelola.' : 'Data anggota belum dapat diambil. Tidak ada data yang diubah.'}</p>
            <RetryButton />
          </div>
        </main>
      </div>
    );
  }
  return (
    <PrivacyProvider>
      <CartProvider>
        <RouteTracker />
        {children}
      </CartProvider>
    </PrivacyProvider>
  );
}
