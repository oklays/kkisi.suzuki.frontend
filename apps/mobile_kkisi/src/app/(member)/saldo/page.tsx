import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Note, SectionHeading, Skeleton, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { rupiahSen } from '@/lib/utils/money';
import { monthShort } from '@/lib/utils/dates';
import { getMonthCreditPurchases, getStoreCredit } from '@/features/store-credit/services/store-credit.server';

export const metadata: Metadata = { title: 'Saldo Kredit Toko' };

const REASON = { MEMBER_INACTIVE: 'Status keanggotaan saat ini tidak aktif untuk kredit toko.', MEMBER_EXPIRED: 'Masa kontrak sudah berakhir, kredit toko tidak tersedia.', INVALID_AMOUNT: 'Data limit kredit tidak valid; hubungi pengurus koperasi.' };

async function CreditHero() {
  const r = await getStoreCredit();
  if (r.state !== 'ok') return <UnavailableState what="Kredit toko" compact={false} />;
  const c = r.data.credit;
  if (!c.eligible) {
    return (
      <section className="hero credit-card" aria-labelledby="credit-title">
        <p className="hero-label" id="credit-title">Sisa Kredit Toko</p>
        <div className="amount is-unavailable">Tidak tersedia</div>
        <p style={{ fontSize: 12, color: 'var(--blue-tint)', marginTop: 8, lineHeight: 1.6 }}>{REASON[c.reason]}</p>
        <div className="hero-foot"><span>Terpakai bulan ini <Sensitive>{rupiahSen(c.usedSen)}</Sensitive></span></div>
      </section>
    );
  }
  return (
    <section className="hero credit-card" aria-labelledby="credit-title">
      <div className="credit-top">
        <div><p className="hero-label" id="credit-title">Sisa Kredit Toko <PrivacyToggle what="nominal" /></p><div className="amount"><Sensitive>{rupiahSen(c.remainingSen)}</Sensitive></div></div>
        <span className="credit-emblem" aria-hidden="true"><Icon name="store" /></span>
      </div>
      <dl className="credit-values">
        <div><dt>Limit Kredit Toko</dt><dd><Sensitive>{rupiahSen(c.limitSen)}</Sensitive></dd></div>
        <div><dt>Terpakai bulan ini</dt><dd><Sensitive>{rupiahSen(c.usedSen)}</Sensitive></dd></div>
      </dl>
      <div className="credit-meter" role="progressbar" aria-label="Kredit toko terpakai" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.usedPercent} aria-valuetext={`${c.usedPercent}% dari limit kredit toko terpakai`}>
        <span style={{ width: `${c.usedPercent}%` }} />
      </div>
      <div className="hero-foot"><span>{c.usedPercent}% dari limit terpakai</span>{c.returnedSen ? <span className="chip-dark">Retur <Sensitive>{rupiahSen(c.returnedSen)}</Sensitive></span> : null}</div>
    </section>
  );
}

async function History() {
  const [r, credit] = await Promise.all([getMonthCreditPurchases(), getStoreCredit()]);
  const month = credit.state === 'ok' ? monthShort(credit.data.month) : '';
  return (
    <section aria-labelledby="history-title">
      <SectionHeading id="history-title" title="Riwayat Bulan Ini" subtitle="Pemakaian kredit belanja toko." action={<span className="month-label">{month}</span>} />
      {r.state !== 'ok' ? <UnavailableState what="Riwayat kredit" /> : (
        <>
          <details className="history-card" open>
            <summary>
              <span className="channel-icon offline"><Icon name="store" /></span>
              <span className="channel-copy"><strong>Belanja di Toko</strong><small>{r.data.length} transaksi kredit</small></span>
              <span className="channel-total"><b><Sensitive>{rupiahSen(r.data.reduce((s, p) => s + p.amountSen, 0))}</Sensitive></b><span className="disclosure-hint" aria-hidden="true">Lihat rincian</span></span>
              <span className="chevron"><Icon name="chevronRight" /></span>
            </summary>
            {r.data.length ? (
              <ol className="purchase-list">{r.data.map((p) => (
                <li key={p.id}><span className="purchase-icon"><Icon name="receipt" /></span><div className="purchase-copy"><strong>{p.date}</strong><small>{p.store}</small></div><b><Sensitive>{rupiahSen(p.amountSen)}</Sensitive></b></li>
              ))}</ol>
            ) : <div className="online-empty"><span><Icon name="info" /></span><div><h3>Belum ada belanja kredit</h3><p>Belanja dengan pembayaran kredit bulan ini akan tampil di sini.</p></div></div>}
          </details>
          <details className="history-card">
            <summary>
              <span className="channel-icon online"><Icon name="wifi" /></span>
              <span className="channel-copy"><strong>Belanja Online</strong><small>Pembelian online</small></span>
              <span className="channel-total"><span className="disclosure-hint" aria-hidden="true">Lihat rincian</span></span>
              <span className="chevron"><Icon name="chevronRight" /></span>
            </summary>
            <div className="online-empty"><span><Icon name="info" /></span><div><h3>Rincian belum tersedia</h3><p>Pemakaian kredit dari belanja online belum dapat dihitung di aplikasi ini. Riwayat pesanan online ada di menu Transaksi.</p></div></div>
          </details>
        </>
      )}
    </section>
  );
}

export default function SaldoPage() {
  return (
    <Screen name="saldo" nav>
      <PageHeader title="Saldo Kredit Toko" subtitle="Toko S-MART" back="/beranda" symbol="store" />
      <main id="main" className="content">
        <Suspense fallback={<section className="hero credit-card" aria-busy="true" style={{ minHeight: 226 }}><Skeleton onBlue height={14} width={130} /><Skeleton onBlue height={36} width={170} style={{ marginTop: 10 }} /><Skeleton onBlue height={52} style={{ marginTop: 22 }} /><Skeleton onBlue height={7} style={{ marginTop: 16 }} /></section>}><CreditHero /></Suspense>
        <Suspense fallback={<div aria-busy="true"><div className="section-heading"><Skeleton height={36} width={180} /></div><Skeleton height={226} /><Skeleton height={94} style={{ marginTop: 12 }} /></div>}><History /></Suspense>
        <Note title="Kredit belanja toko">Sisa kredit adalah limit yang masih dapat digunakan untuk belanja di Toko S-MART bulan ini, dihitung dengan aturan yang sama dengan kasir toko.</Note>
        <p className="footnote">Data diambil langsung dari sistem toko koperasi.</p>
      </main>
    </Screen>
  );
}

