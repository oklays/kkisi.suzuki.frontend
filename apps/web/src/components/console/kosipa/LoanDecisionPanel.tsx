'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { postJson } from './deposit-ui';

/** Messages of the loan decision (FA-04). The server enforces every rule; these only explain its codes. */
export const LOAN_DECISION_MESSAGES: Record<string, string> = {
  LOAN_STATUS_INVALID: 'Status dokumen sudah berubah atau tidak dapat diproses dari status ini. Muat ulang halaman.',
  LOAN_MAKER_CHECKER: 'Anda yang memposting pinjaman ini. Persetujuan atau penolakan harus oleh petugas lain.',
  LOAN_DUPLICATE_HEADER: 'Ada lebih dari satu dokumen dengan nomor ini. Rapikan data terlebih dahulu; keputusan tidak diproses agar dokumen lain tidak ikut berubah.',
  LOAN_STATE_INCONSISTENT: 'Dokumen sudah tercatat dicairkan atau lunas padahal belum disetujui. Periksa datanya; keputusan tidak diproses.',
  LOAN_PPOB_ORDER: 'Kasbon ini berasal dari pesanan PPOB (bayar nanti). Putuskan dari modul PPOB agar status pesanan ikut berubah.',
  LOAN_MOBILE_REQUEST_CONFLICT: 'Ada lebih dari satu pengajuan mobile dengan nomor ini. Rapikan data pengajuan terlebih dahulu.',
  LOAN_AMOUNT_INVALID: 'Pokok pinjaman pada dokumen kosong atau nol; pinjaman tidak dapat disetujui.',
  LOAN_MEMBER_NOT_FOUND: 'NIK pada dokumen tidak ditemukan di data anggota; pinjaman tidak dapat disetujui.',
  LOAN_MEMBER_AMBIGUOUS: 'NIK pada dokumen cocok dengan lebih dari satu anggota. Rapikan data anggota terlebih dahulu.',
  LOAN_MEMBER_INACTIVE: 'Anggota sudah keluar (RESIGN/PENSIUN); pinjaman baru tidak dapat disetujui. Tolak pengajuan bila perlu.',
  LOAN_NOT_FOUND: 'Dokumen pinjaman tidak ditemukan. Muat ulang halaman.',
  STALE: 'Dokumen ini baru saja berubah (oleh orang lain atau KOSIPA lama). Muat ulang halaman lalu ulangi.',
  REASON_INVALID: 'Alasan penolakan wajib diisi (5–200 karakter).',
  FORBIDDEN: 'Akun Anda tidak berwenang untuk tindakan ini.',
  WRITE_DISABLED: 'Keputusan pinjaman belum diaktifkan di lingkungan ini. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan pinjaman belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Layar pinjaman di KOSIPA lama masih aktif, jadi keputusan di sini ditolak. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  NETWORK: 'Koneksi terputus. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
const RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);
/** Blockers that say something about the document (shown as a reason); access/configuration blockers are explained once by the panel. */
const SILENT = new Set(['FORBIDDEN', 'WRITE_DISABLED', 'LEGACY_ACTIVE', 'LOAN_STATUS_INVALID']);

export type LoanDecisionOptionView = { action: 'post' | 'approve' | 'reject'; allowed: boolean; blocker: string | null };
export type LoanDecisionSummary = { member: string; nik: string; product: string; principal: string; installment: string; tenor: string; rollovers: number; mobile: boolean };

export function LoanDecisionPanel({ docNo, status, version, options, writable, legacy, owned, shared, postedByViewer, csrfToken, summary }: {
  docNo: string; status: string; version: string; options: LoanDecisionOptionView[]; writable: boolean; legacy: 'fenced' | 'legacy-active'; owned: boolean; shared: boolean; postedByViewer: boolean;
  csrfToken: string; summary: LoanDecisionSummary;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<'idle' | 'post' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage, remember] = useFlash('status');
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const opt = (a: LoanDecisionOptionView['action']) => options.find((o) => o.action === a);
  const can = { post: !!opt('post')?.allowed, approve: !!opt('approve')?.allowed, reject: !!opt('reject')?.allowed };
  const capable = options.some((o) => o.blocker !== 'FORBIDDEN');
  const blockers = [...new Set(options.filter((o) => !o.allowed && o.blocker && !SILENT.has(o.blocker)).map((o) => o.blocker as string))];
  const locked = !hydrated || busy;

  async function send(action: 'post' | 'approve' | 'reject') {
    setBusy(true); setMessage(null);
    const body = { expectedVersion: version, ...(action === 'reject' ? { reason } : {}) };
    const form = `${docNo}:${action}:${JSON.stringify(body)}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    const r = await postJson(`/api/kosipa/loans/${encodeURIComponent(docNo)}/decision/${action}`, csrfToken, { ...body, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (!RETRY_SAME_KEY.has(r.code)) attempt.current = null;
    if (r.ok) {
      const text = action === 'post' ? `${docNo} diposting dan menunggu persetujuan.` : action === 'approve' ? `${docNo} disetujui. Pencairan dilakukan terpisah.` : `${docNo} ditolak.`;
      // Approve/reject replace this panel with LoanDecisionRecord after the refresh, which announces the stored text; posting keeps this panel mounted.
      if (action !== 'post') remember(text);
      setMessage({ kind: 'ok', text }); setMode('idle'); setReason(''); router.refresh();
    } else setMessage({ kind: 'error', text: LOAN_DECISION_MESSAGES[r.code] ?? 'Keputusan tidak dapat diproses.' });
  }

  return (
    <section className="kloan-decision" aria-labelledby="sec-keputusan" data-status={status}>
      <header className="kloan-section-head">
        <div>
          <h2 id="sec-keputusan">Keputusan pinjaman</h2>
          <p>{status === 'OPEN' ? 'Dokumen baru diajukan. Posting setelah berkas diperiksa, lalu petugas lain menyetujui atau menolak.' : 'Berkas sudah diposting dan menunggu persetujuan atau penolakan.'}</p>
        </div>
      </header>

      {!owned && <p className="kloan-decision-note" role="note">Keputusan pinjaman native belum diaktifkan di lingkungan ini. Persetujuan masih dilakukan di KOSIPA lama.</p>}
      {owned && shared && legacy === 'legacy-active' && <p className="kloan-decision-note" data-kind="warning" role="note"><strong>Mode bersama (UAT).</strong> KOSIPA lama tetap aktif untuk pengajuan, edit, dan pencairan. Putuskan dokumen di satu aplikasi saja, dan muat ulang halaman KOSIPA lama setelah memutuskan di sini: layar lama yang masih terbuka dapat menimpa keputusan ini.</p>}
      {owned && !shared && legacy === 'legacy-active' && <p className="kloan-decision-note" data-kind="warning" role="note">Layar pinjaman di KOSIPA lama masih aktif. Selama aktif, keputusan hanya dapat dilakukan di KOSIPA lama agar dua aplikasi tidak memutuskan dokumen yang sama.</p>}
      {writable && !capable && <p className="kloan-decision-note" role="note">Hanya lihat. Posting memerlukan hak <strong>Siapkan pinjaman</strong>; persetujuan memerlukan hak <strong>Setujui pinjaman</strong>. Keduanya diberikan dua administrator.</p>}
      {writable && postedByViewer && <p className="kloan-decision-note" role="note">Anda yang memposting dokumen ini, jadi persetujuan dan penolakan dilakukan petugas lain.</p>}
      {writable && blockers.length > 0 && <ul className="kloan-decision-blockers" aria-label="Alasan keputusan tertahan">{blockers.map((b) => <li key={b}>{LOAN_DECISION_MESSAGES[b] ?? b}</li>)}</ul>}

      {writable && (can.post || can.approve || can.reject) && mode === 'idle' && (
        <div className="kloan-decision-actions">
          {can.post && <button type="button" className="deposit-approve" disabled={locked} onClick={() => setMode('post')}>Posting dokumen…</button>}
          {can.approve && <button type="button" className="deposit-approve kloan-approve" disabled={locked} onClick={() => setMode('approve')}>Setujui pinjaman…</button>}
          {can.reject && <button type="button" className="deposit-reject" disabled={locked} onClick={() => { setMode('reject'); setReason(''); }}>Tolak pengajuan…</button>}
        </div>
      )}

      {(mode === 'post' || mode === 'approve') && (
        <div className="kloan-decision-confirm" role="group" aria-label={mode === 'post' ? `Konfirmasi posting ${docNo}` : `Konfirmasi persetujuan ${docNo}`}>
          <dl className="kloan-decision-summary">
            <div><dt>Anggota</dt><dd>{summary.member} · NIK {summary.nik}</dd></div>
            <div><dt>Produk</dt><dd>{summary.product}</dd></div>
            <div><dt>Pokok pinjaman</dt><dd>{summary.principal}</dd></div>
            <div><dt>Angsuran / tenor</dt><dd>{summary.installment} · {summary.tenor}</dd></div>
          </dl>
          {mode === 'post'
            ? <p>Posting menandai berkas sudah diperiksa. Dokumen lalu menunggu persetujuan petugas lain.</p>
            : <p>Setelah disetujui dokumen tidak dapat diputuskan ulang. <strong>Pencairan tetap langkah terpisah.</strong>{summary.rollovers > 0 ? ` Pinjaman lama yang di-roll over (${summary.rollovers}) dilunasi saat pencairan, bukan saat persetujuan.` : ''}{summary.mobile ? ' Status pengajuan mobile anggota ikut diperbarui.' : ''}</p>}
          <div className="kloan-decision-actions">
            <button type="button" className="deposit-approve" disabled={locked} onClick={() => void send(mode)}>{mode === 'post' ? 'Ya, posting' : 'Ya, setujui'}</button>
            <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
          </div>
        </div>
      )}

      {mode === 'reject' && (
        <form className="kloan-decision-confirm" aria-label={`Tolak ${docNo}`} onSubmit={(e) => { e.preventDefault(); void send('reject'); }}>
          <label htmlFor="loan-reject-reason"><span>Alasan penolakan <b aria-hidden="true">*</b></span>
            <textarea id="loan-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required rows={3} autoFocus
              placeholder="Wajib, 5–200 karakter. Tersimpan di dokumen dan terlihat oleh anggota pada pengajuan mobile." />
          </label>
          <small className="kloan-sub">{reason.trim().length}/200</small>
          <div className="kloan-decision-actions">
            <button type="submit" className="deposit-reject" disabled={locked || reason.trim().length < 5}>Tolak pengajuan</button>
            <button type="button" className="mform-link" disabled={busy} onClick={() => setMode('idle')}>Batal</button>
          </div>
        </form>
      )}

      {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  );
}

/** Read-only record of a decided document: who posted / approved / rejected it natively or in the stamp columns, and the rejection reason. */
export function LoanDecisionRecord({ stamps }: { stamps: { postedAt: string | null; postedBy: string | null; approvedAt: string | null; approvedBy: string | null; rejectedAt: string | null; rejectedBy: string | null; rejectReason: string | null } }) {
  const [message] = useFlash('status');
  const rows = [
    stamps.postedBy || stamps.postedAt ? { label: 'Diposting', value: [stamps.postedBy, stamps.postedAt].filter(Boolean).join(' · ') } : null,
    stamps.approvedBy || stamps.approvedAt ? { label: 'Disetujui', value: [stamps.approvedBy, stamps.approvedAt].filter(Boolean).join(' · ') } : null,
    stamps.rejectedBy || stamps.rejectedAt ? { label: 'Ditolak', value: [stamps.rejectedBy, stamps.rejectedAt].filter(Boolean).join(' · ') } : null,
    stamps.rejectReason ? { label: 'Alasan penolakan', value: stamps.rejectReason } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);
  if (!rows.length && !message) return null;
  return (
    <section className="kloan-decision" aria-labelledby="sec-keputusan">
      <header className="kloan-section-head"><h2 id="sec-keputusan">Keputusan pinjaman</h2></header>
      {message && <p className="console-message" role="status">{message.text}</p>}
      {rows.length > 0 && <dl className="kloan-decision-summary">{rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>}
    </section>
  );
}
