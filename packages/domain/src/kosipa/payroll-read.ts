import { KosipaError } from './errors.ts';
import { nikLookupKeys } from './nik.ts';

/**
 * Read-only payroll model (spec REQ-025, TASK-027). Everything here describes RECORDED legacy data (trans_potongan_*): it is
 * never recomputed, repaired or approved. Evidence for every rule below was measured on the 30 Sep 2026 production copy
 * (docs/.../index-proposal.md and implementation-journal.md Checkpoint 6); where evidence is missing the value is reported as
 * unavailable/unverified instead of being guessed.
 */

// ------------------------------------------------------------------------------------------------------------- amounts
/**
 * Recorded amounts are decimal(18,4) and 14% of recorded totals carry sub-sen fractions, so a 2-decimal "sen" integer would
 * silently round them. Amounts are therefore exact integers in 1/10,000 rupiah ("amount4"), parsed from the decimal string.
 * 14 integer digits x 10^4 stays a safe integer; sums of the 59 component columns stay far below 2^53.
 */
export const AMOUNT4_SCALE = 10000;
export function parseAmount4(raw: string | null | undefined): number {
  const m = typeof raw === 'string' ? /^(-?)(\d{1,14})(?:\.(\d{1,4}))?$/.exec(raw.trim()) : null;
  if (!m) throw new KosipaError('AMOUNT_INVALID');
  const units = Number(m[2]) * AMOUNT4_SCALE + Number((m[3] ?? '').padEnd(4, '0'));
  if (!Number.isSafeInteger(units)) throw new KosipaError('AMOUNT_INVALID');
  return m[1] ? -units : units;
}
export const amount4FromSen = (sen: number): number => { if (!Number.isSafeInteger(sen)) throw new KosipaError('AMOUNT_INVALID'); return sen * 100; };
export function sumAmount4(values: readonly number[]): number {
  const total = values.reduce((t, v) => t + v, 0);
  if (!Number.isSafeInteger(total)) throw new KosipaError('AMOUNT_INVALID');
  return total;
}

// --------------------------------------------------------------------------------------------------------------- dates
/**
 * Legacy dates are stored in non-strict MySQL: 43% of installment due dates are '0000-00-00' and one is '9999-12-10'. They are
 * classified explicitly and never replaced by a guessed date. The raw text is kept so it can be shown as-is.
 */
export type LegacyDate = { kind: 'date'; iso: string } | { kind: 'zero' } | { kind: 'missing' } | { kind: 'invalid'; raw: string };
export function classifyLegacyDate(raw: string | null | undefined): LegacyDate {
  if (raw === null || raw === undefined || raw.trim() === '') return { kind: 'missing' };
  const text = raw.trim();
  if (/^0000-00-00/.test(text)) return { kind: 'zero' };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return { kind: 'invalid', raw: text.slice(0, 20) };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(y, mo - 1, d));
  const ok = y >= 1990 && y <= 2100 && real.getUTCFullYear() === y && real.getUTCMonth() === mo - 1 && real.getUTCDate() === d;
  return ok ? { kind: 'date', iso: `${m[1]}-${m[2]}-${m[3]}` } : { kind: 'invalid', raw: text.slice(0, 20) };
}

// ------------------------------------------------------------------------------------------------------------- filters
export type PayrollPeriod = { year: number; month: number };
export const PAYROLL_STATUSES = ['OPEN', 'APPROVED'] as const;           // the only values present in the 30 Sep data
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
export const PAYROLL_GROUPS = ['ANGGOTA', 'BMP', 'KOPERASI'] as const;   // header groups present in the data
export type PayrollGroup = (typeof PAYROLL_GROUPS)[number];
export const PAYROLL_PAGE_SIZE = 25;
export const PAYROLL_MEMBER_PAGE_SIZE = 50;
export const PAYROLL_HISTORY_LIMIT = 24;

export function parsePayrollPeriod(raw: unknown): PayrollPeriod {
  const m = typeof raw === 'string' ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw) : null;
  if (!m || Number(m[1]) < 2000 || Number(m[1]) > 2100) throw new KosipaError('PERIOD_INVALID');
  return { year: Number(m[1]), month: Number(m[2]) };
}
export const periodLabel = (p: PayrollPeriod): string => `${p.year}-${String(p.month).padStart(2, '0')}`;
/** Legacy stores the period as two text columns ('2026', '08'). */
export const periodColumns = (p: PayrollPeriod): { year: string; month: string } => ({ year: String(p.year), month: String(p.month).padStart(2, '0') });

export type BatchListQuery = { period: PayrollPeriod | null; status: PayrollStatus | null; group: PayrollGroup | null; afterId: number | null };
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Validated list filter. Empty values mean "no filter"; unknown values are refused, never passed through. */
export function parseBatchListQuery(params: Record<string, string | string[] | undefined>): BatchListQuery {
  const period = first(params.periode) ? parsePayrollPeriod(first(params.periode)) : null;
  const status = first(params.status) ?? '';
  const group = first(params.grup) ?? '';
  if (status && !(PAYROLL_STATUSES as readonly string[]).includes(status)) throw new KosipaError('FILTER_INVALID');
  if (group && !(PAYROLL_GROUPS as readonly string[]).includes(group)) throw new KosipaError('FILTER_INVALID');
  return { period, status: (status || null) as PayrollStatus | null, group: (group || null) as PayrollGroup | null, afterId: parseCursor(first(params.after)) };
}
/** Keyset cursor = the last primary key seen (positive integer). Anything else is refused. */
export function parseCursor(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!/^\d{1,10}$/.test(raw) || Number(raw) < 1) throw new KosipaError('CURSOR_INVALID');
  return Number(raw);
}
export function parseDocNo(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{6,30}$/.test(raw)) throw new KosipaError('DOC_NO_INVALID');
  return raw;
}
export type MemberSearch = { nikKeys: string[] | null; nameLike: string | null };
export function parseMemberFilter(raw: string | undefined): MemberSearch | null {
  const q = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 50);
  if (q.length < 2) return null;
  if (/^[0-9A-Za-z]{2,20}$/.test(q) && /\d/.test(q)) return { nikKeys: nikLookupKeys(q), nameLike: null };
  return { nikKeys: null, nameLike: q.replace(/[%_\\]/g, (c) => `\\${c}`) };
}
/** Source window of a payroll period (spec BR-006): the previous calendar month; `toExclusive` is the first day of the period. */
export function periodSourceWindow(p: PayrollPeriod): { from: string; toExclusive: string } {
  const prev = p.month === 1 ? { y: p.year - 1, m: 12 } : { y: p.year, m: p.month - 1 };
  const d = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
  return { from: d(prev.y, prev.m), toExclusive: d(p.year, p.month) };
}

// ------------------------------------------------------------------------------------------------------------ components
/**
 * The 59 amount columns of trans_potongan_matrix that sum to total_potongan in 84,889 of 84,924 recorded rows. Deliberately
 * excluded: `gaji_payroll` (salary: sensitive, not a deduction), `total_potongan` (the recorded total) and `potongan_toko`
 * (equal to TOKO_TAMBUN + TOKO_MJ + TOKO_GIIC in 100% of rows, i.e. a redundant subtotal that must never be added again).
 * Grouping is evidence-based only: names starting PIUTANG_/JASA_PIUTANG_/KASBON_/TOKO_/PPOB, and columns whose DDL COMMENT says
 * SIMPANAN. Everything else is "lainnya" (not classified): no business meaning is invented.
 */
export const PAYROLL_COMPONENT_COLUMNS = [
  'KASBON_1X_POT', 'KASBON_POT_BPAT', 'KASBON_LEBIHDARI_1X_POT', 'KASBON_BAYAR_CASH', 'KASBON_SEPECIAL_PAT', 'KASBON_POTONGAN_PINJAMAN',
  'POTONGAN_SEPEDA', 'POTONGAN_ELEKTRONIK', 'POTONGAN_SERVICE_KENDARAAN', 'POTONGAN_KASBON_DAN_SIM', 'POTONGAN_BARANG_KONSINYASI', 'POTONGAN_SURAT_SURAT',
  'PBS', 'PAGUYUBAN_FINAL_INSP', 'PAGUYUBAN_KASIH_SETIA', 'POTONGAN_DKM', 'POTONGAN_DKM_MAULID_GIIC', 'POTONGAN_DKM_EHS', 'POTONGAN_TOUR_WELDING', 'POTONGAN_TC4W',
  'RELIFMAN_UP', 'PAGUYUBAN_PART_INSP', 'POTONGAN_SPV_UP', 'POTONGAN_SBC', 'POT_PAGUYUBAN', 'SIMPANAN_SUKARELA', 'BIAYA_JASA_SIMPANAN_SUKARELA', 'jasa_SIMPANAN_SUKARELA',
  'simpanan_potong_payroll', 'POTONGAN_KPR_BTN_BEKASI', 'POTONGAN_KPR_BTN_PURWAKARTA', 'GAJI_MINUS', 'SIMPANAN_WAJIB',
  'PIUTANG_DANA_GABUNGAN', 'JASA_PIUTANG_DANA_GABUNGAN', 'PIUTANG_DANA_KOP', 'JASA_PIUTANG_DANA_KOP', 'PIUTANG_DANA_KOP_ANUITAS', 'JASA_PIUTANG_DANA_KOP_ANUITAS',
  'PIUTANG_BANK_DANAMON', 'JASA_PIUTANG_BANK_DANAMON', 'PIUTANG_BANK_DKI', 'JASA_PIUTANG_BANK_DKI', 'PIUTANG_BANK_BJB', 'JASA_PIUTANG_BANK_BJB',
  'PIUTANG_BANK_MUAMALAT', 'JASA_PIUTANG_BANK_MUAMALAT', 'TOKO_TAMBUN', 'TOKO_MJ', 'TOKO_GIIC', 'PPOB', 'SIMPANAN_POKOK',
  'PIUTANG_BANK_BSI', 'JASA_PIUTANG_BANK_BSI', 'PIUTANG_BANK_BSI_2', 'JASA_PIUTANG_BANK_BSI_2', 'PRESSING', 'PIUTANG_BANK_BSM', 'JASA_PIUTANG_BANK_BSM',
] as const;
export type PayrollComponentColumn = (typeof PAYROLL_COMPONENT_COLUMNS)[number];
export const STORE_COLUMNS = ['TOKO_TAMBUN', 'TOKO_MJ', 'TOKO_GIIC'] as const;
export type StoreColumn = (typeof STORE_COLUMNS)[number];
export type ComponentGroup = 'toko' | 'ppob' | 'piutang' | 'kasbon' | 'simpanan' | 'lainnya';
export const GROUP_LABEL: Record<ComponentGroup, string> = { toko: 'Belanja toko (Kredit)', ppob: 'PPOB', piutang: 'Piutang / pinjaman', kasbon: 'Kasbon', simpanan: 'Simpanan', lainnya: 'Lainnya (belum dikelompokkan)' };
const SIMPANAN_BY_COMMENT = new Set(['PBS', 'PAGUYUBAN_FINAL_INSP', 'PAGUYUBAN_KASIH_SETIA', 'POTONGAN_DKM', 'POTONGAN_DKM_MAULID_GIIC', 'POTONGAN_DKM_EHS', 'POTONGAN_TOUR_WELDING', 'POTONGAN_SPV_UP', 'POTONGAN_SBC', 'POT_PAGUYUBAN']);
export function componentGroup(column: PayrollComponentColumn): ComponentGroup {
  if ((STORE_COLUMNS as readonly string[]).includes(column)) return 'toko';
  if (column === 'PPOB') return 'ppob';
  if (/^(JASA_)?PIUTANG_/.test(column)) return 'piutang';
  if (column.startsWith('KASBON_')) return 'kasbon';
  if (/simpanan/i.test(column) || SIMPANAN_BY_COMMENT.has(column)) return 'simpanan';
  return 'lainnya';
}
export const componentLabel = (column: string): string => column.replace(/_/g, ' ');

export type RecordedAmounts = Partial<Record<PayrollComponentColumn, string>> & { total_potongan: string; potongan_toko?: string };
export type ComponentLine = { column: PayrollComponentColumn; label: string; group: ComponentGroup; amount4: number };
export type RowBreakdown = {
  recordedTotal4: number; components: ComponentLine[]; componentSum4: number;
  /** total_potongan == sum of the 59 components. false in 35 of 84,924 recorded rows: shown, never "fixed". */
  sumMatchesTotal: boolean; differenceFromTotal4: number;
  /** potongan_toko == TOKO_TAMBUN + TOKO_MJ + TOKO_GIIC (redundant subtotal); null when the column was not read. */
  tokoSubtotalMatches: boolean | null;
  groups: { group: ComponentGroup; label: string; amount4: number }[];
};
export function describeRow(amounts: RecordedAmounts): RowBreakdown {
  const recordedTotal4 = parseAmount4(amounts.total_potongan);
  const components: ComponentLine[] = [];
  for (const column of PAYROLL_COMPONENT_COLUMNS) {
    const raw = amounts[column];
    if (raw === undefined) continue;
    const amount4 = parseAmount4(raw);
    if (amount4 !== 0) components.push({ column, label: componentLabel(column), group: componentGroup(column), amount4 });
  }
  const componentSum4 = sumAmount4(components.map((c) => c.amount4));
  const toko = sumAmount4(STORE_COLUMNS.map((c) => parseAmount4(amounts[c] ?? '0')));
  const byGroup = new Map<ComponentGroup, number>();
  for (const c of components) byGroup.set(c.group, (byGroup.get(c.group) ?? 0) + c.amount4);
  const order: ComponentGroup[] = ['toko', 'ppob', 'piutang', 'kasbon', 'simpanan', 'lainnya'];
  return {
    recordedTotal4, components, componentSum4, sumMatchesTotal: componentSum4 === recordedTotal4, differenceFromTotal4: recordedTotal4 - componentSum4,
    tokoSubtotalMatches: amounts.potongan_toko === undefined ? null : parseAmount4(amounts.potongan_toko) === toko,
    groups: order.filter((g) => byGroup.has(g)).map((g) => ({ group: g, label: GROUP_LABEL[g], amount4: byGroup.get(g) as number })),
  };
}

// ------------------------------------------------------------------------------------------------------------ integrity
export type IntegrityIssue =
  | 'STATUS_UNKNOWN' | 'NO_ROWS' | 'HEADER_TOTAL_MISMATCH' | 'DUPLICATE_NIK_ROWS' | 'PERIOD_DATE_INVALID' | 'PERIOD_COLUMNS_MISMATCH' | 'HEADER_TOTAL_MISSING';
export type BatchHeader = {
  id: number; docNo: string; group: string | null; status: string | null; periodYear: string | null; periodMonth: string | null;
  periodDate: string | null; docDate: string | null; cashDate: string | null; headerTotal: string | null; cashTotal: string | null; createdBy: string | null; updatedBy: string | null;
};
export type BatchSummaryFacts = { rowCount: number; distinctNik: number; rowsTotal: string };
export type BatchIntegrity = { issues: IntegrityIssue[]; headerTotal4: number | null; rowsTotal4: number; differenceFrom4: number | null; status: PayrollStatus | 'UNKNOWN'; periodDate: LegacyDate; cashDate: LegacyDate };

/** Checks that make a batch's recorded figures trustworthy or not. Nothing is repaired; every problem is listed. */
export function assessBatch(header: BatchHeader, facts: BatchSummaryFacts): BatchIntegrity {
  const issues: IntegrityIssue[] = [];
  const status = (PAYROLL_STATUSES as readonly string[]).includes(header.status ?? '') ? (header.status as PayrollStatus) : 'UNKNOWN';
  if (status === 'UNKNOWN') issues.push('STATUS_UNKNOWN');
  const rowsTotal4 = parseAmount4(facts.rowsTotal);
  if (facts.rowCount === 0) issues.push('NO_ROWS');
  let headerTotal4: number | null = null;
  if (header.headerTotal === null) issues.push('HEADER_TOTAL_MISSING');
  else { headerTotal4 = parseAmount4(header.headerTotal); if (facts.rowCount > 0 && Math.abs(headerTotal4 - rowsTotal4) >= 50) issues.push('HEADER_TOTAL_MISMATCH'); }   // 50 = half a sen
  if (facts.rowCount !== facts.distinctNik) issues.push('DUPLICATE_NIK_ROWS');
  const periodDate = classifyLegacyDate(header.periodDate);
  if (periodDate.kind !== 'date') issues.push('PERIOD_DATE_INVALID');
  else if (header.periodYear !== null && header.periodMonth !== null && (periodDate.iso.slice(0, 4) !== header.periodYear || periodDate.iso.slice(5, 7) !== header.periodMonth.padStart(2, '0'))) issues.push('PERIOD_COLUMNS_MISMATCH');
  return { issues, headerTotal4, rowsTotal4, differenceFrom4: headerTotal4 === null ? null : headerTotal4 - rowsTotal4, status, periodDate, cashDate: classifyLegacyDate(header.cashDate) };
}
