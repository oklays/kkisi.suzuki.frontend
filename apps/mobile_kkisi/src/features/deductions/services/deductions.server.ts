import 'server-only';
import { cache } from 'react';
import { loadMemberPayrollHistory } from '@koperasi/application/kosipa/payroll';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readPayrollHeaders, readPayrollRows, type PayrollRow } from '../../../server/kosipa/member.reader.ts';
import { buildDeductionPeriods } from './deductions.ts';

const HISTORY = 12;

/** Reuses the console's loadMemberPayrollHistory use case with a member-scoped reader (rows read once, then broken down). */
export const getDeductionPeriods = cache(async () => {
  const m = await requireMember();
  return attempt(async () => {
    const db = readerDb();
    let rows: PayrollRow[] = [];
    const history = await loadMemberPayrollHistory({
      memberHistory: async (nikKeys, _before, limit) => (rows = await readPayrollRows(db, nikKeys, limit)),
      headersByDocNo: (docNos) => readPayrollHeaders(db, docNos),
    }, m.nik, HISTORY);
    return buildDeductionPeriods(history, rows);
  });
});
