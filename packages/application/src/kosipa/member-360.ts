import { evaluateMemberEligibility, maskAccount, maskEmail, maskPhone, nikLookupKeys, savingsPosition, KosipaError, type SavingsLine } from '@koperasi/domain/kosipa';
import { businessDates, memberCredit, PosError } from '@koperasi/domain/pos/sale';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { AuditLog } from '../console/identity-links.ts';
import { loadMemberPayrollHistory, type MemberPayrollRow, type PayrollReader } from './payroll.ts';

export type MemberSummary = { id: number; nik: string; name: string; group: string | null; status: string | null; employment: string | null };
export type MemberRecordRow = MemberSummary & { exitOn: string | null; joinedOn: string | null; division: string | null; section: string | null; phone: string | null; email: string | null; bankAccount: string | null; bankName: string | null; limitTokoSen: number; gajiMinusSen: number; limitPpobSen: number };
export type SavingsAggregate = { type: string; docStatus: string; creditSen: number; debitSen: number; interestSen: number };
export type LoanHeader = { docNo: string; docDate: string | null; type: string | null; method: string | null; principalSen: number; months: number | null; installmentSen: number; docStatus: string | null; disbursement: string | null; repayment: string | null };

/** Read-only port over the business database (SELECT-only reader; every statement time-capped). */
export interface KosipaMemberReader {
  search(query: { nikKeys: string[] | null; nameLike: string | null; limit: number }): Promise<MemberSummary[]>;
  member(id: number): Promise<MemberRecordRow | null>;
  savings(nik: string): Promise<SavingsAggregate[]>;
  loans(nik: string): Promise<LoanHeader[]>;
  storeCredit(nik: string, monthStart: string, monthEndExclusive: string): Promise<{ spentSen: number; returnedSen: number }>;
}

export type Section<T> = { state: 'ok'; data: T } | { state: 'restricted' } | { state: 'unavailable'; reason: 'INDEX_REQUIRED' | 'READ_FAILED' | 'NOT_CONFIGURED' };

export const SEARCH_LIMIT = 25;
/** NIK-shaped input (digits/letters, no spaces) is matched exactly by NIK; anything else by name. */
export function parseMemberSearch(raw: string): { nikKeys: string[] | null; nameLike: string | null } | null {
  const q = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 50);
  if (q.length < 2) return null;
  if (/^[0-9A-Za-z]{2,20}$/.test(q) && /\d/.test(q)) {
    try { return { nikKeys: nikLookupKeys(q), nameLike: null }; } catch (e) { if (!(e instanceof KosipaError)) throw e; }
  }
  return { nikKeys: null, nameLike: q.replace(/[%_\\]/g, (c) => `\\${c}`) };
}

export async function searchMembers(reader: KosipaMemberReader, capabilities: CapabilitySet, raw: string): Promise<MemberSummary[] | null> {
  if (!capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const query = parseMemberSearch(raw);
  return query ? reader.search({ ...query, limit: SEARCH_LIMIT }) : null;
}

const STATE: Record<string, SavingsLine['state']> = { APPROVED: 'POSTED', OPEN: 'PENDING' };

export type Member360 = {
  profile: MemberSummary & { exitOn: string | null; joinedOn: string | null; division: string | null; section: string | null; phone: string | null; email: string | null; bankAccount: string | null; bankName: string | null; eligibility: ReturnType<typeof evaluateMemberEligibility> };
  savings: Section<{ type: string; postedSen: number; pendingDebitSen: number; pendingCreditSen: number }[]>;
  loans: Section<LoanHeader[]>;
  installments: Section<never>;
  /** RECORDED payroll rows (legacy trans_potongan_matrix), newest first, bounded. Never recomputed. */
  payroll: Section<MemberPayrollRow[]>;
  storeCredit: Section<{ monthStart: string; limitSen: number | null; spentSen: number; returnedSen: number; netSen: number; remainingSen: number | null }>;
};

/**
 * Anggota 360 (spec REQ-022): aggregates only what this user may see and what can be read safely today. The view is
 * audited BEFORE any member data is read (an audit failure stops the read). Sections whose sources are not yet safe to
 * query in production (no index on large tables) are reported as unavailable instead of being estimated.
 */
export async function readMember360(
  ports: { reader: KosipaMemberReader; audit: AuditLog; now: () => Date; payroll?: Pick<PayrollReader, 'memberHistory' | 'headersByDocNo'> },
  actor: { userId: number; capabilities: CapabilitySet; requestId: string },
  memberId: number,
): Promise<Member360 | null> {
  const can = (c: Parameters<CapabilitySet['has']>[0]) => actor.capabilities.has(c);
  if (!can('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  if (!Number.isSafeInteger(memberId) || memberId <= 0) return null;
  await ports.audit.append({ actorUserId: actor.userId, action: 'kosipa.member.view', subjectType: 'member', subjectId: `member:${memberId}`, outcome: 'success', requestId: actor.requestId, occurredAt: ports.now() });
  const m = await ports.reader.member(memberId);
  if (!m) return null;
  const now = ports.now();
  const dates = businessDates(now);
  const guarded = async <T>(cap: Parameters<CapabilitySet['has']>[0], read: () => Promise<T>): Promise<Section<T>> => {
    if (!can(cap)) return { state: 'restricted' };
    try { return { state: 'ok', data: await read() }; } catch { return { state: 'unavailable', reason: 'READ_FAILED' }; }
  };
  // Sequential on purpose: the business reader pool (4 in production) is shared with POS checkout; one page view holds at
  // most one reader connection at a time.
  const savings = await guarded('kosipa.savings.view', async () => {
    const byType = new Map<string, SavingsLine[]>();
    for (const row of await ports.reader.savings(m.nik)) {
      const state = STATE[row.docStatus.toUpperCase()] ?? 'VOID';
      const lines = byType.get(row.type) ?? [];
      lines.push({ direction: 'credit', amountSen: row.creditSen, state }, { direction: 'debit', amountSen: row.debitSen, state }, { direction: 'interest', amountSen: row.interestSen, state });
      byType.set(row.type, lines);
    }
    return [...byType].map(([type, lines]) => { const p = savingsPosition(lines); return { type, postedSen: p.postedSen, pendingDebitSen: p.pendingDebitSen, pendingCreditSen: p.pendingCreditSen }; }).sort((a, b) => a.type.localeCompare(b.type));
  });
  const loans = await guarded('kosipa.loan.view', () => ports.reader.loans(m.nik));
  const storeCredit = await guarded('kosipa.store-credit.view', async () => {
    const usage = await ports.reader.storeCredit(m.nik, dates.monthStart, dates.monthEnd);
    const netSen = Math.max(0, usage.spentSen - usage.returnedSen);
    let limitSen: number | null = null, remainingSen: number | null = null;
    try {
      const credit = memberCredit({ id: m.id, nik: m.nik, name: m.name, status: m.status ?? '', employment: m.employment ?? '', exitOn: m.exitOn, limitSen: m.limitTokoSen, gajiMinusSen: m.gajiMinusSen }, netSen, now);
      limitSen = credit.limitSen; remainingSen = credit.remainingSen;
    } catch (e) { if (!(e instanceof PosError)) throw e; }   // ineligible: usage is shown, no limit is offered
    return { monthStart: dates.monthStart, limitSen, spentSen: usage.spentSen, returnedSen: usage.returnedSen, netSen, remainingSen };
  });
  const payrollReader = ports.payroll;
  const payroll: Section<MemberPayrollRow[]> = !payrollReader ? (can('kosipa.payroll.view') ? { state: 'unavailable', reason: 'NOT_CONFIGURED' } : { state: 'restricted' })
    : await guarded('kosipa.payroll.view', () => loadMemberPayrollHistory(payrollReader, m.nik));
  const installmentsGate: Section<never> = can('kosipa.loan.view') ? { state: 'unavailable', reason: 'INDEX_REQUIRED' } : { state: 'restricted' };
  return {
    profile: {
      id: m.id, nik: m.nik, name: m.name, group: m.group, status: m.status, employment: m.employment, exitOn: m.exitOn, joinedOn: m.joinedOn,
      division: m.division, section: m.section, phone: maskPhone(m.phone), email: maskEmail(m.email), bankAccount: maskAccount(m.bankAccount), bankName: m.bankName,
      eligibility: evaluateMemberEligibility({ nik: m.nik, status: m.status ?? '', employment: m.employment ?? '', exitOn: m.exitOn }, dates.day),
    },
    savings, loans, storeCredit,
    installments: installmentsGate,
    payroll,
  };
}
