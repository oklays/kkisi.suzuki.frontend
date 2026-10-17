import { KosipaError } from './errors.ts';
import {
  GROUP_LABEL, PAYROLL_COMPONENT_COLUMNS, STORE_COLUMNS, assessBatch, componentGroup, parseAmount4,
  type BatchHeader, type ComponentGroup, type IntegrityIssue, type PayrollComponentColumn, type PayrollStatus, type StoreColumn,
} from './payroll-read.ts';

/**
 * Read-only KOSIPA reports and data-quality diagnostics (checkpoint 9). Everything here describes what the legacy tables RECORDED:
 * no official balance, no repair, no normalisation of malformed history. Anomalies are counted and sampled (bounded), never dropped.
 */
export const REPORT_SAMPLE_LIMIT = 20;
export const REPORT_GROUP_CAP = 1000;   // "at least" counts for GROUP BY ... HAVING scans stop here and are labelled as capped

export function parseReportYear(raw: string | string[] | undefined): number | null {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (v === '') return null;
  if (!/^\d{4}$/.test(v) || Number(v) < 2000 || Number(v) > 2100) throw new KosipaError('PERIOD_INVALID');
  return Number(v);
}

// ------------------------------------------------------------------------------------------------------------------ loans
export type LoanBucketRaw = { bucket: string; docStatus: string | null; repayment: string | null; count: number; planPrincipal: string };
export type LoanStatusLine = { docStatus: string | null; repayment: string | null; count: number; plan4: number };
export type LoanMonth = { bucket: string; count: number; plan4: number; lines: LoanStatusLine[] };
export type UnusableDateKind = 'ZERO' | 'MISSING' | 'IMPLAUSIBLE';
export type LoanReport = {
  year: number | null; years: number[]; months: LoanMonth[];
  /** Loans whose document date cannot place them in a month: counted apart, never assigned to a guessed month. */
  unusableDates: { kind: UnusableDateKind; count: number; plan4: number }[];
  totals: { count: number; plan4: number };
};
const MONTH_BUCKET = /^\d{4}-(0[1-9]|1[0-2])$/;
export function buildLoanReport(year: number | null, years: readonly number[], rows: readonly LoanBucketRaw[]): LoanReport {
  const months = new Map<string, LoanMonth>(); const unusable = new Map<UnusableDateKind, { kind: UnusableDateKind; count: number; plan4: number }>();
  let count = 0, plan4 = 0;
  for (const r of rows) {
    const p = parseAmount4(r.planPrincipal);
    count += r.count; plan4 += p;
    if (MONTH_BUCKET.test(r.bucket)) {
      const m = months.get(r.bucket) ?? { bucket: r.bucket, count: 0, plan4: 0, lines: [] };
      m.count += r.count; m.plan4 += p; m.lines.push({ docStatus: r.docStatus, repayment: r.repayment, count: r.count, plan4: p }); months.set(r.bucket, m);
    } else {
      const kind: UnusableDateKind = r.bucket === 'ZERO' ? 'ZERO' : r.bucket === 'MISSING' ? 'MISSING' : 'IMPLAUSIBLE';
      const u = unusable.get(kind) ?? { kind, count: 0, plan4: 0 }; u.count += r.count; u.plan4 += p; unusable.set(kind, u);
    }
  }
  if (!Number.isSafeInteger(plan4)) throw new KosipaError('AMOUNT_INVALID');
  for (const m of months.values()) m.lines.sort((a, b) => `${a.docStatus}|${a.repayment}`.localeCompare(`${b.docStatus}|${b.repayment}`));
  return { year, years: [...years].sort((a, b) => b - a), months: [...months.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)), unusableDates: [...unusable.values()].sort((a, b) => a.kind.localeCompare(b.kind)), totals: { count, plan4 } };
}

// ---------------------------------------------------------------------------------------------------------------- payroll
export type PayrollAggregateRaw = { docNo: string; rowCount: number; distinctNik: number; rowsTotal: string; potonganToko: string; componentTotals: Partial<Record<PayrollComponentColumn, string>> };
export type PayrollPeriodBatch = {
  header: BatchHeader; status: PayrollStatus | 'UNKNOWN'; issues: IntegrityIssue[]; rows: number; distinctNik: number; headerTotal4: number | null; rowsTotal4: number;
  groups: { group: ComponentGroup; label: string; amount4: number }[]; toko4: Record<StoreColumn, number>;
};
export type PayrollPeriod = {
  period: string; batches: PayrollPeriodBatch[]; rowsTotal4: number; headerTotal4: number; rows: number;
  groups: { group: ComponentGroup; label: string; amount4: number }[]; toko4: Record<StoreColumn, number>; openBatches: number; issueCount: number;
  /** The store reconciliation needs a usable period (year and month text columns); a period built from unusable text is `UNKNOWN` and not reconcilable. */
  reconcilable: boolean;
};
export type PayrollReport = { year: number | null; years: number[]; periods: PayrollPeriod[]; headersWithoutRows: number; totals: { batches: number; rowsTotal4: number } };
const GROUP_ORDER: ComponentGroup[] = ['toko', 'ppob', 'piutang', 'kasbon', 'simpanan', 'lainnya'];
const groupSums = (totals: Partial<Record<PayrollComponentColumn, string>>) => {
  const by = new Map<ComponentGroup, number>();
  for (const c of PAYROLL_COMPONENT_COLUMNS) { const v = totals[c]; if (v === undefined) continue; const a = parseAmount4(v); if (a !== 0) by.set(componentGroup(c), (by.get(componentGroup(c)) ?? 0) + a); }
  return by;
};
export function buildPayrollReport(year: number | null, years: readonly number[], headers: readonly BatchHeader[], aggregates: readonly PayrollAggregateRaw[]): PayrollReport {
  const agg = new Map(aggregates.map((a) => [a.docNo, a]));
  const periods = new Map<string, PayrollPeriod & { _g: Map<ComponentGroup, number> }>();
  let headersWithoutRows = 0, rowsTotal4 = 0;
  for (const h of headers) {
    const a = agg.get(h.docNo) ?? { docNo: h.docNo, rowCount: 0, distinctNik: 0, rowsTotal: '0', potonganToko: '0', componentTotals: {} };
    const integrity = assessBatch(h, { rowCount: a.rowCount, distinctNik: a.distinctNik, rowsTotal: a.rowsTotal });
    if (a.rowCount === 0) headersWithoutRows++;
    const valid = h.periodYear !== null && h.periodMonth !== null && /^\d{4}$/.test(h.periodYear) && /^(0[1-9]|1[0-2])$/.test(h.periodMonth);
    const key = valid ? `${h.periodYear}-${h.periodMonth}` : 'UNKNOWN';
    const g = groupSums(a.componentTotals);
    const toko4 = { TOKO_TAMBUN: parseAmount4(a.componentTotals.TOKO_TAMBUN ?? '0'), TOKO_MJ: parseAmount4(a.componentTotals.TOKO_MJ ?? '0'), TOKO_GIIC: parseAmount4(a.componentTotals.TOKO_GIIC ?? '0') };
    const batch: PayrollPeriodBatch = { header: h, status: integrity.status, issues: integrity.issues, rows: a.rowCount, distinctNik: a.distinctNik, headerTotal4: integrity.headerTotal4, rowsTotal4: integrity.rowsTotal4, groups: GROUP_ORDER.filter((x) => g.has(x)).map((x) => ({ group: x, label: GROUP_LABEL[x], amount4: g.get(x) as number })), toko4 };
    const p = periods.get(key) ?? { period: key, batches: [], rowsTotal4: 0, headerTotal4: 0, rows: 0, groups: [], toko4: { TOKO_TAMBUN: 0, TOKO_MJ: 0, TOKO_GIIC: 0 }, openBatches: 0, issueCount: 0, reconcilable: valid, _g: new Map<ComponentGroup, number>() };
    p.batches.push(batch); p.rowsTotal4 += batch.rowsTotal4; p.headerTotal4 += batch.headerTotal4 ?? 0; p.rows += batch.rows; p.issueCount += batch.issues.length; if (batch.status !== 'APPROVED') p.openBatches++;
    for (const [k, v] of g) p._g.set(k, (p._g.get(k) ?? 0) + v);
    for (const c of STORE_COLUMNS) p.toko4[c] += toko4[c];
    rowsTotal4 += batch.rowsTotal4; periods.set(key, p);
  }
  if (!Number.isSafeInteger(rowsTotal4)) throw new KosipaError('AMOUNT_INVALID');
  const out = [...periods.values()].map(({ _g, ...p }) => ({ ...p, groups: GROUP_ORDER.filter((x) => _g.has(x)).map((x) => ({ group: x, label: GROUP_LABEL[x], amount4: _g.get(x) as number })) }));
  out.sort((a, b) => (a.period === 'UNKNOWN' ? 1 : b.period === 'UNKNOWN' ? -1 : b.period.localeCompare(a.period)));
  return { year, years: [...years].sort((a, b) => b - a), periods: out, headersWithoutRows, totals: { batches: headers.length, rowsTotal4 } };
}

// --------------------------------------------------------------------------------------------------------- data quality
export type Capped<T> = { total: number; capped: boolean; sample: T[] };
export const capped = <T>(total: number, capFlag: boolean, sample: readonly T[]): Capped<T> => ({ total, capped: capFlag, sample: sample.slice(0, REPORT_SAMPLE_LIMIT) });

export type InstallmentDocRaw = { docNo: string; rows: number };
export type LoanDocRaw = { docNo: string; docStatus: string | null };
export type OrphanScan = {
  installmentDocs: number; installmentRows: number;
  /** Installment rows whose loan document does not exist (compared by document number only; a duplicated number is reported separately). */
  orphanDocs: Capped<{ docNo: string; rows: number }>; orphanRows: number;
  /** APPROVED loans with no installment row at all. */
  approvedWithoutSchedule: Capped<{ docNo: string }>;
};
export function classifyOrphans(installmentDocs: readonly InstallmentDocRaw[], loanDocs: readonly LoanDocRaw[]): OrphanScan {
  const loans = new Set(loanDocs.map((l) => l.docNo)); const scheduled = new Set(installmentDocs.map((d) => d.docNo));
  const orphans = installmentDocs.filter((d) => !loans.has(d.docNo)).sort((a, b) => b.rows - a.rows || a.docNo.localeCompare(b.docNo));
  const unscheduled = [...new Set(loanDocs.filter((l) => l.docStatus === 'APPROVED' && !scheduled.has(l.docNo)).map((l) => l.docNo))].sort();
  return {
    installmentDocs: installmentDocs.length, installmentRows: installmentDocs.reduce((t, d) => t + d.rows, 0),
    orphanDocs: capped(orphans.length, false, orphans), orphanRows: orphans.reduce((t, d) => t + d.rows, 0), approvedWithoutSchedule: capped(unscheduled.length, false, unscheduled.map((docNo) => ({ docNo }))),
  };
}

export type BatchTotalFinding = { docNo: string; issues: IntegrityIssue[]; headerTotal4: number | null; rowsTotal4: number; differenceFrom4: number | null };
/** Header/detail findings per batch, plus batch ids that rows reference without a header. Nothing is repaired. */
export function classifyBatchTotals(headers: readonly BatchHeader[], aggregates: readonly PayrollAggregateRaw[]): { findings: Capped<BatchTotalFinding>; rowsWithoutHeader: Capped<{ docNo: string; rows: number }>; checked: number } {
  const agg = new Map(aggregates.map((a) => [a.docNo, a])); const known = new Set(headers.map((h) => h.docNo));
  const findings: BatchTotalFinding[] = [];
  for (const h of headers) {
    const a = agg.get(h.docNo) ?? { rowCount: 0, distinctNik: 0, rowsTotal: '0' };
    const i = assessBatch(h, { rowCount: a.rowCount, distinctNik: a.distinctNik, rowsTotal: a.rowsTotal });
    const relevant = i.issues.filter((x) => x === 'HEADER_TOTAL_MISMATCH' || x === 'NO_ROWS' || x === 'HEADER_TOTAL_MISSING' || x === 'DUPLICATE_NIK_ROWS' || x === 'STATUS_UNKNOWN');
    if (relevant.length) findings.push({ docNo: h.docNo, issues: relevant, headerTotal4: i.headerTotal4, rowsTotal4: i.rowsTotal4, differenceFrom4: i.differenceFrom4 });
  }
  const orphan = aggregates.filter((a) => !known.has(a.docNo)).map((a) => ({ docNo: a.docNo, rows: a.rowCount }));
  return { findings: capped(findings.length, false, findings), rowsWithoutHeader: capped(orphan.length, false, orphan), checked: headers.length };
}

// ------------------------------------------------------------------------------------------------- diagnostic classification
/**
 * What kind of statement a diagnostic makes, so a reader never mistakes a hint for a proof:
 *  CONFIRMED            the recorded data contradicts itself or a rule (e.g. REJECTED and LUNAS on one document)
 *  POTENTIAL            consistent with an anomaly but also with a legitimate cause (e.g. an installment document number absent from the loan table)
 *  EXPECTED_PRECISION   a sub-sen difference explained by decimal storage; not material
 *  UNVERIFIED           a comparison whose basis is not confirmed (inferred branch map)
 * Independent of the kind, a SCAN has a status: OK, FAILED (could not be read), TRUNCATED (source larger than the safe bound). A failed or
 * truncated scan has NO count and is never shown as zero problems.
 */
export type DiagnosticKind = 'CONFIRMED' | 'POTENTIAL' | 'EXPECTED_PRECISION' | 'UNVERIFIED';
export type ScanStatus = 'OK' | 'FAILED' | 'TRUNCATED' | 'RESTRICTED';
export const DIAGNOSTIC_KIND: Readonly<Record<string, DiagnosticKind>> = {
  duplicateRefs: 'CONFIRMED', statusConflicts: 'CONFIRMED', loanDates: 'CONFIRMED', installmentDates: 'CONFIRMED', orphanInstallments: 'POTENTIAL', approvedWithoutSchedule: 'POTENTIAL',
  batchTotals: 'CONFIRMED', rowTotalsMaterial: 'CONFIRMED', rowTotalsSubSen: 'EXPECTED_PRECISION', rowTotalsNoComponents: 'POTENTIAL', duplicateBatchNik: 'CONFIRMED', branchMapping: 'UNVERIFIED',
};
export const scanStatusOf = (part: { state: 'ok' } | { state: 'unavailable'; reason: string }): ScanStatus => (part.state === 'ok' ? 'OK' : part.reason === 'SOURCE_TRUNCATED' ? 'TRUNCATED' : 'FAILED');
