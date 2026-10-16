'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type LinkRow = { id: number; consoleLabel: string; kosipaLabel: string; linkedAt: string; linkedByLabel: string };
type Option = { id: number; label: string };

const MESSAGES: Record<string, string> = {
  SELF_LINK: 'Anda tidak dapat menautkan akun Anda sendiri. Minta administrator lain.',
  CONSOLE_USER_INACTIVE: 'Akun console tidak aktif.', KOSIPA_USER_INACTIVE: 'Akun KOSIPA tidak aktif.',
  KOSIPA_USER_NO_ACCESS: 'Akun KOSIPA tidak memiliki grup akses aktif.',
  CONSOLE_USER_ALREADY_LINKED: 'Akun console ini sudah memiliki tautan aktif.', KOSIPA_USER_ALREADY_LINKED: 'Akun KOSIPA ini sudah ditautkan ke akun console lain.',
  ALREADY_LINKED: 'Tautan bentrok dengan tautan aktif lain.', LINK_NOT_ACTIVE: 'Tautan sudah tidak aktif.', REASON_REQUIRED: 'Alasan pencabutan wajib diisi (3–200 karakter).',
  FORBIDDEN: 'Akun Anda tidak berwenang mengelola tautan.', CONSOLE_STORE_UNAVAILABLE: 'Penyimpanan console tidak tersedia. Tidak ada perubahan yang disimpan.',
};

async function post(path: string, csrfToken: string, body: unknown): Promise<{ ok: boolean; code: string }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, code: typeof data.error === 'string' ? data.error : '' };
  } catch { return { ok: false, code: 'CONSOLE_STORE_UNAVAILABLE' }; }
}

/** Administrator UI for console <-> KOSIPA links. Every rule is enforced by the server; this only collects input. */
export function IdentityLinkManager({ links, consoleUsers, kosipaUsers, csrfToken }: { links: LinkRow[]; consoleUsers: Option[]; kosipaUsers: Option[]; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  async function create(form: FormData) {
    setBusy(true); setMessage(null);
    const result = await post('/api/console/identity-links', csrfToken, { consoleUserId: Number(form.get('consoleUserId')), kosipaUserId: Number(form.get('kosipaUserId')) });
    setBusy(false);
    if (result.ok) { setMessage({ kind: 'ok', text: 'Tautan dibuat.' }); router.refresh(); }
    else setMessage({ kind: 'error', text: MESSAGES[result.code] ?? 'Tautan tidak dapat dibuat.' });
  }
  async function revoke(id: number) {
    setBusy(true); setMessage(null);
    const result = await post(`/api/console/identity-links/${id}/revoke`, csrfToken, { reason });
    setBusy(false);
    if (result.ok) { setRevoking(null); setReason(''); setMessage({ kind: 'ok', text: 'Tautan dicabut.' }); router.refresh(); }
    else setMessage({ kind: 'error', text: MESSAGES[result.code] ?? 'Tautan tidak dapat dicabut.' });
  }

  return (
    <>
      <section className="console-card" aria-labelledby="link-new">
        <h2 id="link-new">Buat tautan</h2>
        <form className="console-form" onSubmit={(e) => { e.preventDefault(); void create(new FormData(e.currentTarget)); }}>
          <label>Akun console<select name="consoleUserId" required defaultValue=""><option value="" disabled>Pilih akun console…</option>{consoleUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label>Akun KOSIPA<select name="kosipaUserId" required defaultValue=""><option value="" disabled>Pilih akun KOSIPA…</option>{kosipaUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <button type="submit" disabled={busy}>Tautkan</button>
        </form>
        <p className="console-notice">Tautan memberi akun console hak baca KOSIPA sesuai grup akun KOSIPA. Tidak ada pencocokan otomatis berdasarkan nama, e-mail, atau NIK.</p>
      </section>
      {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <section className="console-card" aria-labelledby="link-list">
        <h2 id="link-list">Tautan aktif</h2>
        {links.length === 0 ? <p>Belum ada tautan aktif.</p> : (
          <table className="console-table">
            <thead><tr><th scope="col">Akun console</th><th scope="col">Akun KOSIPA</th><th scope="col">Ditautkan</th><th scope="col"><span className="console-visually-hidden">Aksi</span></th></tr></thead>
            <tbody>{links.map((l) => (
              <tr key={l.id}>
                <td>{l.consoleLabel}</td><td>{l.kosipaLabel}</td><td>{l.linkedAt} oleh {l.linkedByLabel}</td>
                <td>{revoking === l.id ? (
                  <form className="console-inline-form" onSubmit={(e) => { e.preventDefault(); void revoke(l.id); }}>
                    <label className="console-visually-hidden" htmlFor={`reason-${l.id}`}>Alasan pencabutan</label>
                    <input id={`reason-${l.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan pencabutan" minLength={3} maxLength={200} required autoFocus />
                    <button type="submit" disabled={busy}>Cabut</button>
                    <button type="button" className="console-button-quiet" onClick={() => { setRevoking(null); setReason(''); }}>Batal</button>
                  </form>
                ) : <button type="button" className="console-button-quiet" onClick={() => { setRevoking(l.id); setReason(''); }}>Cabut tautan…</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
