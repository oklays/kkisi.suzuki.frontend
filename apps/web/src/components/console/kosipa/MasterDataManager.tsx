'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { MasterDefinition, MasterValues } from '@koperasi/domain/kosipa/master';
import { useHydrated } from '../../use-hydrated';

export type MasterRow = { id: number; values: MasterValues; active: boolean; version: string };

const MESSAGES: Record<string, string> = {
  MASTER_CODE_INVALID: 'Kode tidak valid: wajib diisi, huruf/angka/tanda baca biasa, dan tidak melebihi panjang kolom.',
  MASTER_NAME_INVALID: 'Nama tidak valid: wajib diisi, huruf/angka/tanda baca biasa, dan tidak melebihi panjang kolom.',
  MASTER_REMARKS_INVALID: 'Keterangan terlalu panjang atau berisi karakter yang tidak didukung.',
  MASTER_CODE_DUPLICATE: 'Kode sudah dipakai data lain (termasuk yang tidak aktif).',
  MASTER_NAME_DUPLICATE: 'Nama sudah dipakai data lain (termasuk yang tidak aktif).',
  MASTER_REFERENCED: 'Nilai ini masih dipakai data lain (anggota, akun anggota, atau pinjaman), sehingga tidak dapat diganti. Kolom lain tetap dapat diubah.',
  MASTER_FIELD_IMMUTABLE: 'Nilai ini ditetapkan saat dibuat dan tidak dapat diubah. Buat data baru dan nonaktifkan yang lama bila perlu.',
  NO_CHANGE: 'Tidak ada perubahan untuk disimpan.',
  STALE: 'Data ini baru saja diubah orang lain. Muat ulang halaman lalu ulangi.',
  REASON_INVALID: 'Alasan wajib diisi (5–200 karakter).',
  MASTER_NOT_FOUND: 'Data tidak ditemukan. Muat ulang halaman.',
  FORBIDDEN: 'Akun Anda tidak berwenang mengubah master data KOSIPA.',
  WRITE_DISABLED: 'Perubahan master ini sedang tidak diaktifkan. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Menu KOSIPA lama untuk master ini aktif kembali, jadi perubahan di sini ditolak agar tidak ada dua tempat penulisan. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba simpan lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  NETWORK: 'Koneksi terputus. Coba simpan lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
/** Outcomes after which resubmitting the SAME attempt is correct (the server may or may not have committed it). */
const RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);

async function send(method: 'POST' | 'PATCH', path: string, csrfToken: string, body: unknown): Promise<{ ok: boolean; code: string }> {
  try {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, code: typeof data.error === 'string' ? data.error : '' };
  } catch { return { ok: false, code: 'NETWORK' }; }
}

/**
 * One manager for every KOSIPA reference master. Every rule is enforced by the server; this collects input and keeps ONE idempotency key
 * per attempt: a retry after a timeout or BUSY_RETRY resends the same key (never a second record); a new attempt gets a new key.
 */
export function MasterDataManager({ definition, rows, canManage, writable, legacyActive, csrfToken }: { definition: MasterDefinition; rows: MasterRow[]; canManage: boolean; writable: boolean; legacyActive: boolean; csrfToken: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [statusFor, setStatusFor] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const canWrite = canManage && writable;
  const base = `/api/kosipa/master/${definition.type}`;
  const label = (row: MasterRow) => row.values.code ?? row.values.name ?? `#${row.id}`;
  const read = (form: FormData) => Object.fromEntries(definition.fields.map((f) => [f.key, String(form.get(f.key) ?? '')]));

  function keyFor(form: string): string {
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    return attempt.current.key;
  }
  async function submit(form: string, method: 'POST' | 'PATCH', path: string, body: Record<string, unknown>, done: string, after: () => void) {
    setBusy(true); setMessage(null);
    const result = await send(method, path, csrfToken, { ...body, idempotencyKey: keyFor(form) });
    setBusy(false);
    if (!RETRY_SAME_KEY.has(result.code)) attempt.current = null;
    if (result.ok) { after(); setMessage({ kind: 'ok', text: done }); router.refresh(); }
    else setMessage({ kind: 'error', text: MESSAGES[result.code] ?? 'Perubahan tidak dapat disimpan.' });
  }

  return (
    <>
      {legacyActive && <p className="console-notice" role="note">Menu KOSIPA lama untuk master ini masih aktif, jadi halaman ini hanya menampilkan data. Perubahan dilakukan di KOSIPA sampai menu lama dinonaktifkan oleh operator.</p>}
      {!legacyActive && !writable && <p className="console-notice" role="note">Perubahan master ini belum diaktifkan di lingkungan ini. Halaman ini hanya menampilkan data.</p>}
      {writable && !canManage && <p className="console-notice" role="note">Anda dapat melihat daftar ini. Mengubah master data memerlukan hak <strong>Kelola master KOSIPA</strong> yang diberikan dua administrator.</p>}
      {canWrite && (
        <section className="console-card" aria-labelledby="master-new">
          <h2 id="master-new">Tambah data</h2>
          <form className="console-form kosipa-master-form" onSubmit={(e) => {
            e.preventDefault(); const el = e.currentTarget; const body = read(new FormData(el));
            void submit(`create:${JSON.stringify(body)}`, 'POST', base, body, 'Data ditambahkan.', () => el.reset());
          }}>
            {definition.fields.map((f) => <label key={f.key}>{f.label}<input name={f.key} required={f.required} maxLength={f.max} inputMode={f.format === 'months' ? 'numeric' : undefined} autoComplete="off" disabled={!hydrated} /></label>)}
            <button type="submit" disabled={busy || !hydrated}>Simpan</button>
          </form>
        </section>
      )}
      {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <section className="console-card" aria-labelledby="master-list">
        <h2 id="master-list">Daftar ({rows.length})</h2>
        {rows.length === 0 ? <p>Belum ada data.</p> : (
          <div className="kosipa-master-scroll">
          <table className="console-table">
            <thead><tr>{definition.fields.map((f) => <th key={f.key} scope="col">{f.label}</th>)}<th scope="col">Status</th>{canWrite && <th scope="col"><span className="console-visually-hidden">Aksi</span></th>}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id} data-master-id={row.id}>
                {editing === row.id ? (
                  <td colSpan={definition.fields.length + (canWrite ? 2 : 1)}>
                    <form className="console-inline-form" aria-label={`Ubah ${label(row)}`} onSubmit={(e) => {
                      e.preventDefault(); const body = { ...read(new FormData(e.currentTarget)), expectedVersion: row.version };
                      void submit(`update:${row.id}:${JSON.stringify(body)}`, 'PATCH', `${base}/${row.id}`, body, 'Perubahan disimpan.', () => setEditing(null));
                    }}>
                      {definition.fields.map((f) => (
                        <span key={f.key}>
                          <label className="console-visually-hidden" htmlFor={`${f.key}-${row.id}`}>{f.label}</label>
                          <input id={`${f.key}-${row.id}`} name={f.key} defaultValue={row.values[f.key] ?? ''} required={f.required} maxLength={f.max}
                            readOnly={f.change === 'never'} aria-readonly={f.change === 'never'} title={f.change === 'never' ? 'Tetap sejak dibuat' : undefined} />
                        </span>
                      ))}
                      <button type="submit" disabled={busy}>Simpan</button>
                      <button type="button" className="console-button-quiet" onClick={() => setEditing(null)}>Batal</button>
                    </form>
                  </td>
                ) : (
                  <>
                    {definition.fields.map((f) => <td key={f.key}>{row.values[f.key]}</td>)}
                    <td><span className="kosipa-provenance" data-kind={row.active ? undefined : 'unavailable'}>{row.active ? 'Aktif' : 'Tidak aktif'}</span></td>
                    {canWrite && <td>{statusFor === row.id ? (
                      <form className="console-inline-form" aria-label={`${row.active ? 'Nonaktifkan' : 'Aktifkan'} ${label(row)}`} onSubmit={(e) => {
                        e.preventDefault();
                        const action = row.active ? 'deactivate' : 'reactivate';
                        void submit(`${action}:${row.id}:${row.version}:${reason}`, 'POST', `${base}/${row.id}/${action}`, { expectedVersion: row.version, reason }, row.active ? 'Data dinonaktifkan.' : 'Data diaktifkan kembali.', () => { setStatusFor(null); setReason(''); });
                      }}>
                        <label className="console-visually-hidden" htmlFor={`reason-${row.id}`}>Alasan</label>
                        <input id={`reason-${row.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (wajib)" minLength={5} maxLength={200} required autoFocus />
                        <button type="submit" disabled={busy}>{row.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button type="button" className="console-button-quiet" onClick={() => { setStatusFor(null); setReason(''); }}>Batal</button>
                      </form>
                    ) : (
                      <div className="console-inline-form">
                        <button type="button" className="console-button-quiet" disabled={!hydrated || busy} onClick={() => { setEditing(row.id); setStatusFor(null); }}>Ubah</button>
                        <button type="button" className="console-button-quiet" disabled={!hydrated || busy} onClick={() => { setStatusFor(row.id); setEditing(null); setReason(''); }}>{row.active ? 'Nonaktifkan…' : 'Aktifkan…'}</button>
                      </div>
                    )}</td>}
                  </>
                )}
              </tr>
            ))}</tbody>
          </table>
          </div>
        )}
        <p className="console-notice">Data tidak dihapus permanen. Nonaktifkan: {definition.deactivateEffect} Setiap perubahan tercatat di buku besar perintah dan audit.</p>
      </section>
    </>
  );
}
