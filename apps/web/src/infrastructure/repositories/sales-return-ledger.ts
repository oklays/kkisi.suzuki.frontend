import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';

type Db = Pick<PrismaClient, '$queryRaw'> | Prisma.TransactionClient;

/**
 * db_salesreturn has no id_buka_kasir column. A register session's returns are those written by its owner on its
 * till since it was opened (and until it was closed): the return writer requires that same open session, and a
 * user holds at most one open session, so (company, till, owner, time window) identifies them exactly.
 */
export async function sessionRefunds(db: Db, session: { companyId: number; idKasir: number; username: string; openedAt: string; closedAt?: string | null }) {
  const rows = await db.$queryRaw<{ payment_type: string; amount: Prisma.Decimal; n: bigint | number }[]>`SELECT payment_type,
    CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount, COUNT(*) AS n FROM db_salesreturn
    WHERE company_id = ${session.companyId} AND id_kasir = ${session.idKasir} AND created_by = ${session.username}
    AND return_status = 'Return' AND status = 1 AND return_date >= ${session.openedAt}
    ${session.closedAt ? Prisma.sql`AND return_date <= ${session.closedAt}` : Prisma.empty}
    GROUP BY payment_type`;
  const sum = (type: string) => rows.filter((row) => row.payment_type === type).reduce((total, row) => total + toMinorUnits(row.amount.toFixed(2)), 0);
  return { cashSen: sum('Cash'), kreditSen: sum('Kredit'), count: rows.reduce((n, row) => n + Number(row.n), 0) };
}

/**
 * Kredit returns against the member's Kredit sales of one month (all branches, like the usage it offsets).
 * Callers read this through the read-only client: returns only ever lower usage, so a read that misses a return
 * committed a moment ago yields a smaller remaining limit, never an excess one.
 */
export async function kreditReturnedSen(db: Db, nik: string, monthStart: string, monthEnd: string): Promise<number> {
  const [row] = await db.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT CAST(COALESCE(SUM(CAST(r.grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount
    FROM db_salesreturn r JOIN db_sales s ON s.id = r.sales_id AND s.company_id = r.company_id
    WHERE s.nik_kar = ${nik} AND s.payment_type = 'Kredit' AND s.sales_status = 'Final' AND s.sales_date >= ${monthStart} AND s.sales_date < ${monthEnd}
    AND r.payment_type = 'Kredit' AND r.return_status = 'Return' AND r.status = 1`;
  return toMinorUnits((row?.amount ?? new Prisma.Decimal(0)).toFixed(2));
}
