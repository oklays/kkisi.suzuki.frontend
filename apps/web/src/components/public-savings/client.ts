import { formatRupiah } from '@koperasi/domain/money/rupiah';

export interface SavingsForm {
  memberName: string; maskedIdentifier: string; sectionId: string; sectionName: string; savingsType: string;
  originalDeduction: string|null; requestedPeriod: { year: number; month: number };
  consentVersion: string; consentText: string; formVersion: string; reviewFingerprint:string;
  policy: { minAmount: string; increment: string; maxAmount: string };
}

export function consumeFragmentToken(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string {
  const fragment = location.hash;
  if (fragment) history.replaceState(null, '', location.pathname + location.search);
  const tokens = new URLSearchParams(fragment.replace(/^#/, '')).getAll('token');
  return tokens.length === 1 && tokens[0].length <= 1024 ? tokens[0] : '';
}

export function rupiah(value: string|null): string {
  if(value===null)return 'Belum ada potongan';
  if(!/^\d{1,16}(?:\.\d{1,8})?$/.test(value))return 'Belum diisi';
  return formatRupiah(value);
}

export function validateDraft(amount: string, signature: boolean, consent: boolean, form: SavingsForm): string[] {
  const errors: string[] = [];
  if (!/^[1-9]\d{0,15}$/.test(amount)) errors.push('Isi nominal dalam rupiah bulat, tanpa desimal.');
  else {
    const value = BigInt(amount);
    if (value < BigInt(form.policy.minAmount) || value > BigInt(form.policy.maxAmount) || value % BigInt(form.policy.increment) !== BigInt(0))
      errors.push(`Nominal harus ${rupiah(form.policy.minAmount)}–${rupiah(form.policy.maxAmount)}, kelipatan ${rupiah(form.policy.increment)}.`);
    if (typeof form.originalDeduction==='string' && /^\d+(?:\.0+)?$/.test(form.originalDeduction) && value === BigInt(form.originalDeduction.split('.')[0])) errors.push('Nominal baru harus berbeda dari potongan sebelumnya.');
  }
  if (!signature) errors.push('Bubuhkan tanda tangan Anda pada area yang tersedia.');
  if (!consent) errors.push('Centang persetujuan setelah membaca ketentuannya.');
  return errors;
}

export interface SubmissionSnapshot {
  readonly fields: Readonly<Record<string, string>>; readonly signature: Blob; readonly idempotencyKey: string;
}
export function freezeSubmission(amount: string, form: SavingsForm, signature: Blob, idempotencyKey: string): SubmissionSnapshot {
  return Object.freeze({ idempotencyKey, signature, fields: Object.freeze({ amountRupiah: amount, sectionId: form.sectionId,
    startMonth: String(form.requestedPeriod.month), startYear: String(form.requestedPeriod.year), consentVersion: form.consentVersion,
    formVersion: form.formVersion,reviewFingerprint:form.reviewFingerprint, consent: 'true' }) });
}
export function submissionBody(snapshot: SubmissionSnapshot): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(snapshot.fields)) body.set(key, value);
  body.set('signature', snapshot.signature, 'signature.png');
  return body;
}

export function publicErrorMessage(code: string, retryAfterSeconds?: number): string {
  if (/RATE|THROTTL|TOO_MANY/.test(code)) return `Terlalu banyak percobaan. Coba lagi${retryAfterSeconds ? ` setelah ${retryAfterSeconds} detik` : ' beberapa saat lagi'}.`;
  // Lock and resend caps must not tell the member to request a new code: that request is refused too.
  if (code === 'CHALLENGE_LOCKED') return 'Tautan ini terkunci karena terlalu banyak percobaan kode yang salah. Hubungi petugas koperasi untuk menerbitkan tautan baru.';
  if (code === 'RESEND_TOO_SOON') return `Kode baru baru saja dikirim. Tunggu${retryAfterSeconds ? ` ${retryAfterSeconds} detik` : ' sebentar'} sebelum meminta kode lagi.`;
  if (code === 'RESEND_LIMIT') return 'Batas pengiriman kode verifikasi sudah tercapai. Coba lagi dalam satu jam atau hubungi petugas koperasi.';
  if (/OTP|CODE|CHALLENGE/.test(code)) return 'Kode verifikasi belum cocok atau telah kedaluwarsa. Periksa kode atau minta kode baru.';
  if (/PROOF|VERIFICATION/.test(code)) return 'Verifikasi Anda telah berakhir. Verifikasi kembali sebelum melanjutkan.';
  if (/DUPLICATE|ACTIVE_APPLICATION/.test(code)) return 'Masih ada pengajuan aktif. Hubungi petugas koperasi untuk pemeriksaan.';
  if(code==='FORM_CHANGED')return 'Data anggota atau periode telah berubah. Tinjau data terbaru, bubuhkan kembali tanda tangan, dan nyatakan persetujuan ulang.';
  if (/IDEMPOTENCY/.test(code)) return 'Pengiriman perlu diperiksa. Coba ulang pengiriman yang sama atau hubungi petugas koperasi.';
  if (/VALIDATION|AMOUNT|CONSENT|SIGNATURE|PERIOD|FORM_VERSION/.test(code)) return 'Isian belum dapat diterima. Periksa nominal, periode, persetujuan, dan tanda tangan Anda.';
  return 'Layanan belum dapat memproses permintaan. Coba lagi atau hubungi petugas koperasi.';
}

export class SavingsApiError extends Error {
  code: string; status: number; retryAfterSeconds?: number;
  constructor(code: string, status: number, retryAfterSeconds?: number) {
    super(publicErrorMessage(code, retryAfterSeconds)); this.code = code; this.status = status; this.retryAfterSeconds = retryAfterSeconds;
  }
}
export async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store', credentials: init.credentials ?? 'omit', referrerPolicy: init.referrerPolicy ?? 'no-referrer', redirect: 'error', signal: init.signal ?? AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new SavingsApiError(data?.error?.code || 'UNAVAILABLE', response.status, data?.error?.retryAfterSeconds);
  if (!data || typeof data !== 'object') throw new SavingsApiError('UNAVAILABLE', 503);
  return data as T;
}
export async function downloadPdf(path: string, headers: HeadersInit, filename: string, credentials: RequestCredentials = 'omit'): Promise<void> {
  const response = await fetch(path, {headers, cache:'no-store', credentials, referrerPolicy:'no-referrer', redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new SavingsApiError(data?.error?.code || 'UNAVAILABLE', response.status, data?.error?.retryAfterSeconds);
  }
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new SavingsApiError('UNAVAILABLE',503);
  const url=URL.createObjectURL(await response.blob());
  const anchor=document.createElement('a'); anchor.href=url; anchor.download=filename; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
