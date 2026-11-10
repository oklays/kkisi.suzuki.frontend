import { createHash } from 'node:crypto';
import { formatRupiah, rupiahFromSen } from '../money/rupiah.ts';
import { KosipaError, KosipaFieldError } from './errors.ts';
import { parseIdempotencyKey, parseReason, ledgerSnapshot, type Snapshot } from './command.ts';
import { loanSchedule } from './loan-schedule.ts';

/**
 * Member requests (P1, kosipa-full-access FA-05): the intake a member submits from the PWA Anggota and the console decisions on it.
 *
 *   intake   loan       -> trans_pinjaman_pengajuan  OPEN (doc PGJ-MBL-YYYYMMDD-XXXXXX, is_online 1). Converting it into a loan (F47,
 *                          legacy mobile/pinjaman_mobile_c) stays in legacy KOSIPA: origination is out of this scope.
 *   intake   deduction  -> trans_simpanan_pengajuan  OPEN (doc PPS-MBL-YYYYMMDD-XXXXXX, is_mobile 1)
 *   reject   loan | deduction request OPEN -> REJECTED (reason 5-200, VAL-108)
 *   approve  deduction request OPEN -> APPROVED (legacy F45 mobile/pengajuan_mobile_c::ajax_proses, with its defects corrected):
 *     legacy: rows of m_simpanan_aktif with the exact NIK + jenis exist -> UPDATE ALL of them (doc_no, potongan_payroll, status 1);
 *             none -> INSERT one (periode 1st of the request month .. 31 Dec); m_anggota.sim_sukarela / sim_wajib = potongan; header status.
 *     native: status guard (legacy accepted any status, even re-approving), exactly one AKTIVE member, NIK fits m_simpanan_aktif.nik_kar
 *             (varchar 10: refused, never truncated), only WAJIB / SUKARELA types (the two m_anggota columns legacy writes), WAJIB may only
 *             go up, public-link requests (PSS…) are refused here (their own lifecycle), and the inserted row carries potongan_old and
 *             is_mobile explicitly (legacy left NOT NULL columns to non-strict SQL mode).
 * Amounts are whole Rupiah (the legacy columns are DOUBLE(18,2) and the PWA only accepts whole Rupiah).
 */
export const MEMBER_REQUEST = {
  open: 'OPEN', rejected: 'REJECTED', approved: 'APPROVED',
  loanPrefix: 'PGJ-MBL', deductionPrefix: 'PPS-MBL',
  maxOpenLoans: 3, purposeMax: 120, deductionMaxRp: 100_000_000, activeNikMax: 10,
} as const;

export type MemberRequestType = 'loan' | 'deduction';
export const isMemberRequestType = (v: unknown): v is MemberRequestType => v === 'loan' || v === 'deduction';

// ------------------------------------------------------------------------------------------------------------- formatting
const ACRONYMS = new Set(['PBS', 'DKM', 'SHU', 'PPOB', 'SIM', 'BTN', 'KPR', 'BJB', 'BSI', 'BSM', 'DKI', 'PAT', 'BPAT', 'PLN', 'PDAM', 'TB', 'TB2', 'II', 'MJ', 'GIIC', 'NIK', 'SPV', 'SBC', 'EHS', 'TC4W', 'UP', 'S-MART']);
/** "KASBON 1X POT" -> "Kasbon 1x Pot"; known master acronyms keep their capitals. */
export function titleCaseLabel(raw: string | null | undefined): string {
  return (raw ?? '').trim().split(/\s+/).filter(Boolean).map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/** Exact decimal string ("1250000.00") -> integer sen. Throws on anything that is not a plain decimal. */
export function decimalSen(decimal: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(decimal.trim());
  if (!m) throw new RangeError('INVALID_DECIMAL');
  const sen = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(sen)) throw new RangeError('INVALID_DECIMAL');
  return m[1] ? -sen : sen;
}

/** "Rp150.000", "150000", "150.000" -> 150000 (whole Rupiah). null when the text is not a whole Rupiah amount. */
export function parseWholeRupiah(text: string): number | null {
  const t = text.trim().replace(/^Rp\s*/i, '');
  if (!/^(?:\d{1,15}|\d{1,3}(?:\.\d{3}){1,4})$/.test(t)) return null;
  const n = Number(t.replace(/\./g, ''));
  return Number.isSafeInteger(n) ? n : null;
}
const rp = (sen: number) => formatRupiah(rupiahFromSen(sen));

// ---------------------------------------------------------------------------------------------- Master Pinjaman Mobile
/** m_pinjaman_mobile (status 1) + the interest method of the same-named m_jenis_pinjaman, as read by both apps. */
export type MobileLoanProductRow = { id: number; name: string; minAmount: string; maxAmount: string; minMonths: number; maxMonths: number; ratePercent: string; method: string | null };
export type MobileLoanProduct = { id: number; name: string; label: string; minSen: number; maxSen: number; minMonths: number; maxMonths: number; rateBp: number | null; method: 'Flat' | 'Anuitas' };

export function buildMobileLoanProducts(rows: readonly MobileLoanProductRow[]): MobileLoanProduct[] {
  return rows.map((r) => {
    const rate = Number(r.ratePercent);
    return {
      id: r.id, name: r.name, label: titleCaseLabel(r.name), minSen: decimalSen(r.minAmount), maxSen: decimalSen(r.maxAmount), minMonths: r.minMonths, maxMonths: r.maxMonths,
      rateBp: r.ratePercent.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? Math.round(rate * 100) : null,
      method: (r.method === 'Anuitas' ? 'Anuitas' : 'Flat') as MobileLoanProduct['method'],
    };
  }).filter((p) => p.maxSen > 0 && p.maxMonths > 0);
}

export type LoanSimulationInput = { productId: number; amountRp: number | null; months: number | null };
export type LoanSimulation =
  | { ok: true; firstInstallmentSen: number; principalSen: number; interestSen: number; totalSen: number; method: 'Flat' | 'Anuitas'; rateBp: number }
  | { ok: false; field: 'product' | 'amount' | 'months' | 'rate'; message: string };

/** The domain schedule engine with the master's own rate and method. An illustration for the member, and the server-side bound check. */
export function simulateMobileLoan(products: readonly MobileLoanProduct[], input: LoanSimulationInput): LoanSimulation {
  const p = products.find((x) => x.id === input.productId);
  if (!p) return { ok: false, field: 'product', message: 'Pilih jenis pinjaman.' };
  if (input.amountRp === null || !Number.isSafeInteger(input.amountRp)) return { ok: false, field: 'amount', message: 'Isi nominal dalam Rupiah tanpa desimal.' };
  const sen = input.amountRp * 100;
  if (sen < p.minSen || sen > p.maxSen) return { ok: false, field: 'amount', message: `Nominal ${p.label} antara Rp${(p.minSen / 100).toLocaleString('id-ID')} dan Rp${(p.maxSen / 100).toLocaleString('id-ID')}.` };
  if (input.months === null || !Number.isInteger(input.months) || input.months < p.minMonths || input.months > p.maxMonths) return { ok: false, field: 'months', message: `Tenor ${p.label} ${p.minMonths}–${p.maxMonths} bulan.` };
  if (p.rateBp === null) return { ok: false, field: 'rate', message: 'Jasa pinjaman untuk jenis ini belum tercatat di master koperasi.' };
  const s = loanSchedule({ method: p.method, principalSen: sen, months: input.months, monthlyRateBp: p.rateBp });
  return { ok: true, firstInstallmentSen: s.rows[0].totalSen, principalSen: s.rows[0].principalSen, interestSen: s.rows[0].interestSen, totalSen: s.totalSen, method: p.method, rateBp: p.rateBp };
}

// ------------------------------------------------------------------------------------------------------ payroll deduction
export type DeductionOption = { type: string; label: string; monthlySen: number };
/** m_simpanan_aktif rows of one member (newest first). */
export type ActiveDeductionRow = { id: number; type: string; payroll: string; status: number | null };

/** Latest active row (status 1) per savings type. Zero is a recorded value and is kept. */
export function activeDeductionOptions(rows: readonly ActiveDeductionRow[]): DeductionOption[] {
  const seen = new Set<string>();
  const out: DeductionOption[] = [];
  for (const r of rows) {
    if (r.status !== 1 || !r.type || seen.has(r.type)) continue;
    seen.add(r.type);
    out.push({ type: r.type, label: titleCaseLabel(r.type), monthlySen: decimalSen(r.payroll) });
  }
  return out;
}

/** Simpanan Wajib may only go up; any new amount must differ from the current one and be a whole Rupiah amount. Effective next month. */
export function validateDeductionChange(option: DeductionOption | undefined, raw: string): string | null {
  if (!option) return 'Pilih jenis simpanan.';
  const value = parseWholeRupiah(raw);
  if (value === null) return 'Masukkan nominal potongan baru yang valid (Rupiah tanpa desimal).';
  const current = option.monthlySen / 100;
  if (/WAJIB/i.test(option.type) && value <= current) return `Potongan baru Simpanan Wajib harus lebih besar dari ${rp(option.monthlySen)}.`;
  if (value === current) return 'Potongan baru sama dengan potongan saat ini.';
  if (value > MEMBER_REQUEST.deductionMaxRp) return 'Nominal terlalu besar.';
  return null;
}

// --------------------------------------------------------------------------------------------------------- intake (channel)
const CLIENT_KEY = /^[A-Za-z0-9._:-]{16,64}$/;
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
const posInt = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u001F\u007F]/.test(v);

/** The member as the PWA session asserts it. apps/web re-reads and re-checks it in the transaction; it is never trusted alone. */
export type MemberAssertion = { memberId: number; userId: number; nik: string };
export type LoanIntake = { kind: 'loan'; clientKey: string; member: MemberAssertion; productId: number; amountRp: number; months: number; purpose: string };
export type DeductionIntake = { kind: 'deduction'; clientKey: string; member: MemberAssertion; savingsType: string; requestedRp: number };
export type MemberIntake = LoanIntake | DeductionIntake;

const INTAKE_FIELDS: Record<MemberRequestType, readonly string[]> = {
  loan: ['kind', 'clientKey', 'member', 'productId', 'amountRp', 'months', 'purpose'],
  deduction: ['kind', 'clientKey', 'member', 'savingsType', 'requestedRp'],
};

/** Strict body of the internal intake endpoint. Unknown fields are refused, never ignored; errors name a field at most. */
export function parseMemberIntake(body: unknown): MemberIntake {
  if (!isPlainObject(body) || !isMemberRequestType(body.kind)) throw new KosipaError('INVALID_INPUT');
  const kind = body.kind;
  for (const key of Object.keys(body)) if (!INTAKE_FIELDS[kind].includes(key)) throw new KosipaError('FIELD_NOT_ALLOWED');
  if (typeof body.clientKey !== 'string' || !CLIENT_KEY.test(body.clientKey)) throw new KosipaError('IDEMPOTENCY_KEY_INVALID');
  const m = body.member;
  if (!isPlainObject(m) || Object.keys(m).some((k) => !['memberId', 'userId', 'nik'].includes(k)) || !posInt(m.memberId, 2_147_483_647) || !posInt(m.userId)
    || typeof m.nik !== 'string' || !/^[0-9A-Za-z]{1,50}$/.test(m.nik)) throw new KosipaError('REQUEST_MEMBER_INVALID');
  const member = { memberId: m.memberId, userId: m.userId, nik: m.nik };
  if (kind === 'loan') {
    if (!posInt(body.productId, 2_147_483_647)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'productId');
    if (!posInt(body.amountRp, 10_000_000_000)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'amountRp');
    if (!posInt(body.months, 600)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'months');
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
    if (!purpose || !text(purpose, MEMBER_REQUEST.purposeMax)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'purpose');
    return { kind, clientKey: body.clientKey, member, productId: body.productId, amountRp: body.amountRp, months: body.months, purpose };
  }
  const savingsType = typeof body.savingsType === 'string' ? body.savingsType.trim() : '';
  if (!savingsType || !text(savingsType, 60)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'savingsType');
  if (!posInt(body.requestedRp, MEMBER_REQUEST.deductionMaxRp)) throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'requestedRp');
  return { kind, clientKey: body.clientKey, member, savingsType, requestedRp: body.requestedRp };
}

/**
 * Ledger idempotency key of an intake: a UUID v4-shaped digest of (member, client key), so the console ledger's unique key
 * (actor, idempotency_key) stays per member while the channel uses one actor id. Same member + same client key -> same UUID.
 */
export function intakeLedgerKey(memberId: number, clientKey: string): string {
  const h = createHash('sha256').update(`member-intake:v1\n${memberId}\n${clientKey}`).digest('hex').slice(0, 32).split('');
  h[12] = '4';
  h[16] = '89ab'[parseInt(h[16], 16) & 3];
  const s = h.join('');
  return parseIdempotencyKey(`${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`);
}

/** PGJ-MBL-20261110-1A2B3C: Jakarta date + 6 hex of (member, client key). Same input -> same number (a retry finds its own row). */
export function requestDocNo(type: MemberRequestType, memberId: number, clientKey: string, now: Date): string {
  const jkt = new Date(now.getTime() + 7 * 3_600_000);
  const ymd = `${jkt.getUTCFullYear()}${String(jkt.getUTCMonth() + 1).padStart(2, '0')}${String(jkt.getUTCDate()).padStart(2, '0')}`;
  const suffix = createHash('sha256').update(`${memberId}:${clientKey}`).digest('hex').slice(0, 6).toUpperCase();
  return `${type === 'loan' ? MEMBER_REQUEST.loanPrefix : MEMBER_REQUEST.deductionPrefix}-${ymd}-${suffix}`;
}

/** The member row the intake re-reads under lock. */
export type IntakeMemberFacts = { id: number; nik: string; name: string; status: string | null; section: string | null; location: string | null; phone: string | null; group: string | null };

/** Same member as the session asserted: id AND exact NIK AND still AKTIVE. Anything else is refused without saying which part failed. */
export function assertIntakeMember(found: IntakeMemberFacts | null, asserted: MemberAssertion): IntakeMemberFacts {
  if (!found || found.id !== asserted.memberId || found.nik !== asserted.nik || (found.status ?? '').trim().toUpperCase() !== 'AKTIVE') throw new KosipaError('REQUEST_MEMBER_INVALID');
  return found;
}

export type LoanIntakePlan = { product: MobileLoanProduct; simulation: Extract<LoanSimulation, { ok: true }> };
export function planLoanIntake(input: LoanIntake, products: readonly MobileLoanProduct[], openRequests: number): LoanIntakePlan {
  const simulation = simulateMobileLoan(products, { productId: input.productId, amountRp: input.amountRp, months: input.months });
  if (!simulation.ok) throw new KosipaFieldError('REQUEST_FIELD_INVALID', simulation.field === 'amount' ? 'amountRp' : simulation.field === 'product' || simulation.field === 'rate' ? 'productId' : 'months');
  if (openRequests >= MEMBER_REQUEST.maxOpenLoans) throw new KosipaError('REQUEST_OPEN_LIMIT');
  return { product: products.find((p) => p.id === input.productId)!, simulation };
}

export type DeductionIntakePlan = { option: DeductionOption; previousRp: number; effectiveYear: string; effectiveMonth: string };
/** `now` decides the effective month: the month after the request (Jakarta business month). */
export function planDeductionIntake(input: DeductionIntake, options: readonly DeductionOption[], now: Date): DeductionIntakePlan {
  const option = options.find((o) => o.type === input.savingsType);
  if (!option || validateDeductionChange(option, String(input.requestedRp)) !== null) throw new KosipaFieldError('REQUEST_FIELD_INVALID', option ? 'requestedRp' : 'savingsType');
  const jkt = new Date(now.getTime() + 7 * 3_600_000);
  const next = new Date(Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth() + 1, 1));
  return { option, previousRp: Math.round(option.monthlySen / 100), effectiveYear: String(next.getUTCFullYear()), effectiveMonth: String(next.getUTCMonth() + 1).padStart(2, '0') };
}

// ------------------------------------------------------------------------------------------------------- console decisions
export type RequestDecisionAction = 'approve' | 'reject';
export const isRequestDecisionAction = (v: unknown): v is RequestDecisionAction => v === 'approve' || v === 'reject';
export type RequestDecision = { expectedVersion: string; idempotencyKey: string; reason?: string };

/** Body of a console decision: version + key always, reason (5-200) only and always for reject. */
export function parseRequestDecision(body: unknown, action: RequestDecisionAction): RequestDecision {
  if (!isPlainObject(body)) throw new KosipaError('INVALID_INPUT');
  const allowed = action === 'reject' ? ['expectedVersion', 'idempotencyKey', 'reason'] : ['expectedVersion', 'idempotencyKey'];
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw new KosipaError('FIELD_NOT_ALLOWED');
  if (typeof body.expectedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(body.expectedVersion)) throw new KosipaError('VERSION_INVALID');
  const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);
  return action === 'reject' ? { expectedVersion: body.expectedVersion, idempotencyKey, reason: parseReason(body.reason) } : { expectedVersion: body.expectedVersion, idempotencyKey };
}

/** Request numbers the console may address: PWA (PGJ-MBL/PPS-MBL), legacy smartkkisi numbers and public links; letters, digits, '-', '/', '.'. */
export function parseRequestDocNo(raw: string): string {
  let v: string;
  try { v = decodeURIComponent(raw ?? '').trim(); } catch { throw new KosipaError('DOC_NO_INVALID'); }
  if (!/^[A-Za-z0-9./-]{3,50}$/.test(v)) throw new KosipaError('DOC_NO_INVALID');
  return v;
}

export type RequestRowFacts = { docNo: string; status: string | null; headerCount: number };
export type LoanRequestFacts = RequestRowFacts & { convertedLoans: number };

/** Reject a loan intake: OPEN only, one row with that number, and never once legacy converted it into a loan (trans_pinjaman exists). */
export function planLoanRequestReject(row: LoanRequestFacts | null): { from: string; to: string } {
  if (!row) throw new KosipaError('NOT_FOUND');
  if (row.headerCount !== 1) throw new KosipaError('REQUEST_STATE_INCONSISTENT');
  if (row.status !== MEMBER_REQUEST.open) throw new KosipaError('REQUEST_STATUS_INVALID');
  if (row.convertedLoans > 0) throw new KosipaError('REQUEST_ALREADY_CONVERTED');
  return { from: MEMBER_REQUEST.open, to: MEMBER_REQUEST.rejected };
}

export const isPublicSavingsReference = (docNo: string) => /^PSS[0-9a-f]{32}00000$/.test(docNo);

export type DeductionRequestFacts = RequestRowFacts & { type: string | null; nik: string | null; requestedRp: string | null; docDate: string | null };
export type DeductionMemberFacts = { id: number; nik: string; name: string | null; group: string | null; status: string | null };
export type ActiveDeductionLockRow = { id: number; status: number | null; payroll: string };

export type DeductionApprovePlan = {
  from: string; to: string; memberColumn: 'sim_sukarela' | 'sim_wajib'; amountRp: number;
  /** ids of every m_simpanan_aktif row of the exact NIK + jenis (legacy updates them all), or an insert when there is none. */
  update: number[];
  insert: null | { nik: string; type: string; name: string; group: string | null; previousRp: number; periodStart: string; periodEnd: string };
};

const memberColumn = (type: string): 'sim_sukarela' | 'sim_wajib' | null => {
  const t = type.toUpperCase();
  const wajib = /WAJIB/.test(t), sukarela = /SUKARELA/.test(t);
  return wajib === sukarela ? null : wajib ? 'sim_wajib' : 'sim_sukarela';
};

function wholeRp(decimal: string | null): number {
  if (decimal === null) throw new KosipaError('REQUEST_AMOUNT_INVALID');
  let sen: number;
  try { sen = decimalSen(decimal); } catch { throw new KosipaError('REQUEST_AMOUNT_INVALID'); }
  if (sen <= 0 || sen % 100 !== 0 || sen / 100 > MEMBER_REQUEST.deductionMaxRp) throw new KosipaError('REQUEST_AMOUNT_INVALID');
  return sen / 100;
}

/** Approve a deduction change (F45). `members` = every m_anggota row with the request's exact NIK; `active` = the m_simpanan_aktif rows of NIK + jenis. */
export function planDeductionApprove(row: DeductionRequestFacts | null, members: readonly DeductionMemberFacts[], active: readonly ActiveDeductionLockRow[]): DeductionApprovePlan {
  if (!row) throw new KosipaError('NOT_FOUND');
  if (row.headerCount !== 1) throw new KosipaError('REQUEST_STATE_INCONSISTENT');
  if (isPublicSavingsReference(row.docNo)) throw new KosipaError('REQUEST_TYPE_UNSUPPORTED');
  if (row.status !== MEMBER_REQUEST.open) throw new KosipaError('REQUEST_STATUS_INVALID');
  const type = (row.type ?? '').trim();
  const column = memberColumn(type);
  if (!column) throw new KosipaError('REQUEST_TYPE_UNSUPPORTED');
  const nik = row.nik ?? '';
  if (!nik || nik.length > MEMBER_REQUEST.activeNikMax) throw new KosipaError('REQUEST_NIK_TOO_LONG');
  if (members.length !== 1 || (members[0].status ?? '').trim().toUpperCase() !== 'AKTIVE') throw new KosipaError('REQUEST_MEMBER_INVALID');
  const amountRp = wholeRp(row.requestedRp);
  const current = active.filter((a) => a.status === 1);
  const currentRp = current.length ? Math.max(...current.map((a) => Math.round(decimalSen(a.payroll) / 100))) : 0;
  if (column === 'sim_wajib' && current.length > 0 && amountRp <= currentRp) throw new KosipaError('REQUEST_AMOUNT_INVALID');
  const date = (row.docDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) throw new KosipaError('REQUEST_STATE_INCONSISTENT');
  return {
    from: MEMBER_REQUEST.open, to: MEMBER_REQUEST.approved, memberColumn: column, amountRp,
    update: active.map((a) => a.id),
    insert: active.length ? null : {
      nik, type, name: (members[0].name ?? '').slice(0, 255), group: members[0].group, previousRp: currentRp,
      periodStart: `${date.slice(0, 7)}-01`, periodEnd: `${date.slice(0, 4)}-12-31`,
    },
  };
}

export function planDeductionReject(row: DeductionRequestFacts | null): { from: string; to: string } {
  if (!row) throw new KosipaError('NOT_FOUND');
  if (row.headerCount !== 1) throw new KosipaError('REQUEST_STATE_INCONSISTENT');
  if (isPublicSavingsReference(row.docNo)) throw new KosipaError('REQUEST_TYPE_UNSUPPORTED');
  if (row.status !== MEMBER_REQUEST.open) throw new KosipaError('REQUEST_STATUS_INVALID');
  return { from: MEMBER_REQUEST.open, to: MEMBER_REQUEST.rejected };
}

/** Ledger before/after: business codes, amounts and statuses only (never NIK or names). */
export const requestLedgerSnapshot = (values: Record<string, unknown>): Snapshot =>
  ledgerSnapshot(values, ['docNo', 'type', 'status', 'amountRp', 'months', 'productId', 'savingsType', 'activeRows', 'inserted']);

/** Channel of a request number, for the console list. */
export function requestChannel(docNo: string): 'pwa' | 'public-link' | 'smartkkisi' {
  if (docNo.startsWith(`${MEMBER_REQUEST.loanPrefix}-`) || docNo.startsWith(`${MEMBER_REQUEST.deductionPrefix}-`)) return 'pwa';
  return isPublicSavingsReference(docNo) ? 'public-link' : 'smartkkisi';
}
