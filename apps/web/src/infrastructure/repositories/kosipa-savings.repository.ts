import { Prisma, type PrismaClient } from '@prisma/client';
import type { MovementRaw, SavingsHeaderRef, TypeSummaryRaw } from '@koperasi/domain/kosipa';
import type { SavingsReader } from '@koperasi/application/kosipa/savings';

// Read-only savings adapter (spec REQ-023, TASK-025 read side) on the EXISTING SELECT-only reader pool: no new pool, no write.
// 5 s statement cap, parameterised, LIMITed, keyset by row id. The movement page and the header lookup are SEPARATE statements, so a
// join can neither duplicate nor drop a movement; headers sharing a doc_no are reported (AMBIGUOUS), never merged. The detail `saldo`
// and bank columns are never selected. trans_simpanan_dtl has no index on nik_kar in the 30 Sep dump (production unverified): a read is
// a scan that the cap turns into an explicit unavailable state (members hold up to ~240 rows on that copy).
type Num = number | bigint;
const dec2 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);

export class PrismaKosipaSavingsReader implements SavingsReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async typeSummary(nikKeys: string[]): Promise<TypeSummaryRaw[]> {
    const rows = await this.db.$queryRaw<{ type: string; doc_status: string; credit: Prisma.Decimal; debit: Prisma.Decimal; interest: Prisma.Decimal; n: Num }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT COALESCE(d.jenis_simpanan, h.jenis_simpanan, '(tanpa jenis)') AS type, COALESCE(h.doc_status, 'MISSING_HEADER') AS doc_status,
        CAST(COALESCE(SUM(COALESCE(d.kredit, 0) + COALESCE(d.kredit_cash, 0)), 0) AS DECIMAL(24,2)) AS credit,
        CAST(COALESCE(SUM(COALESCE(d.debit, 0)), 0) AS DECIMAL(24,2)) AS debit,
        CAST(COALESCE(SUM(COALESCE(d.jasa_kredit, 0)), 0) AS DECIMAL(24,2)) AS interest, COUNT(*) AS n
      FROM trans_simpanan_dtl d
      LEFT JOIN (SELECT doc_no, MAX(jenis_simpanan) AS jenis_simpanan, IF(COUNT(DISTINCT doc_status) = 1 AND COUNT(*) = 1, MAX(doc_status), 'AMBIGUOUS') AS doc_status
                 FROM trans_simpanan GROUP BY doc_no) h ON h.doc_no = d.doc_no
      WHERE d.nik_kar IN (${Prisma.join(nikKeys)})
      GROUP BY 1, 2 LIMIT 200`;
    return rows.map((r) => ({ type: r.type, headerStatus: r.doc_status, credit: dec2(r.credit), debit: dec2(r.debit), interest: dec2(r.interest), rows: Number(r.n) }));
  }

  async movements(nikKeys: string[], type: string | null, beforeId: number | null, limit: number): Promise<MovementRaw[]> {
    const rows = await this.db.$queryRaw<{ id: Num; doc_no: string | null; type: string | null; credit: Prisma.Decimal | null; cash: Prisma.Decimal | null; debit: Prisma.Decimal | null; interest: Prisma.Decimal | null; doc_status: string | null; remark: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, doc_no, COALESCE(jenis_simpanan, '(tanpa jenis)') AS type, kredit AS credit, kredit_cash AS cash, debit, jasa_kredit AS interest, doc_status, remark_detail AS remark
      FROM trans_simpanan_dtl WHERE nik_kar IN (${Prisma.join(nikKeys)})
      ${type ? Prisma.sql`AND jenis_simpanan = ${type}` : Prisma.empty} ${beforeId !== null ? Prisma.sql`AND id < ${beforeId}` : Prisma.empty}
      ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((r) => ({ id: Number(r.id), docNo: r.doc_no ?? '', type: r.type ?? '(tanpa jenis)', credit: dec2(r.credit), cashCredit: dec2(r.cash), debit: dec2(r.debit), interest: dec2(r.interest), detailStatus: r.doc_status, remark: r.remark }));
  }

  async headersByDocNo(docNos: readonly string[]): Promise<SavingsHeaderRef[]> {
    if (docNos.length === 0) return [];
    const rows = await this.db.$queryRaw<{ doc_no: string; doc_date: string | null; doc_status: string | null; kind: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT doc_no, CAST(doc_date AS CHAR) AS doc_date, doc_status, jenis_transaksi AS kind FROM trans_simpanan WHERE doc_no IN (${Prisma.join(docNos)}) ORDER BY id LIMIT ${docNos.length * 5}`;
    return docNos.map((docNo) => { const mine = rows.filter((r) => r.doc_no === docNo); return { docNo, headerCount: mine.length, header: mine[0] ? { docDate: mine[0].doc_date, status: mine[0].doc_status, kind: mine[0].kind } : null }; });
  }
}
