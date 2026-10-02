import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaRegisterRepository } from '../src/infrastructure/repositories/prisma-register.repository.ts';
import { PrismaReceiptRepository } from '../src/infrastructure/repositories/prisma-receipt.repository.ts';

const enabled = process.env.POS_REGISTER_RECAP_STAGING_TEST === '1';

test('rollback-only staging recap includes other cashier sales, excludes drafts/other companies, and derives receipt change', { skip: !enabled }, async () => {
  const url = new URL(process.env.DATABASE_URL_WRITE);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '3307');
  assert.equal(url.pathname, '/kkisi_staging');
  assert.notEqual(url.username, 'root');
  const readUrl = new URL(process.env.DATABASE_URL);
  assert.equal(readUrl.hostname, url.hostname);
  assert.equal(readUrl.port, url.port);
  assert.equal(readUrl.pathname, url.pathname);
  assert.notEqual(readUrl.username, url.username);
  const fixture = JSON.parse(await readFile(new URL('../.e2e-pos-recap.json', import.meta.url), 'utf8'));
  const { userId, companyId, registerId, cashSaleId, creditSaleId } = fixture;
  assert.ok([userId, companyId, registerId, cashSaleId, creditSaleId].every(id => Number.isSafeInteger(id) && id > 0));
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const reader = new PrismaClient({ datasources: { db: { url: readUrl.href } } });
  const rollback = new Error('successful-test-must-rollback');
  try {
    await assert.rejects(db.$transaction(async tx => {
      // Match normal lock order before creating any temporary sales in the owned current session.
      await tx.$queryRaw`SELECT id FROM db_company WHERE id=${companyId} AND status=1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM db_users WHERE id=${userId} AND status=1 FOR UPDATE`;
      const [register] = await tx.$queryRaw`SELECT id,id_kasir,saldo_awal FROM db_buka_kasir WHERE id=${registerId} AND company_id=${companyId} AND user_id=${userId} AND status=1 FOR UPDATE`;
      assert.ok(register, 'only the explicitly selected owned open session may be tested');
      const [{ count }] = await tx.$queryRaw`SELECT COUNT(*) AS count FROM db_sales WHERE company_id=${companyId} AND id_buka_kasir=${registerId}`;
      assert.equal(Number(count), 0, 'the owned session must have no saved sales');
      const columns = (await tx.$queryRaw`SHOW COLUMNS FROM db_sales`).map(row => row.Field).filter(field => field !== 'id');
      const clone = async (sourceId, replacements) => {
        const projection = columns.map(field => Object.hasOwn(replacements, field) ? Prisma.sql`${replacements[field]}` : Prisma.raw(`\`${field}\``));
        const written = await tx.$executeRaw(Prisma.sql`INSERT INTO db_sales (${Prisma.join(columns.map(field => Prisma.raw(`\`${field}\``)))}) SELECT ${Prisma.join(projection)} FROM db_sales WHERE id=${sourceId} AND company_id=${companyId} AND sales_status='Final'`);
        assert.equal(written, 1);
        return Number((await tx.$queryRaw`SELECT LAST_INSERT_ID() AS id`)[0].id);
      };
      const common = { id_buka_kasir: registerId, created_by: 'synthetic-recap-other', reference_no: '', sales_note: 'rollback-only-recap-check' };
      const cashId = await clone(cashSaleId, { ...common, grand_total: '125.45', paid_amount: '200.00', other_charges_amt: '999.00' });
      await clone(creditSaleId, { ...common, grand_total: '50.00', paid_amount: '50.00' });
      await clone(cashSaleId, { ...common, sales_status: 'Quotation', grand_total: '99999.00' });
      await clone(cashSaleId, { ...common, company_id: companyId === 1 ? 2 : 1, grand_total: '99999.00' });
      // Test-only dirty read sees the rollback fixture without giving the checkout writer receipt privileges.
      const receipt = await reader.$transaction(readTx => new PrismaReceiptRepository(readTx).find(companyId, cashId), { isolationLevel: Prisma.TransactionIsolationLevel.ReadUncommitted });
      assert.equal(receipt.changeSen, 7455, 'legacy receipt change uses paid minus total, regardless of other charges');
      let recapWrites = 0;
      const scoped = {
        $queryRaw: tx.$queryRaw.bind(tx),
        async $executeRaw(strings, ...values) {
          assert.match(strings.join('?'), /UPDATE db_buka_kasir/);
          assert.equal(values[0], register.saldo_awal.plus('125.45').toFixed(2));
          assert.equal(values[1], '50.00');
          recapWrites++;
          // Checkout credentials cannot update cashier sessions. Capture the proposed recap without writing it.
          return 1;
        },
      };
      const recap = await new PrismaRegisterRepository({ $transaction: fn => fn(scoped) }).close({ companyId, userId }, registerId, new Date());
      assert.equal(recap.saldoAkhir, register.saldo_awal.plus('125.45').toFixed(2));
      assert.equal(recap.saldoKredit, '50.00');
      assert.equal(recapWrites, 1);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 }), error => error === rollback);
    const [{ count }] = await db.$queryRaw`SELECT COUNT(*) AS count FROM db_sales WHERE company_id=${companyId} AND id_buka_kasir=${registerId}`;
    assert.equal(Number(count), 0, 'all temporary sales rolled back');
    const [register] = await db.$queryRaw`SELECT status FROM db_buka_kasir WHERE id=${registerId} AND company_id=${companyId} AND user_id=${userId}`;
    assert.equal(register.status, 1, 'the manual-use session remains open');
  } finally { await Promise.all([db.$disconnect(), reader.$disconnect()]); }
});
