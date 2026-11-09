'use client';
import { Sheet } from '../overlay/Sheet';

/**
 * Shown when a member completes a form whose submission has no approved backend writer yet (loan application, deduction change,
 * store checkout, PPOB purchase). It summarises what was filled in and states plainly that nothing was sent — never a fake success.
 */
export function SubmissionNotice({ open, onClose, title, rows, channel }: { open: boolean; onClose: () => void; title: string; rows: [string, string][]; channel: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="Belum dapat dikirim dari aplikasi">
      <dl className="dialog-values">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="detail-note" role="status">
        <strong style={{ display: 'block', color: 'var(--navy)', marginBottom: 4 }}>Belum ada yang dikirim.</strong>
        {channel} dari aplikasi anggota belum diaktifkan oleh koperasi. Data di atas tidak disimpan. Silakan ajukan melalui pengurus koperasi KKISI TB2.
      </p>
      <button type="button" className="primary" onClick={onClose}>Mengerti</button>
    </Sheet>
  );
}
