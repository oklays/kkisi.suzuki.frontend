import { KosipaError } from './errors.ts';

/**
 * Savings position from persisted ledger lines only (spec REQ-023/REQ-032, BR-007). The browser never supplies a balance.
 * Legacy mapping (adapter): header doc_status APPROVED -> POSTED, OPEN -> PENDING, anything else -> VOID;
 * trans_simpanan_dtl.kredit + kredit_cash -> credit, debit -> debit, jasa -> interest.
 */
export type SavingsLine = { direction: 'credit' | 'debit' | 'interest'; amountSen: number; state: 'POSTED' | 'PENDING' | 'VOID' };
export type SavingsPosition = { postedSen: number; pendingDebitSen: number; pendingCreditSen: number; availableSen: number };

export function savingsPosition(lines: readonly SavingsLine[], openingSen = 0): SavingsPosition {
  if (!Number.isSafeInteger(openingSen)) throw new KosipaError('AMOUNT_INVALID');
  let posted = openingSen, pendingDebit = 0, pendingCredit = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountSen) || line.amountSen < 0) throw new KosipaError('AMOUNT_INVALID');
    if (line.state === 'VOID') continue;
    const signed = line.direction === 'debit' ? -line.amountSen : line.amountSen;
    if (line.state === 'POSTED') posted += signed;
    else if (line.direction === 'debit') pendingDebit += line.amountSen;
    else pendingCredit += line.amountSen;
  }
  // Pending credits are not spendable; pending debits are already reserved.
  return { postedSen: posted, pendingDebitSen: pendingDebit, pendingCreditSen: pendingCredit, availableSen: posted - pendingDebit };
}

/**
 * Which savings types may be withdrawn, and with what floor, is an owner decision (spec BR-007; legacy did not restrict
 * by type). The policy is therefore mandatory input; no default exists. The caller must evaluate this inside the same
 * locked transaction that reads the lines and writes the withdrawal (two concurrent requests cannot both pass).
 */
export type WithdrawalPolicy = { withdrawable: boolean; minimumBalanceSen: number };

export function assertWithdrawal(position: SavingsPosition, amountSen: number, policy: WithdrawalPolicy): void {
  if (!policy || typeof policy.withdrawable !== 'boolean' || !Number.isSafeInteger(policy.minimumBalanceSen) || policy.minimumBalanceSen < 0) throw new KosipaError('WITHDRAWAL_POLICY_MISSING');
  if (!policy.withdrawable) throw new KosipaError('SAVINGS_TYPE_NOT_WITHDRAWABLE');
  if (!Number.isSafeInteger(amountSen) || amountSen <= 0) throw new KosipaError('AMOUNT_INVALID');
  if (position.availableSen - amountSen < policy.minimumBalanceSen) throw new KosipaError('INSUFFICIENT_BALANCE');
}
