'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { LoanReport } from '@koperasi/domain/kosipa';
import { useHydrated } from '@/components/use-hydrated';
import { PageBreadcrumbs } from '../PageBreadcrumbs';
import { FinancialTable, FeedbackState, Provenance } from './KosipaUI';
import { count } from './loan-format';
import { formatAmount4, qs } from './payroll-format';
import { exportFeedback } from './presentation';
import { UNUSABLE_DATE_LABEL, YEAR_NOTE } from './report-format';
import {
  aggregateYearLoanReport,
  type AggregatedLoanMonth,
} from './loan-report-model';
import type { ExportFormatOption } from './ExportControl';

const FORMAT_META: Record<
  ExportFormatOption,
  { label: string; shortLabel: string; busyLabel: string; doneLabel: string; mime: string; ext: string }
> = {
  pdf: {
    label: 'Unduh PDF',
    shortLabel: 'PDF (.pdf)',
    busyLabel: 'Menyiapkan PDF…',
    doneLabel: 'PDF siap. Unduhan telah dimulai.',
    mime: 'application/pdf',
    ext: 'pdf',
  },
  xlsx: {
    label: 'Unduh Excel (.xlsx)',
    shortLabel: 'Excel (.xlsx)',
    busyLabel: 'Menyiapkan Excel…',
    doneLabel: 'Excel (.xlsx) siap. Unduhan telah dimulai.',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  csv: {
    label: 'Unduh CSV',
    shortLabel: 'CSV (.csv)',
    busyLabel: 'Menyiapkan CSV…',
    doneLabel: 'CSV siap. Unduhan telah dimulai.',
    mime: 'text/csv',
    ext: 'csv',
  },
};

export type StatusTone = 'green' | 'blue' | 'orange' | 'red' | 'slate';

export function ReportPageHeader({
  updatedAtLabel,
}: {
  updatedAtLabel?: string;
}) {
  return (
    <header className="kosipa-lr-header">
      <div className="kosipa-lr-nav-row">
        <Link prefetch={false} className="console-back kosipa-lr-back" href="/console/kosipa/laporan">
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Kembali ke Laporan</span>
        </Link>
        <div className="kosipa-lr-crumbs-wrap">
          <PageBreadcrumbs />
        </div>
      </div>

      <div className="kosipa-lr-hero-bar">
        <div className="kosipa-lr-hero-left">
          <span className="kosipa-lr-hero-icon" aria-hidden="true">
            <Layers size={24} />
          </span>
          <div className="kosipa-lr-hero-copy">
            <h1 tabIndex={-1}>Laporan Pinjaman</h1>
            <p className="kosipa-lr-hero-sub">
              Rekapitulasi pokok pinjaman <strong>tercatat (rencana)</strong> per bulan dokumen. Data
              ini bukan saldo/outstanding.
            </p>
          </div>
        </div>

        <div className="kosipa-lr-hero-right">
          {updatedAtLabel && (
            <span className="kosipa-lr-updated" title="Waktu pembacaan laporan dari database">
              <RefreshCw size={12} aria-hidden="true" />
              <span>Terakhir diperbarui: {updatedAtLabel}</span>
            </span>
          )}
          <Provenance kind="recorded" />
        </div>
      </div>
    </header>
  );
}

export function ReportSummaryCard({
  tone,
  icon,
  label,
  value,
  subtext,
  isCurrency = false,
}: {
  tone: 'blue' | 'green' | 'orange' | 'red';
  icon: ReactNode;
  label: string;
  value: string;
  subtext?: string | null;
  isCurrency?: boolean;
}) {
  return (
    <article className={`kosipa-lr-kpi-card is-${tone}`}>
      <span className={`kosipa-lr-kpi-icon is-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="kosipa-lr-kpi-body">
        <span className="kosipa-lr-kpi-label">{label}</span>
        <strong className={`kosipa-lr-kpi-value${isCurrency ? ' is-currency' : ''}`}>
          {value}
        </strong>
        {subtext && <span className="kosipa-lr-kpi-sub">{subtext}</span>}
      </div>
    </article>
  );
}

export function StatusCountCell({
  count: val,
  tone,
  bold = false,
}: {
  count: number | null | undefined;
  tone: StatusTone;
  bold?: boolean;
}) {
  if (val === null || val === undefined) {
    return <span className="kosipa-lr-pill is-empty">—</span>;
  }
  return (
    <span
      className={`kosipa-lr-pill is-${tone}${val === 0 ? ' is-zero' : ''}${bold ? ' is-bold' : ''}`}
    >
      {count(val)}
    </span>
  );
}

export function MonthlyStatusBreakdown({
  month,
  hasUnknownDoc,
  hasUnknownRepayment,
}: {
  month: AggregatedLoanMonth;
  hasUnknownDoc: boolean;
  hasUnknownRepayment: boolean;
}) {
  return (
    <div className="kosipa-lr-expanded-box">
      <div className="kosipa-lr-panels-grid">
        {/* Panel A — Status Dokumen */}
        <div className="kosipa-lr-detail-panel">
          <div className="kosipa-lr-detail-panel-head">
            <span className="kosipa-lr-detail-panel-icon" aria-hidden="true">
              <FileText size={15} />
            </span>
            <strong>Status Dokumen</strong>
            <span className="kosipa-lr-detail-panel-count">({count(month.count)} dokumen)</span>
          </div>
          <ul className="kosipa-lr-detail-list" aria-label={`Rincian status dokumen ${month.bucket}`}>
            <li>
              <span className="kosipa-lr-dot is-green" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Disetujui</strong>
              <span className="kosipa-lr-detail-val">{count(month.docStatus.APPROVED.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Pengajuan telah disetujui ({formatAmount4(month.docStatus.APPROVED.plan4)}).
              </span>
            </li>
            <li>
              <span className="kosipa-lr-dot is-blue" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Posting</strong>
              <span className="kosipa-lr-detail-val">{count(month.docStatus.POSTING.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Sudah diposting / masuk pembukuan ({formatAmount4(month.docStatus.POSTING.plan4)}).
              </span>
            </li>
            <li>
              <span className="kosipa-lr-dot is-orange" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Terbuka</strong>
              <span className="kosipa-lr-detail-val">{count(month.docStatus.OPEN.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Masih dalam proses / belum diposting ({formatAmount4(month.docStatus.OPEN.plan4)}).
              </span>
            </li>
            <li>
              <span className="kosipa-lr-dot is-red" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Ditolak</strong>
              <span className="kosipa-lr-detail-val">{count(month.docStatus.REJECTED.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Pengajuan tidak disetujui ({formatAmount4(month.docStatus.REJECTED.plan4)}).
              </span>
            </li>
            {(hasUnknownDoc || month.docStatus.OTHER.count > 0) && (
              <li>
                <span className="kosipa-lr-dot is-slate" aria-hidden="true" />
                <strong className="kosipa-lr-detail-name">Tanpa Status / Lainnya</strong>
                <span className="kosipa-lr-detail-val">{count(month.docStatus.OTHER.count)} dokumen</span>
                <span className="kosipa-lr-detail-desc">
                  — Nilai status di luar daftar baku ({formatAmount4(month.docStatus.OTHER.plan4)}).
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Panel B — Status Pelunasan */}
        <div className="kosipa-lr-detail-panel">
          <div className="kosipa-lr-detail-panel-head">
            <span className="kosipa-lr-detail-panel-icon" aria-hidden="true">
              <Coins size={15} />
            </span>
            <strong>Status Pelunasan</strong>
            <span className="kosipa-lr-detail-panel-count">
              ({count(month.count)} dokumen · {count(month.approvedOrPostingCount)} dokumen disetujui/posting)
            </span>
          </div>
          <ul className="kosipa-lr-detail-list" aria-label={`Rincian status pelunasan ${month.bucket}`}>
            <li>
              <span className="kosipa-lr-dot is-green" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Lunas</strong>
              <span className="kosipa-lr-detail-val">{count(month.repayment.LUNAS.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Pinjaman telah lunas seluruhnya ({formatAmount4(month.repayment.LUNAS.plan4)}).
              </span>
            </li>
            <li>
              <span className="kosipa-lr-dot is-slate" aria-hidden="true" />
              <strong className="kosipa-lr-detail-name">Belum Lunas</strong>
              <span className="kosipa-lr-detail-val">{count(month.repayment.BELUM_LUNAS.count)} dokumen</span>
              <span className="kosipa-lr-detail-desc">
                — Masih memiliki sisa kewajiban pelunasan ({formatAmount4(month.repayment.BELUM_LUNAS.plan4)}).
              </span>
            </li>
            {(hasUnknownRepayment || month.repayment.OTHER.count > 0) && (
              <li>
                <span className="kosipa-lr-dot is-orange" aria-hidden="true" />
                <strong className="kosipa-lr-detail-name">Tanpa Status / Lainnya</strong>
                <span className="kosipa-lr-detail-val">{count(month.repayment.OTHER.count)} dokumen</span>
                <span className="kosipa-lr-detail-desc">
                  — Status pelunasan di luar daftar baku ({formatAmount4(month.repayment.OTHER.plan4)}).
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Subsection 4.2 — Compact Status Combination Matrix */}
      <div className="kosipa-lr-matrix-section">
        <div className="kosipa-lr-matrix-head">
          <div className="kosipa-lr-matrix-title">
            <ShieldCheck size={14} aria-hidden="true" />
            <strong>Matriks Kombinasi Status Dokumen × Pelunasan ({month.bucket})</strong>
          </div>
          <span className="kosipa-lr-matrix-reconcile" data-ok={month.reconciled}>
            {month.reconciled
              ? `Terekonsiliasi: ${count(month.count)} dokumen (${formatAmount4(month.plan4)})`
              : 'Perlu pemeriksaan rekonsiliasi'}
          </span>
        </div>

        <div
          role="table"
          aria-label={`Matriks kombinasi status bulan ${month.bucket}`}
          className={`kosipa-lr-matrix-grid${hasUnknownRepayment ? ' has-other-col' : ''}`}
        >
          <div role="rowgroup" className="kosipa-lr-matrix-thead">
            <div role="row" className="kosipa-lr-matrix-row">
              <div role="columnheader" className="kosipa-lr-matrix-cell is-label">
                Status Dokumen
              </div>
              <div role="columnheader" className="kosipa-lr-matrix-cell is-num">
                Lunas
              </div>
              <div role="columnheader" className="kosipa-lr-matrix-cell is-num">
                Belum Lunas
              </div>
              {hasUnknownRepayment && (
                <div role="columnheader" className="kosipa-lr-matrix-cell is-num">
                  Lainnya
                </div>
              )}
              <div role="columnheader" className="kosipa-lr-matrix-cell is-num">
                Total
              </div>
            </div>
          </div>

          <div role="rowgroup" className="kosipa-lr-matrix-tbody">
            {month.matrix.rows.map((row) => {
              const isRejectedSettled = row.key === 'REJECTED' && row.lunas.count > 0;
              const isUnapprovedSettled =
                (row.key === 'POSTING' || row.key === 'OPEN') && row.lunas.count > 0;
              return (
                <div key={row.key} role="row" className="kosipa-lr-matrix-row">
                  <div role="rowheader" className="kosipa-lr-matrix-cell is-label">
                    <span
                      className={`kosipa-lr-dot is-${
                        row.key === 'APPROVED'
                          ? 'green'
                          : row.key === 'POSTING'
                            ? 'blue'
                            : row.key === 'OPEN'
                              ? 'orange'
                              : row.key === 'REJECTED'
                                ? 'red'
                                : 'slate'
                      }`}
                      aria-hidden="true"
                    />
                    <span>{row.label}</span>
                  </div>
                  <div
                    role="cell"
                    className={`kosipa-lr-matrix-cell is-num${
                      isRejectedSettled || isUnapprovedSettled ? ' is-anomaly' : ''
                    }`}
                  >
                    <strong>{count(row.lunas.count)}</strong>
                    {row.lunas.count > 0 && <small>{formatAmount4(row.lunas.plan4)}</small>}
                  </div>
                  <div role="cell" className="kosipa-lr-matrix-cell is-num">
                    <strong>{count(row.belumLunas.count)}</strong>
                    {row.belumLunas.count > 0 && <small>{formatAmount4(row.belumLunas.plan4)}</small>}
                  </div>
                  {hasUnknownRepayment && (
                    <div role="cell" className="kosipa-lr-matrix-cell is-num">
                      <strong>{count(row.otherRepayment.count)}</strong>
                      {row.otherRepayment.count > 0 && (
                        <small>{formatAmount4(row.otherRepayment.plan4)}</small>
                      )}
                    </div>
                  )}
                  <div role="cell" className="kosipa-lr-matrix-cell is-num is-row-total">
                    <strong>{count(row.total.count)}</strong>
                    {row.total.count > 0 && <small>{formatAmount4(row.total.plan4)}</small>}
                  </div>
                </div>
              );
            })}
          </div>

          <div role="rowgroup" className="kosipa-lr-matrix-tfoot">
            <div role="row" className="kosipa-lr-matrix-row is-total">
              <div role="rowheader" className="kosipa-lr-matrix-cell is-label">
                <strong>Total</strong>
              </div>
              <div role="cell" className="kosipa-lr-matrix-cell is-num">
                <strong>{count(month.matrix.totals.lunas.count)}</strong>
                <small>{formatAmount4(month.matrix.totals.lunas.plan4)}</small>
              </div>
              <div role="cell" className="kosipa-lr-matrix-cell is-num">
                <strong>{count(month.matrix.totals.belumLunas.count)}</strong>
                <small>{formatAmount4(month.matrix.totals.belumLunas.plan4)}</small>
              </div>
              {hasUnknownRepayment && (
                <div role="cell" className="kosipa-lr-matrix-cell is-num">
                  <strong>{count(month.matrix.totals.otherRepayment.count)}</strong>
                  <small>{formatAmount4(month.matrix.totals.otherRepayment.plan4)}</small>
                </div>
              )}
              <div role="cell" className="kosipa-lr-matrix-cell is-num is-row-total">
                <strong>{count(month.matrix.totals.grand.count)}</strong>
                <small>{formatAmount4(month.matrix.totals.grand.plan4)}</small>
              </div>
            </div>
          </div>
        </div>

        {month.anomalies.length > 0 && (
          <div className="kosipa-lr-anomaly-note" role="note">
            <AlertTriangle size={14} aria-hidden="true" />
            <div>
              <strong>Catatan Kombinasi Status Tercatat (Tanpa Normalisasi Otomatis):</strong>
              <ul>
                {month.anomalies.map((anom, idx) => (
                  <li key={`${anom.kind}-${idx}`}>
                    <code>
                      {anom.docStatus ?? 'NULL'} / {anom.repayment ?? 'NULL'}
                    </code>
                    : <strong>{count(anom.count)} dokumen</strong> ({formatAmount4(anom.plan4)}) —{' '}
                    {anom.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <section className="kosipa-lr-legend" aria-label="Keterangan status laporan pinjaman">
      <div className="kosipa-lr-legend-head">
        <Info size={14} aria-hidden="true" />
        <strong>Keterangan Status:</strong>
      </div>
      <div className="kosipa-lr-legend-items">
        <div className="kosipa-lr-legend-group">
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-green">
              <CheckCircle2 size={12} aria-hidden="true" /> Disetujui
            </span>
            <span className="kosipa-lr-legend-text">: Pengajuan telah disetujui.</span>
          </span>
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-blue">
              <Layers size={12} aria-hidden="true" /> Posting
            </span>
            <span className="kosipa-lr-legend-text">: Sudah diposting (masuk pembukuan).</span>
          </span>
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-orange">
              <Clock size={12} aria-hidden="true" /> Terbuka
            </span>
            <span className="kosipa-lr-legend-text">: Masih dalam proses.</span>
          </span>
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-red">
              <XCircle size={12} aria-hidden="true" /> Ditolak
            </span>
            <span className="kosipa-lr-legend-text">: Pengajuan tidak disetujui.</span>
          </span>
        </div>

        <span className="kosipa-lr-legend-divider" aria-hidden="true" />

        <div className="kosipa-lr-legend-group">
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-green">
              <CheckCircle2 size={12} aria-hidden="true" /> Lunas
            </span>
            <span className="kosipa-lr-legend-text">: Pinjaman telah lunas.</span>
          </span>
          <span className="kosipa-lr-legend-item">
            <span className="kosipa-lr-legend-badge is-slate">
              <Clock size={12} aria-hidden="true" /> Belum Lunas
            </span>
            <span className="kosipa-lr-legend-text">: Masih ada sisa kewajiban.</span>
          </span>
        </div>
      </div>
    </section>
  );
}

export function KosipaLoanReportClient({
  report,
  canExport,
}: {
  report: LoanReport;
  canExport: boolean;
}) {
  const hydrated = useHydrated();
  const agg = useMemo(() => aggregateYearLoanReport(report), [report]);
  const [expandedBuckets, setExpandedBuckets] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ExportFormatOption | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [exportFailed, setExportFailed] = useState(false);

  const yearOptions = useMemo(
    () =>
      [...new Set(report.year === null ? report.years : [report.year, ...report.years])].sort(
        (a, b) => b - a,
      ),
    [report.year, report.years],
  );

  const exportBaseHref = `/api/kosipa/reports/loans/export${qs({
    tahun: report.year === null ? '' : String(report.year),
  })}`;

  const allExpanded =
    agg.months.length > 0 && agg.months.every((m) => expandedBuckets.includes(m.bucket));

  function toggleBucket(bucket: string) {
    setExpandedBuckets((prev) =>
      prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket],
    );
  }

  function handleToggleAll() {
    if (allExpanded) {
      setExpandedBuckets([]);
    } else {
      setExpandedBuckets(agg.months.map((m) => m.bucket));
    }
  }

  async function triggerExport(format: ExportFormatOption) {
    if (busyFormat) return;
    setBusyFormat(format);
    setExportMessage('');
    setExportFailed(false);
    setExportOpen(false);
    const meta = FORMAT_META[format];
    const sep = exportBaseHref.includes('?') ? '&' : '?';
    const targetHref = `${exportBaseHref}${sep}format=${format}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(targetHref, {
        cache: 'no-store',
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        const retry = response.status === 429 ? Number(response.headers.get('retry-after')) : 0;
        setExportFailed(true);
        setExportMessage(
          exportFeedback(response.status) +
            (Number.isFinite(retry) && retry > 0 ? ` Coba lagi dalam ${retry} detik.` : ''),
        );
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes(meta.mime)) throw new Error('Unexpected download');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const filename = response.headers
        .get('content-disposition')
        ?.match(/filename="?([A-Za-z0-9_.-]+\.(?:csv|xlsx|pdf))/)?.[1];
      link.download = filename ?? `laporan-pinjaman.${meta.ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setExportMessage(meta.doneLabel);
    } catch {
      setExportFailed(true);
      setExportMessage(exportFeedback(0));
    } finally {
      clearTimeout(timer);
      setBusyFormat(null);
    }
  }

  const docColSpan = 4 + (agg.hasUnknownDocStatus ? 1 : 0);
  const repColSpan = 2 + (agg.hasUnknownRepaymentStatus ? 1 : 0);
  const totalCols = 4 + docColSpan + repColSpan;

  return (
    <div className="kosipa-lr">
      {/* 2.2 SUMMARY KPI CARDS (5 HORIZONTAL CARDS ON DESKTOP) */}
      <section className="kosipa-lr-kpi-grid" aria-label="Ringkasan indikator pinjaman">
        <ReportSummaryCard
          tone="blue"
          icon={<FileText size={20} />}
          label="Total Dokumen"
          value={count(agg.kpis.totalDocs)}
          subtext={report.year !== null ? `Sepanjang tahun ${report.year}` : 'Tidak ada tahun'}
        />
        <ReportSummaryCard
          tone="green"
          icon={<Coins size={20} />}
          label="Total Pokok (Rencana)"
          value={formatAmount4(agg.kpis.totalPlan4)}
          isCurrency
        />
        <ReportSummaryCard
          tone="green"
          icon={<CheckCircle2 size={20} />}
          label="Dokumen Disetujui"
          value={count(agg.kpis.approvedDocs)}
          subtext={agg.kpis.approvedPct ? `(\u00B1 ${agg.kpis.approvedPct})` : '0%'}
        />
        <ReportSummaryCard
          tone="orange"
          icon={<Clock size={20} />}
          label="Dokumen Proses / Terbuka"
          value={count(agg.kpis.inProgressDocs)}
          subtext={agg.kpis.inProgressPct ? `(\u00B1 ${agg.kpis.inProgressPct})` : '0%'}
        />
        <ReportSummaryCard
          tone="red"
          icon={<XCircle size={20} />}
          label="Dokumen Ditolak"
          value={count(agg.kpis.rejectedDocs)}
          subtext={agg.kpis.rejectedPct ? `(\u00B1 ${agg.kpis.rejectedPct})` : '0%'}
        />
      </section>

      {/* 2.3 FILTER TOOLBAR */}
      {yearOptions.length > 0 && (
        <div className="kosipa-lr-toolbar-card">
          <div className="kosipa-lr-toolbar">
            <form
              className="kosipa-lr-filter-form"
              action="/console/kosipa/laporan/pinjaman"
              method="get"
              aria-label="Filter tahun laporan"
            >
              <label htmlFor="report-year" className="kosipa-lr-filter-label">
                Tahun Laporan
              </label>
              <div className="kosipa-lr-select-wrap">
                <select
                  id="report-year"
                  name="tahun"
                  defaultValue={report.year ?? yearOptions[0]}
                  className="kosipa-lr-select"
                >
                  {yearOptions.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="kosipa-lr-select-caret" aria-hidden="true" />
              </div>
              <button type="submit" className="kosipa-lr-btn-primary">
                <Filter size={14} aria-hidden="true" />
                <span>Terapkan Filter</span>
              </button>
              <Link
                prefetch={false}
                className="kosipa-lr-btn-secondary"
                href="/console/kosipa/laporan/pinjaman"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Reset Filter</span>
              </Link>
            </form>

            <div className="kosipa-lr-toolbar-right">
              {canExport ? (
                <div className="kosipa-lr-export-wrap">
                  <button
                    type="button"
                    className="kosipa-lr-btn-secondary kosipa-lr-export-trigger"
                    aria-expanded={exportOpen}
                    aria-haspopup="true"
                    disabled={busyFormat !== null || !hydrated}
                    onClick={() => setExportOpen((v) => !v)}
                  >
                    {busyFormat ? (
                      <LoaderCircle className="kosipa-spin" size={14} aria-hidden="true" />
                    ) : (
                      <Download size={14} aria-hidden="true" />
                    )}
                    <span>{busyFormat ? FORMAT_META[busyFormat].busyLabel : 'Export'}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>

                  <div
                    className="kosipa-lr-export-menu"
                    data-open={exportOpen ? 'true' : 'false'}
                    role="group"
                    aria-label="Pilihan unduhan dokumen"
                  >
                    {(['pdf', 'xlsx', 'csv'] as const).map((fmt) => {
                      const meta = FORMAT_META[fmt];
                      const isBusy = busyFormat === fmt;
                      const Icon =
                        fmt === 'pdf' ? FileText : fmt === 'xlsx' ? FileSpreadsheet : Download;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          className="kosipa-lr-export-item"
                          disabled={busyFormat !== null || !hydrated}
                          onClick={() => void triggerExport(fmt)}
                        >
                          {isBusy ? (
                            <LoaderCircle className="kosipa-spin" size={14} aria-hidden="true" />
                          ) : (
                            <Icon size={14} aria-hidden="true" />
                          )}
                          <span>{isBusy ? meta.busyLabel : meta.label}</span>
                        </button>
                      );
                    })}
                    <a
                      href={`${exportBaseHref}${exportBaseHref.includes('?') ? '&' : '?'}format=csv`}
                      className="console-visually-hidden"
                    >
                      Unduh CSV laporan ini
                    </a>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="kosipa-lr-btn-secondary"
                  disabled
                  title="Izin ekspor laporan diperlukan untuk mengunduh dokumen"
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Export</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                className="kosipa-lr-btn-secondary"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((v) => !v)}
              >
                <CircleHelp size={14} aria-hidden="true" />
                <span>Bantuan</span>
              </button>
            </div>
          </div>

          {exportMessage && (
            <p
              className="kosipa-export-feedback kosipa-lr-export-feedback"
              data-error={exportFailed}
              role={exportFailed ? 'alert' : 'status'}
              aria-live="polite"
            >
              {exportMessage}
            </p>
          )}

          {helpOpen && (
            <div className="kosipa-lr-help-panel" role="region" aria-label="Panduan membaca laporan pinjaman">
              <strong>Panduan Membaca Laporan Pinjaman:</strong>
              <ul>
                <li>
                  <strong>Pokok tercatat, bukan outstanding resmi:</strong> Angka pada laporan ini
                  menjumlahkan pokok rencana (<code>plan_pinjaman</code>) menurut tanggal dokumen.
                  Saldo/outstanding resmi belum tersedia karena definisinya belum diverifikasi.
                </li>
                <li>
                  <strong>Dua dimensi status independen:</strong> <em>Status Dokumen</em> (Disetujui,
                  Posting, Terbuka, Ditolak) dan <em>Status Pelunasan</em> (Lunas, Belum Lunas)
                  dihitung langsung dari rekaman sumber tanpa menyembunyikan kombinasi anomali.
                </li>
                <li>
                  <strong>Rincian bulanan:</strong> Klik ikon panah pada kolom Bulan, tombol{' '}
                  <em>Detail</em> di sisi kanan, atau sakelar <em>Tampilkan detail status</em> untuk
                  melihat matriks kombinasi status beserta nominal pokok per kombinasi.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* PHASE 3, 4, 5 — MAIN REPORT TABLE CARD */}
      {report.year === null ? (
        <FeedbackState
          kind="empty"
          title={<> Belum ada pinjaman bertanggal </>}
          reset="/console/kosipa/laporan/pinjaman"
        >
          <p>Tidak ada pinjaman dengan tanggal dokumen yang dapat dipakai.</p>
        </FeedbackState>
      ) : (
        <section className="console-card kosipa-lr-table-card" aria-labelledby="sec-bulan">
          <div className="kosipa-lr-card-head">
            <div className="kosipa-lr-card-title-wrap">
              <span className="kosipa-lr-card-icon" aria-hidden="true">
                <Calendar size={17} />
              </span>
              <h2 id="sec-bulan">Rekap Pinjaman Tahun {report.year}</h2>
            </div>

            {agg.months.length > 0 && (
              <button
                type="button"
                role="switch"
                aria-checked={allExpanded}
                className="kosipa-lr-toggle-all"
                onClick={handleToggleAll}
              >
                <span className="kosipa-lr-toggle-label">Tampilkan detail status</span>
                <span
                  className="kosipa-lr-switch-track"
                  data-checked={allExpanded ? 'true' : undefined}
                  aria-hidden="true"
                >
                  <span className="kosipa-lr-switch-thumb" />
                </span>
              </button>
            )}
          </div>

          {agg.months.length === 0 ? (
            <p className="kosipa-lr-empty-year">Tidak ada pinjaman pada tahun ini.</p>
          ) : (
            <div className="kosipa-table-frame kosipa-lr-table-frame">
              <div
                className="kosipa-table-scroll kosipa-lr-table-scroll"
                role="region"
                aria-label="Pinjaman per bulan dokumen"
                tabIndex={0}
                suppressHydrationWarning
              >
                <table className="console-table kosipa-table kosipa-lr-table">
                  <caption className="console-visually-hidden">Pinjaman per bulan dokumen</caption>
                  <thead>
                    <tr className="kosipa-lr-thead-top">
                      <th rowSpan={2} scope="col" className="kosipa-lr-col-month">
                        Bulan
                      </th>
                      <th rowSpan={2} scope="col" className="num kosipa-lr-col-docs">
                        Dokumen
                      </th>
                      <th rowSpan={2} scope="col" className="num kosipa-lr-col-plan">
                        Σ Pokok (Rencana)
                      </th>
                      <th
                        colSpan={docColSpan}
                        scope="colgroup"
                        className="kosipa-lr-group-th is-doc-group"
                      >
                        <span className="kosipa-lr-group-label">
                          <FileText size={14} aria-hidden="true" />
                          <span>Status Dokumen</span>
                          <span
                            className="kosipa-lr-group-info"
                            title="Status Dokumen: tahap/status administratif dokumen pinjaman sesuai rekaman trans_pinjaman."
                          >
                            <Info size={13} aria-hidden="true" />
                          </span>
                        </span>
                      </th>
                      <th
                        colSpan={repColSpan}
                        scope="colgroup"
                        className="kosipa-lr-group-th is-rep-group"
                      >
                        <span className="kosipa-lr-group-label">
                          <Coins size={14} aria-hidden="true" />
                          <span>Status Pelunasan</span>
                          <span
                            className="kosipa-lr-group-info"
                            title="Status Pelunasan: status pelunasan menurut data dan business rule existing (LUNAS / BELUM LUNAS)."
                          >
                            <Info size={13} aria-hidden="true" />
                          </span>
                        </span>
                      </th>
                      <th rowSpan={2} scope="col" className="kosipa-lr-col-action">
                        Aksi
                      </th>
                    </tr>
                    <tr className="kosipa-lr-thead-sub">
                      <th scope="col" className="num kosipa-lr-sub-th is-green">
                        <span className="kosipa-lr-sub-label">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          <span>Disetujui</span>
                        </span>
                      </th>
                      <th scope="col" className="num kosipa-lr-sub-th is-blue">
                        <span className="kosipa-lr-sub-label">
                          <Layers size={13} aria-hidden="true" />
                          <span>Posting</span>
                        </span>
                      </th>
                      <th scope="col" className="num kosipa-lr-sub-th is-orange">
                        <span className="kosipa-lr-sub-label">
                          <Clock size={13} aria-hidden="true" />
                          <span>Terbuka</span>
                        </span>
                      </th>
                      <th scope="col" className="num kosipa-lr-sub-th is-red">
                        <span className="kosipa-lr-sub-label">
                          <XCircle size={13} aria-hidden="true" />
                          <span>Ditolak</span>
                        </span>
                      </th>
                      {agg.hasUnknownDocStatus && (
                        <th scope="col" className="num kosipa-lr-sub-th is-slate">
                          <span className="kosipa-lr-sub-label">
                            <span>Lainnya</span>
                          </span>
                        </th>
                      )}
                      <th scope="col" className="num kosipa-lr-sub-th is-green is-rep-start">
                        <span className="kosipa-lr-sub-label">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          <span>Lunas</span>
                        </span>
                      </th>
                      <th scope="col" className="num kosipa-lr-sub-th is-slate">
                        <span className="kosipa-lr-sub-label">
                          <Clock size={13} aria-hidden="true" />
                          <span>Belum Lunas</span>
                        </span>
                      </th>
                      {agg.hasUnknownRepaymentStatus && (
                        <th scope="col" className="num kosipa-lr-sub-th is-slate">
                          <span className="kosipa-lr-sub-label">
                            <span>Lainnya</span>
                          </span>
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {agg.months.map((m) => {
                      const isExpanded = expandedBuckets.includes(m.bucket);
                      return (
                        <Fragment key={m.bucket}>
                          <tr
                            className="kosipa-lr-month-tr"
                            data-expanded={isExpanded ? 'true' : undefined}
                          >
                            <td className="kosipa-lr-cell-month">
                              <div className="kosipa-lr-month-wrap">
                                <button
                                  type="button"
                                  className="kosipa-lr-chevron-btn"
                                  aria-expanded={isExpanded}
                                  aria-controls={`lr-detail-${m.bucket}`}
                                  aria-label={`${isExpanded ? 'Sembunyikan' : 'Tampilkan'} rincian status bulan ${m.bucket}`}
                                  onClick={() => toggleBucket(m.bucket)}
                                >
                                  <ChevronRight
                                    size={15}
                                    className="kosipa-lr-chevron"
                                    aria-hidden="true"
                                  />
                                </button>
                                <Link
                                  prefetch={false}
                                  className="kosipa-lr-month-link"
                                  href={`/console/kosipa/pinjaman/daftar${qs({ periode: m.bucket })}`}
                                >
                                  {m.bucket}
                                </Link>
                              </div>
                            </td>
                            <td className="num kosipa-lr-cell-docs">{count(m.count)}</td>
                            <td className="num kosipa-lr-cell-plan">{formatAmount4(m.plan4)}</td>
                            <td className="num kosipa-lr-cell-status">
                              <StatusCountCell count={m.docStatus.APPROVED.count} tone="green" />
                            </td>
                            <td className="num kosipa-lr-cell-status">
                              <StatusCountCell count={m.docStatus.POSTING.count} tone="blue" />
                            </td>
                            <td className="num kosipa-lr-cell-status">
                              <StatusCountCell count={m.docStatus.OPEN.count} tone="orange" />
                            </td>
                            <td className="num kosipa-lr-cell-status">
                              <StatusCountCell count={m.docStatus.REJECTED.count} tone="red" />
                            </td>
                            {agg.hasUnknownDocStatus && (
                              <td className="num kosipa-lr-cell-status">
                                <StatusCountCell count={m.docStatus.OTHER.count} tone="slate" />
                              </td>
                            )}
                            <td className="num kosipa-lr-cell-status is-rep-start">
                              <StatusCountCell count={m.repayment.LUNAS.count} tone="green" />
                            </td>
                            <td className="num kosipa-lr-cell-status">
                              <StatusCountCell count={m.repayment.BELUM_LUNAS.count} tone="slate" />
                            </td>
                            {agg.hasUnknownRepaymentStatus && (
                              <td className="num kosipa-lr-cell-status">
                                <StatusCountCell count={m.repayment.OTHER.count} tone="slate" />
                              </td>
                            )}
                            <td className="kosipa-lr-cell-action">
                              <div className="kosipa-lr-action-group">
                                <button
                                  type="button"
                                  className="kosipa-lr-detail-btn"
                                  data-active={isExpanded ? 'true' : undefined}
                                  aria-expanded={isExpanded}
                                  aria-controls={`lr-detail-${m.bucket}`}
                                  onClick={() => toggleBucket(m.bucket)}
                                >
                                  <BarChart2 size={13} aria-hidden="true" />
                                  <span>Detail</span>
                                </button>
                                <Link
                                  prefetch={false}
                                  className="kosipa-lr-more-btn"
                                  href={`/console/kosipa/pinjaman/daftar${qs({ periode: m.bucket })}`}
                                  title={`Lihat daftar dokumen pinjaman periode ${m.bucket}`}
                                  aria-label={`Lihat daftar dokumen periode ${m.bucket}`}
                                >
                                  <MoreHorizontal size={15} aria-hidden="true" />
                                </Link>
                              </div>
                              <span className="console-visually-hidden">
                                {m.lines
                                  .map(
                                    (l) =>
                                      `${l.docStatus ?? 'tanpa status'} / ${l.repayment ?? 'tanpa status'}: ${l.count} (${formatAmount4(l.plan4)})`,
                                  )
                                  .join(' · ')}
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr id={`lr-detail-${m.bucket}`} className="kosipa-lr-expanded-tr">
                              <td colSpan={totalCols} className="kosipa-lr-expanded-td">
                                <MonthlyStatusBreakdown
                                  month={m}
                                  hasUnknownDoc={agg.hasUnknownDocStatus}
                                  hasUnknownRepayment={agg.hasUnknownRepaymentStatus}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="kosipa-lr-total-tr">
                      <td className="kosipa-lr-total-label">
                        <strong>Total Tahun {report.year}</strong>
                      </td>
                      <td className="num kosipa-lr-total-docs">
                        <strong>{count(agg.totals.count)}</strong>
                      </td>
                      <td className="num kosipa-lr-total-plan">
                        <strong>{formatAmount4(agg.totals.plan4)}</strong>
                      </td>
                      <td className="num kosipa-lr-cell-status">
                        <StatusCountCell
                          count={agg.totals.docStatus.APPROVED.count}
                          tone="green"
                          bold
                        />
                      </td>
                      <td className="num kosipa-lr-cell-status">
                        <StatusCountCell
                          count={agg.totals.docStatus.POSTING.count}
                          tone="blue"
                          bold
                        />
                      </td>
                      <td className="num kosipa-lr-cell-status">
                        <StatusCountCell
                          count={agg.totals.docStatus.OPEN.count}
                          tone="orange"
                          bold
                        />
                      </td>
                      <td className="num kosipa-lr-cell-status">
                        <StatusCountCell
                          count={agg.totals.docStatus.REJECTED.count}
                          tone="red"
                          bold
                        />
                      </td>
                      {agg.hasUnknownDocStatus && (
                        <td className="num kosipa-lr-cell-status">
                          <StatusCountCell
                            count={agg.totals.docStatus.OTHER.count}
                            tone="slate"
                            bold
                          />
                        </td>
                      )}
                      <td className="num kosipa-lr-cell-status is-rep-start">
                        <StatusCountCell
                          count={agg.totals.repayment.LUNAS.count}
                          tone="green"
                          bold
                        />
                      </td>
                      <td className="num kosipa-lr-cell-status">
                        <StatusCountCell
                          count={agg.totals.repayment.BELUM_LUNAS.count}
                          tone="slate"
                          bold
                        />
                      </td>
                      {agg.hasUnknownRepaymentStatus && (
                        <td className="num kosipa-lr-cell-status">
                          <StatusCountCell
                            count={agg.totals.repayment.OTHER.count}
                            tone="slate"
                            bold
                          />
                        </td>
                      )}
                      <td className="kosipa-lr-cell-action" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="kosipa-table-hint" hidden suppressHydrationWarning>
                <ArrowRight size={13} aria-hidden="true" />
                Geser tabel untuk melihat kolom lainnya.
              </p>
            </div>
          )}

          {/* PHASE 6 — STATUS LEGEND */}
          <StatusLegend />

          <p className="console-notice kosipa-lr-footnote">
            {YEAR_NOTE} Saldo/outstanding resmi belum tersedia karena definisi view saldo legacy
            belum diverifikasi.
            {canExport &&
              ' Ekspor berisi ringkasan agregat tanpa nama, NIK atau gaji anggota, dan setiap unduhan dicatat dalam audit.'}
          </p>
        </section>
      )}

      {/* UNUSABLE DATES SECTION (PRESERVED FOR DATA INTEGRITY) */}
      {report.unusableDates.length > 0 && (
        <section className="console-card kosipa-lr-unusable-card" aria-labelledby="sec-tanggal">
          <h2 id="sec-tanggal">Pinjaman tanpa tanggal yang dapat dipakai (semua tahun)</h2>
          <FinancialTable
            label="Pinjaman tanpa tanggal yang dapat dipakai"
            columns={[
              { label: 'Kondisi' },
              { label: 'Dokumen', numeric: true },
              { label: 'Σ pokok (rencana)', numeric: true },
            ]}
          >
            <tbody>
              {report.unusableDates.map((u) => (
                <tr key={u.kind}>
                  <td>{UNUSABLE_DATE_LABEL[u.kind]}</td>
                  <td>{u.count}</td>
                  <td className="num">{formatAmount4(u.plan4)}</td>
                </tr>
              ))}
            </tbody>
          </FinancialTable>
        </section>
      )}

      <div className="kosipa-lr-bottom-links">
        <Link
          prefetch={false}
          className="console-more kosipa-lr-quality-link"
          href="/console/kosipa/laporan/kualitas-data"
        >
          <span>Lihat diagnostik kualitas data</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

