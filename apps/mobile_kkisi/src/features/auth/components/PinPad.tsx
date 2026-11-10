'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/overlay/Sheet';
import { commonMessage, postJson } from '@/lib/api/client';
import { safeNextPath } from '@/lib/navigation/safe-next';

/** 4-digit member PIN (legacy smartkkisi length). Digits live only in component state and are cleared after every attempt. */
export function PinPad({ length, next }: { length: number; next: string }) {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const firstKey = useRef<HTMLButtonElement>(null);
  const pinRef = useRef('');
  const update = (value: string) => { pinRef.current = value; setPin(value); };

  const submit = useCallback(async (value: string) => {
    setBusy(true);
    const r = await postJson<{ ok: true }>('/api/auth/pin', { pin: value });
    update('');
    if (r.ok) { router.replace(safeNextPath(next)); router.refresh(); return; }
    setBusy(false);
    if (r.code === 'PIN_INVALID') setError(`PIN tidak sesuai. Sisa ${r.remaining} kali percobaan.`);
    else if (r.code === 'PIN_NOT_SET') setError('PIN belum diatur untuk akun ini. Hubungi pengurus koperasi untuk mengatur PIN.');
    else if (r.code === 'PIN_LOCKED' || r.code === 'SESSION_EXPIRED') { router.replace(`/masuk?reason=${r.code === 'PIN_LOCKED' ? 'pin-locked' : 'expired'}&next=${encodeURIComponent(next)}`); return; }
    else setError(commonMessage(r.code, r.retryAfterSec));
    firstKey.current?.focus();
  }, [next, router]);

  const add = useCallback((digit: string) => {
    if (busy) return;
    if (pinRef.current.length >= length) return;
    setError(null);
    const value = pinRef.current + digit;
    update(value);
    if (value.length === length) void submit(value);
  }, [busy, length, submit]);
  const remove = useCallback(() => { if (!busy) update(pinRef.current.slice(0, -1)); }, [busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); add(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); remove(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [add, remove]);

  return (
    <>
      <div className="pin-dots" aria-hidden="true">
        {Array.from({ length }, (_, i) => <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />)}
      </div>
      <p className="pin-status" role="status" aria-live="polite" aria-atomic="true">{busy ? 'Memverifikasi PIN…' : `${pin.length} dari ${length} digit terisi`}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="pin-pad" role="group" aria-label="Papan angka PIN">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d, i) => (
          <button key={d} ref={i === 0 ? firstKey : undefined} className="pin-key" type="button" aria-label={`Angka ${d}`} disabled={busy} onClick={() => add(d)}>{d}</button>
        ))}
        <span aria-hidden="true" />
        <button className="pin-key" type="button" aria-label="Angka 0" disabled={busy} onClick={() => add('0')}>0</button>
        <button className="pin-key delete" type="button" aria-label="Hapus digit terakhir" disabled={busy} onClick={remove}>Hapus</button>
      </div>
      <div className="forgot-row">
        <button className="auth-link" type="button" onClick={() => setForgot(true)}>Lupa PIN?</button>
      </div>
      <Sheet open={forgot} onClose={() => setForgot(false)} title="Lupa PIN?" subtitle="Informasi akun">
        <p className="detail-copy">Pengaturan ulang PIN belum tersedia di aplikasi ini. Hubungi pengurus koperasi KKISI TB2 untuk mengatur ulang PIN akun S-MART kamu.</p>
        <button type="button" className="primary" onClick={() => setForgot(false)}>Kembali</button>
      </Sheet>
    </>
  );
}
