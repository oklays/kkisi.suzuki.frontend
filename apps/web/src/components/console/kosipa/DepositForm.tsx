'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Info, Search, UserRound } from 'lucide-react';
import { CurrencyInput } from '../../money/CurrencyInput';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { DEPOSIT_MESSAGES, DEPOSIT_RETRY_SAME_KEY, postJson, rupiah } from './deposit-ui';

type Member = { id: number; nik: string; name: string; group: string | null; status: string | null; balance: string };

/**
 * New voluntary-savings deposit (FA-03C T07) in the console form standard (mform: groups + summary rail). The member is resolved on the server by NIK
 * (POST, so the NIK never lands in a URL); the deposit is saved as POSTING and must be approved by ANOTHER officer (FD-35). One idempotency key per attempt.
 */
export function DepositForm({ csrfToken, today, monthStart, canSubmit }: { csrfToken: string; today: string; monthStart: string; canSubmit: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const locked = !hydrated || !canSubmit;
  const [nik, setNik] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [lookup, setLookup] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [docDate, setDocDate] = useState(today);
  const [paymentType, setPaymentType] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useFlash('form');
  const attempt = useRef<{ form: string; key: string } | null>(null);

  async function findMember() {
    setLookup({ busy: true, error: null }); setMember(null); setMessage(null);
    const r = await postJson('/api/kosipa/savings/deposits/member', csrfToken, { nik });
    setLookup({ busy: false, error: r.ok ? null : DEPOSIT_MESSAGES[r.code] ?? 'Anggota tidak dapat dicari saat ini.' });
    if (r.ok) setMember(r.data as Member);
  }

  async function submit() {
    if (!member) return;
    setBusy(true); setMessage(null);
    const body = { memberId: String(member.id), docDate, paymentType, amount, bankName: paymentType === 'TRANSFER' ? bankName : '', bankAccount: paymentType === 'TRANSFER' ? bankAccount : '', remarks };
    const form = JSON.stringify(body);
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    const r = await postJson('/api/kosipa/savings/deposits', csrfToken, { ...body, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (!DEPOSIT_RETRY_SAME_KEY.has(r.code)) attempt.current = null;
    if (r.ok) {
      const docNo = (r.data as { docNo?: string })?.docNo ?? '';
      const text = `Setoran ${docNo} disimpan dan menunggu persetujuan petugas lain.`;
      setMessage({ kind: 'ok', text });
      setAmount(''); setRemarks(''); setBankName(''); setBankAccount(''); setPaymentType('CASH'); setMember(null); setNik('');
      router.refresh();
    } else setMessage({ kind: 'error', text: DEPOSIT_MESSAGES[r.code] ?? 'Setoran tidak dapat disimpan.' });
  }

  const ready = !!member && !!amount && !!docDate;
  return (
    <form className="mform" aria-label="Buat setoran simpanan" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="mform-main">
        <section className="mform-group" role="group" aria-labelledby="dep-member">
          <header><h2 id="dep-member">Anggota</h2></header>
          <div className="deposit-lookup">
            <label htmlFor="dep-nik"><span>NIK anggota <b aria-hidden="true">*</b></span>
              <input id="dep-nik" value={nik} onChange={(e) => { setNik(e.target.value); setMember(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (nik.trim()) void findMember(); } }}
                maxLength={20} autoComplete="off" disabled={locked} placeholder="Ketik NIK lalu Cari" />
            </label>
            <button type="button" className="mform-link deposit-find" disabled={locked || lookup.busy || !nik.trim()} onClick={() => void findMember()}><Search size={15} aria-hidden="true" />Cari</button>
          </div>
          {lookup.error && <p className="console-message console-message-error" role="alert">{lookup.error}</p>}
          {member && (
            <div className="deposit-member" role="status" aria-live="polite">
              <UserRound size={18} aria-hidden="true" />
              <div><strong>{member.name || 'Tanpa nama'}</strong><span>NIK {member.nik} · {member.group ?? 'Grup tidak tercatat'} · {member.status ?? 'Status tidak tercatat'}</span></div>
              <dl><dt>Saldo sukarela (disetujui)</dt><dd>{rupiah(member.balance)}</dd></dl>
            </div>
          )}
        </section>
        <section className="mform-group" role="group" aria-labelledby="dep-detail">
          <header><h2 id="dep-detail">Setoran</h2></header>
          <div className="mform-grid">
            <label htmlFor="dep-date"><span>Tanggal setoran <b aria-hidden="true">*</b></span>
              <input id="dep-date" type="date" value={docDate} min={monthStart} max={today} required disabled={locked} onChange={(e) => setDocDate(e.target.value)} />
              <small>Hanya bulan berjalan, tidak melewati hari ini.</small>
            </label>
            <label htmlFor="dep-method"><span>Metode <b aria-hidden="true">*</b></span>
              <select id="dep-method" value={paymentType} disabled={locked} onChange={(e) => setPaymentType(e.target.value as 'CASH' | 'TRANSFER')}><option value="CASH">Tunai (CASH)</option><option value="TRANSFER">Transfer</option></select>
            </label>
            <label htmlFor="dep-amount"><span>Nominal <b aria-hidden="true">*</b></span>
              <CurrencyInput id="dep-amount" value={amount} onValueChange={setAmount} required disabled={locked} maxIntegerDigits={13} aria-describedby="dep-amount-hint" />
              <small id="dep-amount-hint">Simpanan sukarela; maksimal 2 digit desimal.</small>
            </label>
            {paymentType === 'TRANSFER' && <>
              <label htmlFor="dep-bank"><span>Bank pengirim</span><input id="dep-bank" value={bankName} maxLength={50} disabled={locked} onChange={(e) => setBankName(e.target.value)} autoComplete="off" /></label>
              <label htmlFor="dep-account"><span>No. rekening pengirim</span><input id="dep-account" value={bankAccount} maxLength={50} disabled={locked} onChange={(e) => setBankAccount(e.target.value)} autoComplete="off" /></label>
            </>}
            <label htmlFor="dep-remarks" className="mform-wide"><span>Keterangan</span><input id="dep-remarks" value={remarks} maxLength={50} disabled={locked} onChange={(e) => setRemarks(e.target.value)} autoComplete="off" /></label>
          </div>
        </section>
      </div>
      <aside className="mform-rail" aria-label="Ringkasan setoran">
        <h2>Ringkasan</h2>
        <dl className="deposit-summary">
          <div><dt>Anggota</dt><dd>{member?.name ?? '—'}</dd></div>
          <div><dt>Nominal</dt><dd>{amount ? rupiah(amount) : '—'}</dd></div>
          <div><dt>Status setelah disimpan</dt><dd>Menunggu persetujuan</dd></div>
        </dl>
        <p className="mform-auto"><Info size={14} aria-hidden="true" />Nomor dokumen (TFCSH) dibuat otomatis. Saldo bertambah setelah setoran disetujui oleh petugas LAIN.</p>
        {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <div className="mform-submit"><button type="submit" disabled={busy || locked || !ready}>Simpan setoran</button></div>
      </aside>
    </form>
  );
}
