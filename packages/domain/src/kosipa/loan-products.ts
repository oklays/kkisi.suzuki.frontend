import { KosipaError } from './errors.ts';
import { parseAmount4 } from './payroll-read.ts';
import { parseLoanPeriod, parseLoanSearch, statusFlags } from './loan-read.ts';
import { parseCursor } from './payroll-read.ts';

/**
 * KOSIPA loan products as the legacy menu "Pinjaman" splits them (legacy/kosipa/application/modules/pinjaman/models/*_m.php).
 * Every legacy list is one fixed filter on trans_pinjaman; this module states those filters once so the summary, the product
 * lists and the SQL adapter can never disagree. Documents no legacy menu shows (e.g. jenis REGULLER, PEMBIAYAAN) are counted
 * as `lainnya`, so the product totals always add up to every document.
 */
export const LOAN_PRODUCT_SLUGS = ['reguler', 'bank', 'kasbon', 'pembiayaan', 'gaji-minus', 'kpr-btn'] as const;
export type LoanProductSlug = (typeof LOAN_PRODUCT_SLUGS)[number];
/** A product filter: one of the legacy products, or `lainnya` (documents outside every legacy product list). */
export type LoanProductFilter = LoanProductSlug | 'lainnya';

export type LoanProductDef = {
  slug: LoanProductSlug; label: string;
  /** jenis_pinjaman values of the legacy filter (compared like MariaDB's default collation: case-insensitive, trailing spaces ignored). */
  types: readonly string[];
  /** bank_pembiaya the legacy filter also requires (only Pinjaman Reguler: `bank_pembiaya = 'KOPERASI'`). */
  financier: string | null;
  /** How the product's documents are subdivided in the legacy screen: by bank_pembiaya, or by jenis for Reguler (flat vs anuitas). */
  segmentBy: 'financier' | 'type';
  segmentLabel: string;
  /** The legacy rule in words, shown so the figure can be checked against the old screen. */
  rule: string;
};

export const LOAN_PRODUCTS: readonly LoanProductDef[] = [
  { slug: 'reguler', label: 'Pinjaman Reguler', types: ['PINJAMAN REGULAR', 'PINJAMAN REGULAR (ANUITAS)'], financier: 'KOPERASI', segmentBy: 'type', segmentLabel: 'Jenis', rule: 'Jenis PINJAMAN REGULAR atau PINJAMAN REGULAR (ANUITAS) yang dibiayai KOPERASI' },
  { slug: 'bank', label: 'Pinjaman Bank', types: ['PINJAMAN BANK'], financier: null, segmentBy: 'financier', segmentLabel: 'Bank pembiaya', rule: 'Jenis PINJAMAN BANK' },
  { slug: 'kasbon', label: 'Kasbon', types: ['KASBON'], financier: null, segmentBy: 'financier', segmentLabel: 'Jenis kasbon', rule: 'Jenis KASBON' },
  { slug: 'pembiayaan', label: 'Pembiayaan', types: ['POTONGAN'], financier: null, segmentBy: 'financier', segmentLabel: 'Jenis pembiayaan', rule: 'Jenis POTONGAN (legacy menamainya Pembiayaan)' },
  { slug: 'gaji-minus', label: 'Gaji Minus', types: ['GAJI MINUS'], financier: null, segmentBy: 'financier', segmentLabel: 'Pembiaya', rule: 'Jenis GAJI MINUS' },
  { slug: 'kpr-btn', label: 'KPR BTN', types: ['KPR BTN'], financier: null, segmentBy: 'financier', segmentLabel: 'Lokasi KPR', rule: 'Jenis KPR BTN' },
];
export const UNMAPPED_PRODUCT = { slug: 'lainnya', label: 'Tidak terpetakan', rule: 'Jenis yang tidak muncul di menu legacy mana pun (misalnya REGULLER, PEMBIAYAAN), atau Reguler yang tidak dibiayai KOPERASI' } as const;

const norm = (v: string | null | undefined) => (v ?? '').replace(/ +$/, '').toUpperCase();
export const loanProduct = (slug: string): LoanProductDef | null => LOAN_PRODUCTS.find((p) => p.slug === slug) ?? null;

/** Product of one document by the legacy menu filters; `lainnya` when no legacy menu lists it. */
export function classifyLoanProduct(type: string | null | undefined, financier: string | null | undefined): LoanProductFilter {
  const t = norm(type);
  for (const p of LOAN_PRODUCTS) if (p.types.includes(t) && (p.financier === null || norm(financier) === p.financier)) return p.slug;
  return 'lainnya';
}
/** The value a product subdivides by (bank_pembiaya, or jenis for Reguler). Blank or '0' is reported as not recorded. */
export function loanSegment(def: Pick<LoanProductDef, 'segmentBy'>, type: string | null | undefined, financier: string | null | undefined): string | null {
  const raw = (def.segmentBy === 'type' ? type : financier)?.trim() ?? '';
  return raw === '' || raw === '0' ? null : raw;
}

/** `produk` and `segmen` query parameters. Unknown products are refused; a segment is only meaningful within a product. */
export function parseLoanProductFilter(params: Record<string, string | string[] | undefined>): { product: LoanProductFilter | null; segment: string | null } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const raw = first(params.produk).trim();
  const product = raw === '' ? null : raw === 'lainnya' || (LOAN_PRODUCT_SLUGS as readonly string[]).includes(raw) ? raw as LoanProductFilter : null;
  if (raw !== '' && product === null) throw new KosipaError('FILTER_INVALID');
  const seg = first(params.segmen).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (seg && (seg.length > 60 || product === null || product === 'lainnya')) throw new KosipaError('FILTER_INVALID');
  return { product, segment: seg || null };
}

// ------------------------------------------------------------------------------------------------------------- portfolio
/** One GROUP BY row over trans_pinjaman headers: (jenis, bank_pembiaya, three statuses) with the count and Σ plan principal. */
export type PortfolioGroupRaw = {
  type: string | null; financier: string | null; docStatus: string | null; disbursement: string | null; repayment: string | null;
  documents: number; planPrincipal: string; latestDocDate: string | null;
};
/** Recorded unpaid schedule (status_cicilan 'Belum Bayar') of one active loan document, with that document's product keys. */
export type UnpaidScheduleRaw = { docNo: string; type: string | null; financier: string | null; principal: string; total: string };

export type PortfolioFigures = {
  documents: number;
  /** Approved, disbursed and not settled: the legacy "aktif" condition (Kartu Aktif, dashboard Kas Pinjaman). */
  active: number; activePrincipal4: number;
  /** Document OPEN or POSTING and not settled: still waiting for approval (= submitted + posted). */
  awaitingApproval: number; submitted: number; posted: number;
  /** Approved but the disbursement is still OPEN and not settled. */
  awaitingDisbursement: number;
  settled: number; rejected: number;
  /** Status combinations that contradict each other (statusFlags), shown as recorded. */
  conflicting: number;
  latestDocDate: string | null;
};
export type PortfolioSegment = PortfolioFigures & { key: string | null; unpaidPrincipal4: number | null; unpaidTotal4: number | null };
export type PortfolioLine = PortfolioFigures & {
  product: LoanProductFilter; label: string; rule: string;
  /** Σ recorded unpaid principal / installment of the active documents; null when the schedule could not be read. */
  unpaidPrincipal4: number | null; unpaidTotal4: number | null;
  segments: PortfolioSegment[];
};
export type LoanPortfolio = { lines: PortfolioLine[]; total: PortfolioFigures & { unpaidPrincipal4: number | null; unpaidTotal4: number | null }; scheduleRead: boolean };

const ACTIVE = (g: Pick<PortfolioGroupRaw, 'docStatus' | 'disbursement' | 'repayment'>) => g.docStatus === 'APPROVED' && g.disbursement === 'APPROVED' && g.repayment === 'BELUM LUNAS';
const empty = (): PortfolioFigures => ({ documents: 0, active: 0, activePrincipal4: 0, awaitingApproval: 0, submitted: 0, posted: 0, awaitingDisbursement: 0, settled: 0, rejected: 0, conflicting: 0, latestDocDate: null });
function add(f: PortfolioFigures, g: PortfolioGroupRaw) {
  f.documents += g.documents;
  if (ACTIVE(g)) { f.active += g.documents; f.activePrincipal4 += parseAmount4(g.planPrincipal); }
  if ((g.docStatus === 'OPEN' || g.docStatus === 'POSTING') && g.repayment !== 'LUNAS') {
    f.awaitingApproval += g.documents;
    if (g.docStatus === 'OPEN') f.submitted += g.documents; else f.posted += g.documents;
  }
  if (g.docStatus === 'APPROVED' && g.disbursement === 'OPEN' && g.repayment !== 'LUNAS') f.awaitingDisbursement += g.documents;
  if (g.repayment === 'LUNAS') f.settled += g.documents;
  if (g.docStatus === 'REJECTED') f.rejected += g.documents;
  if (statusFlags(g).length > 0) f.conflicting += g.documents;
  const d = g.latestDocDate && /^\d{4}-\d{2}-\d{2}/.test(g.latestDocDate) && !g.latestDocDate.startsWith('0000') ? g.latestDocDate.slice(0, 10) : null;
  if (d && (!f.latestDocDate || d > f.latestDocDate)) f.latestDocDate = d;
}

/**
 * Per-product figures from the grouped headers, and (when it could be read) the recorded unpaid schedule of the active documents.
 * Exact integer arithmetic (amount4). The schedule sums are recorded values, never an official outstanding balance.
 */
export function buildLoanPortfolio(groups: readonly PortfolioGroupRaw[], schedule: readonly UnpaidScheduleRaw[] | null): LoanPortfolio {
  const slugs: LoanProductFilter[] = [...LOAN_PRODUCT_SLUGS, 'lainnya'];
  const lines = new Map<LoanProductFilter, PortfolioLine>(slugs.map((slug) => {
    const def = loanProduct(slug);
    return [slug, { ...empty(), product: slug, label: def?.label ?? UNMAPPED_PRODUCT.label, rule: def?.rule ?? UNMAPPED_PRODUCT.rule, unpaidPrincipal4: schedule ? 0 : null, unpaidTotal4: schedule ? 0 : null, segments: [] }];
  }));
  const segmentOf = (line: PortfolioLine, type: string | null, financier: string | null): PortfolioSegment | null => {
    const def = loanProduct(line.product); if (!def) return null;
    const key = loanSegment(def, type, financier);
    let seg = line.segments.find((s) => s.key === key);
    if (!seg) { seg = { ...empty(), key, unpaidPrincipal4: schedule ? 0 : null, unpaidTotal4: schedule ? 0 : null }; line.segments.push(seg); }
    return seg;
  };
  const total = { ...empty(), unpaidPrincipal4: schedule ? 0 : null as number | null, unpaidTotal4: schedule ? 0 : null as number | null };
  for (const g of groups) {
    const line = lines.get(classifyLoanProduct(g.type, g.financier))!;
    add(line, g); add(total, g);
    const seg = segmentOf(line, g.type, g.financier); if (seg) add(seg, g);
  }
  if (schedule) for (const s of schedule) {
    const line = lines.get(classifyLoanProduct(s.type, s.financier))!;
    const p = parseAmount4(s.principal), t = parseAmount4(s.total);
    line.unpaidPrincipal4! += p; line.unpaidTotal4! += t; total.unpaidPrincipal4! += p; total.unpaidTotal4! += t;
    const seg = segmentOf(line, s.type, s.financier); if (seg) { seg.unpaidPrincipal4! += p; seg.unpaidTotal4! += t; }
  }
  for (const line of lines.values()) line.segments.sort((a, b) => b.active - a.active || b.documents - a.documents || String(a.key).localeCompare(String(b.key)));
  return { lines: slugs.map((s) => lines.get(s)!), total, scheduleRead: schedule !== null };
}

// ------------------------------------------------------------------------------------------------- settlements & roll-over
export const SETTLEMENT_PAGE_SIZE = 25;
export const ROLLOVER_PAGE_SIZE = 25;
/** Remarks the legacy settlement form writes (pelunasan_pinjaman_c); anything else is shown as recorded. */
export const SETTLEMENT_REMARKS = ['LUNAS DIPERCEPAT', 'LUNAS PENSIUN', 'LUNAS RESIGN', 'LUNAS NORMAL'] as const;

export type SettlementQuery = { product: LoanProductFilter | null; remark: (typeof SETTLEMENT_REMARKS)[number] | null; period: { year: number; month: number } | null; search: LoanSearch | null; afterId: number | null };
export type RolloverQuery = { search: LoanSearch | null; afterId: number | null };
export type LoanSearch = { nikKeys: string[] | null; docNoPrefix: string | null; nameLike: string | null };

/** Legacy settlement row (trans_pinjaman WHERE pelunasan = 1 AND remark_pelunasan <> 'ROLLOVER'). */
export type SettlementRaw = {
  id: number; docNo: string; settledOn: string | null; nik: string; name: string | null; type: string | null; financier: string | null;
  remark: string | null; method: string | null; status: string | null; planPrincipal: string; principal: string; adminFee: string; penalty: string;
};
export type SettlementView = SettlementRaw & { product: LoanProductFilter; planPrincipal4: number; principal4: number; adminFee4: number; penalty4: number;
  /** Pokok + admin + penalti, as the legacy list computes it. The stored pelunasan_total column is not used: it holds truncated values. */
  total4: number };
export const describeSettlement = (r: SettlementRaw): SettlementView => {
  const principal4 = parseAmount4(r.principal), adminFee4 = parseAmount4(r.adminFee), penalty4 = parseAmount4(r.penalty);
  return { ...r, product: classifyLoanProduct(r.type, r.financier), planPrincipal4: parseAmount4(r.planPrincipal), principal4, adminFee4, penalty4, total4: principal4 + adminFee4 + penalty4 };
};
export type SettlementSummaryRaw = { remark: string | null; documents: number; principal: string; adminFee: string; penalty: string };
export type SettlementSummary = { remark: string | null; documents: number; total4: number }[];
export const summarizeSettlements = (rows: readonly SettlementSummaryRaw[]): SettlementSummary =>
  rows.map((r) => ({ remark: r.remark?.trim() || null, documents: r.documents, total4: parseAmount4(r.principal) + parseAmount4(r.adminFee) + parseAmount4(r.penalty) }))
    .sort((a, b) => b.documents - a.documents);

/** Legacy roll-over link (trans_pinjaman_rollover): an older loan settled into a newer one. */
export type RolloverRaw = { id: number; newDocNo: string | null; oldDocNo: string | null; nik: string; name: string | null; oldType: string | null; remainingInstallments: number | null; remainingPrincipal: string; fee: string };
export type RolloverView = RolloverRaw & { remainingPrincipal4: number; fee4: number };
export const describeRollover = (r: RolloverRaw): RolloverView => ({ ...r, remainingPrincipal4: parseAmount4(r.remainingPrincipal), fee4: parseAmount4(r.fee) });

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
/** `produk`, `keterangan` (settlement remark), `periode` (month of the settlement date), `q` and `after`. Unknown values are refused. */
export function parseSettlementQuery(params: Record<string, string | string[] | undefined>): SettlementQuery {
  const remark = one(params.keterangan);
  if (remark && !(SETTLEMENT_REMARKS as readonly string[]).includes(remark)) throw new KosipaError('FILTER_INVALID');
  const { product } = parseLoanProductFilter({ produk: params.produk });
  return { product, remark: (remark || null) as SettlementQuery['remark'], period: parseLoanPeriod(one(params.periode)), search: parseLoanSearch(one(params.q)), afterId: parseCursor(one(params.after) || null) };
}
export function parseRolloverQuery(params: Record<string, string | string[] | undefined>): RolloverQuery {
  return { search: parseLoanSearch(one(params.q)), afterId: parseCursor(one(params.after) || null) };
}
