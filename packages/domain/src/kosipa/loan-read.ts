import { KosipaError } from './errors.ts';
import { nikLookupKeys } from './nik.ts';
import { classifyLegacyDate, parseAmount4, parseCursor, type LegacyDate } from './payroll-read.ts';

/**
 * Read-only KOSIPA loan model (spec REQ-024, TASK-026). It separates what the legacy tables RECORDED (header + installment rows)
 * from integrity findings computed over those records. It never states an official outstanding balance: the legacy balance views
 * are not verified (TASK-003, ANO-K07), so `OFFICIAL_BALANCE_UNVERIFIED` is a first-class, always-present state.
 */

export const LOAN_PAGE_SIZE = 25;
export const LOAN_SCHEDULE_PAGE_SIZE = 60;
export const LOAN_HEADER_LIMIT = 5;   // headers sharing one doc_no (7 such pairs exist on the 30 Sep copy)

export const LOAN_DOC_STATUSES = ['OPEN', 'POSTING', 'APPROVED', 'REJECTED'] as const;
export const LOAN_DISBURSEMENT_STATUSES = ['OPEN', 'APPROVED'] as const;
export const LOAN_REPAYMENT_STATUSES = ['LUNAS', 'BELUM LUNAS'] as const;
export type LoanDocStatus = (typeof LOAN_DOC_STATUSES)[number];

// -------------------------------------------------------------------------------------------------------------- filters
export type LoanListQuery = {
  docStatus: (typeof LOAN_DOC_STATUSES)[number] | null; disbursement: (typeof LOAN_DISBURSEMENT_STATUSES)[number] | null; repayment: (typeof LOAN_REPAYMENT_STATUSES)[number] | null;
  search: { nikKeys: string[] | null; docNoPrefix: string | null; nameLike: string | null } | null; afterId: number | null;
};
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';
const member = <T extends readonly string[]>(list: T, raw: string): T[number] | null => { if (!raw) return null; if (!(list as readonly string[]).includes(raw)) throw new KosipaError('FILTER_INVALID'); return raw as T[number]; };

/** Validated list filter. Unknown values are refused, never passed to SQL. `q` is a NIK, a document-number prefix or a name fragment. */
export function parseLoanListQuery(params: Record<string, string | string[] | undefined>): LoanListQuery {
  const q = first(params.q).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 50);
  let search: LoanListQuery['search'] = null;
  if (q.length >= 2) {
    if (/^[A-Za-z]{2,12}[A-Za-z0-9_-]{0,28}$/.test(q) && /^(PIN|INV|KAS|POT|PEM|KPR|GM)/i.test(q)) search = { nikKeys: null, docNoPrefix: q, nameLike: null };
    else if (/^[0-9A-Za-z]{2,20}$/.test(q) && /\d/.test(q)) search = { nikKeys: nikLookupKeys(q), docNoPrefix: null, nameLike: null };
    else search = { nikKeys: null, docNoPrefix: null, nameLike: q.replace(/[%_\\]/g, (c) => `\\${c}`) };
  }
  return {
    docStatus: member(LOAN_DOC_STATUSES, first(params.status)), disbursement: member(LOAN_DISBURSEMENT_STATUSES, first(params.cair)), repayment: member(LOAN_REPAYMENT_STATUSES, first(params.bayar)),
    search, afterId: parseCursor(first(params.after) || null),
  };
}
export function parseLoanDocNo(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{4,50}$/.test(raw)) throw new KosipaError('DOC_NO_INVALID');
  return raw;
}
/** Schedule cursor = `<installment no>.<row id>` of the last row seen (keyset over (COALESCE(ke,0), id)). */
export function parseScheduleCursor(raw: string | undefined | null): { no: number; id: number } | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const m = /^(\d{1,4})\.(\d{1,10})$/.exec(raw);
  if (!m) throw new KosipaError('CURSOR_INVALID');
  return { no: Number(m[1]), id: Number(m[2]) };
}
export const scheduleCursor = (row: { installmentNo: number | null; id: number }): string => `${row.installmentNo ?? 0}.${row.id}`;

// -------------------------------------------------------------------------------------------------------------- headers
export type LoanHeaderRaw = {
  id: number; docNo: string; docDate: string | null; type: string | null; method: string | null; rate: string | null; nik: string; name: string | null;
  docStatus: string | null; disbursement: string | null; repayment: string | null;
  planPrincipal: string; actualPrincipal: string; planInstallment: string; actualInstallment: string; planMonths: number | null; actualMonths: number | null;
  startDate: string | null; endDate: string | null; disbursedDate: string | null; disbursedAmount: string; adminFee: string; insuranceFee: string; totalDeduction: string; totalReceived: string;
  settlementStatus: string | null; settlementDate: string | null; settlementTotal: string; rollOver: string | null;
};
export type StatusFlag = 'REJECTED_BUT_SETTLED' | 'REJECTED_BUT_DISBURSED' | 'SETTLED_BUT_NOT_APPROVED' | 'DISBURSED_BUT_NOT_APPROVED' | 'STATUS_UNKNOWN';
export type LoanView = {
  header: LoanHeaderRaw; docDate: LegacyDate; startDate: LegacyDate; endDate: LegacyDate; disbursedDate: LegacyDate; settlementDate: LegacyDate;
  planPrincipal4: number; actualPrincipal4: number; planInstallment4: number; actualInstallment4: number; disbursedAmount4: number; adminFee4: number; insuranceFee4: number;
  totalDeduction4: number; totalReceived4: number; settlementTotal4: number; statusFlags: StatusFlag[];
};

/**
 * Status combinations are shown as recorded. Combinations that contradict each other (e.g. REJECTED yet LUNAS: 17 loans on the
 * 30 Sep copy) are flagged, not corrected.
 */
export function statusFlags(h: Pick<LoanHeaderRaw, 'docStatus' | 'disbursement' | 'repayment'>): StatusFlag[] {
  const flags: StatusFlag[] = [];
  if (!(LOAN_DOC_STATUSES as readonly string[]).includes(h.docStatus ?? '') || !(LOAN_DISBURSEMENT_STATUSES as readonly string[]).includes(h.disbursement ?? '') || !(LOAN_REPAYMENT_STATUSES as readonly string[]).includes(h.repayment ?? '')) flags.push('STATUS_UNKNOWN');
  if (h.docStatus === 'REJECTED' && h.repayment === 'LUNAS') flags.push('REJECTED_BUT_SETTLED');
  if (h.docStatus === 'REJECTED' && h.disbursement === 'APPROVED') flags.push('REJECTED_BUT_DISBURSED');
  if (h.docStatus !== 'APPROVED' && h.docStatus !== 'REJECTED' && h.repayment === 'LUNAS') flags.push('SETTLED_BUT_NOT_APPROVED');
  if (h.docStatus !== 'APPROVED' && h.docStatus !== 'REJECTED' && h.disbursement === 'APPROVED') flags.push('DISBURSED_BUT_NOT_APPROVED');
  return flags;
}
export function describeLoan(h: LoanHeaderRaw): LoanView {
  return {
    header: h, docDate: classifyLegacyDate(h.docDate), startDate: classifyLegacyDate(h.startDate), endDate: classifyLegacyDate(h.endDate), disbursedDate: classifyLegacyDate(h.disbursedDate), settlementDate: classifyLegacyDate(h.settlementDate),
    planPrincipal4: parseAmount4(h.planPrincipal), actualPrincipal4: parseAmount4(h.actualPrincipal), planInstallment4: parseAmount4(h.planInstallment), actualInstallment4: parseAmount4(h.actualInstallment),
    disbursedAmount4: parseAmount4(h.disbursedAmount), adminFee4: parseAmount4(h.adminFee), insuranceFee4: parseAmount4(h.insuranceFee), totalDeduction4: parseAmount4(h.totalDeduction),
    totalReceived4: parseAmount4(h.totalReceived), settlementTotal4: parseAmount4(h.settlementTotal), statusFlags: statusFlags(h),
  };
}

// ------------------------------------------------------------------------------------------------------------ schedule
export type ScheduleRowRaw = { id: number; installmentNo: number | null; dueRaw: string | null; paidRaw: string | null; principal: string; interest: string; total: string; status: string | null; type: string | null; blocked: number | null; rollOver: number | null; cicilanDocNo: string | null };
export type ScheduleAggregate = {
  rows: number; distinctNo: number; minNo: number | null; maxNo: number | null; principalSum: string; interestSum: string; totalSum: string;
  paidRows: number; unpaidRows: number; otherStatusRows: number; paidPrincipal: string; unpaidPrincipal: string; unpaidTotal: string;
  zeroDue: number; missingDue: number; implausibleDue: number; componentMismatch: number; paidWithoutPaidDate: number;
};
export type ScheduleIssue =
  | 'DUPLICATE_HEADER' | 'SCHEDULE_ABSENT' | 'PRINCIPAL_SUM_DIFFERS_FROM_PLAN' | 'ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS' | 'DUPLICATE_INSTALLMENT_NUMBERS' | 'NUMBERING_HAS_GAPS'
  | 'DUE_DATES_UNUSABLE' | 'ROW_TOTAL_DIFFERS_FROM_PRINCIPAL_PLUS_INTEREST' | 'SETTLED_WITH_UNPAID_ROWS' | 'STATUS_UNRECOGNISED_ROWS' | 'REJECTED_OR_OPEN_WITH_SCHEDULE';
export type ScheduleIntegrity = {
  issues: ScheduleIssue[];
  /** Recorded schedule figures, summed exactly. Informational: NOT an official balance. */
  recorded: { principal4: number; interest4: number; total4: number; paidPrincipal4: number; unpaidPrincipal4: number; unpaidTotal4: number };
  planPrincipal4: number; planMonths: number | null; rows: number; paidRows: number; unpaidRows: number;
  /** Σ recorded installment principal − recorded plan principal (exact). Under Rp 1 on the legacy rows that differ (2-decimal rounding of imported schedules). */
  principalDifference4: number;
  /** Paid rows with no paid date: legacy never fills `tgl_bayar` (100% of 242k paid rows on the 30 Sep copy), so this is a FACT shown with the schedule, not an anomaly. */
  paidRowsWithoutPaidDate: number;
  dueDates: { zero: number; missing: number; implausible: number };
};
/** Verified on the 30 Sep copy: for a sample of 1,793 APPROVED loans, Σ pokok_cicilan = plan_pinjaman and row count = plan_jangka_waktu in 100% of cases (actual_* columns are unused). */
export function assessSchedule(loan: LoanView, aggregate: ScheduleAggregate, headerCount: number): ScheduleIntegrity {
  const issues: ScheduleIssue[] = [];
  const recorded = { principal4: parseAmount4(aggregate.principalSum), interest4: parseAmount4(aggregate.interestSum), total4: parseAmount4(aggregate.totalSum), paidPrincipal4: parseAmount4(aggregate.paidPrincipal), unpaidPrincipal4: parseAmount4(aggregate.unpaidPrincipal), unpaidTotal4: parseAmount4(aggregate.unpaidTotal) };
  if (headerCount > 1) issues.push('DUPLICATE_HEADER');
  const approved = loan.header.docStatus === 'APPROVED';
  if (aggregate.rows === 0) { if (approved) issues.push('SCHEDULE_ABSENT'); }
  else {
    if (!approved) issues.push('REJECTED_OR_OPEN_WITH_SCHEDULE');
    if (recorded.principal4 !== loan.planPrincipal4) issues.push('PRINCIPAL_SUM_DIFFERS_FROM_PLAN');
    if (loan.header.planMonths !== null && aggregate.rows !== loan.header.planMonths) issues.push('ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS');
    if (aggregate.rows !== aggregate.distinctNo) issues.push('DUPLICATE_INSTALLMENT_NUMBERS');
    else if (aggregate.minNo !== null && aggregate.maxNo !== null && aggregate.maxNo - aggregate.minNo + 1 !== aggregate.distinctNo) issues.push('NUMBERING_HAS_GAPS');
    if (aggregate.zeroDue + aggregate.missingDue + aggregate.implausibleDue > 0) issues.push('DUE_DATES_UNUSABLE');
    if (aggregate.componentMismatch > 0) issues.push('ROW_TOTAL_DIFFERS_FROM_PRINCIPAL_PLUS_INTEREST');
    if (loan.header.repayment === 'LUNAS' && aggregate.unpaidRows > 0) issues.push('SETTLED_WITH_UNPAID_ROWS');
    if (aggregate.otherStatusRows > 0) issues.push('STATUS_UNRECOGNISED_ROWS');
  }
  return { issues, recorded, principalDifference4: recorded.principal4 - loan.planPrincipal4, paidRowsWithoutPaidDate: aggregate.paidWithoutPaidDate, planPrincipal4: loan.planPrincipal4, planMonths: loan.header.planMonths, rows: aggregate.rows, paidRows: aggregate.paidRows, unpaidRows: aggregate.unpaidRows, dueDates: { zero: aggregate.zeroDue, missing: aggregate.missingDue, implausible: aggregate.implausibleDue } };
}

export type ScheduleRowView = { id: number; installmentNo: number | null; due: LegacyDate; paid: LegacyDate; principal4: number; interest4: number; total4: number; status: string | null; type: string | null; blocked: boolean; rollOver: boolean; totalMatches: boolean };
export function describeScheduleRow(r: ScheduleRowRaw): ScheduleRowView {
  const principal4 = parseAmount4(r.principal), interest4 = parseAmount4(r.interest), total4 = parseAmount4(r.total);
  return { id: r.id, installmentNo: r.installmentNo, due: classifyLegacyDate(r.dueRaw), paid: classifyLegacyDate(r.paidRaw), principal4, interest4, total4, status: r.status, type: r.type, blocked: (r.blocked ?? 0) !== 0, rollOver: (r.rollOver ?? 0) !== 0, totalMatches: total4 === principal4 + interest4 };
}

/** The official outstanding balance is never derived here. */
export const OFFICIAL_BALANCE = { state: 'unavailable', reason: 'OFFICIAL_BALANCE_UNVERIFIED' } as const;
