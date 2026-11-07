import { KosipaError } from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { Section } from './member-360.ts';

/**
 * Dashboard finance cards with the SAME formulas as the legacy KOSIPA dashboard (dashboard_private_m::getInfoTarget), so both
 * screens show the same figures for the same period. These are legacy presentation figures, not the verified official balance
 * (see loans.ts OFFICIAL_BALANCE): "Kas Pinjaman" sums `sisa_cicilan` over the unpaid schedule rows of the period, exactly as legacy does.
 *
 * Legacy rules (doc_status / status_pencairan / status_bayar on trans_pinjaman, status_cicilan on trans_pinjaman_dtl):
 * - Kas Pinjaman  = SUM(dtl.sisa_cicilan)      approved + disbursed + BELUM LUNAS loans, dtl rows Belum Bayar with tgl_cicilan in the period
 * - Angsuran      = SUM(dtl.angsuran_cicilan)  same rows as Kas Pinjaman (legacy uses the same filter in both month and year mode)
 * - Pengajuan     = SUM(plan_pinjaman)         approved + disbursed loans with doc_date in the period
 * - Debit Simpanan= SUM(dtl.debit)             APPROVED savings documents of periode_th[/periode_bl], jenis POKOK/WAJIB/SUKARELA
 */
export type FinanceRange = 'bulan' | 'tahun';
export type FinancePeriod = { range: FinanceRange; year: number; month: number };
/** Inclusive start / exclusive end dates (YYYY-MM-DD) plus the legacy periode columns, all derived from one FinancePeriod. */
export type FinanceWindow = { from: string; toExclusive: string; year: string; month: string | null };

/** Amounts are exact decimal strings (2 decimals) as read from the database; never floats. */
export type LoanFinance = { loanCash: string; installments: string; submissions: string; latestSubmissionOn: string | null };
/** latestDebitPeriod = newest YYYY-MM with a posted debit, so a Rp0 month can say how recent the data is. */
export type SavingsFinance = { debit: string; latestDebitPeriod: string | null };
export type FinanceKpis = { period: FinancePeriod; loans: Section<LoanFinance>; savings: Section<SavingsFinance> };

export interface KosipaDashboardFinanceReader {
  /** Kas Pinjaman + Angsuran in one pass over the schedule table (same row set). */
  loanSchedule(window: FinanceWindow): Promise<{ loanCash: string; installments: string }>;
  loanSubmissions(window: FinanceWindow): Promise<string>;
  savingsDebit(window: FinanceWindow): Promise<string>;
  /** Newest doc_date (YYYY-MM-DD) of an approved + disbursed loan, any period; null when there is none. */
  latestSubmissionOn(): Promise<string | null>;
  /** Newest savings period (YYYY-MM) of the Debit Simpanan rule that carries a debit > 0; null when there is none. */
  latestDebitPeriod(): Promise<string | null>;
}

/** Earliest year offered by the filter: legacy KOSIPA forms start at 2019. */
export const FINANCE_EARLIEST_YEAR = 2019;

const pad = (n: number) => String(n).padStart(2, '0');

/** Query values from the URL; anything unknown falls back to the current Asia/Bangkok month (`today` = YYYY-MM-DD). */
export function parseFinancePeriod(raw: { periode?: unknown; bulan?: unknown; tahun?: unknown }, today: string): FinancePeriod {
  const [cy, cm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const range: FinanceRange = raw.periode === 'tahun' ? 'tahun' : 'bulan';
  const year = typeof raw.tahun === 'string' && /^\d{4}$/.test(raw.tahun) && Number(raw.tahun) >= FINANCE_EARLIEST_YEAR && Number(raw.tahun) <= cy + 1 ? Number(raw.tahun) : cy;
  const month = typeof raw.bulan === 'string' && /^(0?[1-9]|1[0-2])$/.test(raw.bulan) ? Number(raw.bulan) : cm;
  return { range, year, month };
}

export function financeWindow(p: FinancePeriod): FinanceWindow {
  if (p.range === 'tahun') return { from: `${p.year}-01-01`, toExclusive: `${p.year + 1}-01-01`, year: String(p.year), month: null };
  const next = p.month === 12 ? `${p.year + 1}-01-01` : `${p.year}-${pad(p.month + 1)}-01`;
  return { from: `${p.year}-${pad(p.month)}-01`, toExclusive: next, year: String(p.year), month: pad(p.month) };
}

const settle = async <T>(allowed: boolean, read: () => Promise<T>): Promise<Section<T>> => {
  if (!allowed) return { state: 'restricted' };
  try { return { state: 'ok', data: await read() }; } catch { return { state: 'unavailable', reason: 'READ_FAILED' }; }
};

/** Successful figures are kept this long per period: the loan figure scans the ~1.2M-row schedule, and legacy totals move slowly. */
export const FINANCE_CACHE_MS = 60_000;
type CacheEntry<T> = { expiresAt: number; value: T };
const loanCache = new Map<string, CacheEntry<LoanFinance>>();
const savingsCache = new Map<string, CacheEntry<SavingsFinance>>();

/** Only successes are cached, so a timeout is retried on the next view instead of being remembered. Keys are allow-listed periods. */
async function cached<T>(cache: Map<string, CacheEntry<T>>, key: string, now: number, read: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await read();
  if (cache.size > 64) cache.clear();
  cache.set(key, { expiresAt: now + FINANCE_CACHE_MS, value });
  return value;
}

/** Test hook: forget cached figures. */
export function clearFinanceCache(): void { loanCache.clear(); savingsCache.clear(); }

/** Loan cards need kosipa.loan.view, the savings card kosipa.savings.view; each group fails on its own and never shows a made-up number. */
export async function readKosipaFinanceKpis(reader: KosipaDashboardFinanceReader, capabilities: CapabilitySet, period: FinancePeriod, now: number = Date.now()): Promise<FinanceKpis> {
  const canLoans = capabilities.has('kosipa.loan.view');
  const canSavings = capabilities.has('kosipa.savings.view');
  if (!canLoans && !canSavings) throw new KosipaError('FORBIDDEN');
  const w = financeWindow(period);
  const key = `${w.from}:${w.toExclusive}`;
  const [loans, savings] = await Promise.all([
    settle(canLoans, () => cached(loanCache, key, now, async () => {
      const [schedule, submissions, latestSubmissionOn] = await Promise.all([reader.loanSchedule(w), reader.loanSubmissions(w), reader.latestSubmissionOn()]);
      return { ...schedule, submissions, latestSubmissionOn };
    })),
    settle(canSavings, () => cached(savingsCache, key, now, async () => {
      const [debit, latestDebitPeriod] = await Promise.all([reader.savingsDebit(w), reader.latestDebitPeriod()]);
      return { debit, latestDebitPeriod };
    })),
  ]);
  return { period, loans, savings };
}
