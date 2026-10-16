import { KosipaError } from './errors.ts';
import { canonicalNik } from './nik.ts';

/**
 * Batch-scoped payroll settlement (spec REQ-033). Legacy marked EVERY unpaid instalment of the month as paid when any one
 * batch was approved. Here only instalments of members in THIS batch's matrix, with a deduction that covers what is due,
 * are settled; everything uncertain becomes an exception for manual review instead of being marked paid.
 */
export type MatrixLine = { nik: string; installmentSen: number };
export type DueInstallment = { id: number; loanDocNo: string; nik: string; dueOn: string; totalSen: number; paid: boolean };
export type SettlementException = { nik: string; reason: 'SHORTFALL' | 'NO_DUE_INSTALLMENT'; dueSen: number; deductedSen: number };
export type SettlementPlan = { batchDocNo: string; settle: { installmentId: number; loanDocNo: string; nik: string }[]; exceptions: SettlementException[]; untouchedOutsideBatch: number };

export function planPayrollSettlement(input: { batchDocNo: string; period: { year: number; month: number }; matrix: readonly MatrixLine[]; installments: readonly DueInstallment[] }): SettlementPlan {
  const { batchDocNo, period } = input;
  if (!batchDocNo) throw new KosipaError('BATCH_REQUIRED');
  const prefix = `${period.year}-${String(period.month).padStart(2, '0')}-`;
  const deducted = new Map<string, number>();
  for (const line of input.matrix) {
    if (!Number.isSafeInteger(line.installmentSen) || line.installmentSen < 0) throw new KosipaError('AMOUNT_INVALID');
    const nik = canonicalNik(line.nik);
    if (deducted.has(nik)) throw new KosipaError('DUPLICATE_MATRIX_ROW');
    deducted.set(nik, line.installmentSen);
  }
  const dueByNik = new Map<string, DueInstallment[]>();
  let untouched = 0;
  for (const inst of input.installments) {
    if (inst.paid || !inst.dueOn.startsWith(prefix)) continue;
    const nik = canonicalNik(inst.nik);
    if (!deducted.has(nik)) { untouched++; continue; }
    dueByNik.set(nik, [...(dueByNik.get(nik) ?? []), inst]);
  }
  const settle: SettlementPlan['settle'] = [];
  const exceptions: SettlementException[] = [];
  for (const [nik, deductedSen] of [...deducted].sort(([a], [b]) => a.localeCompare(b))) {
    const due = dueByNik.get(nik) ?? [];
    const dueSen = due.reduce((s, i) => s + i.totalSen, 0);
    if (due.length === 0) { if (deductedSen > 0) exceptions.push({ nik, reason: 'NO_DUE_INSTALLMENT', dueSen: 0, deductedSen }); continue; }
    if (deductedSen < dueSen) { exceptions.push({ nik, reason: 'SHORTFALL', dueSen, deductedSen }); continue; }
    for (const i of due.sort((a, b) => a.id - b.id)) settle.push({ installmentId: i.id, loanDocNo: i.loanDocNo, nik });
  }
  return { batchDocNo, settle, exceptions, untouchedOutsideBatch: untouched };
}

/** Loans whose every instalment is paid once `settledIds` are applied (candidates for LUNAS). */
export function loansFullyPaid(allInstallments: readonly DueInstallment[], settledIds: ReadonlySet<number>): string[] {
  const open = new Map<string, boolean>();
  for (const i of allInstallments) open.set(i.loanDocNo, (open.get(i.loanDocNo) ?? false) || !(i.paid || settledIds.has(i.id)));
  return [...open].filter(([, stillOpen]) => !stillOpen).map(([doc]) => doc).sort();
}
