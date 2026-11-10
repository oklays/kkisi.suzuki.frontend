'use client';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SubmissionNotice } from '@/components/feedback/SubmissionNotice';
import { postJson } from '@/lib/api/client';
import { parseWholeRupiah, rupiahSen } from '@/lib/utils/money';
import { validateDeductionChange, type DeductionOption } from '../services/deduction-change';

const makeIdempotencyKey = (type: string, requestedRp: number) =>
  `ded-${type.replace(/[^A-Za-z0-9]/g, '')}-${requestedRp}-${crypto.randomUUID().slice(0, 12)}`;

export function DeductionChangeForm({ section, options, effective, enabled = false }: { section: string; options: DeductionOption[]; effective: string; enabled?: boolean }) {
  const [type, setType] = useState(options[0]?.type ?? '');
  const [amount, setAmount] = useState('');
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recordedDocNo, setRecordedDocNo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const option = options.find((o) => o.type === type);
  const amountError = touched ? validateDeductionChange(option, amount) : null;
  const consentError = touched && !consent ? 'Setujui pemotongan payroll dan surat pernyataan untuk melanjutkan.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateDeductionChange(option, amount)) { document.getElementById('new-deduction')?.focus(); return; }
    if (!consent) { document.getElementById('payroll-consent')?.focus(); return; }
    setRecordedDocNo(null);
    setSubmitError(null);
    if (!enabled) { setNotice(true); return; }
    setSubmitting(true);
    const requestedRp = parseWholeRupiah(amount) ?? 0;
    const idempotencyKey = makeIdempotencyKey(type, requestedRp);
    const r = await postJson<{ ok: boolean; docNo: string }>('/api/transaksi/ajukan', {
      kind: 'deduction_change',
      idempotencyKey,
      savingsType: type,
      requestedRp,
      consent: true,
    });
    setSubmitting(false);
    if (r.ok) setRecordedDocNo(r.data.docNo);
    else setSubmitError('Pengajuan belum dapat disimpan saat ini. Silakan coba lagi atau hubungi pengurus koperasi.');
    setNotice(true);
  };

  return (
    <>
      <div className="form-intro light"><span className="form-step">PERUBAHAN POTONGAN</span><h2>Atur potongan simpanan</h2><p>Periksa data dan nominal sebelum melanjutkan.</p></div>
      <form id="deduction-form" noValidate onSubmit={submit}>
        <section className="form-card" aria-labelledby="member-data-title">
          <h3 className="card-heading" id="member-data-title">Data pengajuan</h3>
          <label className="field" htmlFor="member-section"><span>Bagian</span><input id="member-section" value={section} readOnly /></label>
          <label className="field" htmlFor="savings-type"><span>Jenis Simpanan</span>
            <select id="savings-type" value={type} onChange={(e) => setType(e.target.value)}>{options.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}</select>
          </label>
        </section>
        <section className="form-card amount-card" aria-labelledby="amount-data-title">
          <h3 className="card-heading" id="amount-data-title">Nominal potongan</h3>
          <label className="field" htmlFor="old-deduction"><span>Potongan Lama</span><input id="old-deduction" value={option ? rupiahSen(option.monthlySen) : '-'} readOnly /></label>
          <label className="field" htmlFor="new-deduction"><span>Potongan Baru</span>
            <input id="new-deduction" inputMode="numeric" autoComplete="off" placeholder="Contoh: 150.000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountError ? true : undefined} aria-describedby="amount-help amount-error" />
            <small id="amount-help">Untuk Simpanan Wajib, potongan baru harus lebih besar dari potongan lama.</small>
            <span id="amount-error" className="field-error">{amountError}</span>
          </label>
        </section>
        <div className="note"><Icon name="calendar" /><div><strong>Mulai potong bulan berikutnya ({effective}).</strong></div></div>
        <section className="signature-section" aria-labelledby="signature-title">
          <h3 id="signature-title">Tanda tangan</h3>
          <div className="signature-placeholder"><Icon name="pen" /><strong>Tanda tangan di dokumen koperasi</strong><small>Tanda tangan digital belum tersedia di aplikasi</small></div>
        </section>
        <div style={{ marginTop: 15 }}>
          <label className="consent" htmlFor="payroll-consent">
            <input id="payroll-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={consentError ? true : undefined} aria-describedby="consent-error" />
            <span>Saya menyetujui pemotongan payroll dan membaca surat pernyataan</span>
          </label>
          <p id="consent-error" className="field-error">{consentError}</p>
        </div>
      </form>
      <footer className="form-footer"><button type="submit" form="deduction-form" className="primary" disabled={submitting}>{submitting ? 'Memproses…' : <>Lanjut <Icon name="chevronRight" /></>}</button></footer>
      <SubmissionNotice open={notice} onClose={() => setNotice(false)} title="Ringkasan perubahan potongan" channel="Pengajuan perubahan potongan"
        recordedDocNo={recordedDocNo} errorMessage={submitError}
        rows={[['Jenis Simpanan', option?.label ?? '-'], ['Potongan Lama', option ? rupiahSen(option.monthlySen) : '-'], ['Potongan Baru', `Rp${(parseWholeRupiah(amount) ?? 0).toLocaleString('id-ID')}`], ['Mulai', effective]]} />
    </>
  );
}
