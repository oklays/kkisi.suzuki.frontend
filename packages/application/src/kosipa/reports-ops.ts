import {
  KosipaError, buildMembershipReport, buildSavingsMovementReport, parseReportYear,
  type MembershipGroupRaw, type MembershipRaw, type MembershipReport, type SavingsDocAggregateRaw, type SavingsHeaderRaw, type SavingsMovementReport,
} from '@koperasi/domain/kosipa';
import { audit, type ReportActor, type ReportDeps } from './reports.ts';

/**
 * Operational read-only reports (checkpoint 10): membership summary and savings MOVEMENT summary. SELECT-only port; no join across tables
 * (document headers are matched to movement aggregates in memory). Source larger than the safe bound -> unavailable, never partial.
 */
export const OPS_SOURCE_CAP = 30000;
export interface OpsReportReader {
  membershipCounts(today: string): Promise<MembershipRaw[]>;
  membershipGroups(cap: number): Promise<MembershipGroupRaw[]>;
  savingsDocAggregates(cap: number): Promise<SavingsDocAggregateRaw[]>;
  savingsHeaders(cap: number): Promise<SavingsHeaderRaw[]>;
}
export type OpsDeps = Omit<ReportDeps, 'reader'> & { reader: ReportDeps['reader'] & Partial<OpsReportReader>; ops: OpsReportReader };
export type OpsPart<T> = { state: 'ok'; data: T } | { state: 'unavailable'; reason: 'READ_FAILED' | 'SOURCE_TRUNCATED' };

/** Business date in Asia/Bangkok (UTC+7), as the legacy PHP application uses. */
export const bangkokDate = (d: Date): string => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export async function loadMembershipReport(d: OpsDeps): Promise<OpsPart<MembershipReport>> {
  try {
    const groups = await d.ops.membershipGroups(201);
    if (groups.length > 200) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };   // an incomplete group list would hide unrecognised values
    const counts = await d.ops.membershipCounts(bangkokDate(d.now()));
    if (counts.length > 200) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };
    return { state: 'ok', data: buildMembershipReport(counts, groups) };
  } catch (e) { if (e instanceof KosipaError) throw e; return { state: 'unavailable', reason: 'READ_FAILED' }; }
}
export async function readMembershipReport(d: OpsDeps, actor: ReportActor): Promise<OpsPart<MembershipReport>> {
  if (!actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  await audit(d, actor, 'kosipa.report.membership.view', {});
  return loadMembershipReport(d);
}

export async function loadSavingsMovementReport(d: OpsDeps, year: number | null): Promise<OpsPart<SavingsMovementReport>> {
  try {
    const aggregates = await d.ops.savingsDocAggregates(OPS_SOURCE_CAP + 1);
    if (aggregates.length > OPS_SOURCE_CAP) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };
    const headers = await d.ops.savingsHeaders(OPS_SOURCE_CAP + 1);
    if (headers.length > OPS_SOURCE_CAP) return { state: 'unavailable', reason: 'SOURCE_TRUNCATED' };
    const report = buildSavingsMovementReport(year, aggregates, headers);
    return { state: 'ok', data: year === null && report.years.length > 0 ? buildSavingsMovementReport(report.years[0], aggregates, headers) : report };   // default: newest year with movements
  } catch (e) { if (e instanceof KosipaError) throw e; return { state: 'unavailable', reason: 'READ_FAILED' }; }
}
export async function readSavingsMovementReport(d: OpsDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<OpsPart<SavingsMovementReport>> {
  if (!actor.capabilities.has('kosipa.savings.view')) throw new KosipaError('FORBIDDEN');
  const year = parseReportYear(params.tahun);
  await audit(d, actor, 'kosipa.report.savings.view', { year: year ? 1 : 0 });
  return loadSavingsMovementReport(d, year);
}
