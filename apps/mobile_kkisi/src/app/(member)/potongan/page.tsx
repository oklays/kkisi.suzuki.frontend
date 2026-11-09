import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Note, SectionHeading, Skeleton, StatusBadge, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { rupiah4 } from '@/lib/utils/money';
import { getDeductionPeriods } from '@/features/deductions/services/deductions.server';

export const metadata: Metadata = { title: 'Potongan' };

const GROUP_TONE: Record<string, { tone: string; icon: 'wallet' | 'loan' | 'store' | 'phone' | 'receipt' }> = {
  simpanan: { tone: 'yellow', icon: 'wallet' }, piutang: { tone: 'slate', icon: 'loan' }, kasbon: { tone: 'slate', icon: 'loan' },
  toko: { tone: 'blue', icon: 'store' }, ppob: { tone: 'slate', icon: 'phone' }, lainnya: { tone: 'blue', icon: 'receipt' },
};

async function DeductionContent() {
  const r = await getDeductionPeriods();
  if (r.state !== 'ok') return <UnavailableState what="Potongan payroll" compact={false} />;
  if (r.data.length === 0) return <EmptyState icon="receipt" title="Belum ada potongan tercatat">Potongan payroll bulanan akan tampil setelah koperasi memproses periode potongan.</EmptyState>;
  const [latest, ...others] = r.data;
  return (
    <>
      <section className="hero" aria-labelledby="total-title">
        <div className="balance-top"><span className="hero-label" id="total-title">Total Potongan - {latest.period}</span><PrivacyToggle what="nominal" /></div>
        <div className="amount"><Sensitive>{rupiah4(latest.total4)}</Sensitive></div>
        <div className="hero-foot"><span>Rincian potongan anggota</span><span className="chip-dark">{latest.status.label}</span></div>
      </section>
      <section aria-labelledby="components-title">
        <SectionHeading id="components-title" title="Rincian Komponen" subtitle={latest.period} action={<span className="component-count">{latest.components.length} komponen</span>} />
        <ul className="list-card">
          {latest.components.map((c) => {
            const g = GROUP_TONE[c.group] ?? GROUP_TONE.lainnya;
            return <li key={c.key} className="component-row"><span className={`component-icon tone-${g.tone}`}><Icon name={g.icon} /></span><span className="component-name">{c.label}</span><strong><Sensitive>{rupiah4(c.amount4)}</Sensitive></strong></li>;
          })}
        </ul>
        {!latest.totalMatches ? <Note tone="warning" title="Total berbeda dengan komponen">Total potongan yang tercatat tidak sama dengan jumlah komponennya. Angka ditampilkan apa adanya; tanyakan ke pengurus koperasi.</Note> : null}
      </section>
      {others.length ? (
        <section aria-labelledby="period-title">
          <SectionHeading id="period-title" title="Periode Lainnya" />
          {others.map((p) => (
            <div key={p.id} className="period-card">
              <span className="period-icon"><Icon name="calendar" /></span>
              <div className="period-copy"><h3>{p.period}</h3><p>{p.components.length} komponen</p><StatusBadge tone={p.status.tone}>{p.status.label}</StatusBadge></div>
              <strong><Sensitive>{rupiah4(p.total4)}</Sensitive></strong>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

export default function PotonganPage() {
  return (
    <Screen name="potongan" nav>
      <PageHeader title="Potongan" subtitle="Rincian potongan anggota" back="/beranda" symbol="receipt" />
      <main id="main" className="content">
        <Suspense fallback={<section className="hero" aria-busy="true"><Skeleton onBlue height={14} width={180} /><Skeleton onBlue height={34} width={170} style={{ marginTop: 10 }} /></section>}><DeductionContent /></Suspense>
        <Link className="primary apply-change" href="/potongan/ajukan"><span>Ajukan perubahan potongan</span><Icon name="chevronRight" /></Link>
        <p className="footnote">Potongan sesuai catatan payroll koperasi per periode.</p>
      </main>
    </Screen>
  );
}
