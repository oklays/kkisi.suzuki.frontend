import {
  KosipaError, LOAN_HEADER_LIMIT, ROLLOVER_PAGE_SIZE, SETTLEMENT_PAGE_SIZE, buildLoanPortfolio, describeRollover, describeSettlement, parseRolloverQuery, parseSettlementQuery, summarizeSettlements,
  type LoanPortfolio, type LoanProductFilter, type PortfolioGroupRaw, type RolloverQuery, type RolloverRaw, type RolloverView, type SettlementQuery, type SettlementRaw, type SettlementSummary, type SettlementSummaryRaw, type SettlementView, type UnpaidScheduleRaw, LOAN_PAGE_SIZE, LOAN_SCHEDULE_PAGE_SIZE, OFFICIAL_BALANCE, assessSchedule, describeLoan, describeScheduleRow, parseLoanDocNo, parseLoanListQuery, parseScheduleCursor, scheduleCursor,
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
  listLoans(query: Pick<LoanListQuery, 'docStatus' | 'pending' | 'disbursement' | 'repayment' | 'search' | 'afterId' | 'period' | 'product' | 'segment'>, limit: number): Promise<LoanHeaderRaw[]>;
  /** Headers grouped by (jenis, bank_pembiaya, three statuses): one bounded aggregate over every document. */
  portfolioGroups(): Promise<PortfolioGroupRaw[]>;
  /** Σ recorded 'Belum Bayar' schedule per ACTIVE document (approved, disbursed, not settled), with that document's product keys. */
  unpaidSchedule(product?: LoanProductFilter): Promise<UnpaidScheduleRaw[]>;
  listSettlements(query: SettlementQuery, limit: number): Promise<SettlementRaw[]>;
  /** The same filter without paging, grouped by settlement remark. */
  settlementSummary(query: Omit<SettlementQuery, 'afterId'>): Promise<SettlementSummaryRaw[]>;
  listRollovers(query: RolloverQuery, limit: number): Promise<RolloverRaw[]>;
  /** Roll-over links in which this document is the new loan or the old one. */
  rolloverLinks(docNo: string, limit: number): Promise<RolloverRaw[]>;
  /** Every header carrying this document number (normally one; duplicates are surfaced, not hidden). */
  loanHeaders(docNo: string, limit: number): Promise<LoanHeaderRaw[]>;
  scheduleAggregate(docNo: string): Promise<ScheduleAggregate>;
  scheduleRows(docNo: string, after: { no: number; id: number } | null, limit: number): Promise<ScheduleRowRaw[]>;
}
export type LoanActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type LoanDeps = { reader: LoanReader; audit: AuditLog; now: () => Date };

const need = (actor: LoanActor) => { if (!actor.capabilities.has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN'); };
const audit = (d: Pick<LoanDeps, 'audit' | 'now'>, a: LoanActor, action: 'kosipa.loan.list.view' | 'kosipa.loan.detail.view', subjectId: string, detail?: Record<string, unknown>) =>
  d.audit.append({ actorUserId: a.userId, action, subjectType: 'loan', subjectId: subjectId.slice(0, 64), outcome: 'success', requestId: a.requestId, detail, occurredAt: d.now() });

// ------------------------------------------------------------------------------------------------------------------ list
export type LoanListPage = { items: LoanView[]; nextCursor: number | null; filterActive: boolean };

/** Newest first by primary key (stable paging even with unsortable legacy date text). One extra row detects the next page. */
export async function listLoans(d: LoanDeps, actor: LoanActor, params: Record<string, string | string[] | undefined>): Promise<LoanListPage> {
  need(actor);
  const query = parseLoanListQuery(params);
  await audit(d, actor, 'kosipa.loan.list.view', 'loan:list', { filters: [query.docStatus, query.pending || null, query.disbursement, query.repayment, query.period, query.product, query.segment].filter(Boolean).length, search: query.search ? 1 : 0 });
  const rows = await d.reader.listLoans(query, LOAN_PAGE_SIZE + 1);
  const page = rows.slice(0, LOAN_PAGE_SIZE);
  return { items: page.map(describeLoan), nextCursor: rows.length > LOAN_PAGE_SIZE ? page[page.length - 1].id : null, filterActive: query.docStatus !== null || !!query.pending || query.disbursement !== null || query.repayment !== null || query.search !== null || query.period !== null || query.segment !== null };
}

// ----------------------------------------------------------------------------------------------------------- portfolio
/** Per-product summary of every loan document (header figures only; fast). The unpaid schedule is read separately. */
export async function readLoanPortfolio(d: LoanDeps, actor: LoanActor): Promise<LoanPortfolio> {
  need(actor);
  await audit(d, actor, 'kosipa.loan.list.view', 'loan:portfolio');
  return buildLoanPortfolio(await d.reader.portfolioGroups(), null);
}
/**
 * Recorded unpaid schedule of the active documents per product and segment (one scan of the schedule table, which has no doc_no index).
 * A timeout or read failure is an explicit `unavailable`, never a zero. Returns the same shape as the portfolio so cells can look values up.
 */
export async function readUnpaidSchedule(d: LoanDeps, actor: LoanActor, product?: LoanProductFilter): Promise<{ state: 'ok'; portfolio: LoanPortfolio } | { state: 'unavailable' }> {
  need(actor);
  let rows: UnpaidScheduleRaw[];
  try { rows = await d.reader.unpaidSchedule(product); } catch (error) { if (error instanceof KosipaError) throw error; return { state: 'unavailable' }; }
  return { state: 'ok', portfolio: buildLoanPortfolio([], rows) };
}

// --------------------------------------------------------------------------------------------- settlements & roll-over
/** `summary` covers the same filter WITHOUT the remark, so every remark keeps its count while one of them is selected. */
export type SettlementPage = { items: SettlementView[]; nextCursor: number | null; summary: SettlementSummary; query: SettlementQuery };
export async function listSettlements(d: LoanDeps, actor: LoanActor, params: Record<string, string | string[] | undefined>): Promise<SettlementPage> {
  need(actor);
  const query = parseSettlementQuery(params);
  await audit(d, actor, 'kosipa.loan.list.view', 'loan:settlements', { filters: [query.product, query.remark, query.period].filter(Boolean).length, search: query.search ? 1 : 0 });
  const [rows, summary] = await Promise.all([d.reader.listSettlements(query, SETTLEMENT_PAGE_SIZE + 1), d.reader.settlementSummary({ product: query.product, remark: null, period: query.period, search: query.search })]);
  const page = rows.slice(0, SETTLEMENT_PAGE_SIZE);
  return { items: page.map(describeSettlement), nextCursor: rows.length > SETTLEMENT_PAGE_SIZE ? page[page.length - 1].id : null, summary: summarizeSettlements(summary), query };
}
export type RolloverPage = { items: RolloverView[]; nextCursor: number | null };
export async function listRollovers(d: LoanDeps, actor: LoanActor, params: Record<string, string | string[] | undefined>): Promise<RolloverPage> {
  need(actor);
  const query = parseRolloverQuery(params);
  await audit(d, actor, 'kosipa.loan.list.view', 'loan:rollovers', { search: query.search ? 1 : 0 });
  const rows = await d.reader.listRollovers(query, ROLLOVER_PAGE_SIZE + 1);
  const page = rows.slice(0, ROLLOVER_PAGE_SIZE);
  return { items: page.map(describeRollover), nextCursor: rows.length > ROLLOVER_PAGE_SIZE ? page[page.length - 1].id : null };
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
  /** Roll-over links that name this document (as the new or the old loan); unavailable on a read failure. */
  rollovers: { state: 'ok'; rows: RolloverView[] } | { state: 'unavailable' };
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
  const [schedule, rollovers] = await Promise.all([
    (async (): Promise<ScheduleSection> => {
      try {
        const [aggregate, rows] = await Promise.all([
          d.reader.scheduleAggregate(docNo),
          d.reader.scheduleRows(docNo, after, LOAN_SCHEDULE_PAGE_SIZE + 1),
        ]);
        const page = rows.slice(0, LOAN_SCHEDULE_PAGE_SIZE);
        return { state: 'ok', integrity: assessSchedule(loan, aggregate, headers.length), rows: page.map(describeScheduleRow), nextCursor: rows.length > LOAN_SCHEDULE_PAGE_SIZE ? scheduleCursor(page[page.length - 1]) : null };
      } catch (error) {
        if (error instanceof KosipaError) throw error;   // e.g. a stored amount that cannot be parsed is surfaced as data corruption, never silently skipped
        return { state: 'unavailable', reason: 'READ_FAILED' };
      }
    })(),
    (async (): Promise<LoanDetail['rollovers']> => {
      try { return { state: 'ok', rows: (await d.reader.rolloverLinks(docNo, 20)).map(describeRollover) }; }
      catch (error) { if (error instanceof KosipaError) throw error; return { state: 'unavailable' }; }
    })(),
  ]);
  return { loan, headerCount: headers.length, otherHeaders: views.slice(1), officialBalance: OFFICIAL_BALANCE, schedule, rollovers };
}
