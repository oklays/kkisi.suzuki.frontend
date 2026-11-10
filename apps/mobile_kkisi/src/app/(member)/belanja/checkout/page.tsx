import type { Metadata } from 'next';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { StoreCheckout } from '@/features/catalog/components/StoreCheckout';
import { getProfile } from '@/features/member/services/member.server';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  const profile = await getProfile();
  return (
    <Screen name="checkout" footerSpace={140} className="formpage">
      <PageHeader title="Checkout" subtitle="Toko S-MART TB2" back="/belanja" symbol="store" />
      <main id="main" className="content">
        <StoreCheckout address={profile.address ? `${profile.name} - ${profile.address}` : null} />
      </main>
    </Screen>
  );
}
