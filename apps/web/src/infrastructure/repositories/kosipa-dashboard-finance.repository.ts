import { Prisma, type PrismaClient } from '@prisma/client';
import type { FinanceWindow, KosipaDashboardFinanceReader } from '@koperasi/application/kosipa/dashboard-finance';

// Legacy dashboard figures (dashboard_private_m::getInfoTarget) through the SELECT-only reader; every statement is time-capped.
// trans_pinjaman_dtl (~1.2M rows) has only a PRIMARY key (index-proposal.md is still a proposal), so the legacy
// `trans_pinjaman LEFT JOIN trans_pinjaman_dtl` (block-nested-loop, 1.8–5.2 s on the local copy) is rewritten as a semi-join on
// the approved loan numbers: one scan of the schedule, 0.2–0.6 s, identical sums to the cent on the 30 Oct 2026 copy
// (approved+disbursed+BELUM LUNAS doc_no values are unique there, so the legacy join cannot multiply rows either).
// Debit Simpanan likewise: legacy `trans_simpanan LEFT JOIN trans_simpanan_dtl` took ~9 s for a whole year; the semi-join 22 ms, same sum
// (APPROVED POKOK/WAJIB/SUKARELA doc_no values are unique, 5,610 of 5,610).
// YEAR()/MONTH() filters become date ranges on DATE columns: same rows, zero dates excluded in both forms.
type Dec = Prisma.Decimal | null;
const money = (v: Dec) => (v ?? new Prisma.Decimal(0)).toFixed(2);

export class PrismaKosipaDashboardFinanceReader implements KosipaDashboardFinanceReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async loanSchedule(w: FinanceWindow): Promise<{ loanCash: string; installments: string }> {
    const [r] = await this.db.$queryRaw<{ cash: Dec; installments: Dec }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(COALESCE(SUM(b.sisa_cicilan), 0) AS DECIMAL(24,2)) AS cash, CAST(COALESCE(SUM(b.angsuran_cicilan), 0) AS DECIMAL(24,2)) AS installments
      FROM trans_pinjaman_dtl b
      WHERE b.tgl_cicilan >= ${w.from} AND b.tgl_cicilan < ${w.toExclusive} AND b.status_cicilan = 'Belum Bayar'
        AND b.doc_no IN (SELECT doc_no FROM trans_pinjaman WHERE doc_status = 'APPROVED' AND status_pencairan = 'APPROVED' AND status_bayar = 'BELUM LUNAS')`;
    return { loanCash: money(r?.cash ?? null), installments: money(r?.installments ?? null) };
  }

  async loanSubmissions(w: FinanceWindow): Promise<string> {
    const [r] = await this.db.$queryRaw<{ total: Dec }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(COALESCE(SUM(plan_pinjaman), 0) AS DECIMAL(24,2)) AS total FROM trans_pinjaman
      WHERE doc_status = 'APPROVED' AND status_pencairan = 'APPROVED' AND doc_date >= ${w.from} AND doc_date < ${w.toExclusive}`;
    return money(r?.total ?? null);
  }

  async savingsDebit(w: FinanceWindow): Promise<string> {
    const month = w.month === null ? Prisma.empty : Prisma.sql`AND a.periode_bl = ${w.month}`;
    const [r] = await this.db.$queryRaw<{ total: Dec }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(COALESCE(SUM(b.debit), 0) AS DECIMAL(24,2)) AS total FROM trans_simpanan_dtl b
      WHERE b.doc_no IN (SELECT a.doc_no FROM trans_simpanan a WHERE a.doc_status = 'APPROVED' AND a.periode_th = ${w.year} ${month}
        AND a.jenis_simpanan IN ('SIMPANAN POKOK', 'SIMPANAN WAJIB', 'SIMPANAN SUKARELA'))`;
    return money(r?.total ?? null);
  }

  // Freshness hints for an empty period (cheap: 32k loan headers; one pass over the 113k savings lines).
  async latestSubmissionOn(): Promise<string | null> {
    const [r] = await this.db.$queryRaw<{ d: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT DATE_FORMAT(MAX(doc_date), '%Y-%m-%d') AS d FROM trans_pinjaman
      WHERE doc_status = 'APPROVED' AND status_pencairan = 'APPROVED' AND doc_date > '1900-01-01'`;
    return r?.d ?? null;
  }

  async latestDebitPeriod(): Promise<string | null> {
    const [r] = await this.db.$queryRaw<{ p: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT MAX(CONCAT(a.periode_th, '-', LPAD(a.periode_bl, 2, '0'))) AS p FROM trans_simpanan a
      WHERE a.doc_status = 'APPROVED' AND a.jenis_simpanan IN ('SIMPANAN POKOK', 'SIMPANAN WAJIB', 'SIMPANAN SUKARELA')
        AND a.periode_th REGEXP '^[0-9]{4}$' AND a.periode_bl REGEXP '^[0-9]{1,2}$'
        AND a.doc_no IN (SELECT b.doc_no FROM trans_simpanan_dtl b WHERE b.debit > 0)`;
    return r?.p ?? null;
  }
}
