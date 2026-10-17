import { KosipaError } from './errors.ts';
import { classifyLegacyDate, parseAmount4, parseCursor, type LegacyDate } from './payroll-read.ts';

/**
 * Read-only savings ledger (spec REQ-023, TASK-025 read side). It presents RECORDED movements and per-type sums of movements. It never
 * states an official balance: the legacy opening-balance semantics and balance views are unverified (TASK-003), and the detail
 * `saldo` column is never filled (0 on all 7,921 recent rows of the 30 Sep copy), so no recorded balance exists to show either.
 * The HEADER status is authoritative: the detail status is empty or different from the header in ~54% of recent rows.
 */
export const SAVINGS_PAGE_SIZE = 50;
export const SAVINGS_BALANCE = { state: 'unavailable', reason: 'OFFICIAL_BALANCE_UNVERIFIED' } as const;

export type LedgerQuery = { type: string | null; afterId: number | null };
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';
export function parseLedgerQuery(params: Record<string, string | string[] | undefined>): LedgerQuery {
  const type = first(params.jenis).trim();
  if (type && !/^[A-Za-z0-9 /&.()\-]{1,60}$/.test(type)) throw new KosipaError('FILTER_INVALID');
  return { type: type || null, afterId: parseCursor(first(params.after) || null) };
}
export function parseMemberId(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw) || Number(raw) < 1) throw new KosipaError('MEMBER_ID_INVALID');
  return Number(raw);
}

export type MovementState = 'POSTED' | 'PENDING' | 'VOID' | 'UNVERIFIED';
/** APPROVED -> POSTED, OPEN -> PENDING, any other recorded status -> VOID (same mapping as Anggota 360). */
export const stateOfHeaderStatus = (status: string | null): Exclude<MovementState, 'UNVERIFIED'> => (status === 'APPROVED' ? 'POSTED' : status === 'OPEN' ? 'PENDING' : 'VOID');

export type MovementRaw = { id: number; docNo: string; type: string; credit: string; cashCredit: string; debit: string; interest: string; detailStatus: string | null; remark: string | null };
export type SavingsHeaderRef = { docNo: string; headerCount: number; header: { docDate: string | null; status: string | null; kind: string | null } | null };
export type MovementFlag = 'HEADER_MISSING' | 'HEADER_AMBIGUOUS' | 'DETAIL_STATUS_DIFFERS' | 'DATE_UNUSABLE' | 'NEGATIVE_AMOUNT';
export type MovementView = {
  id: number; docNo: string; type: string; date: LegacyDate; kind: string | null; headerStatus: string | null; state: MovementState;
  credit4: number; debit4: number; interest4: number; opening: boolean; remark: string | null; flags: MovementFlag[];
};
export function describeMovement(row: MovementRaw, ref: SavingsHeaderRef | undefined): MovementView {
  const credit4 = parseAmount4(row.credit) + parseAmount4(row.cashCredit), debit4 = parseAmount4(row.debit), interest4 = parseAmount4(row.interest);
  const flags: MovementFlag[] = [];
  let state: MovementState; let headerStatus: string | null = null; let kind: string | null = null; let date: LegacyDate = { kind: 'missing' };
  if (!ref || ref.headerCount === 0 || !ref.header) { state = 'UNVERIFIED'; flags.push('HEADER_MISSING'); }
  else if (ref.headerCount > 1) { state = 'UNVERIFIED'; flags.push('HEADER_AMBIGUOUS'); }
  else {
    headerStatus = ref.header.status; kind = ref.header.kind; state = stateOfHeaderStatus(headerStatus); date = classifyLegacyDate(ref.header.docDate);
    if (row.detailStatus && row.detailStatus !== headerStatus) flags.push('DETAIL_STATUS_DIFFERS');
    if (date.kind !== 'date') flags.push('DATE_UNUSABLE');
  }
  if (credit4 < 0 || debit4 < 0 || interest4 < 0) flags.push('NEGATIVE_AMOUNT');
  return { id: row.id, docNo: row.docNo, type: row.type, date, kind, headerStatus, state, credit4, debit4, interest4, opening: kind === 'SALDO AWAL', remark: row.remark, flags };
}

/** Per type and HEADER status sums as read from the ledger (`AMBIGUOUS` / `MISSING_HEADER` are kept apart, never counted as posted). */
export type TypeSummaryRaw = { type: string; headerStatus: string; credit: string; debit: string; interest: string; rows: number };
export type TypeSummary = { type: string; rows: number; posted4: number; pendingDebit4: number; pendingCredit4: number; voidRows: number; unverifiedRows: number; unverified4: { credit: number; debit: number } };
/** Movement sums only: opening balances, if any, are inside these movements and NOT separated (semantics unverified), so `posted4` is not a balance. */
export function summarizeTypes(raw: readonly TypeSummaryRaw[]): TypeSummary[] {
  const by = new Map<string, TypeSummary>();
  for (const r of raw) {
    const t = by.get(r.type) ?? { type: r.type, rows: 0, posted4: 0, pendingDebit4: 0, pendingCredit4: 0, voidRows: 0, unverifiedRows: 0, unverified4: { credit: 0, debit: 0 } };
    const credit = parseAmount4(r.credit), debit = parseAmount4(r.debit), interest = parseAmount4(r.interest);
    t.rows += r.rows;
    if (r.headerStatus === 'AMBIGUOUS' || r.headerStatus === 'MISSING_HEADER') { t.unverifiedRows += r.rows; t.unverified4.credit += credit + interest; t.unverified4.debit += debit; }
    else {
      const state = stateOfHeaderStatus(r.headerStatus);
      if (state === 'POSTED') t.posted4 += credit + interest - debit;
      else if (state === 'PENDING') { t.pendingCredit4 += credit + interest; t.pendingDebit4 += debit; }
      else t.voidRows += r.rows;
    }
    if (![t.posted4, t.pendingDebit4, t.pendingCredit4].every(Number.isSafeInteger)) throw new KosipaError('AMOUNT_INVALID');
    by.set(r.type, t);
  }
  return [...by.values()].sort((a, b) => a.type.localeCompare(b.type));
}
