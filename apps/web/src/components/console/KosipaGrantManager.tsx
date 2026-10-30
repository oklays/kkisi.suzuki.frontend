'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '../use-hydrated';

export type GrantRow = {
  id: number; status: 'pending' | 'active'; userLabel: string; capabilityLabel: string; requestedAt: string; requestedByLabel: string;
  expiresAt: string; decidedByLabel: string | null; canApprove: boolean; canReject: boolean;
};
type Option = { id: number | string; label: string };

const MESSAGES: Record<string, string> = {
  SELF_GRANT: 'Anda tidak dapat meminta atau memutuskan hak untuk akun Anda sendiri.',
  SELF_APPROVAL: 'Permintaan yang Anda ajukan harus disetujui administrator lain.',
  NOT_LINKED: 'Akun ini belum ditautkan ke akun KOSIPA. Tautkan dulu di menu Tautan Akun KOSIPA.',
  CONSOLE_USER_INACTIVE: 'Akun console tidak aktif.', CONSOLE_USER_NOT_FOUND: 'Akun console tidak ditemukan.',
  ALREADY_GRANTED: 'Akun ini sudah memiliki hak tersebut atau permintaan yang masih menunggu.',
  GRANT_NOT_PENDING: 'Permintaan ini sudah diputuskan oleh administrator lain.', GRANT_REQUEST_EXPIRED: 'Permintaan sudah kedaluwarsa (24 jam). Ajukan ulang.',
  GRANT_REQUEST_STALE: 'Keadaan berubah sejak permintaan diajukan (pengaju atau akun tujuan tidak lagi memenuhi syarat). Ajukan ulang bila masih perlu.',
  GRANT_NOT_ACTIVE: 'Hak ini sudah dicabut.', GRANT_NOT_FOUND: 'Data tidak ditemukan.',
  CAPABILITY_NOT_GRANTABLE: 'Hak ini belum dapat diberikan.', REASON_REQUIRED: 'Alasan wajib diisi (5–200 karakter).',
  FORBIDDEN: 'Akun Anda tidak berwenang mengelola hak ubah KOSIPA.', CONSOLE_STORE_UNAVAILABLE: 'Penyimpanan console tidak tersedia. Tidak ada perubahan yang disimpan.',
};

async function post(path: string, csrfToken: string, body: unknown): Promise<{ ok: boolean; code: string }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, code: typeof data.error === 'string' ? data.error : '' };
  } catch { return { ok: false, code: 'CONSOLE_STORE_UNAVAILABLE' }; }
}

/** Grant administration UI (FD-16, two administrators). The server enforces every rule: allow-list, no self-request/approval, linked target, expiry, audit. */
export function KosipaGrantManager({ grants, users, capabilities, csrfToken }: { grants: GrantRow[]; users: Option[]; capabilities: Option[]; csrfToken: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [open, setOpen] = useState<{ id: number; action: 'reject' | 'revoke' } | null>(null);
  const [reason, setReason] = useState('');
  const pending = grants.filter((g) => g.status === 'pending');
  const active = grants.filter((g) => g.status === 'active');

  async function act(path: string, body: unknown, done: string, after: () => void) {
    setBusy(true); setMessage(null);
    const result = await post(path, csrfToken, body);
    setBusy(false);
    if (result.ok) { after(); setMessage({ kind: 'ok', text: done }); router.refresh(); }
    else setMessage({ kind: 'error', text: MESSAGES[result.code] ?? 'Perubahan tidak dapat disimpan.' });
  }
  const reasonForm = (g: GrantRow, action: 'reject' | 'revoke') => (
    <form className="console-inline-form" onSubmit={(e) => {
      e.preventDefault();
      void act(`/api/console/kosipa-grants/${g.id}/${action}`, action === 'reject' ? { note: reason } : { reason }, action === 'reject' ? 'Permintaan ditolak.' : 'Hak dicabut.', () => { setOpen(null); setReason(''); });
    }}>
      <label className="console-visually-hidden" htmlFor={`grant-reason-${g.id}`}>Alasan</label>
      <input id={`grant-reason-${g.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? 'Alasan penolakan' : 'Alasan pencabutan'} minLength={5} maxLength={200} required autoFocus />
      <button type="submit" disabled={busy}>{action === 'reject' ? 'Tolak' : 'Cabut'}</button>
      <button type="button" className="console-button-quiet" onClick={() => { setOpen(null); setReason(''); }}>Batal</button>
    </form>
  );

  return (
    <>
      <section className="console-card" aria-labelledby="grant-new">
        <h2 id="grant-new">Ajukan hak</h2>
        <form className="console-form console-form-4" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget); const el = e.currentTarget;
          void act('/api/console/kosipa-grants', { consoleUserId: Number(f.get('consoleUserId')), capability: String(f.get('capability')), reason: String(f.get('reason') ?? '') }, 'Permintaan diajukan. Administrator lain harus menyetujuinya.', () => el.reset());
        }}>
          <label>Akun (sudah ditautkan)<select name="consoleUserId" required defaultValue="" disabled={!hydrated}><option value="" disabled>Pilih akun…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label>Hak<select name="capability" required defaultValue={String(capabilities[0]?.id ?? '')} disabled={!hydrated}>{capabilities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label>Alasan<input name="reason" required minLength={5} maxLength={200} disabled={!hydrated} /></label>
          <button type="submit" disabled={busy || !hydrated}>Ajukan</button>
        </form>
        <p className="console-notice">Hak ubah berlaku setelah disetujui administrator <strong>lain</strong> dalam 24 jam. Hak ubah tidak pernah berasal dari menu KOSIPA lama atau dari tautan akun.</p>
      </section>
      {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <section className="console-card" aria-labelledby="grant-pending">
        <h2 id="grant-pending">Menunggu persetujuan</h2>
        {pending.length === 0 ? <p>Tidak ada permintaan yang menunggu.</p> : (
          <table className="console-table">
            <thead><tr><th scope="col">Akun</th><th scope="col">Hak</th><th scope="col">Diajukan</th><th scope="col"><span className="console-visually-hidden">Aksi</span></th></tr></thead>
            <tbody>{pending.map((g) => (
              <tr key={g.id} data-grant-id={g.id}>
                <td>{g.userLabel}</td><td>{g.capabilityLabel}</td><td>{g.requestedAt} oleh {g.requestedByLabel} · berlaku sampai {g.expiresAt}</td>
                <td>{open?.id === g.id && open.action === 'reject' ? reasonForm(g, 'reject') : (
                  <div className="console-inline-form">
                    {g.canApprove ? <button type="button" disabled={!hydrated || busy} onClick={() => void act(`/api/console/kosipa-grants/${g.id}/approve`, {}, 'Hak disetujui dan berlaku.', () => undefined)}>Setujui</button>
                      : <span className="console-notice">Menunggu administrator lain</span>}
                    {g.canReject && <button type="button" className="console-button-quiet" disabled={!hydrated || busy} onClick={() => { setOpen({ id: g.id, action: 'reject' }); setReason(''); }}>Tolak…</button>}
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <section className="console-card" aria-labelledby="grant-list">
        <h2 id="grant-list">Hak aktif</h2>
        {active.length === 0 ? <p>Belum ada hak ubah yang berlaku.</p> : (
          <table className="console-table">
            <thead><tr><th scope="col">Akun</th><th scope="col">Hak</th><th scope="col">Diajukan / disetujui</th><th scope="col"><span className="console-visually-hidden">Aksi</span></th></tr></thead>
            <tbody>{active.map((g) => (
              <tr key={g.id} data-grant-id={g.id}>
                <td>{g.userLabel}</td><td>{g.capabilityLabel}</td><td>{g.requestedByLabel} · disetujui {g.decidedByLabel}</td>
                <td>{open?.id === g.id && open.action === 'revoke' ? reasonForm(g, 'revoke')
                  : <button type="button" className="console-button-quiet" disabled={!hydrated} onClick={() => { setOpen({ id: g.id, action: 'revoke' }); setReason(''); }}>Cabut hak…</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
