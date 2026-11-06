import { KosipaError } from './errors.ts';
import { canonicalNik } from './nik.ts';
import { parseIdempotencyKey, parseReason } from './command.ts';
import { sameMasterText } from './master.ts';

/** Every captured m_anggota column exactly once. Identity is fixed after registration. */
export const MEMBER_FIELD_CLASSES = {
  identity: ['id', 'doc_no', 'no_anggota', 'nik_kar', 'id_card', 'tgl_daftar'],
  profile: ['nama_kar', 'ktp', 'email', 'jenis_kel', 'tgl_lahir', 'tempat_lahir', 'alamat', 'rt', 'rw', 'provinsi', 'kabupaten', 'kecamatan', 'kelurahan', 'kode_pos', 'alamat_tinggal', 'kelurahan_tinggal', 'kecamatan_tinggal', 'kabupaten_tinggal', 'kode_pos_tinggal', 'no_telp', 'no_telp1', 'status_rumah', 'pendidikan', 'status_nikah', 'nama_istri', 'ibu_kandung', 'npwp'],
  employment: ['divisi', 'dept', 'bagian', 'kd_group', 'jabatan', 'tgl_karyawan', 'tgl_masuk', 'tgl_keluar', 'lokasi', 'status_karyawan'],
  bank: ['no_rek', 'bank_rek', 'nama_rek'],
  salary: ['gaji'],
  deductionConfiguration: ['sim_wajib', 'sim_pokok', 'sim_sukarela', 'status_pot_pokok', 'status_pot_wajib', 'status_pot_sukarela'],
  financialControls: ['limit_toko_old', 'limit_toko', 'gaji_minus', 'limit_persen', 'batas_pinjaman', 'limit_ppob'],
  status: ['status_anggota'],
  credentialsFiles: ['password', 'foto_profile', 'foto_ktp', 'foto_ttd', 'surat_kuasa', 'persetujuan', 'foto_kk', 'foto_bukti_biaya_sekolah'],
  audit: ['cd', 'cd_usr', 'ud', 'ud_usr'],
} as const;
export const MEMBER_PROFILE_FIELDS = [...MEMBER_FIELD_CLASSES.profile, ...MEMBER_FIELD_CLASSES.employment, ...MEMBER_FIELD_CLASSES.bank, ...MEMBER_FIELD_CLASSES.salary] as const;
export const MEMBER_REGISTRATION_FIELDS = [...MEMBER_PROFILE_FIELDS, 'nik_kar', 'id_card', 'tgl_daftar', 'status_anggota'] as const;
export type MemberField = (typeof MEMBER_REGISTRATION_FIELDS)[number];
export type MemberFields = Partial<Record<MemberField, string | null>>;
export type InitialDeductions = { pokok: string; wajib: string; sukarela: string };
export type MemberRegistration = { fields: MemberFields; initialDeductions: InitialDeductions; idempotencyKey: string };
export type MemberProfile = { fields: MemberFields; expectedVersion: string; reason?: string; idempotencyKey: string };
/** Stored legacy row values may be numeric or malformed (legacy wrote sanitized ints with sign); compared tolerantly. */
export type MemberStoredFields = Partial<Record<MemberField, string | number | null>>;
export type MemberRecord = { id: number; fields: MemberStoredFields };
export type MemberMasterFacts = { bagian: readonly { name: string; active: boolean }[]; lokasi: readonly { name: string; active: boolean }[] };

const required = ['nama_kar', 'nik_kar', 'kd_group', 'bagian', 'lokasi', 'status_anggota'];
const dates = ['tgl_daftar', 'tgl_lahir', 'tgl_karyawan', 'tgl_masuk', 'tgl_keluar'];
const status = ['AKTIVE', 'LUAR BIASA', 'KONTRAK', 'RESIGN', 'PENSIUN'];
const groups = ['ANGGOTA', 'NON ANGGOTA', 'BMP', 'KOPERASI'];
const mirrorNotNull = ['ktp', 'email', 'no_telp'];
// Legacy anggota_v.php renders these as <textarea>: LF/CRLF line breaks are legitimate latin1 values. Lone CR stays refused.
const multiline = ['alamat', 'alamat_tinggal'];
// Member VARCHAR widths, narrowed where the verified five-field users mirror requires it.
const widths: Partial<Record<MemberField, number>> = {
  id_card: 50, nama_kar: 50, ktp: 50, email: 50, jenis_kel: 50, tempat_lahir: 50, alamat: 250, rt: 50, rw: 50, provinsi: 100, kabupaten: 50, kecamatan: 50, kelurahan: 50, kode_pos: 50,
  alamat_tinggal: 250, kelurahan_tinggal: 50, kecamatan_tinggal: 50, kabupaten_tinggal: 50, kode_pos_tinggal: 50, no_telp: 25, no_telp1: 50, status_rumah: 50, pendidikan: 50, status_nikah: 50, nama_istri: 50, ibu_kandung: 50, npwp: 50,
  divisi: 50, dept: 250, bagian: 100, kd_group: 100, jabatan: 50, lokasi: 100, status_karyawan: 50, no_rek: 20, bank_rek: 20, nama_rek: 100, status_anggota: 50,
};
// MariaDB latin1 = Windows-1252. Refuse C0/C1 controls, including undefined cp1252 slots.
const printableLatin1 = /^[\x20-\x7e\u00a0-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]*$/u;

/** Plain JSON data only: no getters, symbols, hidden/inherited keys or special prototypes. */
function object(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) throw new KosipaError('INVALID_INPUT');
  const out: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(raw)) {
    const d = Object.getOwnPropertyDescriptor(raw, key);
    if (typeof key !== 'string' || !d?.enumerable || !('value' in d)) throw new KosipaError('INVALID_INPUT');
    if (!allowed.includes(key)) throw new KosipaError('FIELD_NOT_ALLOWED');
    out[key] = d.value;
  }
  return out;
}

/** Exact bounded decimal, no numeric coercion, rounding or truncation. Canonicalized for fingerprints/no-change. */
function amount(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 64 || !/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new KosipaError('MEMBER_AMOUNT_INVALID');
  const [digits, fraction = ''] = raw.split('.');
  const whole = digits.replace(/^0+(?=\d)/, '');
  if (whole.length > 14 || (whole.length === 14 && (whole > '10000000000000' || /[1-9]/.test(fraction)))) throw new KosipaError('MEMBER_AMOUNT_INVALID');
  const decimal = fraction.replace(/0+$/, '');
  return whole + (decimal ? `.${decimal}` : '');
}

function date(raw: unknown): string | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new KosipaError('MEMBER_DATE_INVALID');
  const [year, month, day] = raw.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new KosipaError('MEMBER_DATE_INVALID');
  return raw;
}

function fields(raw: unknown, registration: boolean): MemberFields {
  const input = object(raw, registration ? MEMBER_REGISTRATION_FIELDS : MEMBER_PROFILE_FIELDS);
  const out: MemberFields = {};
  for (const [key, value] of Object.entries(input)) {
    const k = key as MemberField;
    if (k === 'gaji') out[k] = amount(value);
    else if (dates.includes(k)) out[k] = date(value);
    else if (k === 'nik_kar') {
      if (typeof value !== 'string' || !value.trim()) throw new KosipaError('MEMBER_FIELD_INVALID');
      out[k] = canonicalNik(value);
    } else {
      const max = widths[k];
      if (value === null && !mirrorNotNull.includes(k) && !required.includes(k)) { out[k] = null; continue; }
      if (typeof value !== 'string' || max === undefined || value.length > max || !printableLatin1.test(multiline.includes(k) ? value.replace(/\r?\n/g, '') : value) || (required.includes(k) && !value.trim())) throw new KosipaError('MEMBER_FIELD_INVALID');
      if ((k === 'status_anggota' && !status.includes(value)) || (k === 'kd_group' && !groups.includes(value))) throw new KosipaError('MEMBER_FIELD_INVALID');
      out[k] = value;
    }
  }
  if (registration) {
    for (const key of required) if (typeof out[key as MemberField] !== 'string' || !out[key as MemberField]?.trim()) throw new KosipaError('MEMBER_FIELD_INVALID');
    if (!Object.hasOwn(input, 'gaji')) out.gaji = '0';
  } else if (!Object.keys(out).length) throw new KosipaError('NO_CHANGE');
  return out;
}

export function parseMemberRegistration(raw: unknown, today: string): MemberRegistration {
  const b = object(raw, ['fields', 'initialDeductions', 'idempotencyKey']);
  const idempotencyKey = parseIdempotencyKey(b.idempotencyKey);
  const values = fields(b.fields, true);
  if (!date(today) || (values.tgl_daftar && values.tgl_daftar > today)) throw new KosipaError('MEMBER_DATE_INVALID');
  const d = object(b.initialDeductions, ['pokok', 'wajib', 'sukarela']);
  const initialDeductions = { pokok: amount(d.pokok), wajib: amount(d.wajib), sukarela: amount(d.sukarela) };
  if (Object.values(initialDeductions).some((v) => v !== '0') && (values.nik_kar as string).length > 10) throw new KosipaError('MEMBER_DEDUCTION_NIK_TOO_LONG');
  return { fields: values, initialDeductions, idempotencyKey };
}

export function parseMemberProfile(raw: unknown): MemberProfile {
  const b = object(raw, ['fields', 'expectedVersion', 'reason', 'idempotencyKey']);
  const idempotencyKey = parseIdempotencyKey(b.idempotencyKey);
  const values = fields(b.fields, false);
  if (typeof b.expectedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(b.expectedVersion)) throw new KosipaError('VERSION_INVALID');
  return { fields: values, expectedVersion: b.expectedVersion, idempotencyKey, ...(Object.hasOwn(b, 'reason') ? { reason: parseReason(b.reason) } : {}) };
}

/** Write uniqueness only. Do not change read-side canonicalNik/sameMember behavior. */
export const memberNikUniquenessKey = (raw: string): string => canonicalNik(raw).toLowerCase();

function resolveMasters(values: MemberFields, facts: MemberMasterFacts, current?: MemberStoredFields): MemberFields {
  const out = { ...values };
  for (const key of ['bagian', 'lokasi'] as const) {
    if (!Object.hasOwn(values, key)) continue;
    const value = values[key], stored = current?.[key];
    // Unchanged (same master text) keeps the stored spelling and is not revalidated, so historical inactive values survive.
    if (typeof stored === 'string' && typeof value === 'string' && sameMasterText(stored, value)) { out[key] = stored; continue; }
    const match = typeof value === 'string' && facts[key].find((m) => m.active && sameMasterText(m.name, value));
    if (!match) throw new KosipaError('MEMBER_MASTER_INVALID');
    out[key] = match.name;
  }
  return out;
}

/** Repository must call under its transaction with verified active-master facts. */
export function planMemberRegistration(input: MemberRegistration, masters: MemberMasterFacts): MemberRegistration {
  return { ...input, fields: resolveMasters(input.fields, masters) };
}
export type MemberChangeSummary = { id: number; presence: Partial<Record<MemberField, boolean>>; changes: Partial<Record<MemberField, boolean>>; bankChanged: boolean; salaryChanged: boolean };

/** Stored salary that is not a canonical amount (legacy negative/oversized/garbage) counts as different, so it can be corrected. */
function storedAmount(raw: string | number | null | undefined): string | undefined {
  try { return amount(typeof raw === 'number' ? String(raw) : raw); } catch { return undefined; }
}
/** Change detection only: NULL and '' are the same nullable-text intent; the parsed value is still written as submitted. */
const storedText = (raw: string | number | null | undefined): string => (raw == null ? '' : String(raw));

/** Repository checks the opaque HMAC version on the locked row BEFORE calling this planner. */
export function planMemberProfile(current: MemberRecord | null, input: MemberProfile, masters: MemberMasterFacts): { before: MemberRecord; after: MemberRecord; changed: MemberField[]; reason?: string; summary: MemberChangeSummary } {
  if (!current) throw new KosipaError('MEMBER_NOT_FOUND');
  const values = resolveMasters(input.fields, masters, current.fields);
  const changed = (Object.keys(values) as MemberField[]).filter((key) => key === 'gaji' ? storedAmount(current.fields.gaji) !== values.gaji : storedText(current.fields[key]) !== storedText(values[key]));
  if (!changed.length) throw new KosipaError('NO_CHANGE');
  const bankChanged = changed.some((key) => (MEMBER_FIELD_CLASSES.bank as readonly string[]).includes(key));
  const reason = bankChanged ? parseReason(input.reason) : input.reason;
  return { before: current, after: { ...current, fields: { ...current.fields, ...values } }, changed, ...(reason === undefined ? {} : { reason }), summary: memberFieldSummary(current.id, values, changed) };
}

/** Call after registration allocates the record id, or with the update's actual changed fields. No values/reason text. */
export function memberFieldSummary(id: number, values: MemberFields, changed: readonly MemberField[] = Object.keys(values) as MemberField[]): MemberChangeSummary {
  const presence = Object.fromEntries(Object.keys(values).map((key) => [key, true]));
  const changes = Object.fromEntries(Object.keys(values).map((key) => [key, changed.includes(key as MemberField)]));
  return { id, presence, changes, bankChanged: changed.some((key) => (MEMBER_FIELD_CLASSES.bank as readonly string[]).includes(key)), salaryChanged: changed.includes('gaji') };
}
