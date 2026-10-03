import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthContext } from '@koperasi/application/auth/validate-session';
import { registerWritePrisma } from '../db/prisma-register-write.ts';
import { businessDates, PosError } from '@koperasi/domain/pos/sale';
import type { RegisterOpeningInput, RegisterOpeningResult } from '@koperasi/application/pos/register-lifecycle';

export class PrismaRegisterRepository {
  private readonly write: PrismaClient;
  constructor(write: PrismaClient) { this.write = write; }
  async close(ctx: AuthContext, registerId: number, now: Date) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.write.$transaction(async (tx) => {
        const [company] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_company WHERE id = ${ctx.companyId} AND status = 1 FOR UPDATE`;
        if (!company) throw new PosError('FORBIDDEN');
        const [user] = await tx.$queryRaw<{ id: number }[]>`SELECT u.id FROM db_users u JOIN db_roles r ON r.id = u.role_id AND r.status = 1
          WHERE u.id = ${ctx.userId} AND u.status = 1 AND (u.role_id <= 2 OR u.company_id = ${ctx.companyId})
          AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id = u.role_id AND p.permissions = 'sales_add') FOR UPDATE`;
        if (!user) throw new PosError('FORBIDDEN');
        const [register] = await tx.$queryRaw<{ id: number; id_kasir: number; noref: string; status: number; saldo_awal: Prisma.Decimal; saldo_akhir: Prisma.Decimal | null; saldo_kredit: Prisma.Decimal }[]>`SELECT b.id,b.id_kasir,b.noref,b.status,b.saldo_awal,b.saldo_akhir,b.saldo_kredit FROM db_buka_kasir b
          JOIN db_kasir k ON k.id=b.id_kasir AND k.company_id=b.company_id
          WHERE b.id=${registerId} AND b.user_id=${ctx.userId} AND b.company_id=${ctx.companyId} FOR UPDATE`;
        if (!register) throw new PosError('FORBIDDEN');
        if (register.status !== 0 && register.status !== 1) throw new PosError('REGISTER_CLOSED');
        // Legacy Pos::tutup_kasir derives change as paid - grand_total, so net Cash equals grand_total.
        // Ownership is enforced on the session above; historical session sales can have other creators.
        const [totals] = await tx.$queryRaw<{ cash: Prisma.Decimal; credit: Prisma.Decimal; discount: Prisma.Decimal; transaction_count: bigint; unsupported: bigint }[]>`SELECT
          CAST(COALESCE(SUM(CASE WHEN payment_type='Cash' THEN CAST(grand_total AS DECIMAL(18,2)) ELSE 0 END),0) AS DECIMAL(18,2)) AS cash,
          CAST(COALESCE(SUM(CASE WHEN payment_type='Kredit' THEN CAST(grand_total AS DECIMAL(18,2)) ELSE 0 END),0) AS DECIMAL(18,2)) AS credit,
          CAST(COALESCE(SUM(tot_discount_to_all_amt),0) AS DECIMAL(18,2)) AS discount,
          COUNT(*) AS transaction_count,
          SUM(CASE WHEN COALESCE(return_bit,'0')<>'0' OR payment_type NOT IN ('Cash','Kredit') THEN 1 ELSE 0 END) AS unsupported
          FROM db_sales WHERE company_id=${ctx.companyId} AND id_buka_kasir=${registerId} AND sales_status='Final'`;
        const summary = { transactionCount: Number(totals.transaction_count), discountTotal: totals.discount.toFixed(2) };
        if (register.status === 0) return { id: register.id, noref: register.noref, saldoAwal: register.saldo_awal.toFixed(2), saldoAkhir: register.saldo_akhir?.toFixed(2) ?? '0.00', saldoKredit: register.saldo_kredit.toFixed(2), ...summary };
        if (Number(totals.unsupported ?? 0)) throw new PosError('REGISTER_RECAP_UNSUPPORTED');
        const saldoAkhir = register.saldo_awal.plus(totals.cash).toFixed(2), saldoKredit = totals.credit.toFixed(2);
        const localTime = new Date(now.getTime()+7*3600000).toISOString().slice(0,19).replace('T',' ');
        const changed = await tx.$executeRaw`UPDATE db_buka_kasir SET saldo_akhir=${saldoAkhir},saldo_kredit=${saldoKredit},tgl_tutup=${localTime},status=0
          WHERE id=${registerId} AND user_id=${ctx.userId} AND company_id=${ctx.companyId} AND status=1`;
        if (changed !== 1) throw new PosError('POS_UNAVAILABLE');
        return { id: register.id, noref: register.noref, saldoAwal: register.saldo_awal.toFixed(2), saldoAkhir, saldoKredit, ...summary };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:15000,timeout:15000 }); }
      catch(error) {
        const e=error as { code?: string; meta?: { code?: string } };
        if(attempt>=2 || !(e.code==='P2034' || (e.code==='P2010' && ['1205','1213'].includes(String(e.meta?.code))))) throw error;
      }
    }
  }
  async open(ctx: AuthContext, input: RegisterOpeningInput, now: Date): Promise<RegisterOpeningResult> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.write.$transaction(async (tx) => {
        const [company] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_company WHERE id = ${ctx.companyId} AND status = 1 FOR UPDATE`;
        if (!company) throw new PosError('FORBIDDEN');
        const [user] = await tx.$queryRaw<{ id: number }[]>`SELECT u.id FROM db_users u JOIN db_roles r ON r.id = u.role_id AND r.status = 1
          WHERE u.id = ${ctx.userId} AND u.status = 1 AND (u.role_id <= 2 OR u.company_id = ${ctx.companyId})
          AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id = u.role_id AND p.permissions = 'sales_add') FOR UPDATE`;
        if (!user) throw new PosError('FORBIDDEN');
        const [kasir] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_kasir WHERE id = ${input.idKasir} AND company_id = ${ctx.companyId} AND status = 1 FOR UPDATE`;
        if (!kasir) throw new PosError('FORBIDDEN');
        const rows = await tx.$queryRaw<{ id: number; noref: string; company_id: number; opened_on: string; kasir_status: number | null }[]>`SELECT b.id, b.noref, b.company_id, DATE_FORMAT(b.tgl_buka,'%Y-%m-%d') AS opened_on, k.status AS kasir_status
          FROM db_buka_kasir b LEFT JOIN db_kasir k ON k.id = b.id_kasir AND k.company_id = b.company_id WHERE b.user_id = ${ctx.userId} AND b.status = 1 ORDER BY b.id FOR UPDATE`;
        if (rows.some((r) => r.company_id !== ctx.companyId)) throw new PosError('REGISTER_OPEN_OUTSIDE');
        if (rows.length > 1) throw new PosError('REGISTER_AMBIGUOUS');
        const day = businessDates(now).day;
        if (rows[0]) {
          if (rows[0].opened_on !== day) throw new PosError('REGISTER_STALE');
          if (rows[0].kasir_status !== 1) throw new PosError('REGISTER_CLOSED');
          return { id: rows[0].id, noref: rows[0].noref };
        }
        const localTime = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
        await tx.$executeRaw`INSERT INTO db_buka_kasir (noref,id_kasir,saldo_awal,tgl_buka,user_id,company_id,status,saldo_kredit)
          VALUES ('',${input.idKasir},${input.saldoAwal},${localTime},${ctx.userId},${ctx.companyId},1,0)`;
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        const registerId = Number(id), noref = `KRS-${day.replaceAll('-', '')}${String(registerId).padStart(4, '0')}`;
        const changed = await tx.$executeRaw`UPDATE db_buka_kasir SET noref = ${noref} WHERE id = ${registerId} AND user_id = ${ctx.userId} AND company_id = ${ctx.companyId}`;
        if (changed !== 1) throw new PosError('POS_UNAVAILABLE');
        return { id: registerId, noref };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 15000 }); }
      catch (error) {
        const e = error as { code?: string; meta?: { code?: string } };
        if (attempt >= 2 || !(e.code === 'P2034' || (e.code === 'P2010' && ['1205','1213'].includes(String(e.meta?.code))))) throw error;
      }
    }
  }
}

export function registerRepository(): PrismaRegisterRepository { return new PrismaRegisterRepository(registerWritePrisma()); }
