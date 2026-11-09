import { describeMovement, summarizeTypes, type MovementRaw, type MovementState, type SavingsHeaderRef, type TypeSummaryRaw } from '@koperasi/domain/kosipa';
import type { DeductionRequestRow, DeductionRow, WithdrawalRow } from '../../../server/kosipa/member.reader.ts';
import { legacyDayLabel, monthLong, titleCase, dayLabel } from '../../../lib/utils/dates.ts';
import { senOf } from '../../../lib/utils/money.ts';

// Savings view models. Balance semantics follow the console (packages/domain/src/kosipa/savings-read.ts): only APPROVED movements
// are summed ("tercatat"); the result is labelled as recorded movements, NOT an official balance (SAVINGS_BALANCE is unverified).

export type SavingsType = { type: string; label: string; recorded4: number; pending4: number; rows: number; unverifiedRows: number };
export type SavingsSummary = { types: SavingsType[]; totalRecorded4: number; hasUnverified: boolean; hasPending: boolean };

const ORDER = ['SIMPANAN WAJIB', 'SIMPANAN SUKARELA', 'PBS', 'SIMPANAN POKOK'];
const rank = (t: string) => { const i = ORDER.indexOf(t.toUpperCase()); return i < 0 ? ORDER.length : i; };

export function buildSavingsSummary(raw: readonly TypeSummaryRaw[]): SavingsSummary {
  const types = summarizeTypes(raw)
    .map((t) => ({ type: t.type, label: titleCase(t.type), recorded4: t.posted4, pending4: t.pendingCredit4 - t.pendingDebit4, rows: t.rows, unverifiedRows: t.unverifiedRows }))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.label.localeCompare(b.label));
  return {
    types,
    totalRecorded4: types.reduce((s, t) => s + t.recorded4, 0),
    hasUnverified: types.some((t) => t.unverifiedRows > 0),
    hasPending: types.some((t) => t.pending4 !== 0),
  };
}

/** The three types the balance card names (mockup: Wajib, Sukarela, PBS); whatever the member actually has, in that order. */
export const cardBreakdown = (s: SavingsSummary): SavingsType[] => s.types.slice(0, 3);

export const STATE_LABEL: Record<MovementState, { label: string; tone: 'success' | 'waiting' | 'muted' | 'danger' }> = {
  POSTED: { label: 'Tercatat', tone: 'success' },
  PENDING: { label: 'Menunggu persetujuan', tone: 'waiting' },
  VOID: { label: 'Tidak berlaku', tone: 'muted' },
  UNVERIFIED: { label: 'Perlu konfirmasi koperasi', tone: 'danger' },
};

export type MovementItem = { id: number; date: string; type: string; title: string; detail: string; amount4: number; direction: 'in' | 'out'; state: MovementState };

export function buildMovements(rows: readonly MovementRaw[], refs: readonly SavingsHeaderRef[]): MovementItem[] {
  const byDoc = new Map(refs.map((r) => [r.docNo, r]));
  return rows.map((r) => {
    const v = describeMovement(r, byDoc.get(r.docNo));
    const net = v.credit4 + v.interest4 - v.debit4;
    const kind = v.opening ? 'Saldo awal' : v.debit4 > 0 && v.credit4 === 0 ? 'Penarikan' : titleCase(v.kind) || 'Setoran';
    return { id: v.id, date: legacyDayLabel(v.date), type: v.type, title: kind, detail: v.remark?.trim() || titleCase(v.type), amount4: net, direction: net < 0 ? 'out' : 'in', state: v.state };
  });
}

export type DeductionItem = { type: string; label: string; monthlySen: number; since: string | null };
/** Latest active row per savings type in m_simpanan_aktif (status 1). Types with a zero deduction are kept: zero is a recorded value. */
export function buildActiveDeductions(rows: readonly DeductionRow[]): DeductionItem[] {
  const seen = new Set<string>();
  const out: DeductionItem[] = [];
  for (const r of rows) {
    if (r.status !== 1 || !r.type || seen.has(r.type)) continue;
    seen.add(r.type);
    out.push({ type: r.type, label: titleCase(r.type), monthlySen: senOf(r.payroll), since: r.periodStart && !r.periodStart.startsWith('0000') ? monthLong(r.periodStart) : null });
  }
  return out.sort((a, b) => rank(a.type) - rank(b.type));
}

const REQUEST_STATUS: Record<string, { label: string; tone: 'success' | 'waiting' | 'danger' | 'muted' }> = {
  OPEN: { label: 'Menunggu konfirmasi', tone: 'waiting' }, POSTING: { label: 'Diproses', tone: 'waiting' }, APPROVED: { label: 'Disetujui', tone: 'success' }, REJECTED: { label: 'Ditolak', tone: 'danger' },
};
export const requestStatus = (status: string | null) => REQUEST_STATUS[(status ?? '').toUpperCase()] ?? { label: status ? titleCase(status) : 'Status tidak tercatat', tone: 'muted' as const };

export type RequestItem = { id: number; title: string; date: string; fromSen: number; toSen: number; start: string | null; status: ReturnType<typeof requestStatus> };
export const buildDeductionRequests = (rows: readonly DeductionRequestRow[]): RequestItem[] => rows.map((r) => ({
  id: r.id, title: titleCase(r.type) || 'Perubahan potongan', date: dayLabel(r.docDate), fromSen: senOf(r.previous), toSen: senOf(r.requested),
  start: r.startYear && r.startMonth ? monthLong(`${r.startYear}-${String(r.startMonth).padStart(2, '0')}`) : null, status: requestStatus(r.status),
}));

export type WithdrawalItem = { id: number; title: string; date: string; amountSen: number; status: ReturnType<typeof requestStatus> };
export const buildWithdrawals = (rows: readonly WithdrawalRow[]): WithdrawalItem[] => rows.map((r) => ({
  id: r.id, title: titleCase(r.type) || 'Penarikan simpanan', date: dayLabel(r.docDate), amountSen: senOf(r.amount), status: requestStatus(r.status),
}));
