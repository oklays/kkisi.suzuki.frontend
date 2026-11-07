'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { PRODUCT_MESSAGES, PRODUCT_RETRY_SAME_KEY } from './product-master-ui';

/** Deactivate / reactivate one product-master row with a mandatory reason. States the real effect first (Suku Bunga: none, FD-34). Never a delete. */
export function ProductMasterStatus({ type, id, active, version, effect, csrfToken, canSubmit }: { type: string; id: number; active: boolean; version: string; effect: string; csrfToken: string; canSubmit: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage, remember] = useFlash('status');
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const action = active ? 'deactivate' : 'reactivate';

  async function submit() {
    setBusy(true); setMessage(null);
    const form = `${id}:${version}:${action}:${reason}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    let ok = false, code = '';
    try {
      const r = await fetch(`/api/kosipa/master/${type}/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, cache: 'no-store',
        body: JSON.stringify({ expectedVersion: version, reason, idempotencyKey: attempt.current.key }) });
      ok = r.ok; code = (await r.json().catch(() => ({}))).error ?? '';
    } catch { code = 'NETWORK'; }
    setBusy(false);
    if (!PRODUCT_RETRY_SAME_KEY.has(code)) attempt.current = null;
    if (ok) { const text = active ? 'Data dinonaktifkan.' : 'Data diaktifkan kembali.'; setReason(''); setMessage({ kind: 'ok', text }); remember(text); router.refresh(); }
    else setMessage({ kind: 'error', text: PRODUCT_MESSAGES[code] ?? 'Status tidak dapat diubah.' });
  }

  return (
    <section className="mform-group product-status" aria-labelledby="pm-status-title">
      <header><h2 id="pm-status-title">Status</h2><span className="kosipa-provenance" data-kind={active ? undefined : 'unavailable'}>{active ? 'Aktif' : 'Tidak aktif'}</span></header>
      <form className="mform product-status-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="mform-muted">{active ? `Nonaktifkan: ${effect}` : 'Aktifkan kembali agar muncul lagi di pilihan yang menyaring status aktif.'}</p>
        <label htmlFor="pm-status-reason"><span>Alasan <b aria-hidden="true">*</b></span>
          <input id="pm-status-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required disabled={!hydrated || !canSubmit} autoComplete="off" placeholder="Wajib; tercatat di buku besar perintah" />
        </label>
        {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <div className="product-status-actions"><button type="submit" className={active ? 'product-danger' : undefined} disabled={busy || !hydrated || !canSubmit || reason.trim().length < 5}>{active ? 'Nonaktifkan' : 'Aktifkan kembali'}</button></div>
      </form>
    </section>
  );
}
