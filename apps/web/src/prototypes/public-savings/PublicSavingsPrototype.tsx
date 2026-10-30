'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ShieldCheck } from 'lucide-react';
import { formatExactRupiah } from '../../components/console/kosipa/presentation.ts';
import { createMockService, fixture, provisionalRules, validatePrototypeDraft } from './fixture.ts';
import { SignatureField } from './SignatureField.tsx';
import type { DraftErrors, MockSavingsService, PrototypeScenario, SignaturePoint } from './types.ts';
import { CurrencyInput } from '../../components/money/CurrencyInput.tsx';

const terminalCopy = {
  invalid: ['Tautan tidak ditemukan', 'Minta tautan baru melalui petugas koperasi. Ini contoh tampilan untuk tautan yang tidak valid.'],
  expired: ['Masa berlaku tautan berakhir', 'Hubungi petugas koperasi untuk mendapatkan tautan baru.'],
  revoked: ['Tautan sudah dinonaktifkan', 'Tautan ini tidak dapat digunakan lagi. Hubungi petugas koperasi jika masih membutuhkan bantuan.'],
  consumed: ['Pengajuan sudah tercatat dalam simulasi', 'Tautan contoh ini telah digunakan. Tidak ada pengajuan tambahan yang dibuat.'],
  unavailable: ['Halaman belum dapat dimuat', 'Data contoh belum tersedia. Coba lagi atau hubungi petugas koperasi.'],
} as const;

export function PublicSavingsPrototype({ scenario = 'verification', service }: {scenario?: PrototypeScenario; service?: MockSavingsService}) {
  const [mock] = useState(() => service ?? createMockService({failFirstSubmit:scenario==='submit-error'}));
  const [state, setState] = useState<PrototypeScenario>(scenario==='submit-error'?'ready':scenario);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [amount, setAmount] = useState('');
  const [signatureStrokes, setSignatureStrokes] = useState<SignaturePoint[][]>([]);
  const signature = signatureStrokes.length>0;
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const outcome = useRef<HTMLHeadingElement>(null);
  useEffect(() => {if (Object.keys(errors).length) summary.current?.focus();}, [errors]);
  useEffect(() => {if (review || state==='success') outcome.current?.focus();}, [review,state]);
  const formattedAmount = /^(0|[1-9][0-9]{0,15})$/.test(amount) ? formatExactRupiah(amount) : 'Belum diisi';

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setCodeError('');
    try {if (await mock.verify(code)) setState('ready'); else setCodeError('Kode contoh belum cocok. Gunakan 123456 untuk simulasi.');}
    catch {setCodeError('Verifikasi simulasi belum berhasil. Coba lagi.');}
    finally {setBusy(false);}
  }
  function validate(event: FormEvent) {
    event.preventDefault();
    const next=validatePrototypeDraft({amountRupiah:amount,hasSignature:signature,consent},provisionalRules);
    setErrors(next);
    if (!Object.keys(next).length) {setReview(true);setSubmitError(false);}
  }
  async function simulateSubmit() {
    if (busy) return;
    setBusy(true);setSubmitError(false);
    try {await mock.submit({amountRupiah:amount,hasSignature:signature,consent});setState('success');}
    catch {setSubmitError(true);}
    finally {setBusy(false);}
  }

  const step=state==='verification'?0:state==='success'||review?2:1;
  return <div className="ps-prototype">
    <div className="ps-demo-banner"><strong>SIMULASI · DATA CONTOH</strong><span>Tidak mengirim pengajuan atau kode OTP. Aturan bisnis belum disahkan.</span></div>
    <header className="ps-header"><div className="ps-brand"><span className="ps-brand-mark" aria-hidden="true">K</span><div><strong>KKISI</strong><span>Koperasi Karyawan Suzuki</span></div></div><span className="ps-private"><ShieldCheck size={16} aria-hidden="true" /> Pratinjau lokal</span></header>
    <main className="ps-main">
      <div className="ps-heading"><span className="ps-eyebrow">SIMPANAN ANGGOTA</span><h1>{state in terminalCopy ? terminalCopy[state as keyof typeof terminalCopy][0] : state==='success'?'Simulasi pengajuan selesai':'Pengajuan simpanan sukarela'}</h1><p>Periksa nominal dan periode permohonan sebelum menyatakan persetujuan.</p></div>
      <ol className="ps-steps" aria-label="Tahapan pengajuan">{['Verifikasi','Isi pengajuan','Tinjau & setujui'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} data-active={step===i} data-complete={step>i}><span aria-hidden="true">{step>i?<Check size={14}/>:i+1}</span>{label}</li>)}</ol>

      {state==='loading' ? <section className="ps-card ps-terminal" role="status" aria-busy="true"><div className="ps-skeleton"/><h2>Memuat contoh pengajuan…</h2><p>Menyiapkan tampilan formulir simulasi.</p></section>
      : state in terminalCopy ? <section className="ps-card ps-terminal" role={state==='unavailable'?'alert':'status'}><ShieldCheck size={38} aria-hidden="true"/><h2>{terminalCopy[state as keyof typeof terminalCopy][0]}</h2><p>{terminalCopy[state as keyof typeof terminalCopy][1]}</p>{state==='consumed'&&<p className="ps-reference">Referensi contoh <strong>DEMO-SS-0042</strong></p>}{state==='unavailable'&&<button type="button" className="ps-primary" onClick={()=>setState('verification')}>Coba lagi</button>}</section>
      : state==='success' ? <section className="ps-card ps-terminal ps-success" role="status"><CheckCircle2 size={46} aria-hidden="true"/><h2 tabIndex={-1} ref={outcome}>Pengajuan contoh berhasil ditinjau</h2><p>Ini hasil simulasi. Tidak ada potongan payroll, perubahan saldo, atau pengajuan nyata.</p><p className="ps-reference">Referensi contoh <strong>DEMO-SS-0042</strong></p><div className="ps-info">Dalam layanan yang akan datang, pengajuan tetap memerlukan proses petugas koperasi. Tampilan berhasil bukan persetujuan payroll.</div></section>
      : state==='verification' ? <section className="ps-card ps-verify"><ShieldCheck size={32} aria-hidden="true"/><h2>Verifikasi akses contoh</h2><p>Pada layanan yang akan datang, verifikasi menggunakan kontak anggota yang telah dikonfirmasi petugas.</p><form onSubmit={verify} noValidate><label htmlFor="ps-code">Kode verifikasi simulasi</label><input id="ps-code" inputMode="numeric" autoComplete="off" value={code} maxLength={6} aria-invalid={Boolean(codeError)} aria-describedby={`ps-code-help${codeError?' ps-code-error':''}`} onChange={e=>setCode(e.target.value)} disabled={busy}/><p className="ps-help" id="ps-code-help">Kode contoh: <strong>123456</strong>. Tidak ada OTP yang dikirim.</p>{codeError&&<p role="alert" className="ps-field-error" id="ps-code-error">{codeError}</p>}<button type="submit" className="ps-primary" disabled={busy}>{busy?'Memeriksa contoh…':'Verifikasi simulasi'}<ArrowRight size={16} aria-hidden="true"/></button></form></section>
      : <div className="ps-grid"><div className="ps-form-column">
        <section className="ps-card ps-member" aria-labelledby="ps-member-title"><div className="ps-section-heading"><span className="ps-number" aria-hidden="true">01</span><h2 id="ps-member-title">Data anggota contoh</h2><span className="ps-chip">Hanya baca</span></div><dl><div><dt>Nama anggota</dt><dd>{fixture.name}</dd></div><div><dt>NIK tersamarkan</dt><dd>{fixture.identifier}</dd></div><div><dt>Bagian</dt><dd>{fixture.section}</dd></div><div><dt>Jenis simpanan</dt><dd>Simpanan Sukarela</dd></div></dl></section>
        {review && <section className="ps-card ps-review"><div className="ps-section-heading"><span className="ps-number" aria-hidden="true">02</span><h2 tabIndex={-1} ref={outcome}>Tinjau persetujuan contoh</h2></div><p>Pastikan contoh nominal, periode, dan tanda tangan sesuai dengan isian Anda.</p><dl><div><dt>Nominal potongan baru</dt><dd>{formattedAmount}</dd></div><div><dt>Periode permohonan</dt><dd>{fixture.requestedPeriod}</dd></div><div><dt>Tanda tangan</dt><dd>Contoh tersedia</dd></div><div><dt>Persetujuan</dt><dd>Dicentang untuk simulasi</dd></div></dl><svg className="ps-signature-preview" role="img" aria-label="Tanda tangan simulasi yang ditinjau" viewBox="0 0 600 180">{signatureStrokes.map((stroke,index)=><polyline key={index} points={stroke.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="#003399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}</svg><div className="ps-info">Tanggal efektif payroll dan aturan pengajuan menunggu keputusan pemilik proses. Contoh ini tidak menjadi bukti otorisasi.</div>{submitError&&<div className="ps-error" role="alert"><strong>Simulasi pengiriman belum berhasil.</strong><p>Isian Anda tetap tersedia. Coba lagi tanpa mengisi ulang formulir.</p></div>}<div className="ps-review-actions"><button type="button" className="ps-secondary" disabled={busy} onClick={()=>{setReview(false);setSubmitError(false);}}><ArrowLeft size={16} aria-hidden="true"/>Ubah isian</button><button type="button" className="ps-primary" disabled={busy} onClick={simulateSubmit}>{busy?'Memproses simulasi…':submitError?'Coba kirim simulasi lagi':'Kirim simulasi'}<ArrowRight size={16} aria-hidden="true"/></button></div></section>}
        <form className="ps-card ps-form" onSubmit={validate} noValidate hidden={review}><div className="ps-section-heading"><span className="ps-number" aria-hidden="true">02</span><h2>Rencana potongan</h2></div>
          {Object.keys(errors).length>0&&<div className="ps-error" role="alert" tabIndex={-1} ref={summary}><strong>Periksa isian berikut</strong><ul>{Object.values(errors).map(message=><li key={message}>{message}</li>)}</ul></div>}
          <div><label htmlFor="ps-amount">Nominal potongan baru <span aria-hidden="true">*</span></label><CurrencyInput id="ps-amount" allowDecimals={false} maxIntegerDigits={16} value={amount} onValueChange={setAmount} placeholder="Contoh: 150.000" aria-required="true" aria-invalid={Boolean(errors.amountRupiah)} aria-describedby={`ps-amount-help${errors.amountRupiah?' ps-amount-error':''}`}/><p className="ps-help" id="ps-amount-help">Angka rupiah bulat, titik ribuan ditambahkan otomatis. Nilai contoh: {formattedAmount}.</p>{errors.amountRupiah&&<p id="ps-amount-error" className="ps-field-error">{errors.amountRupiah}</p>}</div>
          <div className="ps-policy"><strong>Belum disahkan · aturan contoh</strong><p>Minimum Rp1 untuk mencoba formulir; maksimum bisnis belum ditetapkan. Nilai ini bukan ketentuan koperasi.</p></div>
          <SignatureField value={signatureStrokes} onChange={setSignatureStrokes} error={errors.signature}/>
          <div className="ps-consent"><input id="ps-consent" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} aria-required="true" aria-invalid={Boolean(errors.consent)} aria-describedby={`ps-consent-help${errors.consent?' ps-consent-error':''}`}/><label htmlFor="ps-consent">Saya telah memeriksa contoh nominal dan periode, serta menyetujui simulasi pengajuan ini.</label></div><p className="ps-help" id="ps-consent-help">Contoh redaksi persetujuan; belum disahkan sebagai surat kuasa payroll.</p>{errors.consent&&<p id="ps-consent-error" className="ps-field-error">{errors.consent}</p>}<button type="submit" className="ps-primary ps-full">Tinjau pengajuan<ArrowRight size={16} aria-hidden="true"/></button>
        </form>
      </div><aside className="ps-summary ps-card" aria-labelledby="ps-summary-title"><span className="ps-eyebrow">RINGKASAN PERMOHONAN</span><h2 id="ps-summary-title">Potongan sukarela</h2><div className="ps-old"><span>Potongan sebelumnya · contoh</span><strong>{formatExactRupiah(fixture.previousRupiah)}</strong></div><div className="ps-new"><span>Potongan baru · contoh</span><strong>{formattedAmount}</strong><small>per bulan yang dimohonkan</small></div><dl><div><dt>Periode permohonan</dt><dd>{fixture.requestedPeriod}</dd></div></dl><p className="ps-summary-note"><ShieldCheck size={17} aria-hidden="true"/>Periode ini adalah contoh permohonan, bukan tanggal efektif payroll.</p><p className="ps-help">Perubahan belum berlaku sampai proses koperasi selesai. Seluruh data pada halaman ini adalah fixture simulasi.</p></aside></div>}
      <footer className="ps-footer">Koperasi Karyawan Suzuki <span aria-hidden="true">·</span> Prototipe lokal dengan data sintetis</footer>
    </main>
  </div>;
}
