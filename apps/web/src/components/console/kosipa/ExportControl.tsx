'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
import { useHydrated } from '@/components/use-hydrated';
import { exportFeedback } from './presentation';

export type ExportFormatOption = 'csv' | 'xlsx' | 'pdf';

const FORMAT_META: Record<ExportFormatOption, { label: string; busyLabel: string; doneLabel: string; mime: string; ext: string }> = {
  pdf: {
    label: 'Unduh PDF',
    busyLabel: 'Menyiapkan PDF…',
    doneLabel: 'PDF siap. Unduhan telah dimulai.',
    mime: 'application/pdf',
    ext: 'pdf',
  },
  xlsx: {
    label: 'Unduh Excel (.xlsx)',
    busyLabel: 'Menyiapkan Excel…',
    doneLabel: 'Excel (.xlsx) siap. Unduhan telah dimulai.',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  csv: {
    label: 'Unduh CSV',
    busyLabel: 'Menyiapkan CSV…',
    doneLabel: 'CSV siap. Unduhan telah dimulai.',
    mime: 'text/csv',
    ext: 'csv',
  },
};

function buildFormatHref(baseHref: string, format: ExportFormatOption, singleEndpoint: boolean): string {
  if (singleEndpoint) return baseHref;
  const separator = baseHref.includes('?') ? '&' : '?';
  return `${baseHref}${separator}format=${format}`;
}

/** A granted report or document download; all policy, audit, limits, sanitization and formatting stay on the server endpoint. */
export function ExportControl({
  href,
  formats = ['pdf', 'xlsx', 'csv'],
  singlePdfLabel,
}: {
  href: string;
  formats?: ExportFormatOption[];
  singlePdfLabel?: string;
}) {
  const [busyFormat, setBusyFormat] = useState<ExportFormatOption | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const hydrated = useHydrated();
  const isSinglePdf = Boolean(singlePdfLabel);
  const activeFormats: ExportFormatOption[] = isSinglePdf ? ['pdf'] : formats;

  async function download(format: ExportFormatOption) {
    if (busyFormat) return;
    setBusyFormat(format);
    setMessage('');
    setFailed(false);
    const meta = FORMAT_META[format];
    const targetHref = buildFormatHref(href, format, isSinglePdf);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(targetHref, { cache: 'no-store', signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        const retry = response.status === 429 ? Number(response.headers.get('retry-after')) : 0;
        setFailed(true);
        setMessage(exportFeedback(response.status) + (Number.isFinite(retry) && retry > 0 ? ` Coba lagi dalam ${retry} detik.` : ''));
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes(meta.mime)) throw new Error('Unexpected download');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const filename = response.headers.get('content-disposition')?.match(/filename="?([A-Za-z0-9_.-]+\.(?:csv|xlsx|pdf))/)?.[1];
      link.download = filename ?? `laporan-kosipa.${meta.ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(meta.doneLabel);
    } catch {
      setFailed(true);
      setMessage(exportFeedback(0));
    } finally {
      clearTimeout(timer);
      setBusyFormat(null);
    }
  }

  return (
    <div className="kosipa-export">
      <div className="kosipa-export-actions" role="group" aria-label="Pilihan unduhan dokumen">
        {activeFormats.map((format) => {
          const meta = FORMAT_META[format];
          const isBusy = busyFormat === format;
          const label = isSinglePdf && singlePdfLabel ? singlePdfLabel : meta.label;
          const Icon = format === 'pdf' ? FileText : format === 'xlsx' ? FileSpreadsheet : Download;
          return (
            <button
              key={format}
              className="kosipa-button-secondary"
              data-primary={format === 'pdf' ? 'true' : undefined}
              type="button"
              onClick={() => void download(format)}
              disabled={busyFormat !== null || !hydrated}
            >
              {isBusy ? <LoaderCircle className="kosipa-spin" size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
              {isBusy ? meta.busyLabel : label}
            </button>
          );
        })}
      </div>
      <span className="kosipa-export-note">Sesuai filter laporan · izin ekspor terpisah</span>
      {message && (
        <p className="kosipa-export-feedback" data-error={failed} role={failed ? 'alert' : 'status'} aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
