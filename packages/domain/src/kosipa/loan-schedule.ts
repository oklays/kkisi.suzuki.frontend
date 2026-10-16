import { KosipaError } from './errors.ts';

/**
 * Loan instalment schedules (spec REQ-030, BR-003/BR-004). Amounts are integer sen; the rate is a MONTHLY rate in basis
 * points (1% per month = 100 bp), matching the legacy `biaya_suku_bunga` semantics of metode_flat/metode_anuitas.
 * All arithmetic is exact (BigInt for the annuity factor); no floating point touches an amount.
 *
 * Status: simulation-grade. The values legacy PERSISTS come from database views whose definitions are not yet available
 * (spec TASK-003); persisted-value parity must be proven before any loan writer uses this (spec REQ-027).
 */
export type LoanMethod = 'Flat' | 'Anuitas';
export type ScheduleInput = { method: LoanMethod; principalSen: number; months: number; monthlyRateBp: number; unitSen?: number };
export type ScheduleRow = { no: number; principalSen: number; interestSen: number; totalSen: number; balanceAfterSen: number };
export type Schedule = { rows: ScheduleRow[]; totalPrincipalSen: number; totalInterestSen: number; totalSen: number };

// BigInt() calls instead of literals: the shared tsconfig targets ES2017.
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), BP_SCALE = BigInt(10_000);

/** Round num/den half-up to a multiple of `unit` (all non-negative). */
function roundToUnit(num: bigint, den: bigint, unit: bigint): bigint {
  return ((num * TWO + den * unit) / (TWO * den * unit)) * unit;
}

function validate({ method, principalSen, months, monthlyRateBp, unitSen = 100 }: ScheduleInput): void {
  if (method !== 'Flat' && method !== 'Anuitas') throw new KosipaError('LOAN_METHOD_INVALID');
  if (!Number.isSafeInteger(principalSen) || principalSen <= 0) throw new KosipaError('LOAN_PRINCIPAL_INVALID');
  if (!Number.isInteger(months) || months < 1 || months > 360) throw new KosipaError('LOAN_TERM_INVALID');
  if (!Number.isInteger(monthlyRateBp) || monthlyRateBp < 0 || monthlyRateBp > 10_000) throw new KosipaError('LOAN_RATE_INVALID');
  if (!Number.isInteger(unitSen) || unitSen < 1 || principalSen % unitSen !== 0) throw new KosipaError('LOAN_UNIT_INVALID');
}

export function loanSchedule(input: ScheduleInput): Schedule {
  validate(input);
  const P = BigInt(input.principalSen), n = BigInt(input.months), bp = BigInt(input.monthlyRateBp), unit = BigInt(input.unitSen ?? 100);
  const rows: ScheduleRow[] = [];
  let balance = P;
  if (input.method === 'Flat' || bp === ZERO) {
    const interest = input.method === 'Flat' ? roundToUnit(P * bp, BP_SCALE, unit) : ZERO;
    const base = (P / n / unit) * unit;
    for (let i = ONE; i <= n; i++) {
      const principal = i === n ? balance : base;
      balance -= principal;
      rows.push(row(i, principal, interest, balance));
    }
  } else {
    const pmt = (amount: bigint, months: bigint) => {
      const growth = (BP_SCALE + bp) ** months, scale = BP_SCALE ** months;
      return roundToUnit(amount * bp * growth, BP_SCALE * (growth - scale), unit);
    };
    let payment = pmt(P, n);
    for (let i = ONE; i <= n; i++) {
      const interest = roundToUnit(balance * bp, BP_SCALE, unit);
      let principal = i === n ? balance : payment - interest;
      // Rounding the fixed payment drifts by (1+r)^n; only at extreme rate x term would it overshoot the balance.
      // Then re-amortise the remaining months from the actual balance instead of producing a negative/over-paid row.
      if (i < n && (principal < ZERO || principal > balance)) { payment = pmt(balance, n - i + ONE); principal = payment - interest; }
      if (principal < ZERO || principal > balance) throw new KosipaError('LOAN_SCHEDULE_INCONSISTENT');
      balance -= principal;
      rows.push(row(i, principal, interest, balance));
    }
  }
  const sum = (key: 'principalSen' | 'interestSen' | 'totalSen') => rows.reduce((s, r) => s + r[key], 0);
  const result = { rows, totalPrincipalSen: sum('principalSen'), totalInterestSen: sum('interestSen'), totalSen: sum('totalSen') };
  if (result.totalPrincipalSen !== input.principalSen || balance !== ZERO) throw new KosipaError('LOAN_SCHEDULE_INCONSISTENT');
  return result;
}

function row(no: bigint, principal: bigint, interest: bigint, balance: bigint): ScheduleRow {
  const out = { no: Number(no), principalSen: Number(principal), interestSen: Number(interest), totalSen: Number(principal + interest), balanceAfterSen: Number(balance) };
  if (!Object.values(out).every(Number.isSafeInteger)) throw new KosipaError('LOAN_AMOUNT_OVERFLOW');
  return out;
}

/**
 * Monthly deduction ratio against salary (spec BR-005). Legacy only DISPLAYED 70% of salary; whether it blocks, and the
 * ratio, are pending owner decisions, so the ratio is a required argument and the result never auto-approves.
 */
export function evaluateDeductionRatio(input: { salarySen: number; existingMonthlySen: number; newMonthlySen: number; maxRatioBp: number }): { status: 'ok' | 'needs-override'; limitSen: number; projectedSen: number } {
  const { salarySen, existingMonthlySen, newMonthlySen, maxRatioBp } = input;
  if (![salarySen, existingMonthlySen, newMonthlySen].every((v) => Number.isSafeInteger(v) && v >= 0)) throw new KosipaError('AMOUNT_INVALID');
  if (!Number.isInteger(maxRatioBp) || maxRatioBp <= 0 || maxRatioBp > 10_000) throw new KosipaError('RATIO_INVALID');
  const limitSen = Number((BigInt(salarySen) * BigInt(maxRatioBp)) / BP_SCALE);
  const projectedSen = existingMonthlySen + newMonthlySen;
  return { status: salarySen > 0 && projectedSen <= limitSen ? 'ok' : 'needs-override', limitSen, projectedSen };
}
