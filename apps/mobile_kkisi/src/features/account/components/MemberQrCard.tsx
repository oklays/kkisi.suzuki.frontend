'use client';
import { useEffect, useState } from 'react';
import { getJson } from '@/lib/api/client';
import { Icon } from '@/components/ui/Icon';

type Qr = { token: string; expiresAt: number; image: string };
type State = { kind: 'loading' } | { kind: 'ok'; qr: Qr } | { kind: 'unavailable' } | { kind: 'error'; offline: boolean };

/**
 * Signed member QR (P2): fetched from /api/qr when the sheet opens, refreshed ~10 s before it expires and whenever the page becomes visible.
 * The cashier scans it once; a screenshot stops working within a minute. Without a signing key on the server the card says QR is unavailable.
 */
export function MemberQrCard({ nik }: { nik: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function run() {
      if (timer) clearTimeout(timer);
      const r = await getJson<Qr>('/api/qr');
      if (!alive) return;
      if (r.ok) {
        setState({ kind: 'ok', qr: r.data });
        const wait = Math.max(5, r.data.expiresAt - Math.floor(Date.now() / 1000) - 10);
        timer = setTimeout(() => { if (document.visibilityState === 'visible') void run(); }, wait * 1000);
      } else if (r.status === 503 && r.code === 'QR_NOT_CONFIGURED') setState({ kind: 'unavailable' });
      else setState({ kind: 'error', offline: r.code === 'OFFLINE' || r.code === 'NETWORK' });
    }
    void run();
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); if (timer) clearTimeout(timer); };
  }, [attempt]);

  if (state.kind === 'unavailable') {
    return (
      <div className="qr-placeholder"><Icon name="qr" /><strong>NIK {nik}</strong><p>QR ID anggota belum diaktifkan koperasi.<br />Tunjukkan NIK ini kepada kasir.</p></div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="qr-placeholder" role="alert"><Icon name="qr" /><strong>QR belum dapat dimuat</strong>
        <p>{state.offline ? 'Tidak ada koneksi internet. QR hanya dibuat saat online.' : 'Layanan sedang sibuk.'}</p>
        <button type="button" className="secondary" onClick={() => { setState({ kind: 'loading' }); setAttempt((a) => a + 1); }}>Coba lagi</button>
      </div>
    );
  }
  if (state.kind === 'loading') return <div className="qr-card" aria-busy="true"><div className="qr-frame qr-skeleton" /><p className="detail-note">Membuat QR…</p></div>;
  const left = Math.max(0, state.qr.expiresAt - now);
  return (
    <div className="qr-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG data URI, no remote image */}
      <img className="qr-frame" src={state.qr.image} alt="QR ID anggota untuk dipindai kasir" width={240} height={240} />
      <p className="qr-timer" aria-live="polite">{left > 0 ? `Berlaku ${left} detik lagi` : 'Memperbarui QR…'}</p>
      <p className="detail-note">Tunjukkan QR ini ke kasir. QR berganti otomatis, hanya dapat dipindai sekali, dan tidak memuat NIK. Naikkan kecerahan layar bila sulit terbaca.</p>
    </div>
  );
}
