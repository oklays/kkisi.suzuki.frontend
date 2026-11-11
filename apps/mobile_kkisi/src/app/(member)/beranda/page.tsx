import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { PromoCarousel } from '@/features/home/components/PromoCarousel';
import { BalanceCard, BalanceCardSkeleton, CoopGrid, CoopGridSkeleton, Reminders, RemindersSkeleton, ServicesGrid, StoreCard, StoreCardSkeleton } from '@/features/home/components/HomeSections';

export const metadata: Metadata = { title: 'Beranda' };

export default function BerandaPage() {
  return (
    <Screen name="beranda" nav>
      <HomeHeader />
      <main id="main" className="content">
        <Suspense fallback={<BalanceCardSkeleton />}><BalanceCard /></Suspense>
        <ServicesGrid />
        <PromoCarousel />
        <section aria-labelledby="coop-title">
          <div className="section-heading"><h2 id="coop-title">Koperasi kamu</h2></div>
          <Suspense fallback={<CoopGridSkeleton />}><CoopGrid /></Suspense>
        </section>
        <section aria-labelledby="attention-title">
          <div className="section-heading"><h2 id="attention-title">Perlu diperhatikan</h2></div>
          <Suspense fallback={<RemindersSkeleton />}><Reminders /></Suspense>
        </section>
        <Suspense fallback={<StoreCardSkeleton />}><StoreCard /></Suspense>
        <p className="footnote">Simpanan tercatat dihitung dari mutasi yang disetujui koperasi. Saldo resmi tetap mengacu pada catatan koperasi.</p>
      </main>
    </Screen>
  );
}
