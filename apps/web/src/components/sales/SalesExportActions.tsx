'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
import type { SalesHistoryQuery } from '@koperasi/domain/sales/history';
import type { SalesExportFormat, SalesExportScope } from '@koperasi/domain/sales/export';

const FORMAT_META: Record<SalesExportFormat, { label: string; busyLabel: string; doneLabel: string; mime: string; ext: string }> = {
  pdf: {
    label: 'Export PDF',
    busyLabel: 'Menyiapkan PDF…',
    doneLabel: 'Dokumen PDF berhasil diunduh.',
    mime: 'application/pdf',
    ext: 'pdf',
  },
  xlsx: {
    label: 'Export (.xlsx)',
    busyLabel: 'Menyiapkan Excel…',
    doneLabel: 'Workbook Excel (.xlsx) berhasil diunduh.',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
};

export function buildSalesExportHref(query: SalesHistoryQuery, format: SalesExportFormat, scope: SalesExportScope): string {
  const params = new URLSearchParams();
  params.set('format', format);
  params.set('scope', scope);
  params.set('from', query.from);
  params.set('to', query.to);
  params.set('source', query.source);
  params.set('salesStatus', query.salesStatus);
  params.set('paymentStatus', query.paymentStatus);
  params.set('paymentType', query.paymentType);
  if (query.createdBy) params.set('createdBy', query.createdBy);
  if (query.registerId !== null) params.set('registerId', String(query.registerId));
  if (query.q) params.set('q', query.q);
  params.set('sort', query.sort);
  return `/api/sales/export?${params.toString()}`;
}

export function SalesExportActions({
  query,
  canSwitchBranch = false,
  branchName = 'Cabang Aktif',
  disabled = false,
}: {
  query: SalesHistoryQuery;
  canSwitchBranch?: boolean;
  branchName?: string;
  disabled?: boolean;
}) {
  const [scope, setScope] = useState<SalesExportScope>('store');
  const [busyFormat, setBusyFormat] = useState<SalesExportFormat | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  async function handleExport(format: SalesExportFormat) {
    if (busyFormat || disabled) return;
    setBusyFormat(format);
    setFeedback(null);
    const meta = FORMAT_META[format];
    const effectiveScope: SalesExportScope = canSwitchBranch ? scope : 'store';
    const href = buildSalesExportHref(query, format, effectiveScope);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(href, { cache: 'no-store', signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        const msg = response.status === 403
          ? 'Akun Anda tidak memiliki izin untuk cakupan ekspor ini.'
          : response.status === 400
            ? 'Filter ekspor tidak valid. Periksa rentang tanggal dan terapkan filter kembali.'
            : 'Gagal menyiapkan dokumen ekspor. Silakan coba beberapa saat lagi.';
        setFeedback({ text: msg, error: true });
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes(meta.mime)) throw new Error('Invalid content-type');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const filename = response.headers.get('content-disposition')?.match(/filename="?([A-Za-z0-9_.-]+\.(?:xlsx|pdf))/)?.[1];
      link.download = filename ?? `Laporan_Penjualan_${query.from}_sd_${query.to}.${meta.ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setFeedback({ text: meta.doneLabel, error: false });
    } catch {
      setFeedback({ text: 'Unduhan gagal. Periksa koneksi jaringan Anda lalu coba lagi.', error: true });
    } finally {
      clearTimeout(timer);
      setBusyFormat(null);
    }
  }

  return (
    <div className="sales-export-bar" role="group" aria-label="Ekspor laporan riwayat transaksi">
      {canSwitchBranch && (
        <label className="sales-export-scope">
          <span className="pos-sr-only">Cakupan toko untuk ekspor</span>
          <select
            name="exportScope"
            value={scope}
            onChange={(e) => setScope(e.target.value === 'all' ? 'all' : 'store')}
            disabled={busyFormat !== null || disabled}
            aria-label="Cakupan toko untuk ekspor"
          >
            <option value="store">Toko Aktif · {branchName}</option>
            <option value="all">Semua Toko (Konsolidasi)</option>
          </select>
        </label>
      )}
      <button
        type="button"
        className="sales-secondary sales-export-btn sales-export-btn--pdf"
        onClick={() => void handleExport('pdf')}
        disabled={busyFormat !== null || disabled}
      >
        {busyFormat === 'pdf' ? <LoaderCircle size={15} className="sales-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
        {busyFormat === 'pdf' ? FORMAT_META.pdf.busyLabel : FORMAT_META.pdf.label}
      </button>
      <button
        type="button"
        className="sales-secondary sales-export-btn sales-export-btn--xlsx"
        onClick={() => void handleExport('xlsx')}
        disabled={busyFormat !== null || disabled}
      >
        {busyFormat === 'xlsx' ? <LoaderCircle size={15} className="sales-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
        {busyFormat === 'xlsx' ? FORMAT_META.xlsx.busyLabel : FORMAT_META.xlsx.label}
      </button>
      {feedback && (
        <span
          className={`sales-export-feedback${feedback.error ? ' sales-export-feedback--error' : ''}`}
          role={feedback.error ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}

