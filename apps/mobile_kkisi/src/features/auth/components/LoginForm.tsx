'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/overlay/Sheet';
import { commonMessage, postJson } from '@/lib/api/client';
import { useIsClient } from '@/hooks/browser-store';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'NIK/email/telepon atau password tidak sesuai.',
  ACCOUNT_INACTIVE: 'Akun ini tidak aktif. Hubungi pengurus koperasi KKISI TB2.',
  NOT_A_MEMBER: 'Akun ini belum terhubung dengan data anggota KKISI TB2. Hubungi pengurus koperasi.',
  IDENTITY_INVALID: 'Gunakan NIK anggota, email, atau nomor telepon yang terdaftar.',
};

type Info = { title: string; body: string } | null;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  // Until hydrated the form cannot submit: a native submit must never carry the password anywhere (method=post also keeps it out of URLs).
  const hydrated = useIsClient();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ identity?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Info>(null);
  const identityRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const identity = identityRef.current?.value.trim() ?? '';
    const password = passwordRef.current?.value ?? '';
    const fieldErrors = { identity: identity ? undefined : 'Isi NIK anggota, email, atau telepon.', password: password ? undefined : 'Isi password.' };
    setErrors(fieldErrors);
    if (fieldErrors.identity) { identityRef.current?.focus(); return; }
    if (fieldErrors.password) { passwordRef.current?.focus(); return; }
    setBusy(true);
    const r = await postJson<{ next: string }>('/api/auth/login', { identity, password });
    setBusy(false);
    if (r.ok) {
      if (passwordRef.current) passwordRef.current.value = '';
      router.replace(`/pin?next=${encodeURIComponent(next)}`);
      return;
    }
    setErrors({ form: MESSAGES[r.code] ?? commonMessage(r.code, r.retryAfterSec) });
    if (passwordRef.current) passwordRef.current.value = '';
    passwordRef.current?.focus();
  }

  return (
    <>
      <form className="auth-form" method="post" action="/api/auth/login" onSubmit={submit} noValidate aria-describedby="auth-hint">
        {errors.form ? <p className="form-error auth-error" role="alert">{errors.form}</p> : null}
        <label className="field" htmlFor="identity">
          <span>NIK anggota / email / telepon</span>
          <input ref={identityRef} id="identity" name="identity" type="text" placeholder="NIK, email, atau telepon" autoComplete="username" autoCapitalize="none" spellCheck={false}
            maxLength={80} aria-invalid={errors.identity ? true : undefined} aria-describedby="identity-error" onInput={() => setErrors((x) => ({ ...x, identity: undefined }))} />
          <small className="field-error" id="identity-error">{errors.identity}</small>
        </label>
        <label className="field" htmlFor="password">
          <span>Password</span>
          <div className="password-control">
            <input ref={passwordRef} id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Masukkan password" autoComplete="current-password" maxLength={200}
              aria-invalid={errors.password ? true : undefined} aria-describedby="password-error" onInput={() => setErrors((x) => ({ ...x, password: undefined }))} />
            <button className="password-toggle" type="button" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
              <Icon name={showPassword ? 'eyeOff' : 'eye'} />
            </button>
          </div>
          <small className="field-error" id="password-error">{errors.password}</small>
        </label>
        <div className="forgot-row">
          <button className="auth-link" type="button" onClick={() => setInfo({ title: 'Lupa password?', body: 'Pengaturan ulang password belum tersedia di aplikasi ini. Hubungi pengurus koperasi KKISI TB2 untuk mengatur ulang password akun S-MART kamu.' })}>Lupa password?</button>
        </div>
        <button className="primary" type="submit" disabled={busy || !hydrated} aria-busy={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        <button className="secondary" type="button" onClick={() => setInfo({ title: 'Mode tamu', body: 'Semua layanan di aplikasi ini memakai data keanggotaan, jadi diperlukan akun anggota. Mode tamu belum tersedia.' })}>Lanjut sebagai tamu</button>
        <p className="auth-hint" id="auth-hint">Gunakan akun S-MART KKISI TB2 yang sudah terdaftar. Password tidak pernah disimpan di perangkat.</p>
      </form>
      <div className="signup">
        <span>Belum punya akun?</span>
        <button className="auth-link" type="button" onClick={() => setInfo({ title: 'Daftar', body: 'Pendaftaran anggota dilakukan melalui pengurus koperasi KKISI TB2. Setelah terdaftar, kamu akan mendapatkan akun untuk masuk ke aplikasi ini.' })}>Daftar</button>
      </div>
      <Sheet open={info !== null} onClose={() => setInfo(null)} title={info?.title ?? ''} subtitle="Informasi akun">
        <p className="detail-copy">{info?.body}</p>
        <button type="button" className="primary" onClick={() => setInfo(null)}>Kembali</button>
      </Sheet>
    </>
  );
}
