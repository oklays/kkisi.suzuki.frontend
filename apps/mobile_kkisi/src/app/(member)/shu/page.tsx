import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabLinks } from '@/components/navigation/TabLinks';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, SectionHeading, Skeleton, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { rupiahSen } from '@/lib/utils/money';
import { getShuYears } from '@/features/shu/services/shu.server';

export const metadata: Metadata = { title: 'SHU' };

async function ShuContent({ year }: { year: string | null }) {
  const r = await getShuYears();
  if (r.state !== 'ok') return <UnavailableState what="SHU" compact={false} />;
  if (r.data.length === 0) return <EmptyState icon="pie" title="Belum ada SHU yang dipublikasikan">SHU tahunan tampil setelah koperasi mempublikasikan pembagian SHU.</EmptyState>;
  const current = r.data.find((y) => y.year === year) ?? r.data[0];
  return (
    <>
      {r.data.length > 1 ? <TabLinks inContent label="Tahun SHU" current={current.year} items={r.data.slice(0, 4).map((y) => ({ key: y.year, label: y.year, href: `/shu?tahun=${y.year}` }))} /> : null}
      <section className="hero" aria-labelledby="income-title">
        <div className="hero-label" id="income-title">Pendapatan Total<PrivacyToggle what="nominal" /></div>
        <div className="amount"><Sensitive>{rupiahSen(current.incomeSen)}</Sensitive></div>
        <div className="hero-foot"><span>Tahun buku {current.year}</span><span className="chip-dark">Dipublikasikan</span></div>
      </section>
      <section aria-labelledby="shu-detail-title">
        <SectionHeading id="shu-detail-title" title="Rincian SHU" subtitle={`Komponen pendapatan tahun ${current.year}.`} />
        <dl className="list-card" style={{ listStyle: 'none' }}>
          {current.lines.map((l) => (
            <div key={l.label} className="shu-row"><span className={`type-icon ${l.tone}`}><Icon name="pie" /></span><dt>{l.label}</dt><dd><Sensitive>{rupiahSen(l.amountSen)}</Sensitive></dd></div>
          ))}
          <div className="shu-row total-row"><span className="type-icon blue"><Icon name="pie" /></span><dt>Pendapatan Total</dt><dd><Sensitive>{rupiahSen(current.incomeSen)}</Sensitive></dd></div>
        </dl>
      </section>
    </>
  );
}

export default async function ShuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = (await searchParams).tahun;
  const year = typeof t === 'string' && /^\d{4}$/.test(t) ? t : null;
  return (
    <Screen name="shu" nav>
      <PageHeader title="SHU" subtitle="SHU anggota KKISI TB2" back="/beranda" symbol="pie" />
      <main id="main" className="content">
        <Suspense key={year ?? 'latest'} fallback={<section className="hero" aria-busy="true"><Skeleton onBlue height={14} width={120} /><Skeleton onBlue height={34} width={150} style={{ marginTop: 10 }} /></section>}><ShuContent year={year} /></Suspense>
        <p className="footnote">Nilai SHU sesuai dokumen SHU koperasi yang dipublikasikan. <Link href="/lainnya" className="text-link" style={{ fontSize: 10, minHeight: 0, padding: 0 }}>Butuh bantuan?</Link></p>
      </main>
    </Screen>
  );
}
