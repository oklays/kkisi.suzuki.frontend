import type { Metadata } from 'next';
import Link from 'next/link';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { requireMember } from '@/lib/auth/session.server';

export const metadata: Metadata = { title: 'Checkout Layanan' };

/** Mockup "Checkout Layanan". A PPOB purchase can only be reviewed here once a product was chosen from the provider; until the
 *  provider is connected no draft can exist, so this screen always shows its empty state. */
export default async function CheckoutLayananPage() {
  await requireMember();
  return (
    <Screen name="checkout-layanan" className="formpage">
      <PageHeader title="Checkout Layanan" subtitle="PPOB" back="/beranda" symbol="document" />
      <main id="main" className="content">
        <div className="empty">
          <span className="empty-icon" aria-hidden="true"><Icon name="document" /></span>
          <h2>Belum ada layanan dipilih</h2>
          <p>Pembelian pulsa, token, paket data dan pembayaran tagihan belum tersedia di aplikasi anggota karena penyedia PPOB belum terhubung.</p>
          <Link className="primary" href="/beranda">Pilih layanan</Link>
        </div>
      </main>
    </Screen>
  );
}
