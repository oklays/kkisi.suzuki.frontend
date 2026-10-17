import {
  KosipaError, LOAN_HEADER_LIMIT, LOAN_PAGE_SIZE, LOAN_SCHEDULE_PAGE_SIZE, OFFICIAL_BALANCE, assessSchedule, describeLoan, describeScheduleRow, parseLoanDocNo, parseLoanListQuery, parseScheduleCursor, scheduleCursor,
  type LoanHeaderRaw, type LoanListQuery, type LoanView, type ScheduleAggregate, type ScheduleIntegrity, type ScheduleRowRaw, type ScheduleRowView,
} from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { AuditLog } from '../console/identity-links.ts';

/**
 * Read-only KOSIPA loans (spec REQ-024, TASK-026). Nothing here writes or recomputes a loan: it presents what the legacy tables
 * RECORDED, plus integrity findings over those records. The official outstanding balance is always `unavailable`
 * (OFFICIAL_BALANCE_UNVERIFIED) until the legacy balance views are verified (TASK-003). Every read is bounded and keyset-paginated.
 */
export interface LoanReader {
  listLoans(query: Pick<LoanListQuery, 'docStatus' | 'disbursement' | 'repayment' | 'search' | 'afterId'>, limit: number): Promise<LoanHeaderRaw[]>;
  /** Every header carrying this document number (normally one; duplicates are surfaced, not hidden). */
  loanHeaders(docNo: string, limit: number): Promise<LoanHeaderRaw[]>;
  scheduleAggregate(docNo: string): Promise<ScheduleAggregate>;
  scheduleRows(docNo: string, after: { no: number; id: number } | null, limit: number): Promise<ScheduleRowRaw[]>;
}
export type LoanActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type LoanDeps = { reader: LoanReader; audit: AuditLog; now: () => Date };

const need = (actor: LoanActor) => { if (!actor.capabilities.has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN'); };
const audit = (d: LoanDeps, a: LoanActor, action: 'kosipa.loan.list.view' | 'kosipa.loan.detail.view', subjectId: string, detail?: Record<string, unknown>) =>
  d.audit.append({ actorUserId: a.userId, action, subjectType: 'loan', subjectId: subjectId.slice(0, 64), outcome: 'success', requestId: a.requestId, detail, occurredAt: d.now() });

// ------------------------------------------------------------------------------------------------------------------ list
export type LoanListPage = { items: LoanView[]; nextCursor: number | null; filterActive: boolean };

/** Newest first by primary key (stable paging even with unsortable legacy date text). One extra row detects the next page. */
export async function listLoans(d: LoanDeps, actor: LoanActor, params: Record<string, string | string[] | undefined>): Promise<LoanListPage> {
  need(actor);
  const query = parseLoanListQuery(params);
  await audit(d, actor, 'kosipa.loan.list.view', 'loan:list', { filters: [query.docStatus, query.disbursement, query.repayment].filter(Boolean).length, search: query.search ? 1 : 0 });
  const rows = await d.reader.listLoans(query, LOAN_PAGE_SIZE + 1);
  const page = rows.slice(0, LOAN_PAGE_SIZE);
  return { items: page.map(describeLoan), nextCursor: rows.length > LOAN_PAGE_SIZE ? page[page.length - 1].id : null, filterActive: query.docStatus !== null || query.disbursement !== null || query.repayment !== null || query.search !== null };
}

// ---------------------------------------------------------------------------------------------------------------- detail
export type ScheduleSection =
  | { state: 'ok'; integrity: ScheduleIntegrity; rows: ScheduleRowView[]; nextCursor: string | null }
  | { state: 'unavailable'; reason: 'READ_FAILED' };
export type LoanDetail = {
  loan: LoanView; headerCount: number; otherHeaders: LoanView[];
  /** Always unavailable until the legacy balance views are verified. The recorded schedule sums are informational, not a balance. */
  officialBalance: typeof OFFICIAL_BALANCE;
  schedule: ScheduleSection;
};

export async function readLoan(d: LoanDeps, actor: LoanActor, input: { docNo: unknown; after?: string }): Promise<LoanDetail | null> {
  need(actor);
  const docNo = parseLoanDocNo(input.docNo);
  const after = parseScheduleCursor(input.after);
  await audit(d, actor, 'kosipa.loan.detail.view', `loan:${docNo}`, { paged: after ? 1 : 0 });
  const headers = await d.reader.loanHeaders(docNo, LOAN_HEADER_LIMIT + 1);
  if (headers.length === 0) return null;
  const views = headers.slice(0, LOAN_HEADER_LIMIT).map(describeLoan);
  const loan = views[0];
  let schedule: ScheduleSection;
  try {
    const aggregate = await d.reader.scheduleAggregate(docNo);
    const rows = await d.reader.scheduleRows(docNo, after, LOAN_SCHEDULE_PAGE_SIZE + 1);
    const page = rows.slice(0, LOAN_SCHEDULE_PAGE_SIZE);
    schedule = { state: 'ok', integrity: assessSchedule(loan, aggregate, headers.length), rows: page.map(describeScheduleRow), nextCursor: rows.length > LOAN_SCHEDULE_PAGE_SIZE ? scheduleCursor(page[page.length - 1]) : null };
  } catch (error) {
    if (error instanceof KosipaError) throw error;   // e.g. a stored amount that cannot be parsed is surfaced as data corruption, never silently skipped
    schedule = { state: 'unavailable', reason: 'READ_FAILED' };
  }
  return { loan, headerCount: headers.length, otherHeaders: views.slice(1), officialBalance: OFFICIAL_BALANCE, schedule };
}
