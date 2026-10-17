import {
  KosipaError, REPORT_GROUP_CAP, REPORT_SAMPLE_LIMIT, OFFICIAL_BALANCE, DEFAULT_STORE_COLUMN_MAP, buildLoanReport, buildPayrollReport, capped, classifyBatchTotals, classifyOrphans, parseReportYear,
  type BatchHeader, type BatchTotalFinding, type Capped, type InstallmentDocRaw, type LoanBucketRaw, type LoanDocRaw, type LoanReport, type OrphanScan, type PayrollAggregateRaw, type PayrollReport, type StoreColumnMap,
} from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { AuditLog } from '../console/identity-links.ts';

/**
 * Read-only KOSIPA loan & payroll reports and data-quality diagnostics (checkpoint 9). Recorded figures only: no official balance, no
 * repair, no join across financial tables (every comparison happens in memory over separately read, bounded sets). Each diagnostic is
 * an independent section: a timeout in one never hides the others, and an incomplete scan is reported as unavailable, never as "clean".
 */
export type DuplicateLoanRef = { docNo: string; count: number; statusCombinations: number };
export type LoanStatusConflictCounts = { rejectedSettled: number; rejectedDisbursed: number; settledNotApproved: number; disbursedNotApproved: number };
export type LoanStatusConflictRow = { docNo: string; docStatus: string | null; disbursement: string | null; repayment: string | null };
export type DateProblemCounts = { total: number; zero: number; missing: number; implausible: number };
/** Differences between total_potongan and the sum of the 59 components, in two tiers (exact = any sub-sen difference; half-sen = >= Rp 0.005) with the largest one, because sub-sen noise (14% of totals carry fractions) must not be mistaken for a material mismatch. */
export type RowTotalsRaw = { rows: number; totalDiffersFromComponents: number; totalDiffersByHalfSenOrMore: number; maxDifference: string; totalWithoutComponents: number; sample: { docNo: string; nik: string; total: string; componentSum: string }[] };
export type DuplicateBatchNik = { docNo: string; nik: string; count: number };

/** SELECT-only reader. Every method is one bounded statement (time cap, LIMIT or a single aggregate). No write method exists. */
export interface ReportReader {
  loanYears(): Promise<number[]>;
  loanBuckets(year: number | null): Promise<LoanBucketRaw[]>;
  payrollYears(): Promise<number[]>;
  payrollHeadersForYear(year: number, limit: number): Promise<BatchHeader[]>;
  payrollAggregates(docNos: readonly string[]): Promise<PayrollAggregateRaw[]>;
  // diagnostics
  duplicateLoanRefs(cap: number): Promise<DuplicateLoanRef[]>;
  loanStatusConflicts(sampleLimit: number): Promise<{ counts: LoanStatusConflictCounts; sample: LoanStatusConflictRow[] }>;
  loanDateProblems(): Promise<DateProblemCounts>;
  installmentDateProblems(): Promise<DateProblemCounts>;
  installmentDocs(cap: number): Promise<InstallmentDocRaw[]>;
  loanDocs(cap: number): Promise<LoanDocRaw[]>;
  payrollHeadersAll(cap: number): Promise<BatchHeader[]>;
  payrollAggregatesAll(cap: number): Promise<PayrollAggregateRaw[]>;
  payrollRowTotals(sampleLimit: number): Promise<RowTotalsRaw>;
  duplicateBatchNik(cap: number): Promise<DuplicateBatchNik[]>;
}
export type ReportActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type ReportDeps = { reader: ReportReader; audit: AuditLog; now: () => Date; storeColumnMap?: StoreColumnMap };
export type Part<T> = { state: 'ok'; data: T } | { state: 'unavailable'; reason: 'READ_FAILED' | 'SOURCE_TRUNCATED' };

const PAYROLL_HEADER_LIMIT = 120;
export const audit = (d: ReportDeps, a: ReportActor, action: 'kosipa.report.loan.view' | 'kosipa.report.payroll.view' | 'kosipa.report.quality.view' | 'kosipa.report.membership.view' | 'kosipa.report.savings.view' | 'kosipa.report.export', detail: Record<string, unknown>, options: { subject?: string; outcome?: 'success' | 'denied' } = {}) =>
  d.audit.append({ actorUserId: a.userId, action, subjectType: 'report', subjectId: options.subject ?? `report:${action.split('.')[2]}`, outcome: options.outcome ?? 'success', requestId: a.requestId, detail, occurredAt: d.now() });
async function section<T>(read: () => Promise<T>): Promise<Part<T>> {
  try { return { state: 'ok', data: await read() }; } catch (e) { if (e instanceof KosipaError) throw e; return { state: 'unavailable', reason: 'READ_FAILED' }; }   // malformed stored data is an error, not an "unavailable"
}

// ------------------------------------------------------------------------------------------------------------ loan report
export type LoanReportResult = { report: LoanReport; officialBalance: typeof OFFICIAL_BALANCE };
export async function readLoanReport(d: ReportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<LoanReportResult> {
  if (!actor.capabilities.has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN');
  const requested = parseReportYear(params.tahun);
  await audit(d, actor, 'kosipa.report.loan.view', { year: requested ? 1 : 0 });
  return loadLoanReport(d, requested);
}
/** Reads and builds the loan report with NO authorisation and NO audit: callers (view and export) do both first. */
export async function loadLoanReport(d: ReportDeps, requested: number | null): Promise<LoanReportResult> {
  const years = await d.reader.loanYears();
  const year = requested ?? years[0] ?? null;   // years are newest first; the default is the newest year that has loans
  const rows = await d.reader.loanBuckets(year);
  return { report: buildLoanReport(year, years, rows), officialBalance: OFFICIAL_BALANCE };
}

// -------------------------------------------------------------------------------------------------------- payroll report
export async function readPayrollReport(d: ReportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<PayrollReport> {
  if (!actor.capabilities.has('kosipa.payroll.view')) throw new KosipaError('FORBIDDEN');
  const requested = parseReportYear(params.tahun);
  await audit(d, actor, 'kosipa.report.payroll.view', { year: requested ? 1 : 0 });
  return loadPayrollReport(d, requested);
}
/** Same contract as loadLoanReport. */
export async function loadPayrollReport(d: ReportDeps, requested: number | null): Promise<PayrollReport> {
  const years = await d.reader.payrollYears();
  const year = requested ?? years[0] ?? null;
  const headers = year === null ? [] : await d.reader.payrollHeadersForYear(year, PAYROLL_HEADER_LIMIT);
  const aggregates = headers.length ? await d.reader.payrollAggregates(headers.map((h) => h.docNo)) : [];
  return buildPayrollReport(year, years, headers, aggregates);
}

// ---------------------------------------------------------------------------------------------------------- data quality
export type LoanDiagnostics = {
  duplicateRefs: Part<Capped<DuplicateLoanRef> & { conflictingStatuses: number }>;
  statusConflicts: Part<{ counts: LoanStatusConflictCounts; total: number; sample: LoanStatusConflictRow[] }>;
  loanDates: Part<DateProblemCounts>; installmentDates: Part<DateProblemCounts>; orphans: Part<OrphanScan>;
};
export type PayrollDiagnostics = {
  batchTotals: Part<ReturnType<typeof classifyBatchTotals>>;
  rowTotals: Part<RowTotalsRaw & { sample: RowTotalsRaw['sample'] }>;
  duplicateBatchNik: Part<Capped<DuplicateBatchNik>>;
};
export type DataQualityReport = {
  /** Always present: the branch (company) to payroll-column map is inferred unless an owner decision was configured. */
  branchMapping: { basis: StoreColumnMap['basis']; state: 'UNVERIFIED' | 'CONFIRMED' };
  loans: LoanDiagnostics | 'restricted'; payroll: PayrollDiagnostics | 'restricted';
};

export async function readDataQuality(d: ReportDeps, actor: ReportActor): Promise<DataQualityReport> {
  const loans = actor.capabilities.has('kosipa.loan.view'), payroll = actor.capabilities.has('kosipa.payroll.view');
  if (!loans && !payroll) throw new KosipaError('FORBIDDEN');
  await audit(d, actor, 'kosipa.report.quality.view', { loans, payroll });
  return loadDataQuality(d, loans, payroll);
}
/** Same contract as loadLoanReport; `loans` / `payroll` say which domains the caller may read. */
export async function loadDataQuality(d: ReportDeps, loans: boolean, payroll: boolean): Promise<DataQualityReport> {
  const map = d.storeColumnMap ?? DEFAULT_STORE_COLUMN_MAP;
  const r = d.reader;
  // Sequential on purpose: one reader connection per page view (the reader pool is shared with POS).
  const loanPart: LoanDiagnostics | 'restricted' = !loans ? 'restricted' : {
    duplicateRefs: await section(async () => { const rows = await r.duplicateLoanRefs(REPORT_GROUP_CAP + 1); const isCapped = rows.length > REPORT_GROUP_CAP; const kept = rows.slice(0, REPORT_GROUP_CAP); return { ...capped(kept.length, isCapped, kept), conflictingStatuses: kept.filter((x) => x.statusCombinations > 1).length }; }),
    statusConflicts: await section(async () => { const x = await r.loanStatusConflicts(REPORT_SAMPLE_LIMIT); return { counts: x.counts, total: x.counts.rejectedSettled + x.counts.rejectedDisbursed + x.counts.settledNotApproved + x.counts.disbursedNotApproved, sample: x.sample.slice(0, REPORT_SAMPLE_LIMIT) }; }),
    loanDates: await section(() => r.loanDateProblems()),
    installmentDates: await section(() => r.installmentDateProblems()),
    orphans: await (async (): Promise<Part<OrphanScan>> => {
      try {
        const dtl = await r.installmentDocs(100000 + 1); const loansDocs = await r.loanDocs(100000 + 1);
        if (dtl.length > 100000 || loansDocs.length > 100000) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };   // an incomplete set would invent orphans
        return { state: 'ok', data: classifyOrphans(dtl, loansDocs) };
      } catch (e) { if (e instanceof KosipaError) throw e; return { state: 'unavailable', reason: 'READ_FAILED' }; }
    })(),
  };
  const payrollPart: PayrollDiagnostics | 'restricted' = !payroll ? 'restricted' : {
    batchTotals: await (async (): Promise<Part<ReturnType<typeof classifyBatchTotals>>> => {
      try {
        const headers = await r.payrollHeadersAll(2001); const aggregates = await r.payrollAggregatesAll(2001);
        if (headers.length > 2000 || aggregates.length > 2000) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };
        return { state: 'ok', data: classifyBatchTotals(headers, aggregates) };
      } catch (e) { if (e instanceof KosipaError) throw e; return { state: 'unavailable', reason: 'READ_FAILED' }; }
    })(),
    rowTotals: await section(() => r.payrollRowTotals(REPORT_SAMPLE_LIMIT)),
    duplicateBatchNik: await section(async () => { const rows = await r.duplicateBatchNik(REPORT_GROUP_CAP + 1); return capped(Math.min(rows.length, REPORT_GROUP_CAP), rows.length > REPORT_GROUP_CAP, rows.slice(0, REPORT_GROUP_CAP)); }),
  };
  return { branchMapping: { basis: map.basis, state: map.basis === 'OWNER_CONFIRMED' ? 'CONFIRMED' : 'UNVERIFIED' }, loans: loanPart, payroll: payrollPart };
}
export type { BatchTotalFinding };
