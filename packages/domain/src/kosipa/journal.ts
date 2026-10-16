import { KosipaError } from './errors.ts';

/**
 * Double-entry validation for postings (spec REQ-036). Legacy wrote debit and credit to the same account with no balance
 * check. Which accounts a document maps to comes from the account mapping (acc_mapping_akun) in the adapter; this only
 * guarantees that whatever is written is a well-formed, balanced journal.
 */
export type JournalLine = { account: string; debitSen: number; creditSen: number };

export function assertBalancedJournal(lines: readonly JournalLine[]): { debitSen: number; creditSen: number } {
  if (lines.length < 2) throw new KosipaError('JOURNAL_EMPTY');
  let debit = 0, credit = 0;
  for (const l of lines) {
    const amounts = [l.debitSen, l.creditSen];
    if (!l.account?.trim() || !amounts.every((v) => Number.isSafeInteger(v) && v >= 0) || (l.debitSen > 0) === (l.creditSen > 0)) throw new KosipaError('JOURNAL_LINE_INVALID');
    debit += l.debitSen; credit += l.creditSen;
  }
  if (debit !== credit) throw new KosipaError('JOURNAL_UNBALANCED');
  // The legacy defect: every line booked to one account, so the journal moves nothing.
  if (new Set(lines.map((l) => l.account.trim())).size === 1) throw new KosipaError('JOURNAL_SAME_ACCOUNT');
  return { debitSen: debit, creditSen: credit };
}
