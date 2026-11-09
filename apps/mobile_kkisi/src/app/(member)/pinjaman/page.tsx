import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabLinks } from '@/components/navigation/TabLinks';
import { ListSkeleton } from '@/features/savings/components/SavingsViews';
import { ActiveLoanSection, ActiveLoanSkeleton, ApplicationsPanel, LatestApplication } from '@/features/loans/components/LoanViews';

export const metadata: Metadata = { title: 'Pinjaman' };

export default async function PinjamanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tab = (await searchParams).tab === 'pengajuan' ? 'pengajuan' : 'aktif';
  return (
    <Screen name="pinjaman" nav>
      <PageHeader title="Pinjaman" subtitle="Pinjaman anggota KKISI TB2" back="/beranda" symbol="loan">
        <TabLinks label="Layanan pinjaman" current={tab} items={[{ key: 'aktif', label: 'Aktif', href: '/pinjaman' }, { key: 'pengajuan', label: 'Pengajuan', href: '/pinjaman?tab=pengajuan' }]} />
      </PageHeader>
      <main id="main" className="content">
        {tab === 'aktif' ? (
          <>
            <Suspense fallback={<ActiveLoanSkeleton />}><ActiveLoanSection /><LatestApplication /></Suspense>
          </>
        ) : <Suspense fallback={<ListSkeleton />}><ApplicationsPanel /></Suspense>}
        <p className="footnote">Sisa pokok dan kewajiban dihitung dari jadwal angsuran yang tercatat. Saldo resmi tetap mengacu pada catatan koperasi.</p>
      </main>
    </Screen>
  );
}
