'use client';
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SubmissionNotice } from '@/components/feedback/SubmissionNotice';
import { postJson } from '@/lib/api/client';
import { parseWholeRupiah, rupiahSen } from '@/lib/utils/money';
import { simulateLoan, type LoanProduct } from '../services/loans';

const makeLoanIdempotencyKey = (productId: number, amountRp: number | null, months: string) =>
  `loan-${productId}-${amountRp ?? 0}-${months.trim()}-${crypto.randomUUID().slice(0, 12)}`;

/** Loan application form with a live, real simulation (domain loanSchedule + the master's own rate and limits). */
export function LoanApplicationForm({ products, enabled = false }: { products: LoanProduct[]; enabled?: boolean }) {
  const [productId, setProductId] = useState(products[0]?.id ?? 0);
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('');
  const [purpose, setPurpose] = useState('');
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recordedDocNo, setRecordedDocNo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId) ?? null;
  const result = useMemo(() => simulateLoan(products, { productId, amountRp: parseWholeRupiah(amount), months: /^\d{1,3}$/.test(months.trim()) ? Number(months) : null }), [products, productId, amount, months]);
  const err = (field: string) => (touched && !result.ok && result.field === field ? result.message : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!result.ok) { document.getElementById(result.field === 'months' ? 'loan-tenor' : result.field === 'amount' ? 'loan-amount' : 'loan-type')?.focus(); return; }
    if (!purpose.trim()) { document.getElementById('loan-purpose')?.focus(); return; }
    setRecordedDocNo(null);
    setSubmitError(null);
    if (!enabled) { setNotice(true); return; }
    setSubmitting(true);
    const idempotencyKey = makeLoanIdempotencyKey(productId, parseWholeRupiah(amount), months);
    const r = await postJson<{ ok: boolean; docNo: string }>('/api/transaksi/ajukan', {
      kind: 'loan_application',
      idempotencyKey,
      productId,
      amountRp: parseWholeRupiah(amount),
      months: Number(months.trim()),
      purpose: purpose.trim(),
    });
    setSubmitting(false);
    if (r.ok) setRecordedDocNo(r.data.docNo);
    else setSubmitError('Pengajuan belum dapat disimpan saat ini. Silakan coba lagi atau hubungi pengurus koperasi.');
    setNotice(true);
  };

  return (
    <>
      <form id="loan-form" noValidate onSubmit={submit}>
        <section className="form-intro" aria-labelledby="form-step-title">
          <span className="form-step">PENGAJUAN PINJAMAN</span>
          <h2 id="form-step-title">Data Pinjaman</h2>
          <p>Batas nominal, tenor dan jasa mengikuti master pinjaman koperasi.</p>
        </section>
        <div className="form-card">
          <label className="field" htmlFor="loan-type"><span>Jenis Pinjaman</span>
            <select id="loan-type" value={productId} onChange={(e) => setProductId(Number(e.target.value))} aria-describedby="type-help type-error">
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <small id="type-help">{product ? `Rp${(product.minSen / 100).toLocaleString('id-ID')} – Rp${(product.maxSen / 100).toLocaleString('id-ID')} · ${product.minMonths}–${product.maxMonths} bulan · jasa ${product.rateBp !== null ? `${(product.rateBp / 100).toLocaleString('id-ID')}%/bulan (${product.method})` : 'belum tercatat'}` : ''}</small>
            <span className="field-error" id="type-error">{err('product') || err('rate')}</span>
          </label>
          <label className="field" htmlFor="loan-amount"><span>Nominal</span>
            <input id="loan-amount" inputMode="numeric" autoComplete="off" placeholder="Contoh: 10.000.000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={err('amount') ? true : undefined} aria-describedby="amount-error" />
            <span className="field-error" id="amount-error">{err('amount')}</span>
          </label>
          <label className="field" htmlFor="loan-tenor"><span>Tenor (bulan)</span>
            <input id="loan-tenor" inputMode="numeric" autoComplete="off" placeholder={product ? `${product.minMonths}–${product.maxMonths}` : ''} value={months} onChange={(e) => setMonths(e.target.value)} aria-invalid={err('months') ? true : undefined} aria-describedby="tenor-error" />
            <span className="field-error" id="tenor-error">{err('months')}</span>
          </label>
          <label className="field" htmlFor="loan-purpose"><span>Keperluan</span>
            <input id="loan-purpose" maxLength={120} autoComplete="off" placeholder="Contoh: biaya pendidikan" value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-invalid={touched && !purpose.trim() ? true : undefined} aria-describedby="purpose-error" />
            <span className="field-error" id="purpose-error">{touched && !purpose.trim() ? 'Isi keperluan pinjaman.' : ''}</span>
          </label>
        </div>
        <section className={`simulation-card${result.ok ? '' : ' pending'}`} aria-labelledby="quote-title" aria-live="polite" style={{ marginTop: 14 }}>
          <div className="quote-top"><span className="type-icon blue"><Icon name="calculator" /></span><div><h2 id="quote-title">Hasil Simulasi</h2><p>{result.ok ? `Tenor ${months} bulan · ${result.method}` : 'Isi nominal dan tenor untuk menghitung'}</p></div></div>
          {result.ok ? <strong>{rupiahSen(result.firstInstallmentSen)}<span style={{ fontSize: 13, fontWeight: 500 }}> /bulan</span></strong> : null}
          <p className="quote-note">{result.ok ? `Pokok ${rupiahSen(result.principalSen)} + jasa ${rupiahSen(result.interestSen)} pada angsuran pertama; total ${rupiahSen(result.totalSen)}. Simulasi, bukan penawaran: keputusan dan angka akhir dari koperasi.` : 'Perhitungan memakai jasa dan metode dari master pinjaman koperasi.'}</p>
        </section>
      </form>
      <footer className="form-footer">
        <Link className="secondary" href="/pinjaman">Kembali</Link>
        <button type="submit" form="loan-form" className="primary" disabled={submitting}>{submitting ? 'Memproses…' : 'Lanjut'}</button>
      </footer>
      <SubmissionNotice open={notice} onClose={() => setNotice(false)} title="Ringkasan pengajuan" channel="Pengajuan pinjaman"
        recordedDocNo={recordedDocNo} errorMessage={submitError}
        rows={[['Jenis Pinjaman', product?.label ?? '-'], ['Nominal', amount ? `Rp${(parseWholeRupiah(amount) ?? 0).toLocaleString('id-ID')}` : '-'], ['Tenor', `${months} bulan`], ['Keperluan', purpose.trim() || '-'],
          ['Simulasi angsuran', result.ok ? rupiahSen(result.firstInstallmentSen) : '-']]} />
    </>
  );
}
