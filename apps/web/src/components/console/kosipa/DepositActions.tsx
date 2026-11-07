'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useHydrated } from '../../use-hydrated';
import { rememberFlash } from './member-flash';
import { DEPOSIT_MESSAGES, DEPOSIT_RETRY_SAME_KEY, postJson, rupiah } from './deposit-ui';

/** Approve (with an explicit confirmation of amount and member) or reject (mandatory reason) one pending deposit. The server re-checks everything. */
export function DepositActions({ id, version, amount, member, docNo, canApprove, canReject, isOwn, csrfToken, writable }: {
  id: number; version: string; amount: string; member: string; docNo: string; canApprove: boolean; canReject: boolean; isOwn: boolean; csrfToken: string; writable: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error'; text: string } | null>(null);
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const locked = !hydrated || !writable || busy;

  async function send(action: 'approve' | 'reject') {
    setBusy(true); setMessage(null);
    const body = { expectedVersion: version, ...(action === 'reject' ? { reason } : {}) };
    const form = `${id}:${action}:${JSON.stringify(body)}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    const r = await postJson(`/api/kosipa/savings/deposits/${id}/${action}`, csrfToken, { ...body, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (!DEPOSIT_RETRY_SAME_KEY.has(r.code)) attempt.current = null;
    if (r.ok) { rememberFlash('list', action === 'approve' ? `${docNo} disetujui.` : `${docNo} ditolak.`); setMode('idle'); router.refresh(); }
    else setMessage({ kind: 'error', text: DEPOSIT_MESSAGES[r.code] ?? 'Tindakan tidak dapat diproses.' });
  }

  if (!canApprove && !canReject) return isOwn ? <span className="deposit-note">Menunggu petugas lain</span> : <span className="deposit-note">—</span>;
  return (
    <div className="deposit-actions">
      {mode === 'idle' && <>
        {canApprove && <button type="button" className="deposit-approve" disabled={locked} onClick={() => setMode('approve')}>Setujui…</button>}
        {!canApprove && isOwn && <span className="deposit-note">Persetujuan oleh petugas lain</span>}
        {canReject && <button type="button" className="mform-link" disabled={locked} onClick={() => { setMode('reject'); setReason(''); }}>Tolak…</button>}
      </>}
      {mode === 'approve' && (
        <div className="deposit-confirm" role="group" aria-label={`Konfirmasi persetujuan ${docNo}`}>
          <p>Setujui setoran <strong>{rupiah(amount)}</strong> untuk <strong>{member}</strong>? Saldo bertambah dan dokumen tidak dapat diubah lagi.</p>
          <button type="button" className="deposit-approve" disabled={locked} onClick={() => void send('approve')}>Ya, setujui</button>
          <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
        </div>
      )}
      {mode === 'reject' && (
        <form className="deposit-confirm" aria-label={`Tolak ${docNo}`} onSubmit={(e) => { e.preventDefault(); void send('reject'); }}>
          <label htmlFor={`dep-reason-${id}`} className="console-visually-hidden">Alasan penolakan</label>
          <input id={`dep-reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required placeholder="Alasan penolakan (wajib)" autoFocus />
          <button type="submit" className="deposit-reject" disabled={locked || reason.trim().length < 5}>Tolak</button>
          <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
        </form>
      )}
      {message && <p className="console-message console-message-error" role="alert">{message.text}</p>}
    </div>
  );
}
