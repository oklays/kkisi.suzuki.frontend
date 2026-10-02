import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaReceiptRepository } from '../src/infrastructure/repositories/prisma-receipt.repository.ts';

test('saved receipt maps exact minor units and scopes sale, lines, and item label to the company', async () => {
  let calls = 0;
  const decimal = (value) => new Prisma.Decimal(value);
  const db = { async $queryRaw(query) {
    calls++;
    assert.match(query.sql, /s\.company_id = \?/);
    assert.match(query.sql, /si\.company_id = \?/);
    assert.match(query.sql, /i\.company_id = \?/);
    assert.deepEqual(query.values, [9, 9, 42, 9]);
    return [{ id: 42, sales_code: 'TST42', sales_date: '2026-10-02', created_time: new Date('2026-10-05T01:00:00Z'), company_name: 'Cabang 9', address: 'Jl. A', created_by: 'Kasir', customer_name: 'UMUM', payment_type: 'Cash', return_bit: '0', subtotal: decimal('125.45'), total_discount: decimal('0.00'), grand_total: decimal('125.45'), paid_amount: decimal('200.00'), change_return: decimal('74.55'), line_id: 1, item_name: 'Sabun', description: '', sales_qty: 3, price_per_unit: decimal('50.00'), discount_amt: decimal('8.18'), total_cost: decimal('125.45') }];
  } };
  const receipt = await new PrismaReceiptRepository(db).find(9, 42);
  assert.equal(calls, 1);
  assert.equal(receipt.grandTotalSen, 12545);
  assert.equal(receipt.changeSen, 7455);
  assert.equal(receipt.saleDate, '2026-10-02', 'reprinting keeps the saved sale date despite a later update');
  assert.deepEqual(receipt.lines, [{ name: 'Sabun', quantity: 3, unitPriceSen: 5000, discountSen: 818, totalSen: 12545 }]);
});

test('unsupported historical payment or return cannot print as a regular Cash sale', async () => {
  for (const saved of [{ payment_type: 'Transfer', return_bit: '0' }, { payment_type: 'Cash', return_bit: '1' }]) {
    const db = { async $queryRaw() { return [saved]; } };
    await assert.rejects(new PrismaReceiptRepository(db).find(9, 42), { code: 'RECEIPT_UNSUPPORTED' });
  }
});

test('missing receipt returns null without exposing another company sale', async () => {
  const db = { async $queryRaw() { return []; } };
  assert.equal(await new PrismaReceiptRepository(db).find(9, 42), null);
});
