'use client';

import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { useHydrated } from '@/components/use-hydrated';
import { exportFeedback } from './presentation';

/** A granted report download; all policy, audit, limits, sanitization and exact CSV stay on the existing endpoint. */
export function ExportControl({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const hydrated = useHydrated();
  async function download() {
    if (busy) return;
    setBusy(true); setMessage(''); setFailed(false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(href, { cache: 'no-store', signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        const retry = response.status === 429 ? Number(response.headers.get('retry-after')) : 0;
        setFailed(true); setMessage(exportFeedback(response.status) + (Number.isFinite(retry) && retry > 0 ? ` Coba lagi dalam ${retry} detik.` : ''));
        return;
      }
      if (!response.headers.get('content-type')?.includes('text/csv')) throw new Error('Unexpected download');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl;
      const filename = response.headers.get('content-disposition')?.match(/filename="?([A-Za-z0-9_.-]+\.csv)/)?.[1];
      link.download = filename ?? 'laporan-kosipa.csv'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage('CSV siap. Unduhan telah dimulai.');
    } catch { setFailed(true); setMessage(exportFeedback(0)); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <div className="kosipa-export"><button className="kosipa-button-secondary" type="button" onClick={() => void download()} disabled={busy || !hydrated}>
    {busy ? <LoaderCircle className="kosipa-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{busy ? 'Menyiapkan CSV…' : 'Unduh CSV'}
  </button><span className="kosipa-export-note">Sesuai filter laporan · izin ekspor terpisah</span>
    {message && <p className="kosipa-export-feedback" data-error={failed} role={failed ? 'alert' : 'status'}>{message}</p>}
  </div>;
}
