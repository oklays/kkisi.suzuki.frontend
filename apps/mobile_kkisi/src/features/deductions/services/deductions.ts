import { describeRow } from '@koperasi/domain/kosipa';
import type { MemberPayrollRow as AppPayrollRow } from '@koperasi/application/kosipa/payroll';
import type { PayrollRow } from '../../../server/kosipa/member.reader.ts';
import { monthLong, titleCase } from '../../../lib/utils/dates.ts';

// Payroll deductions ("Potongan") as RECORDED in trans_potongan_matrix, broken down by the domain catalog (describeRow). The
// recorded total is shown as is; when it differs from the sum of its components the screen says so instead of correcting it.

export type DeductionComponent = { key: string; label: string; group: string; amount4: number };
export type DeductionPeriod = {
  id: number; period: string; periodKey: string | null; status: { label: string; tone: 'success' | 'waiting' | 'muted' }; total4: number;
  components: DeductionComponent[]; totalMatches: boolean;
};

const STATUS = { APPROVED: { label: 'Selesai', tone: 'success' }, OPEN: { label: 'Dalam proses', tone: 'waiting' }, UNKNOWN: { label: 'Status tidak tercatat', tone: 'muted' } } as const;

export function buildDeductionPeriods(history: readonly AppPayrollRow[], rows: readonly PayrollRow[]): DeductionPeriod[] {
  const amounts = new Map(rows.map((r) => [r.id, r.amounts]));
  return history.map((h) => {
    const breakdown = describeRow(amounts.get(h.id) ?? { total_potongan: '0' });
    const key = h.header.state === 'OK' && h.header.period ? h.header.period : null;
    const status = h.header.state === 'OK' ? STATUS[h.header.status] : STATUS.UNKNOWN;
    return {
      id: h.id, period: key ? monthLong(key) : 'Periode tidak tercatat', periodKey: key, status, total4: h.total4,
      components: breakdown.components.map((c) => ({ key: c.column, label: titleCase(c.label), group: c.group, amount4: c.amount4 })).sort((a, b) => b.amount4 - a.amount4),
      totalMatches: breakdown.sumMatchesTotal,
    };
  });
}
