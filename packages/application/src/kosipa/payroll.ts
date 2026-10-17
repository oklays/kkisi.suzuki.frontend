import {
  KosipaError, PAYROLL_HISTORY_LIMIT, PAYROLL_MEMBER_PAGE_SIZE, PAYROLL_PAGE_SIZE, DEFAULT_STORE_COLUMN_MAP, STORE_COLUMNS, assessBatch, classifyLegacyDate, deriveStoreObligations, describeRow,
  isDifference, nikLookupKeys, parseAmount4, parseBatchListQuery, parseCursor, parseDocNo, parseMemberFilter, parsePayrollPeriod, periodColumns, periodLabel, periodSourceWindow, reconcileStoreCredit,
  type Anomaly, type BatchHeader, type BatchIntegrity, type BatchListQuery, type Difference, type KreditReturnRow, type KreditSaleRow, type LegacyDate, type MemberSearch,
  type PayrollComponentColumn, type PayrollPeriod, type PayrollStatus, type ReconciliationRow, type ReconciliationSummary, type RecordedAmounts, type RowBreakdown, type StoreColumn, type StoreColumnMap,
} from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { AuditLog } from '../console/identity-links.ts';

/**
 * Read-only KOSIPA payroll (spec REQ-025, TASK-027). Nothing here writes, approves, posts, generates or repairs anything: it
 * presents what the legacy tables RECORDED and, separately, a derived store-credit figure for review. Every read is bounded
 * (page size, window, row cap), ordered deterministically and paginated by keyset (last primary key / last key).
 */

// ------------------------------------------------------------------------------------------------------------------ port
export type MatrixListRow = { id: number; nik: string; name: string; group: string; total: string; potonganToko: string; ppob: string; toko: Record<StoreColumn, string> };
export type MatrixFullRow = { id: number; nik: string; name: string; group: string; amounts: RecordedAmounts };
export type BatchAggregate = { rowCount: number; distinctNik: number; rowsTotal: string; componentTotals: Partial<Record<PayrollComponentColumn, string>>; potonganToko: string };
export type HistoryRow = { id: number; docNo: string; total: string; toko: Record<StoreColumn, string> };
export type HeaderLookup = { docNo: string; headerCount: number; header: BatchHeader | null };
export type InstallmentRow = { id: number; loanDocNo: string; installmentNo: number | null; dueRaw: string | null; principal: string; interest: string; total: string; status: string | null; type: string | null };
export type InstallmentDateSummary = { total: number; unpaid: number; zeroDue: number; missingDue: number; implausibleDue: number };
export type RecordedStoreRaw = { nik: string; amounts: Record<StoreColumn, string>; rows: number };

/** SELECT-only reader over the business database (existing pool; every statement time-capped). */
export interface PayrollReader {
  listBatches(query: Pick<BatchListQuery, 'period' | 'status' | 'group' | 'afterId'>, limit: number): Promise<BatchHeader[]>;
  batchHeader(docNo: string): Promise<BatchHeader | null>;
  batchAggregate(docNo: string): Promise<BatchAggregate>;
  batchRows(docNo: string, search: MemberSearch | null, afterId: number | null, limit: number): Promise<MatrixListRow[]>;
  memberRows(docNo: string, nikKeys: string[]): Promise<MatrixFullRow[]>;
  periodBatches(period: PayrollPeriod): Promise<BatchHeader[]>;
  periodRecordedStore(docNos: readonly string[]): Promise<RecordedStoreRaw[]>;
  kreditSales(window: { from: string; toExclusive: string }, cap: number): Promise<{ rows: KreditSaleRow[]; truncated: boolean }>;
  kreditReturns(window: { from: string; toExclusive: string }, cap: number): Promise<{ rows: KreditReturnRow[]; truncated: boolean }>;
  memberHistory(nikKeys: string[], beforeId: number | null, limit: number): Promise<HistoryRow[]>;
  headersByDocNo(docNos: readonly string[]): Promise<HeaderLookup[]>;
  memberInstallments(nikKeys: string[], window: { from: string; toExclusive: string }, limit: number): Promise<InstallmentRow[]>;
  memberInstallmentSummary(nikKeys: string[]): Promise<InstallmentDateSummary>;
  loanHeadersPresent(docNos: readonly string[]): Promise<Set<string>>;
}

export type PayrollActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type PayrollDeps = { reader: PayrollReader; audit: AuditLog; now: () => Date; storeColumnMap?: StoreColumnMap };
export type Section<T> = { state: 'ok'; data: T } | { state: 'restricted' } | { state: 'unavailable'; reason: string };

const need = (actor: PayrollActor, ...caps: Parameters<CapabilitySet['has']>[0][]) => { for (const c of caps) if (!actor.capabilities.has(c)) throw new KosipaError('FORBIDDEN'); };
/** Audit BEFORE any financial data is read: if the audit cannot be written, nothing is read (fail closed). Opaque subject only. */
const audit = (d: PayrollDeps, a: PayrollActor, action: 'kosipa.payroll.list.view' | 'kosipa.payroll.batch.view' | 'kosipa.payroll.member.view' | 'kosipa.payroll.reconcile', docNo: string, detail?: Record<string, unknown>) =>
  d.audit.append({ actorUserId: a.userId, action, subjectType: 'payroll', subjectId: `payroll:${docNo}`.slice(0, 64), outcome: 'success', requestId: a.requestId, detail, occurredAt: d.now() });

// ----------------------------------------------------------------------------------------------------------- batch list
export type BatchListItem = { header: BatchHeader; status: PayrollStatus | 'UNKNOWN'; periodDate: LegacyDate; cashDate: LegacyDate; headerTotal4: number | null };
export type BatchListPage = { items: BatchListItem[]; nextCursor: number | null; filter: Pick<BatchListQuery, 'period' | 'status' | 'group'> };

const statusOf = (header: Pick<BatchHeader, 'status'>): PayrollStatus | 'UNKNOWN' => (header.status === 'OPEN' || header.status === 'APPROVED' ? header.status : 'UNKNOWN');

export function describeHeader(header: BatchHeader): BatchListItem {
  const status = statusOf(header);
  return { header, status, periodDate: classifyLegacyDate(header.periodDate), cashDate: classifyLegacyDate(header.cashDate), headerTotal4: header.headerTotal === null ? null : parseAmount4(header.headerTotal) };
}

/** Header-level list, newest first (by primary key, so paging is stable even though period text columns are not sortable dates). */
export async function listPayrollBatches(d: PayrollDeps, actor: PayrollActor, params: Record<string, string | string[] | undefined>): Promise<BatchListPage> {
  need(actor, 'kosipa.payroll.view');
  const query = parseBatchListQuery(params);
  // Owner decision A4 (checkpoint 12): the list carries header totals, so it is audited like every other payroll read — before the read, fail closed.
  // Detail holds only which filters were used and whether this is a later page: no period value, amount, NIK or name.
  await audit(d, actor, 'kosipa.payroll.list.view', 'list', { filters: [query.period, query.status, query.group].filter(Boolean).length, paged: query.afterId === null ? 0 : 1 });
  const rows = await d.reader.listBatches(query, PAYROLL_PAGE_SIZE + 1);
  const page = rows.slice(0, PAYROLL_PAGE_SIZE);
  return { items: page.map(describeHeader), nextCursor: rows.length > PAYROLL_PAGE_SIZE ? page[page.length - 1].id : null, filter: { period: query.period, status: query.status, group: query.group } };
}

// -------------------------------------------------------------------------------------------------------- batch detail
export type MemberRowView = { id: number; nik: string; name: string; group: string; total4: number; toko4: Record<StoreColumn, number>; ppob4: number; tokoSubtotalMatches: boolean };
export type BatchDetail = {
  header: BatchListItem; integrity: BatchIntegrity; rowCount: number; distinctNik: number;
  /** Component totals described with the same rules as a single row (informational sum check against the recorded sum). */
  totals: RowBreakdown;
  rows: MemberRowView[]; nextCursor: number | null; filterActive: boolean;
};

export async function readPayrollBatch(d: PayrollDeps, actor: PayrollActor, input: { docNo: unknown; q?: string; after?: string }): Promise<BatchDetail | null> {
  need(actor, 'kosipa.payroll.view');
  const docNo = parseDocNo(input.docNo);
  const search = parseMemberFilter(input.q);
  const after = parseCursor(input.after);
  await audit(d, actor, 'kosipa.payroll.batch.view', docNo, { filter: search ? 1 : 0 });
  const header = await d.reader.batchHeader(docNo);
  if (!header) return null;
  const aggregate = await d.reader.batchAggregate(docNo);
  const rows = await d.reader.batchRows(docNo, search, after, PAYROLL_MEMBER_PAGE_SIZE + 1);
  const page = rows.slice(0, PAYROLL_MEMBER_PAGE_SIZE);
  return {
    header: describeHeader(header),
    integrity: assessBatch(header, { rowCount: aggregate.rowCount, distinctNik: aggregate.distinctNik, rowsTotal: aggregate.rowsTotal }),
    rowCount: aggregate.rowCount, distinctNik: aggregate.distinctNik,
    totals: describeRow({ ...aggregate.componentTotals, total_potongan: aggregate.rowsTotal, potongan_toko: aggregate.potonganToko }),
    rows: page.map((r) => ({
      id: r.id, nik: r.nik, name: r.name, group: r.group, total4: parseAmount4(r.total), ppob4: parseAmount4(r.ppob),
      toko4: { TOKO_TAMBUN: parseAmount4(r.toko.TOKO_TAMBUN), TOKO_MJ: parseAmount4(r.toko.TOKO_MJ), TOKO_GIIC: parseAmount4(r.toko.TOKO_GIIC) },
      tokoSubtotalMatches: parseAmount4(r.potonganToko) === STORE_COLUMNS.reduce((t, c) => t + parseAmount4(r.toko[c]), 0),
    })),
    nextCursor: rows.length > PAYROLL_MEMBER_PAGE_SIZE ? page[page.length - 1].id : null, filterActive: search !== null,
  };
}

// ------------------------------------------------------------------------------------------------------- member in batch
export type InstallmentView = { id: number; loanDocNo: string; installmentNo: number | null; due: LegacyDate; principal4: number; interest4: number; total4: number; status: string | null; type: string | null; parent: 'PRESENT' | 'MISSING' };
export type MemberInBatch = {
  header: BatchListItem; nik: string;
  rows: { id: number; name: string; group: string; breakdown: RowBreakdown }[];
  /** More than one recorded row for this member in this batch: shown separately and flagged, never merged silently. */
  duplicateRows: boolean;
  installments: Section<{ window: { from: string; toExclusive: string }; items: InstallmentView[]; truncated: boolean; orphanParents: number; quality: InstallmentDateSummary }>;
};
const INSTALLMENT_LIMIT = 50;

export async function readPayrollMember(d: PayrollDeps, actor: PayrollActor, input: { docNo: unknown; nik: unknown }): Promise<MemberInBatch | null> {
  need(actor, 'kosipa.payroll.view');
  const docNo = parseDocNo(input.docNo);
  if (typeof input.nik !== 'string') throw new KosipaError('NIK_INVALID');
  const nikKeys = nikLookupKeys(input.nik);   // throws NIK_INVALID for anything that is not a plain NIK
  await audit(d, actor, 'kosipa.payroll.member.view', docNo, { kind: 'member' });
  const header = await d.reader.batchHeader(docNo);
  if (!header) return null;
  const memberRows = await d.reader.memberRows(docNo, nikKeys);
  if (memberRows.length === 0) return null;                // a member who is not in this batch is simply not found
  const hd = describeHeader(header);
  let installments: MemberInBatch['installments'];
  if (!actor.capabilities.has('kosipa.loan.view')) installments = { state: 'restricted' };
  else if (hd.periodDate.kind !== 'date') installments = { state: 'unavailable', reason: 'PERIOD_DATE_UNUSABLE' };   // no guessed month
  else {
    try {
      const period = parsePayrollPeriod(hd.periodDate.iso.slice(0, 7));
      const from = `${periodLabel(period)}-01`;
      const toExclusive = period.month === 12 ? `${period.year + 1}-01-01` : `${period.year}-${String(period.month + 1).padStart(2, '0')}-01`;
      const window = { from, toExclusive };
      const rows = await d.reader.memberInstallments(nikKeys, window, INSTALLMENT_LIMIT + 1);
      const shown = rows.slice(0, INSTALLMENT_LIMIT);
      const present = await d.reader.loanHeadersPresent([...new Set(shown.map((r) => r.loanDocNo))]);
      const quality = await d.reader.memberInstallmentSummary(nikKeys);
      const items = shown.map((r): InstallmentView => ({
        id: r.id, loanDocNo: r.loanDocNo, installmentNo: r.installmentNo, due: classifyLegacyDate(r.dueRaw), principal4: parseAmount4(r.principal), interest4: parseAmount4(r.interest), total4: parseAmount4(r.total),
        status: r.status, type: r.type, parent: present.has(r.loanDocNo) ? 'PRESENT' : 'MISSING',
      }));
      installments = { state: 'ok', data: { window, items, truncated: rows.length > INSTALLMENT_LIMIT, orphanParents: items.filter((i) => i.parent === 'MISSING').length, quality } };
    } catch { installments = { state: 'unavailable', reason: 'READ_FAILED' }; }
  }
  return {
    header: hd, nik: memberRows[0].nik, duplicateRows: memberRows.length > 1, installments,
    rows: memberRows.map((r) => ({ id: r.id, name: r.name, group: r.group, breakdown: describeRow(r.amounts) })),
  };
}

// ------------------------------------------------------------------------------------------- member history (Anggota 360)
export type MemberPayrollRow = { id: number; docNo: string; total4: number; toko4: Record<StoreColumn, number>; header: { state: 'OK'; status: PayrollStatus | 'UNKNOWN'; period: string | null } | { state: 'MISSING' } | { state: 'AMBIGUOUS' } };

/** Last recorded payroll rows of one member (bounded). Headers are looked up separately so a join can never duplicate a row. */
export async function loadMemberPayrollHistory(reader: Pick<PayrollReader, 'memberHistory' | 'headersByDocNo'>, nik: string, limit: number = PAYROLL_HISTORY_LIMIT): Promise<MemberPayrollRow[]> {
  const rows = await reader.memberHistory(nikLookupKeys(nik), null, Math.min(limit, PAYROLL_HISTORY_LIMIT));
  const headers = new Map((await reader.headersByDocNo([...new Set(rows.map((r) => r.docNo))])).map((h) => [h.docNo, h]));
  return rows.map((r) => {
    const h = headers.get(r.docNo);
    const header: MemberPayrollRow['header'] = !h || h.headerCount === 0 || !h.header ? { state: 'MISSING' } : h.headerCount > 1 ? { state: 'AMBIGUOUS' }
      : { state: 'OK', status: statusOf(h.header), period: h.header.periodYear && h.header.periodMonth ? `${h.header.periodYear}-${h.header.periodMonth}` : null };
    return { id: r.id, docNo: r.docNo, total4: parseAmount4(r.total), header, toko4: { TOKO_TAMBUN: parseAmount4(r.toko.TOKO_TAMBUN), TOKO_MJ: parseAmount4(r.toko.TOKO_MJ), TOKO_GIIC: parseAmount4(r.toko.TOKO_GIIC) } };
  });
}

// ------------------------------------------------------------------------------------------------ store reconciliation
export const RECONCILIATION_PAGE_SIZE = 50;
export const SOURCE_ROW_CAP = 60000;
export type ComparabilityReason = 'STORE_COLUMN_MAP_UNCONFIRMED' | 'OPEN_BATCH_IN_PERIOD' | 'NO_APPROVED_BATCH_IN_PERIOD';
export type Reconciliation = {
  header: BatchListItem; period: string; window: { from: string; toExclusive: string };
  batches: { docNo: string; group: string | null; status: PayrollStatus | 'UNKNOWN' }[];
  /** Always review-only: the recorded values stay the official deductions; the derived values are evidence. */
  comparability: { reviewOnly: true; reasons: ComparabilityReason[]; mapBasis: StoreColumnMap['basis'] };
  summary: ReconciliationSummary; differencesOnly: boolean; rows: ReconciliationRow[]; nextCursor: string | null; anomalies: Anomaly[];
};
export type ReconciliationResult =
  | { state: 'ok'; data: Reconciliation }
  | { state: 'unavailable'; reason: 'PERIOD_UNUSABLE' | 'NO_RECORDED_ROWS' | 'SOURCE_TRUNCATED' | 'READ_FAILED'; header: BatchListItem };

const cellKey = (r: Pick<ReconciliationRow, 'nik' | 'column'>) => `${r.nik}|${r.column}`;

/**
 * Period-level comparison (a member can sit in more than one batch of the same period; 29 such pairs exist), computed on the fly
 * and returned only as evidence. Window = previous calendar month (BR-006). Differences are listed first-class: MATCH cells are
 * counted but not listed unless `all` is requested. Keyset paging over the deterministic `nik|column` order.
 */
export async function readStoreReconciliation(d: PayrollDeps, actor: PayrollActor, input: { docNo: unknown; after?: string; all?: boolean }): Promise<ReconciliationResult | null> {
  need(actor, 'kosipa.payroll.view', 'kosipa.store-credit.view');
  const docNo = parseDocNo(input.docNo);
  if (input.after !== undefined && input.after !== '' && !/^[0-9A-Za-z]{1,20}\|TOKO_[A-Z]{2,6}$/.test(input.after)) throw new KosipaError('CURSOR_INVALID');
  await audit(d, actor, 'kosipa.payroll.reconcile', docNo, { differencesOnly: !input.all });
  const raw = await d.reader.batchHeader(docNo);
  if (!raw) return null;
  const header = describeHeader(raw);
  if (header.periodDate.kind !== 'date') return { state: 'unavailable', reason: 'PERIOD_UNUSABLE', header };
  try {
    const period = parsePayrollPeriod(header.periodDate.iso.slice(0, 7));
    const cols = periodColumns(period);
    if (raw.periodYear !== cols.year || raw.periodMonth !== cols.month) return { state: 'unavailable', reason: 'PERIOD_UNUSABLE', header };   // period text and date disagree: do not pick one
    const batches = await d.reader.periodBatches(period);
    const recorded = await d.reader.periodRecordedStore(batches.map((b) => b.docNo));
    if (recorded.length === 0) return { state: 'unavailable', reason: 'NO_RECORDED_ROWS', header };
    const window = periodSourceWindow(period);
    const sales = await d.reader.kreditSales(window, SOURCE_ROW_CAP);
    const returns = await d.reader.kreditReturns(window, SOURCE_ROW_CAP);
    if (sales.truncated || returns.truncated) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED', header };   // an incomplete source would invent differences
    const map = d.storeColumnMap ?? DEFAULT_STORE_COLUMN_MAP;
    const { derived, anomalies } = deriveStoreObligations(sales.rows, returns.rows, map);
    const result = reconcileStoreCredit(recorded.map((r) => ({ nik: r.nik, amounts: r.amounts, rows: r.rows })), derived, anomalies);
    const shown = (input.all ? result.rows : result.rows.filter((r) => isDifference(r.status as Difference))).filter((r) => !input.after || cellKey(r) > input.after);
    const page = shown.slice(0, RECONCILIATION_PAGE_SIZE);
    const views = batches.map((b) => ({ docNo: b.docNo, group: b.group, status: statusOf(b) }));
    const reasons: ComparabilityReason[] = [];
    if (map.basis !== 'OWNER_CONFIRMED') reasons.push('STORE_COLUMN_MAP_UNCONFIRMED');
    if (views.some((b) => b.status !== 'APPROVED')) reasons.push('OPEN_BATCH_IN_PERIOD');
    if (!views.some((b) => b.status === 'APPROVED')) reasons.push('NO_APPROVED_BATCH_IN_PERIOD');
    return {
      state: 'ok',
      data: { header, period: periodLabel(period), window, batches: views, comparability: { reviewOnly: true, reasons, mapBasis: map.basis }, summary: result.summary, differencesOnly: !input.all,
        rows: page, nextCursor: shown.length > RECONCILIATION_PAGE_SIZE ? cellKey(page[page.length - 1]) : null, anomalies: result.anomalies },
    };
  } catch (error) {
    if (error instanceof KosipaError) throw error;
    return { state: 'unavailable', reason: 'READ_FAILED', header };
  }
}
