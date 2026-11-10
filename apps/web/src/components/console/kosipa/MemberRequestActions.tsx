'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useHydrated } from '../../use-hydrated';
import { rememberFlash } from './member-flash';
import { postJson } from './deposit-ui';

/** Messages of the member-request screen (P1). The server enforces every rule; these only explain its codes. */
export const REQUEST_MESSAGES: Record<string, string> = {
  REQUEST_STATUS_INVALID: 'Pengajuan ini sudah diproses (disetujui atau ditolak). Muat ulang halaman.',
  REQUEST_ALREADY_CONVERTED: 'Pengajuan ini sudah dijadikan pinjaman di KOSIPA lama, jadi tidak dapat ditolak di sini.',
  REQUEST_TYPE_UNSUPPORTED: 'Jenis pengajuan ini tidak diproses di sini (hanya Simpanan Wajib / Sukarela; pengajuan dari tautan publik punya halamannya sendiri).',
  REQUEST_MEMBER_INVALID: 'Data anggota untuk NIK ini tidak tunggal atau anggota sudah keluar. Periksa di direktori anggota.',
  REQUEST_NIK_TOO_LONG: 'NIK anggota lebih dari 10 karakter sehingga tidak muat di kolom potongan simpanan. Hubungi administrator.',
  REQUEST_AMOUNT_INVALID: 'Nominal tidak valid: harus Rupiah bulat, dan Simpanan Wajib hanya boleh naik.',
  REQUEST_STATE_INCONSISTENT: 'Data pengajuan tidak konsisten (nomor ganda atau tanggal kosong). Periksa di KOSIPA.',
  NOT_FOUND: 'Pengajuan tidak ditemukan. Muat ulang halaman.',
  STALE: 'Pengajuan ini baru saja berubah (oleh orang lain atau layar lama). Muat ulang halaman lalu ulangi.',
  REASON_INVALID: 'Alasan wajib diisi (5–200 karakter).',
  FORBIDDEN: 'Akun Anda tidak berwenang untuk tindakan ini.',
  WRITE_DISABLED: 'Pemrosesan pengajuan belum diaktifkan di lingkungan ini. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan pengajuan belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Layar pengajuan di KOSIPA lama aktif kembali, jadi perubahan di sini ditolak. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  NETWORK: 'Koneksi terputus. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
const RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);

/** Approve (deduction changes only, with an explicit confirmation) or reject (mandatory reason) one OPEN member request. */
export function MemberRequestActions({ type, docNo, version, summary, canApprove, canReject, csrfToken, writable }: {
  type: 'loan' | 'deduction'; docNo: string; version: string; summary: string; canApprove: boolean; canReject: boolean; csrfToken: string; writable: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const locked = !hydrated || !writable || busy;
  const id = docNo.replace(/[^A-Za-z0-9]/g, '');

  async function send(action: 'approve' | 'reject') {
    setBusy(true); setError(null);
    const body = { expectedVersion: version, ...(action === 'reject' ? { reason } : {}) };
    const form = `${docNo}:${action}:${JSON.stringify(body)}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    const r = await postJson(`/api/kosipa/member-requests/${type}/${encodeURIComponent(docNo)}/${action}`, csrfToken, { ...body, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (!RETRY_SAME_KEY.has(r.code)) attempt.current = null;
    if (r.ok) { rememberFlash('list', action === 'approve' ? `${docNo} disetujui.` : `${docNo} ditolak.`); setMode('idle'); router.refresh(); }
    else setError(REQUEST_MESSAGES[r.code] ?? 'Tindakan tidak dapat diproses.');
  }

  if (!canApprove && !canReject) return <span className="deposit-note">—</span>;
  return (
    <div className="deposit-actions">
      {mode === 'idle' && <>
        {canApprove && <button type="button" className="deposit-approve" disabled={locked} onClick={() => setMode('approve')}>Setujui…</button>}
        {canReject && <button type="button" className="mform-link" disabled={locked} onClick={() => { setMode('reject'); setReason(''); }}>Tolak…</button>}
      </>}
      {mode === 'approve' && (
        <div className="deposit-confirm" role="group" aria-label={`Konfirmasi persetujuan ${docNo}`}>
          <p>Setujui {summary}? Potongan payroll anggota berubah mulai periode berikutnya dan pengajuan tidak dapat diubah lagi.</p>
          <button type="button" className="deposit-approve" disabled={locked} onClick={() => void send('approve')}>Ya, setujui</button>
          <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
        </div>
      )}
      {mode === 'reject' && (
        <form className="deposit-confirm" aria-label={`Tolak ${docNo}`} onSubmit={(e) => { e.preventDefault(); void send('reject'); }}>
          <label htmlFor={`req-reason-${id}`} className="console-visually-hidden">Alasan penolakan</label>
          <input id={`req-reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required placeholder="Alasan penolakan (wajib)" autoFocus />
          <button type="submit" className="deposit-reject" disabled={locked || reason.trim().length < 5}>Tolak</button>
          <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
        </form>
      )}
      {error && <p className="console-message console-message-error" role="alert">{error}</p>}
    </div>
  );
}
