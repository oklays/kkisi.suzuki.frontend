import {
  KosipaError, SAVINGS_BALANCE, SAVINGS_PAGE_SIZE, describeMovement, nikLookupKeys, parseLedgerQuery, parseMemberId, summarizeTypes,
  type MovementRaw, type MovementView, type SavingsHeaderRef, type TypeSummary, type TypeSummaryRaw,
} from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { AuditLog } from '../console/identity-links.ts';
import type { KosipaMemberReader, MemberSummary } from './member-360.ts';

/**
 * Read-only member savings ledger (spec REQ-023, TASK-025 read side). Recorded movements and per-type movement sums only: no official
 * balance is stated (SAVINGS_BALANCE is always unavailable until the legacy balance semantics are verified, TASK-003). The header
 * status is authoritative; headers are looked up separately from the movement page, so a join can neither double nor drop a row.
 */
export interface SavingsReader {
  typeSummary(nikKeys: string[]): Promise<TypeSummaryRaw[]>;
  /** Newest first by row id (keyset). */
  movements(nikKeys: string[], type: string | null, beforeId: number | null, limit: number): Promise<MovementRaw[]>;
  headersByDocNo(docNos: readonly string[]): Promise<SavingsHeaderRef[]>;
}
export type SavingsActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type SavingsDeps = { savings: SavingsReader; members: Pick<KosipaMemberReader, 'member'>; audit: AuditLog; now: () => Date };
type Part<T> = { state: 'ok'; data: T } | { state: 'unavailable'; reason: 'READ_FAILED' | 'MEMBER_NIK_UNUSABLE' };

export type MemberSavings = {
  member: Pick<MemberSummary, 'id' | 'nik' | 'name' | 'group' | 'status'>;
  officialBalance: typeof SAVINGS_BALANCE;
  summary: Part<TypeSummary[]>;
  ledger: Part<{ items: MovementView[]; nextCursor: number | null; type: string | null }>;
};

export async function readMemberSavings(d: SavingsDeps, actor: SavingsActor, input: { memberId: unknown; params?: Record<string, string | string[] | undefined> }): Promise<MemberSavings | null> {
  if (!actor.capabilities.has('kosipa.savings.view') || !actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const memberId = parseMemberId(input.memberId);
  const query = parseLedgerQuery(input.params ?? {});
  await d.audit.append({ actorUserId: actor.userId, action: 'kosipa.savings.view', subjectType: 'member', subjectId: `member:${memberId}`, outcome: 'success', requestId: actor.requestId, detail: { paged: query.afterId ? 1 : 0, typed: query.type ? 1 : 0 }, occurredAt: d.now() });
  const m = await d.members.member(memberId);
  if (!m) return null;
  const member = { id: m.id, nik: m.nik, name: m.name, group: m.group, status: m.status };
  let nikKeys: string[];
  try { nikKeys = nikLookupKeys(m.nik); } catch (e) {
    if (!(e instanceof KosipaError)) throw e;
    return { member, officialBalance: SAVINGS_BALANCE, summary: { state: 'unavailable', reason: 'MEMBER_NIK_UNUSABLE' }, ledger: { state: 'unavailable', reason: 'MEMBER_NIK_UNUSABLE' } };
  }
  // Sequential reads: one reader connection per page view (the reader pool is shared with POS).
  let summary: MemberSavings['summary'];
  try { summary = { state: 'ok', data: summarizeTypes(await d.savings.typeSummary(nikKeys)) }; } catch (e) { if (e instanceof KosipaError) throw e; summary = { state: 'unavailable', reason: 'READ_FAILED' }; }
  let ledger: MemberSavings['ledger'];
  try {
    const rows = await d.savings.movements(nikKeys, query.type, query.afterId, SAVINGS_PAGE_SIZE + 1);
    const page = rows.slice(0, SAVINGS_PAGE_SIZE);
    const refs = new Map((await d.savings.headersByDocNo([...new Set(page.map((r) => r.docNo))])).map((h) => [h.docNo, h]));
    ledger = { state: 'ok', data: { items: page.map((r) => describeMovement(r, refs.get(r.docNo))), nextCursor: rows.length > SAVINGS_PAGE_SIZE ? page[page.length - 1].id : null, type: query.type } };
  } catch (e) { if (e instanceof KosipaError) throw e; ledger = { state: 'unavailable', reason: 'READ_FAILED' }; }
  return { member, officialBalance: SAVINGS_BALANCE, summary, ledger };
}
