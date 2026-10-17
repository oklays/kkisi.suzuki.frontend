import { KosipaError } from './errors.ts';
import { classifyLegacyDate, parseAmount4 } from './payroll-read.ts';
import { stateOfHeaderStatus } from './savings-read.ts';

/**
 * Operational read-only reports over verified tables (checkpoint 10): membership summary and savings MOVEMENT summary. Both state what is
 * RECORDED. Neither is a balance, an eligibility decision or a deactivation list: expired/exit dates are shown as recorded facts only
 * (owner decision D3 is open), and unrecognised values (the member table contains column-shifted amounts in status and group columns) are
 * counted as such instead of being mapped to a guess.
 */
export const KNOWN_MEMBER_STATUS = ['AKTIVE', 'RESIGN', 'PENSIUN'] as const;
export const KNOWN_EMPLOYMENT = ['TETAP', 'KONTRAK'] as const;
export const KNOWN_MEMBER_GROUP = ['ANGGOTA', 'BMP', 'KOPERASI', 'NON ANGGOTA'] as const;

export type MembershipRaw = { status: string | null; employment: string | null; members: number; withExitDate: number; exitDateBeforeToday: number; withoutNik: number };
export type MembershipGroupRaw = { group: string | null; members: number };
export type MembershipLine = MembershipRaw & { statusKnown: boolean; employmentKnown: boolean };
export type MembershipReport = {
  total: number; lines: MembershipLine[]; groups: { group: string | null; members: number; known: boolean }[];
  unrecognised: { status: number; employment: number; group: number }; totals: { withExitDate: number; exitDateBeforeToday: number; withoutNik: number };
};
const inList = (list: readonly string[], v: string | null) => v !== null && (list as readonly string[]).includes(v);
export function buildMembershipReport(rows: readonly MembershipRaw[], groups: readonly MembershipGroupRaw[]): MembershipReport {
  const lines = rows.map((r): MembershipLine => ({ ...r, statusKnown: inList(KNOWN_MEMBER_STATUS, r.status), employmentKnown: r.employment === null || r.employment === '' || inList(KNOWN_EMPLOYMENT, r.employment) }))
    .sort((a, b) => b.members - a.members || `${a.status}|${a.employment}`.localeCompare(`${b.status}|${b.employment}`));
  const sum = (f: (l: MembershipLine) => number) => lines.reduce((t, l) => t + f(l), 0);
  const gs = groups.map((g) => ({ group: g.group, members: g.members, known: inList(KNOWN_MEMBER_GROUP, g.group) })).sort((a, b) => b.members - a.members || String(a.group).localeCompare(String(b.group)));
  return {
    total: sum((l) => l.members), lines, groups: gs,
    unrecognised: { status: sum((l) => (l.statusKnown ? 0 : l.members)), employment: sum((l) => (l.employmentKnown ? 0 : l.members)), group: gs.reduce((t, g) => t + (g.known ? 0 : g.members), 0) },
    totals: { withExitDate: sum((l) => l.withExitDate), exitDateBeforeToday: sum((l) => l.exitDateBeforeToday), withoutNik: sum((l) => l.withoutNik) },
  };
}

// ------------------------------------------------------------------------------------------------ savings movement summary
export type SavingsDocAggregateRaw = { docNo: string; type: string; rows: number; credit: string; debit: string; interest: string };
export type SavingsHeaderRaw = { docNo: string; docDate: string | null; status: string | null };
export type SavingsMonthLine = { bucket: string; type: string; rows: number; posted4: { credit: number; debit: number; interest: number }; pending4: { credit: number; debit: number }; voidRows: number; unverifiedRows: number };
export type SavingsMovementReport = {
  year: number | null; years: number[]; lines: SavingsMonthLine[];
  /** Movements whose document date cannot place them in a month (zero / missing / implausible) or whose header is missing or duplicated: counted apart, never in a month. */
  unplaced: { kind: 'DATE_UNUSABLE' | 'HEADER_MISSING' | 'HEADER_AMBIGUOUS'; type: string; rows: number }[];
};
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Movement SUMS, not balances. Header status decides the state (APPROVED posted, OPEN pending, anything else void); headers are matched by document number in memory (no SQL join). */
export function buildSavingsMovementReport(year: number | null, aggregates: readonly SavingsDocAggregateRaw[], headers: readonly SavingsHeaderRaw[]): SavingsMovementReport {
  const byDoc = new Map<string, SavingsHeaderRaw[]>(); for (const h of headers) byDoc.set(h.docNo, [...(byDoc.get(h.docNo) ?? []), h]);
  const years = new Set<number>(); const lines = new Map<string, SavingsMonthLine>(); const unplaced = new Map<string, { kind: 'DATE_UNUSABLE' | 'HEADER_MISSING' | 'HEADER_AMBIGUOUS'; type: string; rows: number }>();
  const apart = (kind: 'DATE_UNUSABLE' | 'HEADER_MISSING' | 'HEADER_AMBIGUOUS', type: string, rows: number) => { const k = `${kind}|${type}`; const u = unplaced.get(k) ?? { kind, type, rows: 0 }; u.rows += rows; unplaced.set(k, u); };
  for (const a of aggregates) {
    const hs = byDoc.get(a.docNo) ?? [];
    if (hs.length === 0) { apart('HEADER_MISSING', a.type, a.rows); continue; }
    if (hs.length > 1) { apart('HEADER_AMBIGUOUS', a.type, a.rows); continue; }
    const date = classifyLegacyDate(hs[0].docDate);
    if (date.kind !== 'date') { apart('DATE_UNUSABLE', a.type, a.rows); continue; }
    const bucket = date.iso.slice(0, 7); if (!MONTH.test(bucket)) { apart('DATE_UNUSABLE', a.type, a.rows); continue; }
    years.add(Number(bucket.slice(0, 4)));
    if (year !== null && Number(bucket.slice(0, 4)) !== year) continue;
    const l = lines.get(`${bucket}|${a.type}`) ?? { bucket, type: a.type, rows: 0, posted4: { credit: 0, debit: 0, interest: 0 }, pending4: { credit: 0, debit: 0 }, voidRows: 0, unverifiedRows: 0 };
    const credit = parseAmount4(a.credit), debit = parseAmount4(a.debit), interest = parseAmount4(a.interest);
    l.rows += a.rows; const state = stateOfHeaderStatus(hs[0].status);
    if (state === 'POSTED') { l.posted4.credit += credit; l.posted4.debit += debit; l.posted4.interest += interest; }
    else if (state === 'PENDING') { l.pending4.credit += credit + interest; l.pending4.debit += debit; }
    else l.voidRows += a.rows;
    if (![l.posted4.credit, l.posted4.debit, l.posted4.interest, l.pending4.credit, l.pending4.debit].every(Number.isSafeInteger)) throw new KosipaError('AMOUNT_INVALID');
    lines.set(`${bucket}|${a.type}`, l);
  }
  const sorted = [...years].sort((a, b) => b - a);
  return { year, years: sorted, lines: [...lines.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.type.localeCompare(b.type)), unplaced: [...unplaced.values()].sort((a, b) => `${a.kind}|${a.type}`.localeCompare(`${b.kind}|${b.type}`)) };
}
