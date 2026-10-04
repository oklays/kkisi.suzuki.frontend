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

test('member receipt includes saved Kredit sale in monthly usage; cash and guest stay distinct', async () => {
  const decimal = (n) => new Prisma.Decimal(n);
  for (const paymentType of ['Kredit', 'Cash']) {
    let calls = 0;
    const db = { async $queryRaw(query) {
      calls++;
      if (calls === 1) return [{ id: 42, sales_code: 'INV42', sales_date: '2026-10-02', return_bit: '0', company_name: 'Toko', address: 'Jl. A', created_by: 'Kasir', customer_name: 'Ani', nik_kar: '123', member_name: 'Ani', limit_amount: decimal('500.00'), gaji_minus: decimal('0.00'), payment_type: paymentType, subtotal: decimal('50.00'), total_discount: decimal('0'), grand_total: decimal('50.00'), paid_amount: decimal('50.00'), change_return: decimal('0'), line_id: null }];
      const sql = query.join('?');
      assert.match(sql, /nik_kar = \?/);
      assert.match(sql, /payment_type = 'Kredit'/);
      assert.match(sql, /sales_status = 'Final'/);
      assert.match(sql, /sales_date >= \?/);
      return [{ amount: decimal('150.00') }];
    } };
    const receipt = await new PrismaReceiptRepository(db).find(9, 42);
    assert.equal(receipt.memberNik, '123');
    assert.equal(receipt.customerName, 'Ani');
    assert.equal(receipt.limitSen, 50000);
    assert.equal(receipt.usedLimitSen, 15000);
    assert.equal(receipt.remainingLimitSen, 35000);
    assert.equal(calls, 2);
  }
});

test('guest and non-member receipts omit member fields and skip limit lookup', async () => {
  const decimal = (n) => new Prisma.Decimal(n);
  for (const [nik, memberName] of [[null, null], ['', null], ['   ', null], ['0', null], ['0', 'UMUM'], [' 0 ', 'UMUM'], ['123', null]]) {
    let calls = 0;
    const db = { async $queryRaw() {
      calls++;
      assert.equal(calls, 1, `no credit-limit query for guest NIK ${JSON.stringify(nik)}`);
      return [{ id: 1, sales_code: 'INV1', sales_date: '2026-10-02', return_bit: '0', company_name: 'Toko', address: '', created_by: 'Kasir', customer_name: 'UMUM', nik_kar: nik, member_name: memberName, payment_type: 'Cash', subtotal: decimal('10'), total_discount: decimal('0'), grand_total: decimal('10'), paid_amount: decimal('10'), change_return: decimal('0'), line_id: null }];
    } };
    const receipt = await new PrismaReceiptRepository(db).find(9, 1);
    assert.equal(receipt.customerName, 'UMUM');
    assert.equal(receipt.memberNik, null);
    assert.equal(receipt.limitSen, null);
    assert.equal(receipt.usedLimitSen, null);
    assert.equal(receipt.remainingLimitSen, null);
  }
});

test('QRIS receipt maps paymentType accurately without change return', async () => {
  const decimal = (value) => new Prisma.Decimal(value);
  const db = { async $queryRaw() {
    return [{ id: 43, sales_code: 'TST43', sales_date: '2026-10-02', company_name: 'Cabang 9', address: 'Jl. A', created_by: 'Kasir', customer_name: 'UMUM', payment_type: 'QRIS', return_bit: '0', subtotal: decimal('75.00'), total_discount: decimal('0.00'), grand_total: decimal('75.00'), paid_amount: decimal('75.00'), change_return: decimal('0.00'), line_id: 1, item_name: 'Snack', description: '', sales_qty: 1, price_per_unit: decimal('75.00'), discount_amt: decimal('0.00'), total_cost: decimal('75.00') }];
  } };
  const receipt = await new PrismaReceiptRepository(db).find(9, 43);
  assert.equal(receipt.paymentType, 'QRIS');
  assert.equal(receipt.grandTotalSen, 7500);
  assert.equal(receipt.paidSen, 7500);
  assert.equal(receipt.changeSen, 0);
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
