import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowRight, BadgeCheck, Repeat2, Search } from 'lucide-react';
import { readLoanPortfolio, readUnpaidSchedule } from '@koperasi/application/kosipa/loans';
import type { LoanPortfolio } from '@koperasi/domain/kosipa';
import { FeedbackState, ContextNotice, Provenance } from '@/components/console/kosipa/KosipaUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanFigure, LoanFigureStrip, LoanPageHeader, Money, UnpaidFallback, UnpaidValue, actionCount, type UnpaidPromise } from '@/components/console/kosipa/LoanUI';
import { LOAN_HUB, LOAN_LIST, count, productHref, shortDate } from '@/components/console/kosipa/loan-format';
import { qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

import LoanListPage from './daftar/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pinjaman · KOSIPA · KKISI TB2' };

const FILTER_KEYS = ['q', 'status', 'cair', 'bayar', 'periode', 'produk', 'after'] as const;

/**
 * Pinjaman hub: every loan document summarised per legacy product (the old KOSIPA submenus), what is waiting for someone, and the
 * way into each product, the settlement history and the roll-over history. Header figures render at once; the recorded unpaid
 * schedule streams in per cell because it needs one scan of the unindexed schedule table.
 */
export default async function LoanHubPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: LOAN_HUB });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = searchParams ? await searchParams : {};
  if (FILTER_KEYS.some((k) => sp[k] !== undefined && sp[k] !== '')) return <LoanListPage searchParams={Promise.resolve(sp)} />;
  const deps = { reader: services.loans, audit: services.audit, now: services.now };
  const actor = { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() };
  let portfolio: LoanPortfolio | null = null;
  try { portfolio = await readLoanPortfolio(deps, actor); } catch { /* rendered as the error state below */ }
  const unpaid: UnpaidPromise = portfolio ? readUnpaidSchedule(deps, actor).catch(() => ({ state: 'unavailable' as const })) : Promise.resolve({ state: 'unavailable' as const });
  const latest = shortDate(portfolio?.total.latestDocDate);

  return (
    <div className="console-page kloan-page">
      <LoanPageHeader title={<> Pinjaman </>}>
        <p>Ringkasan semua pinjaman KOSIPA per produk, dikelompokkan dengan aturan yang sama seperti submenu Pinjaman di KOSIPA lama.{latest && <> Dokumen terbaru tercatat <strong>{latest}</strong>.</>}</p>
      </LoanPageHeader>

      <form className="kloan-quicksearch" action={LOAN_LIST} method="post" data-kosipa-private role="search" aria-label="Cari dokumen pinjaman">
        <label htmlFor="loan-q">Cari dokumen atau anggota</label>
        <div><Search size={17} aria-hidden="true" /><input id="loan-q" name="q" minLength={2} maxLength={50} required autoComplete="off" placeholder="NIK, nama anggota, atau nomor dokumen (PIN…, BON…, PEMBYN…)" /><button type="submit">Terapkan filter</button></div>
      </form>

      {!portfolio ? (
        <FeedbackState kind="error" title={<> Ringkasan pinjaman tidak dapat dibaca </>} reset={LOAN_HUB}><p>Database tidak menjawab tepat waktu. Daftar dokumen per produk tetap bisa dibuka dari menu samping.</p></FeedbackState>
      ) : portfolio.total.documents === 0 ? (
        <FeedbackState kind="empty" title={<> Belum ada pinjaman tercatat </>}><p>Belum ada dokumen pinjaman di KOSIPA. Ringkasan akan muncul setelah dokumen pertama dibuat di KOSIPA lama.</p></FeedbackState>
      ) : <Hub portfolio={portfolio} unpaid={unpaid} />}
    </div>
  );
}

function Hub({ portfolio, unpaid }: { portfolio: LoanPortfolio; unpaid: UnpaidPromise }) {
  const t = portfolio.total;
  const lines = portfolio.lines.filter((l) => l.product !== 'lainnya' || l.documents > 0);
  const attention = [
    { label: 'Diajukan, belum diproses', hint: 'Status dokumen OPEN', n: t.submitted, href: `${LOAN_LIST}${qs({ status: 'OPEN', bayar: 'BELUM LUNAS' })}` },
    { label: 'Menunggu persetujuan', hint: 'Status dokumen POSTING', n: t.posted, href: `${LOAN_LIST}${qs({ status: 'POSTING', bayar: 'BELUM LUNAS' })}` },
    { label: 'Disetujui, belum dicairkan', hint: 'APPROVED, pencairan OPEN', n: t.awaitingDisbursement, href: `${LOAN_LIST}${qs({ status: 'APPROVED', cair: 'OPEN', bayar: 'BELUM LUNAS' })}` },
  ];
  return <>
    <LoanFigureStrip label="Ringkasan seluruh pinjaman">
      <LoanFigure lead label="Sisa pokok menurut jadwal" note={<>Angsuran belum dibayar dari {count(t.active)} pinjaman aktif</>}>
        <Suspense fallback={<UnpaidFallback />}><UnpaidValue promise={unpaid} /></Suspense>
      </LoanFigure>
      <LoanFigure label="Pinjaman aktif" note={<>Disetujui, sudah cair, belum lunas · dari {count(t.documents)} dokumen</>}>{count(t.active)}</LoanFigure>
      <LoanFigure label="Pokok awal pinjaman aktif" note="Jumlah pokok saat pinjaman aktif dicairkan"><Money units={t.activePrincipal4} compact /></LoanFigure>
      <LoanFigure label="Perlu tindakan" note="Menunggu persetujuan atau pencairan">{count(actionCount(t))}</LoanFigure>
    </LoanFigureStrip>

    <div className="kloan-hub-grid">
      <section className="kloan-ledger" aria-labelledby="ledger-title">
        <header className="kloan-section-head">
          <div><h2 id="ledger-title">Portofolio per produk</h2><p>Pilih produk untuk melihat dokumennya. Batang menunjukkan porsi sisa pokok tiap produk.</p></div>
          <Provenance kind="recorded" />
        </header>
        <div className="kosipa-table-frame kloan-ledger-frame">
          <div className="kosipa-table-scroll kloan-ledger-scroll" role="region" aria-labelledby="ledger-title" tabIndex={0} suppressHydrationWarning>
            <table className="kloan-ledger-table">
              <caption className="console-visually-hidden">Ringkasan pinjaman per produk</caption>
              <thead><tr><th scope="col">Produk</th><th scope="col" className="num">Pinjaman aktif</th><th scope="col">Sisa pokok (jadwal)</th><th scope="col" className="num">Pokok awal aktif</th><th scope="col" className="num">Perlu tindakan</th><th scope="col" className="num">Total dokumen</th></tr></thead>
              <tbody>{lines.map((l) => {
                const named = l.segments.filter((s) => s.key !== null);
                const preview = named.slice(0, 3).map((s) => s.key).join(' · ') + (named.length > 3 ? ` · +${named.length - 3} lainnya` : '');
                return <tr key={l.product} data-unmapped={l.product === 'lainnya' || undefined}>
                  <th scope="row">
                    <Link prefetch={false} href={productHref(l.product)} className="kloan-ledger-product">{l.label}<ArrowRight size={14} aria-hidden="true" /></Link>
                    <small>{l.product === 'lainnya' ? 'Tidak tampil di submenu legacy mana pun' : preview || l.rule}</small>
                  </th>
                  <td className="num" data-label="Pinjaman aktif"><strong>{count(l.active)}</strong></td>
                  <td data-label="Sisa pokok (jadwal)"><Suspense fallback={<UnpaidFallback share />}><UnpaidValue promise={unpaid} product={l.product} share /></Suspense></td>
                  <td className="num" data-label="Pokok awal aktif"><Money units={l.activePrincipal4} compact /></td>
                  <td className="num" data-label="Perlu tindakan">{actionCount(l) ? <span className="kloan-attn">{count(actionCount(l))}</span> : <span className="kloan-muted">0</span>}</td>
                  <td className="num" data-label="Total dokumen">{count(l.documents)}<small>{shortDate(l.latestDocDate) ? `terbaru ${shortDate(l.latestDocDate)}` : 'tanpa tanggal valid'}</small></td>
                </tr>;
              })}</tbody>
              <tfoot><tr>
                <th scope="row">Semua produk</th>
                <td className="num" data-label="Pinjaman aktif"><strong>{count(t.active)}</strong></td>
                <td data-label="Sisa pokok (jadwal)"><Suspense fallback={<UnpaidFallback />}><UnpaidValue promise={unpaid} /></Suspense></td>
                <td className="num" data-label="Pokok awal aktif"><Money units={t.activePrincipal4} compact /></td>
                <td className="num" data-label="Perlu tindakan">{count(actionCount(t))}</td>
                <td className="num" data-label="Total dokumen">{count(t.documents)}</td>
              </tr></tfoot>
            </table>
          </div>
          <p className="kosipa-table-hint" hidden suppressHydrationWarning><ArrowRight size={13} aria-hidden="true" />Geser tabel untuk melihat kolom lainnya.</p>
        </div>
      </section>

      <aside className="kloan-side" aria-label="Tindakan dan riwayat">
        <section className="kloan-panel" aria-labelledby="attn-title">
          <h2 id="attn-title">Perlu tindakan</h2>
          <p>Dokumen yang belum selesai diproses. Persetujuan dan pencairan masih dilakukan di KOSIPA lama.</p>
          <ul className="kloan-attn-list">{attention.map((a) => (
            <li key={a.label}><Link prefetch={false} href={a.href} data-zero={a.n === 0 || undefined}>
              <span><strong>{a.label}</strong><small>{a.hint}</small></span><span className="kloan-attn-n">{count(a.n)}</span>
            </Link></li>
          ))}</ul>
          {t.conflicting > 0 && <p className="kloan-panel-foot">{count(t.conflicting)} dokumen punya kombinasi status yang saling bertentangan. <Link prefetch={false} href="/console/kosipa/laporan/kualitas-data">Lihat diagnostik kualitas data</Link></p>}
        </section>
        <section className="kloan-panel" aria-labelledby="hist-title">
          <h2 id="hist-title">Riwayat penyelesaian</h2>
          <ul className="kloan-history">
            <li><Link prefetch={false} href={`${LOAN_HUB}/pelunasan`}><BadgeCheck size={18} aria-hidden="true" /><span><strong>Pelunasan Pinjaman</strong><small>Lunas dipercepat, pensiun, dan resign beserta nominalnya</small></span></Link></li>
            <li><Link prefetch={false} href={`${LOAN_HUB}/roll-over`}><Repeat2 size={18} aria-hidden="true" /><span><strong>Roll Over Pinjaman</strong><small>Pinjaman lama yang dilunasi dengan pinjaman baru</small></span></Link></li>
          </ul>
        </section>
      </aside>
    </div>

    <ContextNotice title="Angka tercatat, bukan outstanding resmi" expandable>
      <p>Sisa pokok menjumlahkan angsuran berstatus Belum Bayar pada jadwal pinjaman aktif, persis seperti tercatat di KOSIPA lama. Saldo outstanding resmi belum tersedia karena definisinya belum diverifikasi. Pinjaman aktif berarti dokumen APPROVED, pencairan APPROVED, dan pelunasan BELUM LUNAS, sama seperti Kartu Aktif dan kartu Kas Pinjaman di dashboard.</p>
    </ContextNotice>
  </>;
}
