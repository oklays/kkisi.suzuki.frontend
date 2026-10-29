'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { consumeFragmentToken, downloadPdf, freezeSubmission, requestJson, rupiah, SavingsApiError, submissionBody, validateDraft } from './client';
import type { SavingsForm, SubmissionSnapshot } from './client';
import { SignaturePad } from './SignaturePad';
import { CurrencyInput } from '../money/CurrencyInput.tsx';
import { formatRupiahTerbilang } from '../money/format';

const base='/api/public/simpanan-sukarela';
type State='LOADING'|'VERIFICATION_REQUIRED'|'READY'|'CONSUMED'|'EXPIRED'|'REVOKED'|'INVALID'|'UNAVAILABLE'|'SUBMITTED';
interface Validation { state: State; form?: SavingsForm; reference?: string; canVerifyReceipt?: boolean }
interface Receipt { reference: string; artifactState: 'PENDING'|'READY'; pdfAvailable?: boolean }
const terminal: Partial<Record<State,[string,string]>>={
  INVALID:['Tautan tidak valid','Buka tautan lengkap yang dikirim oleh petugas koperasi. Jika masih bermasalah, minta tautan baru.'],
  EXPIRED:['Masa berlaku tautan berakhir','Hubungi petugas koperasi untuk mendapatkan tautan baru.'],
  REVOKED:['Tautan telah dinonaktifkan','Hubungi petugas koperasi jika Anda masih membutuhkan bantuan.'],
  UNAVAILABLE:['Halaman belum dapat dimuat','Coba lagi beberapa saat lagi atau hubungi petugas koperasi.'],
};
export default function PublicSavings() {
  const token=useRef<string | null>(null), proof=useRef(''), snapshot=useRef<SubmissionSnapshot | null>(null);
  const canvas=useRef<HTMLCanvasElement>(null), errorRef=useRef<HTMLDivElement>(null), heading=useRef<HTMLHeadingElement>(null);
  const [state,setState]=useState<State>('LOADING'),[form,setForm]=useState<SavingsForm | null>(null);
  const [busy,setBusy]=useState(false),[errors,setErrors]=useState<string[]>([]),[code,setCode]=useState(''),[challenge,setChallenge]=useState('');
  const [amount,setAmount]=useState(''),[signature,setSignature]=useState(false),[consent,setConsent]=useState(false),[review,setReview]=useState(false);
  const [frozen,setFrozen]=useState(false),[receipt,setReceipt]=useState<Receipt | null>(null),[canVerifyReceipt,setCanVerifyReceipt]=useState(false);
  const [retryUntil,setRetryUntil]=useState(0),[seconds,setSeconds]=useState(0);
  const headers=(): Record<string,string>=>({Authorization:`Bearer ${token.current ?? ''}`,...(proof.current?{'X-Public-Proof':proof.current}:{})});
  function handleError(error: unknown) {
    const api=error instanceof SavingsApiError?error:null;
    if(api?.retryAfterSeconds){setRetryUntil(Date.now()+api.retryAfterSeconds*1000);setSeconds(api.retryAfterSeconds);}
    if(api?.code==='FORM_CHANGED'){snapshot.current=null;setFrozen(false);setReview(false);setConsent(false);setSignature(false);setForm(null);setState('LOADING');void validate().catch(()=>setState('UNAVAILABLE'));}
    else if(api && /REVOKED/.test(api.code)) {setState('REVOKED');setForm(null);}
    else if(api && /^(EXPIRED|TOKEN_EXPIRED|LINK_EXPIRED)$/.test(api.code)) {setState('EXPIRED');setForm(null);}
    else if(api && /^(INVALID|INVALID_TOKEN|TOKEN_INVALID|LINK_INVALID)$/.test(api.code)) {setState('INVALID');setForm(null);}
    else if(api && /PROOF|VERIFICATION_REQUIRED|VERIFICATION_EXPIRED/.test(api.code)) {proof.current='';setChallenge('');setCode('');setState('VERIFICATION_REQUIRED');}
    setErrors([api?.message ?? 'Koneksi terputus. Coba lagi. Isian tetap tersedia selama halaman ini terbuka.']);
  }
  async function validate() {
    const data=await requestJson<Validation>(`${base}/validate`,{method:'POST',headers:headers()});
    if(data.state==='READY' && !data.form) throw new SavingsApiError('UNAVAILABLE',503);
    setState(data.state); if(data.form) setForm(data.form); setCanVerifyReceipt(Boolean(data.canVerifyReceipt));
    if(data.state==='CONSUMED' && proof.current) await refreshReceipt();
  }
  async function run(action:()=>Promise<void>) { if(busy) return; setBusy(true);setErrors([]);try{await action();}catch(error){handleError(error);}finally{setBusy(false);} }
  async function refreshReceipt() { setReceipt(await requestJson<Receipt>(`${base}/receipt`,{method:'POST',headers:headers()})); }
  useEffect(()=>{
    if(token.current!==null) return;
    token.current=consumeFragmentToken(window.location,window.history);
    if(!token.current){Promise.resolve().then(()=>setState('INVALID'));return;}
    void validate().catch(error=>{setState('UNAVAILABLE');handleError(error);});
    // Credentials are consumed once, and never written to persistent browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(errors.length)errorRef.current?.focus();},[errors]);
  // Opening a different private link in the same tab must discard every credential/draft from the previous member.
  useEffect(()=>{const changed=()=>{if(window.location.hash)window.location.reload();};window.addEventListener('hashchange',changed);return ()=>window.removeEventListener('hashchange',changed);},[]);
  useEffect(()=>{if(review || state==='SUBMITTED' || state==='CONSUMED')heading.current?.focus();},[review,state]);
  useEffect(()=>{
    if(state!=='READY' || !snapshot.current || !canvas.current) return;
    const element=canvas.current;
    void createImageBitmap(snapshot.current.signature).then(image=>{element.getContext('2d')?.drawImage(image,0,0);image.close();}).catch(()=>{});
  },[state]);
  useEffect(()=>{
    if(!retryUntil) return;
    const timer=setInterval(()=>setSeconds(Math.max(0,Math.ceil((retryUntil-Date.now())/1000))),1000);
    return ()=>clearInterval(timer);
  },[retryUntil]);
  async function sendCode() { await run(async()=>{const data=await requestJson<{challengeRef:string;retryAfterSeconds:number}>(`${base}/verification-challenges`,{method:'POST',headers:headers()});setChallenge(data.challengeRef);setCode('');setRetryUntil(Date.now()+data.retryAfterSeconds*1000);setSeconds(data.retryAfterSeconds);}); }
  async function verify(event:FormEvent) {
    event.preventDefault(); if(!/^\d{6}$/.test(code)){setErrors(['Isi kode verifikasi 6 digit.']);return;}
    await run(async()=>{const data=await requestJson<{proof:string}>(`${base}/verification-challenges/verify`,{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({challengeRef:challenge,code})});proof.current=data.proof;setCode('');await validate();});
  }
  async function reviewDraft(event:FormEvent) {
    event.preventDefault(); if(!form || busy) return;
    const next=validateDraft(amount,signature,consent,form);setErrors(next);if(next.length)return;
    setReview(true);
  }
  async function submit() {
    if(!form) return;
    await run(async()=>{
      if(!snapshot.current){
        const element=canvas.current;
        if(!element) throw new SavingsApiError('SIGNATURE_INVALID',422);
        const blob=await new Promise<Blob|null>(resolve=>element.toBlob(resolve,'image/png'));
        if(!blob) throw new SavingsApiError('SIGNATURE_INVALID',422);
        snapshot.current=freezeSubmission(amount,form,blob,crypto.randomUUID());setFrozen(true);
      }
      try {
        const data=await requestJson<Receipt>(`${base}/submissions`,{method:'POST',headers:{...headers(),'Idempotency-Key':snapshot.current.idempotencyKey},body:submissionBody(snapshot.current)});
        setReceipt(data);setState('SUBMITTED');
      } catch(error) {
        if(error instanceof SavingsApiError && [400,422].includes(error.status)){snapshot.current=null;setFrozen(false);}
        throw error;
      }
    });
  }
  const step=state==='READY'?(review?2:1):state==='SUBMITTED'||state==='CONSUMED'?2:0;
  const period=form?new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(form.requestedPeriod.year,form.requestedPeriod.month-1,1))):'';
  const receiptMode=state==='SUBMITTED'||state==='CONSUMED';
  return <div className="pss-page">
    <header className="pss-header"><div className="pss-brand"><span aria-hidden="true">K</span><div><strong>KKISI</strong><small>Koperasi Karyawan Suzuki</small></div></div><span className="pss-private">Layanan anggota</span></header>
    <main className="pss-main"><div className="pss-heading"><span className="pss-eyebrow">SIMPANAN ANGGOTA</span><h1>Pengajuan simpanan sukarela</h1><p>Periksa nominal dan periode permohonan sebelum menyatakan persetujuan.</p></div>
      <ol className="pss-steps" aria-label="Tahapan pengajuan">{['Verifikasi','Isi pengajuan','Tinjau & kirim'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined} data-active={step===index}><span>{index+1}</span>{label}</li>)}</ol>
      {errors.length>0&&<div className="pss-error" ref={errorRef} tabIndex={-1} role="alert"><strong>Periksa permintaan Anda</strong><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div>}
      {state==='LOADING'?<section className="pss-card pss-centered" role="status" aria-busy="true"><h2>Memeriksa tautan…</h2></section>
      :terminal[state]?<section className="pss-card pss-centered"><h2>{terminal[state]?.[0]}</h2><p>{terminal[state]?.[1]}</p>{state==='UNAVAILABLE'&&<button disabled={busy} onClick={()=>run(validate)}>Coba lagi</button>}</section>
      :receiptMode?<section className="pss-card pss-centered"><span className="pss-eyebrow">BUKTI PENGAJUAN</span><h2 ref={heading} tabIndex={-1}>{state==='SUBMITTED'?'Pengajuan telah tercatat':'Tautan telah digunakan'}</h2><p>Pengajuan tetap memerlukan proses petugas koperasi. Nominal dan periode efektif payroll mengikuti hasil proses koperasi.</p>
        {receipt?<><dl className="pss-receipt"><div><dt>Nomor referensi</dt><dd>{receipt.reference}</dd></div><div><dt>Bukti PDF</dt><dd>{receipt.artifactState==='READY'?'Tersedia':'Sedang disiapkan'}</dd></div></dl><div className="pss-actions"><button className="pss-secondary" disabled={busy} onClick={()=>run(refreshReceipt)}>Perbarui status bukti</button>{(receipt.pdfAvailable||receipt.artifactState==='READY')&&<button disabled={busy} onClick={()=>run(()=>downloadPdf(`${base}/pdf`,headers(),'bukti-simpanan-sukarela.pdf'))}>Unduh bukti PDF</button>}</div></>
        :canVerifyReceipt?<><p>Verifikasi kembali untuk membuka bukti pengajuan Anda.</p><button disabled={busy} onClick={()=>{setState('VERIFICATION_REQUIRED');setChallenge('');}}>Verifikasi untuk melihat bukti</button></>:<p>Hubungi petugas koperasi untuk memeriksa pengajuan atau mendapatkan kembali bukti Anda.</p>}
      </section>
      :state==='VERIFICATION_REQUIRED'?<section className="pss-card pss-verify"><span className="pss-eyebrow">AKSES PRIBADI</span><h2>Verifikasi anggota</h2><p>Kode dikirim ke kontak anggota yang telah dikonfirmasi koperasi. Jangan bagikan kode atau tautan ini kepada orang lain.</p><button className="pss-secondary" disabled={busy||seconds>0} onClick={sendCode}>{challenge?'Kirim ulang kode':'Kirim kode verifikasi'}{seconds>0?` (${seconds} dtk)`:''}</button>{challenge&&<form onSubmit={verify}><label htmlFor="pss-code">Kode verifikasi 6 digit</label><input id="pss-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event=>setCode(event.target.value)} maxLength={6} disabled={busy} required/><button disabled={busy}>{busy?'Memeriksa…':'Verifikasi & lanjutkan'}</button></form>}</section>
      :state==='READY'&&form?<div className="pss-grid"><div className="pss-form-column"><section className="pss-card"><div className="pss-section-title"><span className="pss-number">01</span><h2>Data anggota</h2><small>Hanya baca</small></div><dl><div><dt>Nama anggota</dt><dd>{form.memberName}</dd></div><div><dt>NIK tersamarkan</dt><dd>{form.maskedIdentifier}</dd></div><div><dt>Bagian</dt><dd>{form.sectionName}</dd></div><div><dt>Jenis simpanan</dt><dd>{form.savingsType}</dd></div></dl></section>
        {review&&<section className="pss-card"><div className="pss-section-title"><span className="pss-number">02</span><h2 ref={heading} tabIndex={-1}>Tinjau pengajuan</h2></div><p>Pastikan nominal, periode, dan tanda tangan di bawah sesuai dengan permohonan Anda.</p><dl><div><dt>Nominal baru per bulan</dt><dd>{rupiah(amount)}<small className="pss-terbilang">Terbilang: {formatRupiahTerbilang(amount,{fallback:'—'})}</small></dd></div><div><dt>Periode permohonan</dt><dd>{period}</dd></div></dl><p className="pss-consent-copy">{form.consentText}</p><p className="pss-help">Persetujuan telah dicentang. Versi {form.consentVersion}.</p>{frozen&&<p className="pss-info">Pengiriman belum dapat dipastikan. Gunakan “Coba kirim kembali” untuk mengirim permohonan yang sama. Jangan tutup atau muat ulang halaman ini.</p>}</section>}
        <form id="pss-draft-form" className="pss-card pss-form" onSubmit={reviewDraft} hidden={review}><div className="pss-section-title"><span className="pss-number">02</span><h2>Rencana potongan</h2></div><div><label htmlFor="pss-amount">Nominal potongan baru (rupiah) <span aria-hidden="true">*</span></label><CurrencyInput id="pss-amount" allowDecimals={false} maxIntegerDigits={16} value={amount} onValueChange={value=>{setAmount(value);setErrors([]);}} placeholder="Contoh: 150.000" aria-required="true" aria-describedby="pss-amount-help"/><p className="pss-help" id="pss-amount-help">Minimum {rupiah(form.policy.minAmount)}, maksimum {rupiah(form.policy.maxAmount)}, kelipatan {rupiah(form.policy.increment)}. Nilai baru harus berbeda dari potongan sebelumnya.</p></div><div className="pss-info"><strong>Periode permohonan: {period}</strong><p>Periode ini bukan jaminan tanggal efektif payroll. Permohonan akan diperiksa oleh koperasi.</p></div><div className="pss-consent"><input id="pss-consent" type="checkbox" checked={consent} onChange={event=>{setConsent(event.target.checked);setErrors([]);}} aria-required="true"/><label htmlFor="pss-consent">{form.consentText}</label></div><p className="pss-help">Versi persetujuan {form.consentVersion}.</p>
          </form>
        <section className="pss-card" hidden={state!=='READY'}><SignaturePad canvasRef={canvas} onChange={value=>{setSignature(value);setErrors([]);}} disabled={busy||review}/>{review&&<p className="pss-help">Tanda tangan yang akan disertakan pada pengajuan Anda.</p>}{review?<div className="pss-actions"><button className="pss-secondary" disabled={busy||frozen} onClick={()=>setReview(false)}>Ubah isian</button><button disabled={busy} onClick={submit}>{busy?'Mengirim…':frozen?'Coba kirim kembali':'Kirim pengajuan'}</button></div>:<button type="submit" form="pss-draft-form">Tinjau pengajuan</button>}</section>
      </div><aside className="pss-card pss-summary"><span className="pss-eyebrow">RINGKASAN PERMOHONAN</span><h2>Potongan sukarela</h2><div className="pss-old">Potongan sebelumnya<strong>{rupiah(form.originalDeduction)}</strong></div><div className="pss-new">Potongan baru<strong>{rupiah(amount)}</strong><small>per bulan yang dimohonkan</small></div><dl><div><dt>Periode permohonan</dt><dd>{period}</dd></div></dl><p className="pss-help">Pengajuan tidak langsung mengubah potongan payroll atau saldo simpanan.</p></aside></div>:null}
      <footer className="pss-footer">Koperasi Karyawan Suzuki · Layanan simpanan anggota</footer>
    </main>
  </div>;
}
