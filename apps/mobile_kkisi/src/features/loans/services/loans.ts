import { assessSchedule, describeLoan, describeScheduleRow, loanSchedule, type LoanHeaderRaw, type LoanView, type ScheduleAggregate, type ScheduleRowRaw } from '@koperasi/domain/kosipa';
import type { LoanApplicationRow, LoanProductRow } from '../../../server/kosipa/member.reader.ts';
import { dayLabel, legacyDayLabel, monthShort, titleCase } from '../../../lib/utils/dates.ts';
import { senOf } from '../../../lib/utils/money.ts';
import { requestStatus } from '../../savings/services/savings.ts';

// Loan view models. Figures are the RECORDED header and schedule (packages/domain/src/kosipa/loan-read.ts); remaining amounts are
// sums of unpaid schedule rows, labelled "menurut jadwal" because the legacy official balance is unverified (OFFICIAL_BALANCE).

/** Active = approved, disbursed and not settled — the legacy "pinjaman berjalan". */
export const isActiveLoan = (h: LoanHeaderRaw) => h.docStatus === 'APPROVED' && h.disbursement === 'APPROVED' && h.repayment !== 'LUNAS';

export type InstallmentStatus = 'paid' | 'waiting' | 'scheduled' | 'overdue';
export const INSTALLMENT_LABEL: Record<InstallmentStatus, string> = { paid: 'Lunas', waiting: 'Menunggu potongan', scheduled: 'Dijadwalkan', overdue: 'Belum terbayar' };

export type InstallmentItem = { id: number; no: number | null; month: string; total4: number; principal4: number; interest4: number; status: InstallmentStatus };
export type ActiveLoan = {
  docNo: string; title: string; method: string | null; principal4: number; months: number | null; installment4: number;
  paidRows: number; rows: number; unpaidRows: number; remainingPrincipal4: number; remainingTotal4: number; scheduleIssues: string[];
  current: InstallmentItem | null; installments: InstallmentItem[]; monthsLeftLabel: string;
};

/** Paid rows are 'Bayar'; an unpaid row is "waiting" in its due month, "overdue" before it and "scheduled" after (Jakarta month). */
export function installmentStatus(status: string | null, dueMonth: string | null, currentMonth: string): InstallmentStatus {
  if (status === 'Bayar') return 'paid';
  if (!dueMonth) return 'scheduled';
  return dueMonth === currentMonth ? 'waiting' : dueMonth < currentMonth ? 'overdue' : 'scheduled';
}

export function buildActiveLoan(header: LoanHeaderRaw, aggregate: ScheduleAggregate, rows: readonly ScheduleRowRaw[], currentMonth: string): ActiveLoan {
  const view: LoanView = describeLoan(header);
  const integrity = assessSchedule(view, aggregate, 1);
  const installments = rows.map((r) => {
    const v = describeScheduleRow(r);
    const dueMonth = v.due.kind === 'date' ? v.due.iso.slice(0, 7) : null;
    return { id: v.id, no: v.installmentNo, month: v.due.kind === 'date' ? monthShort(v.due.iso) : legacyDayLabel(v.due), total4: v.total4, principal4: v.principal4, interest4: v.interest4, status: installmentStatus(v.status, dueMonth, currentMonth) };
  });
  const current = installments.find((i) => i.status === 'waiting' || i.status === 'overdue') ?? installments.find((i) => i.status === 'scheduled') ?? null;
  return {
    docNo: header.docNo, title: titleCase(header.type) || 'Pinjaman', method: header.method, principal4: view.planPrincipal4, months: header.planMonths,
    installment4: current?.total4 ?? view.planInstallment4, paidRows: integrity.paidRows, rows: integrity.rows, unpaidRows: integrity.unpaidRows,
    remainingPrincipal4: integrity.recorded.unpaidPrincipal4, remainingTotal4: integrity.recorded.unpaidTotal4, scheduleIssues: integrity.issues,
    current, installments, monthsLeftLabel: `Sisa ${integrity.unpaidRows} bln`,
  };
}

/** The window the mockup shows: last paid, the current one and the next scheduled. */
export function installmentWindow(items: readonly InstallmentItem[]): InstallmentItem[] {
  const i = items.findIndex((x) => x.status !== 'paid');
  if (i < 0) return items.slice(-3);
  return items.slice(Math.max(0, i - 1), i + 2);
}

export type LoanHistoryItem = { docNo: string; title: string; date: string; principal4: number; status: { label: string; tone: 'success' | 'waiting' | 'danger' | 'muted' } };
export function loanHistoryStatus(h: LoanHeaderRaw): LoanHistoryItem['status'] {
  if (h.repayment === 'LUNAS') return { label: 'Lunas', tone: 'success' };
  if (h.docStatus === 'REJECTED') return { label: 'Ditolak', tone: 'danger' };
  if (isActiveLoan(h)) return { label: 'Aktif', tone: 'success' };
  if (h.docStatus === 'OPEN' || h.docStatus === 'POSTING') return { label: 'Menunggu keputusan', tone: 'waiting' };
  return { label: titleCase(h.docStatus) || 'Status tidak tercatat', tone: 'muted' };
}
export const buildLoanHistory = (headers: readonly LoanHeaderRaw[]): LoanHistoryItem[] => headers.map((h) => ({
  docNo: h.docNo, title: titleCase(h.type) || 'Pinjaman', date: dayLabel(h.docDate), principal4: describeLoan(h).planPrincipal4, status: loanHistoryStatus(h),
}));

export type ApplicationItem = { id: number; title: string; date: string; amountSen: number; months: number | null; status: ReturnType<typeof requestStatus>; note: string | null };
export const buildApplications = (rows: readonly LoanApplicationRow[]): ApplicationItem[] => rows.map((r) => ({
  id: r.id, title: titleCase(r.type) || 'Pengajuan pinjaman', date: dayLabel(r.docDate), amountSen: senOf(r.amount), months: r.months, status: requestStatus(r.status),
  note: r.status === 'REJECTED' && r.rejection ? r.rejection.trim().slice(0, 200) : null,
}));

// ------------------------------------------------------------------------------------------------ simulation (application)
export type LoanProduct = { id: number; name: string; label: string; minSen: number; maxSen: number; minMonths: number; maxMonths: number; rateBp: number | null; method: 'Flat' | 'Anuitas' };
export function buildLoanProducts(rows: readonly LoanProductRow[]): LoanProduct[] {
  return rows.map((r) => {
    const rate = Number(r.ratePercent);
    return { id: r.id, name: r.name, label: titleCase(r.name), minSen: senOf(r.minAmount), maxSen: senOf(r.maxAmount), minMonths: r.minMonths, maxMonths: r.maxMonths,
      rateBp: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? Math.round(rate * 100) : null, method: (r.method === 'Anuitas' ? 'Anuitas' : 'Flat') as LoanProduct['method'] };
  }).filter((p) => p.maxSen > 0 && p.maxMonths > 0);
}

export type SimulationInput = { productId: number; amountRp: number | null; months: number | null };
export type SimulationResult =
  | { ok: true; firstInstallmentSen: number; principalSen: number; interestSen: number; totalSen: number; method: 'Flat' | 'Anuitas'; rateBp: number }
  | { ok: false; field: 'product' | 'amount' | 'months' | 'rate'; message: string };

/** Uses the domain schedule engine with the master's own rate and method. An illustration, not an offer. */
export function simulateLoan(products: readonly LoanProduct[], input: SimulationInput): SimulationResult {
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
