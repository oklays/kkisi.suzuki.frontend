import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { KosipaError, loanProduct, type LoanPortfolio } from '@koperasi/domain/kosipa';
import { listLoans, readLoanPortfolio, readUnpaidSchedule, type LoanListPage } from '@koperasi/application/kosipa/loans';
import { FeedbackState, FilterContext } from '@/components/console/kosipa/KosipaUI';
import { PrivatePagination } from '@/components/console/kosipa/PrivateWorkspace';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanFigure, LoanFigureStrip, LoanFilterForm, LoanPageHeader, LoanTable, Money, UnpaidFallback, UnpaidValue, actionCount, type LoanListFilters, type UnpaidPromise } from '@/components/console/kosipa/LoanUI';
import { LOAN_HUB, count, shortDate } from '@/components/console/kosipa/loan-format';
import { qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function generateMetadata({ params }: { params: Promise<{ produk: string }> }) {
  const def = loanProduct((await params).produk);
  return { title: `${def?.label ?? 'Produk Pinjaman'} · KOSIPA · KKISI TB2` };
}

/** One legacy Pinjaman submenu (Reguler, Bank, Kasbon, Pembiayaan, Gaji Minus, KPR BTN): its figures, its segments and its documents. */
export default async function LoanProductPage({ params, searchParams }: { params: Promise<{ produk: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { produk } = await params;
  const def = loanProduct(produk);
  if (!def) notFound();
  const path = `${LOAN_HUB}/produk/${def.slug}`;
  const auth = await requireConsoleSession({ next: path });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams;
  const f: LoanListFilters = { q: one(sp.q).slice(0, 50), status: one(sp.status), cair: one(sp.cair), bayar: one(sp.bayar), periode: one(sp.periode), produk: def.slug, segmen: one(sp.segmen).slice(0, 60) };
  const deps = { reader: services.loans, audit: services.audit, now: services.now };
  const actor = () => ({ userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() });
  let portfolio: LoanPortfolio | null = null; let page: LoanListPage | null = null; let failed = false; let invalid = false;
  const [p, l] = await Promise.allSettled([readLoanPortfolio(deps, actor()), listLoans(deps, actor(), { ...sp, produk: def.slug })]);
  if (p.status === 'fulfilled') portfolio = p.value;
  if (l.status === 'fulfilled') page = l.value; else if (l.reason instanceof KosipaError) invalid = true; else failed = true;
  const unpaid: UnpaidPromise = readUnpaidSchedule(deps, actor(), def.slug).catch(() => ({ state: 'unavailable' as const }));
  const line = portfolio?.lines.find((x) => x.product === def.slug) ?? null;
  const segment = f.segmen || null;
  const listParams = { q: f.q, status: f.status, cair: f.cair, bayar: f.bayar, periode: f.periode, segmen: f.segmen };

  return (
    <div className="console-page kloan-page">
      <LoanPageHeader title={<> {def.label} </>}>
        <p>Sama dengan submenu {def.label} di KOSIPA lama: {def.rule.charAt(0).toLowerCase() + def.rule.slice(1)}.{line && shortDate(line.latestDocDate) && <> Dokumen terbaru <strong>{shortDate(line.latestDocDate)}</strong>.</>}</p>
      </LoanPageHeader>

      {line ? (
        <LoanFigureStrip label={`Ringkasan ${def.label}`}>
          <LoanFigure lead label="Sisa pokok menurut jadwal" note={<>Angsuran belum dibayar dari {count(line.active)} pinjaman aktif</>}>
            <Suspense fallback={<UnpaidFallback />}><UnpaidValue promise={unpaid} product={def.slug} /></Suspense>
          </LoanFigure>
          <LoanFigure label="Pinjaman aktif" note={<>dari {count(line.documents)} dokumen · {count(line.settled)} sudah lunas</>}>{count(line.active)}</LoanFigure>
          <LoanFigure label="Pokok awal pinjaman aktif" note="Jumlah pokok saat dicairkan"><Money units={line.activePrincipal4} compact /></LoanFigure>
          <LoanFigure label="Perlu tindakan" note={<>{count(line.awaitingApproval)} menunggu persetujuan · {count(line.awaitingDisbursement)} belum cair</>}>{count(actionCount(line))}</LoanFigure>
        </LoanFigureStrip>
      ) : <p className="console-unavailable" role="status">Ringkasan {def.label} tidak dapat dibaca saat ini. Daftar dokumen di bawah tetap ditampilkan.</p>}

      {line && line.segments.length > 1 && (
        <nav className="kloan-segments" aria-label={`${def.segmentLabel} ${def.label}`}>
          <span className="kloan-segments-label">{def.segmentLabel}</span>
          <ul>
            <li><Link prefetch={false} href={path} aria-current={segment === null ? 'page' : undefined}>Semua<small>{count(line.documents)} dok</small></Link></li>
            {line.segments.map((s) => (
              <li key={s.key ?? 'unrecorded'}>{s.key === null
                ? <span className="kloan-segment-static" title="Kolom bank_pembiaya kosong atau 0; tidak bisa dipilih sebagai filter">Tidak tercatat<small>{count(s.documents)} dok</small></span>
                : <Link prefetch={false} href={`${path}${qs({ segmen: s.key })}`} aria-current={segment === s.key ? 'page' : undefined}>{s.key}<small>{s.active ? `${count(s.active)} aktif · ` : ''}{count(s.documents)} dok</small></Link>}</li>
            ))}
          </ul>
        </nav>
      )}

      <LoanFilterForm action={path} f={f} fixedProduct />
      <FilterContext privateReset reset={path} filters={[{ label: def.segmentLabel, value: f.segmen }, { label: 'Status', value: f.status }, { label: 'Pencairan', value: f.cair }, { label: 'Pelunasan', value: f.bayar }, { label: 'Bulan', value: f.periode }, { label: 'Pencarian', value: f.q ? 'Aktif' : '' }]} />
      {invalid && <FeedbackState kind="error" title={<> Filter tidak valid </>} reset={path}><p>Periksa status, bulan dokumen, dan pilihan {def.segmentLabel.toLowerCase()}. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Dokumen {def.label} tidak dapat dibaca </>} reset={path}><p>Database tidak menjawab tepat waktu. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {page && page.items.length === 0 && <FeedbackState kind="empty" title={<> Tidak ada dokumen {def.label} yang cocok </>} reset={path}><p>{page.filterActive ? 'Tidak ada dokumen untuk kombinasi filter ini. Longgarkan salah satu filter.' : `Belum ada dokumen ${def.label} tercatat.`}</p></FeedbackState>}
      {page && page.items.length > 0 && (
        <section aria-label={`Dokumen ${def.label}`} className="console-section">
          <LoanTable items={page.items} detailQuery={{}} showProduct={false} />
          <p className="console-notice">{page.items.length} dokumen di halaman ini, terbaru lebih dulu.</p>
          {page.nextCursor !== null && <PrivatePagination path={path} params={{ ...listParams, after: String(page.nextCursor) }}>Muat dokumen lebih lama</PrivatePagination>}
        </section>
      )}
    </div>
  );
}
