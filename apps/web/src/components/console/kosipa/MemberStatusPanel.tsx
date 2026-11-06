'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { MEMBER_MESSAGES, MEMBER_STATUS_OPTIONS, RETRY_SAME_KEY } from './member-form-config';

/**
 * Status change (REQ-110, FD-30). ONE authorized operator with a mandatory reason (owner decision, FD-17 subset). Effects are stated before the operator
 * confirms; the server performs them atomically.
 */
export function MemberStatusPanel({ memberId, currentStatus, version, csrfToken, canSubmit }: { memberId: number; currentStatus: string; version: string; csrfToken: string; canSubmit: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const targets = MEMBER_STATUS_OPTIONS.filter((s) => s !== currentStatus);
  const [target, setTarget] = useState<string>(targets[0] ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage, remember] = useFlash('status');
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const deactivating = target !== 'AKTIVE';

  async function submit() {
    setBusy(true); setMessage(null);
    const form = `${memberId}:${version}:${target}:${reason}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    let code = '', ok = false;
    try {
      const r = await fetch(`/api/kosipa/members/${memberId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, cache: 'no-store',
        body: JSON.stringify({ status: target, reason, expectedVersion: version, idempotencyKey: attempt.current.key }) });
      ok = r.ok; code = (await r.json().catch(() => ({}))).error ?? '';
    } catch { code = 'NETWORK'; }
    setBusy(false);
    if (!RETRY_SAME_KEY.has(code)) attempt.current = null;
    if (ok) { setReason(''); setMessage({ kind: 'ok', text: `Status diubah menjadi ${target}.` }); remember(`Status diubah menjadi ${target}.`); router.refresh(); }
    else setMessage({ kind: 'error', text: MEMBER_MESSAGES[code] ?? 'Status tidak dapat diubah.' });
  }

  return (
    <section className="console-card" aria-labelledby="member-status-title">
      <h2 id="member-status-title">Ubah status anggota</h2>
      <p>Status saat ini: <strong>{currentStatus || '—'}</strong></p>
      <form className="console-form kosipa-member-status" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label htmlFor="member-status-target"><span>Status baru *</span>
          <select id="member-status-target" value={target} disabled={!hydrated || !canSubmit} onChange={(e) => setTarget(e.target.value)}>{targets.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label htmlFor="member-status-reason"><span>Alasan *</span>
          <input id="member-status-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required disabled={!hydrated || !canSubmit} autoComplete="off" placeholder="Wajib; tercatat di buku besar perintah" />
        </label>
        <p className="console-notice" role="note" data-kind={deactivating ? 'warning' : undefined}>
          {deactivating
            ? <>Saat disimpan: <strong>limit toko, limit PPOB, dan gaji minus menjadi 0</strong>; bila anggota punya akun mobile, akun dinonaktifkan, saldo dompetnya 0, dan semua token loginnya dicabut. Konfigurasi potongan payroll tidak diubah.</>
            : <>Hanya status anggota yang diubah. <strong>Batas kredit tetap 0</strong> dan akun mobile tidak diaktifkan kembali otomatis; keduanya memerlukan tindakan terpisah.</>}
        </p>
        {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <button type="submit" disabled={busy || !hydrated || !canSubmit || !target}>Ubah status</button>
      </form>
    </section>
  );
}
