import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabLinks } from '@/components/navigation/TabLinks';
import { SectionHeading } from '@/components/feedback/States';
import { DeductionPanel, ListSkeleton, MovementList, SavingsCards, SavingsHero, SavingsHeroSkeleton, WithdrawalPanel } from '@/features/savings/components/SavingsViews';

export const metadata: Metadata = { title: 'Simpanan' };
type Params = Promise<Record<string, string | string[] | undefined>>;

const TABS = ['kartu', 'setoran', 'potongan', 'penarikan'] as const;
const LABEL = { kartu: 'Kartu', setoran: 'Setoran', potongan: 'Potongan', penarikan: 'Penarikan' };

export default async function SimpananPage({ searchParams }: { searchParams: Params }) {
  const p = await searchParams;
  const tab = TABS.find((t) => t === p.tab) ?? 'kartu';
  const jenis = typeof p.jenis === 'string' ? p.jenis.slice(0, 60) : null;
  const before = typeof p.sebelum === 'string' && /^[1-9]\d{0,10}$/.test(p.sebelum) ? Number(p.sebelum) : null;
  return (
    <Screen name="simpanan" nav>
      <PageHeader title="Simpanan" subtitle="Simpanan anggota KKISI TB2" back="/beranda" symbol="wallet">
        <TabLinks label="Layanan simpanan" current={tab} items={TABS.map((t) => ({ key: t, label: LABEL[t], href: t === 'kartu' ? '/simpanan' : `/simpanan?tab=${t}` }))} />
      </PageHeader>
      <main id="main" className="content">
        <Suspense fallback={<SavingsHeroSkeleton />}><SavingsHero /></Suspense>
        {tab === 'kartu' ? <Suspense key={`${jenis}-${before}`} fallback={<><div style={{ height: 24 }} /><ListSkeleton /></>}><SavingsCards selected={jenis} before={before} /></Suspense> : null}
        {tab === 'setoran' ? (
          <>
            <SectionHeading title="Setoran simpanan" subtitle="Setoran yang tercatat, semua jenis." />
            <Suspense key={`${before}`} fallback={<ListSkeleton />}><MovementList type={null} before={before} filter="in" pageHref={(id) => `/simpanan?tab=setoran&sebelum=${id}`} /></Suspense>
          </>
        ) : null}
        {tab === 'potongan' ? <Suspense fallback={<ListSkeleton rows={2} />}><DeductionPanel /></Suspense> : null}
        {tab === 'penarikan' ? <Suspense fallback={<ListSkeleton rows={2} />}><WithdrawalPanel /></Suspense> : null}
        <p className="footnote">Angka dihitung dari mutasi yang disetujui koperasi. Saldo resmi tetap mengacu pada catatan koperasi.</p>
      </main>
    </Screen>
  );
}
