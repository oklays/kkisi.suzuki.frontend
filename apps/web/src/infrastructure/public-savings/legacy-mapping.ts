/** Pure translation against documented LOCAL schema 09A; no legacy writer or profile/ledger side effects. */
import type { SubmissionSnapshot } from '@koperasi/domain/kosipa/savings-snapshot';
import type { ChangeRequestState } from '@koperasi/domain/kosipa/savings-lifecycle';

export interface LegacyMemberSnapshot {
  readonly id: string;
  readonly nik: string;
  readonly name: string;
  readonly sectionId: string;
  readonly sectionName: string;
  readonly branch: string;
  readonly phone: string | null;
  readonly groupCode: string;
}
export interface LegacySubmissionRow {
  doc_no: string; doc_date: string; doc_status: 'OPEN'; jenis_simpanan: 'SIMPANAN SUKARELA';
  nik_kar: string; nama: string; phone: string | null; bank: null; norek: null; bagian: string; lokasi: string;
  potongan_old: string | null; potongan: string; awal_potong_bulan: string; awal_potong_tahun: string;
  remarks: null; posting_date: null; created_at: string; cd_usr: string; updated_at: string; ud_usr: string;
  status_notif: 0; ttd: string; is_mobile: 0;
}
export type LegacyMappingResult = { readonly ok: true; readonly value: LegacySubmissionRow }
  | { readonly ok: false; readonly error: { readonly code: 'LEGACY_INCOMPATIBLE'; readonly field: string } };
const fail = (field: string): LegacyMappingResult => ({ ok: false, error: { code: 'LEGACY_INCOMPATIBLE', field } });
// Reject controls/unrepresentable characters; never truncate or silently transcode Latin1 columns.
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && /^[\u0020-\u007e\u00a0-\u00ff]+$/u.test(value) && value.trim() === value;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const safeWhole = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value) && value.length <= 16 && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER);
const originalWhole = (value: unknown): string | null | undefined => {
  if (value === null) return null; // only the validated VERIFIED_NONE snapshot encodes first enrollment this way
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(?:\.0+)?$/u.test(value)) return undefined;
  const whole = value.split('.')[0];
  return safeWhole(whole) ? whole : undefined;
};
const sqlDateTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/u.test(value)) return false;
  const parsed = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19).replace('T', ' ') === value;
};
const privateRef = (value: unknown): value is string => text(value, 100) && !value.includes('://') && !value.includes('..') && !value.startsWith('/') && /^[A-Za-z0-9][A-Za-z0-9_./:-]*$/u.test(value);

/** 128 random bits supplied by the crypto adapter; RIGHT(doc_no,5) remains zero for Laravel's legacy monthly helper. */
export function legacyPublicReference(randomHex: string): string {
  if (typeof randomHex !== 'string' || !/^[0-9a-f]{32}$/u.test(randomHex)) throw new TypeError('Expected 128-bit lowercase hex');
  return `PSS${randomHex}00000`;
}

/** createdAt is the explicit Asia/Jakarta SQL wall clock; callers retain the full immutable snapshot separately. */
export function mapLegacySubmission(input: { reference: string; member: LegacyMemberSnapshot; snapshot: SubmissionSnapshot; signatureRef: string; createdAt: string; actor: string }): LegacyMappingResult {
  if (!record(input)) return fail('input');
  const { reference, member: m, snapshot: s, signatureRef, createdAt, actor } = input;
  if (typeof reference !== 'string' || !/^PSS[0-9a-f]{32}00000$/u.test(reference)) return fail('reference');
  if (!record(m)) return fail('member');
  for (const [key, max] of [['id', 128], ['nik', 10], ['name', 50], ['sectionId', 128], ['sectionName', 100], ['branch', 100], ['groupCode', 50]] as const) {
    if (!text(m[key], max)) return fail(`member.${key}`);
  }
  if (m.phone !== null && !text(m.phone, 50)) return fail('member.phone');
  if (!record(s) || s.contractVersion !== 'pss-snapshot/v2' || s.memberRef !== m.id || s.sectionId !== m.sectionId || s.savingsType !== 'SIMPANAN SUKARELA') return fail('snapshot.binding');
  const old = originalWhole(s.originalDeduction);
  if (old === undefined) return fail('snapshot.originalDeduction');
  if (!safeWhole(s.requestedAmount) || s.requestedAmount === '0') return fail('snapshot.requestedAmount');
  const p = s.requestedPeriod;
  if (!record(p) || !Number.isInteger(p.year) || p.year < 1000 || p.year > 9999 || !Number.isInteger(p.month) || p.month < 1 || p.month > 12) return fail('snapshot.requestedPeriod');
  if (!privateRef(signatureRef) || !record(s.signature) || signatureRef !== s.signature.storageRef) return fail('signatureRef');
  if (!sqlDateTime(createdAt)) return fail('createdAt');
  if (!text(actor, 50)) return fail('actor');
  return { ok: true, value: {
    doc_no: reference, doc_date: createdAt.slice(0, 10), doc_status: 'OPEN', jenis_simpanan: 'SIMPANAN SUKARELA',
    nik_kar: m.nik, nama: m.name, phone: m.phone, bank: null, norek: null, bagian: m.sectionName, lokasi: m.branch,
    potongan_old: old, potongan: s.requestedAmount, awal_potong_bulan: String(p.month).padStart(2, '0'), awal_potong_tahun: String(p.year),
    remarks: null, posting_date: null, created_at: createdAt, cd_usr: actor, updated_at: createdAt, ud_usr: actor,
    status_notif: 0, ttd: signatureRef, is_mobile: 0,
  } };
}

/** Only four raw states are verified in CI2 source. A separate trusted payroll fact is required to release APPROVED. */
export function mapLegacyRequestState(status: unknown, posting?: { readonly postedConfirmed: boolean }): ChangeRequestState | 'UNKNOWN' {
  if (posting?.postedConfirmed === true) return status === 'APPROVED' || status === 'POSTING' ? 'POSTED_CONFIRMED' : 'UNKNOWN';
  if (status === 'APPROVED') return 'APPROVED_NOT_POSTED';
  return status === 'OPEN' || status === 'POSTING' || status === 'REJECTED' ? status : 'UNKNOWN';
}
