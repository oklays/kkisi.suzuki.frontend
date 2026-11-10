'use client';
import { Sheet } from '../overlay/Sheet';

/**
 * Shown when a member completes a form. When the feature flag is disabled (default in production), it states plainly that
 * nothing was sent ("Belum ada yang dikirim."). When enabled and recorded by `/api/transaksi/ajukan`, it shows the recorded
 * intake document number and status ("OPEN — menunggu verifikasi pengurus").
 */
export function SubmissionNotice({
  open, onClose, title, rows, channel, recordedDocNo, errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: [string, string][];
  channel: string;
  recordedDocNo?: string | null;
  errorMessage?: string | null;
}) {
  const subtitle = recordedDocNo ? `Tercatat · ${recordedDocNo}` : 'Belum dapat dikirim dari aplikasi';
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <dl className="dialog-values">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {recordedDocNo ? (
        <p className="detail-note" role="status">
          <strong style={{ display: 'block', color: 'var(--navy)', marginBottom: 4 }}>Pengajuan tercatat ({recordedDocNo}).</strong>
          {channel} berstatus menunggu verifikasi pengurus koperasi KKISI TB2.
        </p>
      ) : (
        <p className="detail-note" role="status">
          <strong style={{ display: 'block', color: 'var(--navy)', marginBottom: 4 }}>Belum ada yang dikirim.</strong>
          {errorMessage ?? `${channel} dari aplikasi anggota belum diaktifkan oleh koperasi. Data di atas tidak disimpan. Silakan ajukan melalui pengurus koperasi KKISI TB2.`}
        </p>
      )}
      <button type="button" className="primary" onClick={onClose}>Mengerti</button>
    </Sheet>
  );
}
