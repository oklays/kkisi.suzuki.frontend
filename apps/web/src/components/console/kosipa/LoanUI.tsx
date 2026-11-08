import Link from 'next/link';
import type { ReactNode } from 'react';
import { HandCoins, Search } from 'lucide-react';
import { LOAN_DISBURSEMENT_STATUSES, LOAN_DOC_STATUSES, LOAN_REPAYMENT_STATUSES, type LoanPortfolio, type LoanProductFilter, type LoanView, type PortfolioFigures } from '@koperasi/domain/kosipa';
import { CurrencyText } from '@/components/money/CurrencyText';
import { PageBreadcrumbs } from '../PageBreadcrumbs';
import type { TailCrumb } from '../breadcrumb-trail';
import { FinancialTable } from './KosipaUI';
import { maskIdentifier } from './presentation';
import { formatAmount4, formatLegacyDate, qs } from './payroll-format';
import { PRODUCT_OPTIONS, STATUS_FLAG_TEXT, loanStage, productLabel, productOf, shortDate } from './loan-format';

/** The unpaid schedule streams in after the header figures (one scan of the unindexed schedule table, up to ~4 s cold). */
export type UnpaidPromise = Promise<{ state: 'ok'; portfolio: LoanPortfolio } | { state: 'unavailable' }>;

/** Breadcrumb, title, purpose, and decorative loan-ledger illustration matching Keanggotaan (hidden on narrow screens). */
export function LoanPageHeader({ title, children, tail }: { title: ReactNode; children?: ReactNode; tail?: readonly TailCrumb[] }) {
  return <header className="membership-header kloan-header">
    <PageBreadcrumbs tail={tail} />
    <div className="membership-title-row">
      <span className="membership-title-icon" aria-hidden="true"><HandCoins size={28} /></span>
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {children}
      </div>
    </div>
    <svg className="membership-illustration" viewBox="0 0 280 120" role="presentation" aria-hidden="true" focusable="false">
      <path d="M0 96C40 70 76 112 126 86s74-52 154-34v68H0z" fill="#dbe8ff" opacity=".7" />
      <rect x="86" y="22" width="112" height="72" rx="12" fill="#cfe0ff" transform="rotate(8 142 58)" />
      <rect x="70" y="14" width="112" height="72" rx="12" fill="#fff" stroke="#bcd0f5" />
      <circle cx="98" cy="40" r="13" fill="#e6efff" stroke="#5b8def" strokeWidth="1.5" />
      <text x="98" y="44" textAnchor="middle" fill="#1d56c9" fontSize="10.5" fontWeight="800" fontFamily="system-ui, sans-serif">Rp</text>
      <rect x="120" y="31" width="46" height="6" rx="3" fill="#bcd0f5" />
      <rect x="120" y="43" width="34" height="6" rx="3" fill="#d6e2fa" />
      <rect x="85" y="64" width="82" height="7" rx="3.5" fill="#e6efff" />
      <rect x="85" y="64" width="54" height="7" rx="3.5" fill="#5b8def" />
      <circle cx="196" cy="24" r="14" fill="#22a65b" /><path d="M189 24l5 5 9-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </header>;
}

// ------------------------------------------------------------------------------------------------------------- figures
/** One figure in a strip. The first figure of a strip is the focal one (`lead`); the strip itself is a single card. */
export function LoanFigure({ label, children, note, lead = false }: { label: string; children: ReactNode; note?: ReactNode; lead?: boolean }) {
  return <div className="kloan-figure" data-lead={lead || undefined}>
    <span className="kloan-figure-label">{label}</span>
    <strong className="kloan-figure-value">{children}</strong>
    {note && <small className="kloan-figure-note">{note}</small>}
  </div>;
}
export function LoanFigureStrip({ label, children }: { label: string; children: ReactNode }) {
  return <section className="kloan-figures" aria-label={label}>{children}</section>;
}
export const Money = ({ units, compact = false }: { units: number; compact?: boolean }) => <CurrencyText value={units} unit="amount4" variant={compact ? 'compact' : 'standard'} />;

/** A thin single-hue magnitude bar. The number it encodes is always printed next to it, so the bar is never the only carrier. */
export function ShareBar({ part, whole, label }: { part: number; whole: number; label: string }) {
  const pct = whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
  const text = `${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%`;
  return <span className="kloan-share" title={`${text} ${label}`}>
    <span className="kloan-share-track" aria-hidden="true">{pct > 0 && <span className="kloan-share-fill" style={{ inlineSize: `${pct}%` }} />}</span>
    <span className="kloan-share-pct">{text}<span className="console-visually-hidden"> {label}</span></span>
  </span>;
}

/** Recorded unpaid schedule of one product (or segment) once the stream resolves; an explicit "tidak tersedia", never a zero. */
export async function UnpaidValue({ promise, product, segment, share = false, compact = true }: { promise: UnpaidPromise; product?: LoanProductFilter; segment?: string | null; share?: boolean; compact?: boolean }) {
  const r = await promise;
  if (r.state !== 'ok') return <span className="kloan-muted" title="Jadwal angsuran tidak dapat dibaca saat ini (batas waktu database). Muat ulang untuk mencoba lagi.">Tidak tersedia</span>;
  const line = product ? r.portfolio.lines.find((l) => l.product === product) : null;
  const target = product === undefined ? r.portfolio.total : segment === undefined ? line : line?.segments.find((s) => s.key === segment);
  const units = target?.unpaidPrincipal4 ?? 0;
  const whole = product === undefined ? r.portfolio.total.unpaidPrincipal4 ?? 0 : segment === undefined ? r.portfolio.total.unpaidPrincipal4 ?? 0 : line?.unpaidPrincipal4 ?? 0;
  return <span className="kloan-unpaid">
    <Money units={units} compact={compact} />
    {share && <ShareBar part={units} whole={whole} label={segment === undefined ? 'dari seluruh sisa pokok' : 'dari sisa pokok produk ini'} />}
  </span>;
}
export const UnpaidFallback = ({ share = false }: { share?: boolean }) => <span className="kloan-unpaid" aria-busy="true"><span className="kloan-skeleton" />{share && <span className="kloan-skeleton kloan-skeleton-bar" />}<span className="console-visually-hidden">Memuat sisa pokok…</span></span>;

/** "Perlu tindakan" = waiting for approval + approved but not yet disbursed. */
export const actionCount = (f: PortfolioFigures) => f.awaitingApproval + f.awaitingDisbursement;

// --------------------------------------------------------------------------------------------------------------- stage
export function LoanStageBadge({ h }: { h: { docStatus: string | null; disbursement: string | null; repayment: string | null } }) {
  const s = loanStage(h);
  return <span className="console-badge kloan-stage" data-state={s.state} data-stage={s.key}>{s.label}</span>;
}

// --------------------------------------------------------------------------------------------------------- filter form
export type LoanListFilters = { q: string; status: string; cair: string; bayar: string; periode: string; produk: string; segmen: string };
/** Search stays in the POST body (data-kosipa-private), never in the address bar. `fixedProduct` hides the product field on a product page. */
export function LoanFilterForm({ action, f, fixedProduct = false }: { action: string; f: LoanListFilters; fixedProduct?: boolean }) {
  return <form className="console-search console-search-wide kloan-filter" action={action} method="post" data-kosipa-private role="search" aria-label="Filter pinjaman">
    {fixedProduct && f.segmen && <input type="hidden" name="segmen" value={f.segmen} />}
    <div className="console-filter-row kloan-filter-row" data-product={!fixedProduct || undefined}>
      <label className="kloan-filter-search">NIK, nama, atau nomor dokumen<input name="q" minLength={2} placeholder="Contoh: 09002 atau BON2026" defaultValue={f.q} maxLength={50} autoComplete="off" /></label>
      {!fixedProduct && <label>Produk<select name="produk" defaultValue={f.produk}><option value="">Semua produk</option>{PRODUCT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
      <label>Status dokumen<select name="status" defaultValue={f.status}><option value="">Semua</option>{LOAN_DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Pencairan<select name="cair" defaultValue={f.cair}><option value="">Semua</option>{LOAN_DISBURSEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Pelunasan<select name="bayar" defaultValue={f.bayar}><option value="">Semua</option>{LOAN_REPAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Bulan dokumen<input name="periode" type="month" min="2000-01" max="2100-12" defaultValue={f.periode} /></label>
      <div className="kloan-filter-actions">
        <button type="submit"><Search size={16} aria-hidden="true" />Terapkan filter</button>
        <button type="submit" name="_reset" value="1" formNoValidate className="kosipa-button-secondary">Reset</button>
      </div>
    </div>
  </form>;
}

// ---------------------------------------------------------------------------------------------------------------- table
/** Loan documents: the deciding fields first (document, member, product), then amounts, then the lifecycle stage with the raw statuses. */
export function LoanTable({ items, detailQuery, showProduct = true }: { items: readonly LoanView[]; detailQuery: Record<string, string>; showProduct?: boolean }) {
  return <FinancialTable label="Daftar dokumen pinjaman" columns={[{ label: 'Dokumen' }, { label: 'Anggota' }, ...(showProduct ? [{ label: 'Produk' }] : [{ label: 'Jenis' }]), { label: 'Pokok', numeric: true }, { label: 'Tenor', numeric: true }, { label: 'Status' }]}>
    <tbody>{items.map((l) => {
      const h = l.header; const product = productOf(h);
      const dup = items.some((o) => o.header.docNo === h.docNo && o.header.id !== h.id);
      return <tr key={h.id}>
        <td><Link prefetch={false} className="kloan-doc" href={`/console/kosipa/pinjaman/${encodeURIComponent(h.docNo)}${qs(detailQuery)}`}>{h.docNo}</Link>
          <small className="kloan-sub">{shortDate(l.docDate.kind === 'date' ? l.docDate.iso : null) ?? formatLegacyDate(l.docDate)}</small>
          {dup && <span className="console-badge" data-state="partial">Nomor ganda pada halaman ini</span>}</td>
        <td><span className="kloan-name">{h.name || 'Nama tidak tercatat'}</span><small className="kloan-sub">NIK {maskIdentifier(h.nik)}</small></td>
        <td>{showProduct ? <><span>{productLabel(product)}</span><small className="kloan-sub">{h.financier && h.financier !== '0' ? h.financier : h.type || 'Jenis tidak tercatat'}</small></>
          : <><span>{h.financier && h.financier !== '0' ? h.financier : 'Tidak tercatat'}</span><small className="kloan-sub">{[h.type, h.method].filter(Boolean).join(' · ')}</small></>}</td>
        <td className="num">{formatAmount4(l.planPrincipal4)}<small className="kloan-sub">{l.planInstallment4 ? `${formatAmount4(l.planInstallment4)}/bln` : ''}</small></td>
        <td className="num">{h.planMonths ? `${h.planMonths} bln` : <span className="kloan-muted">Tidak tercatat</span>}</td>
        <td><LoanStageBadge h={h} /><small className="kloan-sub kloan-raw" title="Status dokumen · pencairan · pelunasan, sebagaimana tercatat">{[h.docStatus, h.disbursement, h.repayment].map((s) => s || '?').join(' · ')}</small>
          {l.statusFlags.map((f) => <span key={f} className="console-badge" data-state="partial">{STATUS_FLAG_TEXT[f]}</span>)}</td>
      </tr>;
    })}</tbody>
  </FinancialTable>;
}
