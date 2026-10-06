import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaSalesReturnRepository } from '../src/infrastructure/repositories/prisma-sales-return.repository.ts';

const d = (value) => new Prisma.Decimal(value);
const actor = { companyId: 1, userId: 4 };
const now = new Date('2026-10-06T03:00:00Z'); // 10:00 WIB
const request = { items: [{ itemId: 11, quantity: 1 }], reason: 'Barang rusak', idempotencyKey: '0f8fad5b-d9cb-469f-a165-70867728950e' };
const sale = (over = {}) => ({ id: 500, sales_code: 'TB26100100001', sales_date: '2026-10-01', customer_id: 7, customer_name: 'Ani', nik_kar: 'NIK-7', payment_type: 'Cash',
  payment_status: 'Paid', sales_status: 'Final', record_status: 1, pos: 1, grand_total: d('30000.00'), subtotal: d('30000.00'), discount: d('0.00'),
  paid_amount: d('50000.00'), other_charges_tax_id: 0, ...over });
const line = (over = {}) => ({ item_id: 11, barcode: 'B11', label: 'Sabun', sold: 3n, total: d('30000.00'), price: d('10500.00'), discount: d('500.00'),
  purchase_price: d('7000.00'), tax_id: 0, tax_type: '', item_type: 'Produk Jadi', foreign_rows: 0n, inactive_rows: 0n, invalid_rows: 0n, tax: d('0.00'), ...over });

function fake({ saved = [], saleRow = sale(), lines = [line()], returned = [], registers, cash = '0.00', refunds = [], items = [{ id: 11, status_so: 0 }], affected = 1 } = {}) {
  const queries = []; const writes = [];
  const tx = {
    $queryRaw: async (first, ...rest) => {
      const sql = Array.isArray(first) ? first.join('?') : first.sql; const values = Array.isArray(first) ? rest : first.values;
      queries.push({ sql, values });
      if (sql.includes('FROM db_company')) return [{ sales_return_init: 'RTN-TB' }];
      if (sql.includes('FROM db_users')) return [{ username: 'kasir1' }];
      if (sql.includes('reference_no = ?')) return saved;
      if (sql.includes('FROM db_salesitemsreturn WHERE return_id')) return [{ item_id: 11, return_qty: 1 }];
      if (sql.includes('FROM db_sales s WHERE s.id')) return saleRow ? [saleRow] : [];
      if (sql.includes('FROM db_salesitems si')) return lines;
      if (sql.includes('FROM db_salesitemsreturn WHERE sales_id')) return returned;
      if (sql.includes('FROM db_buka_kasir')) return registers ?? [{ id: 20, id_kasir: 3, opened_on: '2026-10-06', opened_at: '2026-10-06 07:00:00', saldo_awal: d('0.00'), kasir_status: 1 }];
      if (sql.includes('id_buka_kasir = ?')) return [{ amount: d(cash) }];
      if (sql.includes('FROM db_salesreturn') && sql.includes('id_kasir = ?')) return refunds;
      if (sql.includes('FROM db_items')) return items;
      if (sql.includes('MAX(CAST(RIGHT(return_code')) return [{ maximum: 4 }];
      if (sql.includes('COUNT(*) AS n FROM db_salesreturn')) return [{ n: 0n }];
      if (sql.includes('LAST_INSERT_ID')) return [{ id: 77n }];
      if (sql.includes('SELECT return_bit')) return [{ flag: '1' }];
      throw new Error(`unexpected ${sql}`);
    },
    $executeRaw: async (first, ...rest) => {
      const sql = Array.isArray(first) ? first.join('?') : first.sql; const values = Array.isArray(first) ? rest : first.values;
      writes.push({ sql, values }); return sql.includes('return_bit') ? affected : 1;
    },
  };
  return { queries, writes, repo: new PrismaSalesReturnRepository({ $queryRaw: async () => [] }, { $transaction: async (fn) => fn(tx) }) };
}

test('cash return locks branch, user, sale, register and items, then writes the three legacy tables, stock and the sale flag', async () => {
  const f = fake({ cash: '30000.00' });
  const created = await f.repo.create(actor, 500, request, now);
  assert.deepEqual(created, { returnId: 77, returnCode: 'RTN-TB26100600005', saleId: 500, totalSen: 1_000_000, refundMethod: 'Cash', replayed: false });
  const order = ['FROM db_company', 'FROM db_users', 'reference_no = ?', 'FROM db_sales s WHERE s.id', 'FROM db_buka_kasir', 'FROM db_items'];
  const positions = order.map((needle) => f.queries.findIndex((q) => q.sql.includes(needle)));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'lock order matches checkout and register close');
  for (const needle of ['FROM db_company', 'FROM db_users', 'FROM db_sales s WHERE s.id', 'FROM db_buka_kasir', 'FROM db_items']) assert.match(f.queries.find((q) => q.sql.includes(needle)).sql, /FOR UPDATE/);
  assert.match(f.queries.find((q) => q.sql.includes('FROM db_users')).sql, /permissions = 'sales_return_add'/);
  const [header, lines, payment, stock, flag] = f.writes;
  assert.match(header.sql, /INSERT INTO db_salesreturn/);
  assert.ok(header.values.includes('RTN-TB26100600005'));
  assert.ok(header.values.includes('2026-10-06 10:00:00'), 'return_date is the local Jakarta time');
  assert.ok(header.values.some((value) => /^NXR-[0-9a-f]{40}$/.test(String(value))), 'idempotency reference');
  assert.deepEqual(header.values.slice(-3), [1, 'Cash', 3], 'company, refund channel and till of the open session');
  assert.match(lines.sql, /INSERT INTO db_salesitemsreturn/);
  assert.ok(lines.values.includes('10000.00') && lines.values.includes('7000.00'), 'refund from the saved line total; HPP from the sale line');
  assert.match(payment.sql, /INSERT INTO db_salespaymentsreturn/);
  assert.match(stock.sql, /UPDATE db_items SET stock = stock \+ \? WHERE id = \? AND company_id = \? AND status_so = 0/);
  assert.deepEqual(stock.values, [1, 11, 1]);
  assert.match(flag.sql, /UPDATE db_sales SET return_bit = '1' WHERE id = \? AND company_id = \?/);
});

test('cash refund cannot exceed the drawer of the open session', async () => {
  const f = fake({ cash: '5000.00', refunds: [{ payment_type: 'Cash', amount: d('1000.00'), n: 1n }] });
  await assert.rejects(f.repo.create(actor, 500, request, now), { code: 'DRAWER_INSUFFICIENT' });
  assert.equal(f.writes.length, 0);
});

test('Kredit return skips the drawer check and is blocked once the sale month is over', async () => {
  const kredit = fake({ saleRow: sale({ payment_type: 'Kredit', paid_amount: d('30000.00') }) });
  assert.equal((await kredit.repo.create(actor, 500, request, now)).refundMethod, 'Kredit');
  assert.ok(!kredit.queries.some((q) => q.sql.includes('id_buka_kasir = ?')));
  const closed = fake({ saleRow: sale({ payment_type: 'Kredit', sales_date: '2026-09-30', paid_amount: d('30000.00') }) });
  await assert.rejects(closed.repo.create(actor, 500, request, now), { code: 'CREDIT_PERIOD_CLOSED' });
  assert.equal(closed.writes.length, 0);
});

test('server-side rules: window, quantity, register, opname, totals and branch scope', async () => {
  const cases = [
    [{ saleRow: sale({ sales_date: '2026-09-28' }) }, 'RETURN_WINDOW_EXPIRED'],
    [{ returned: [{ item_id: 11, qty: 3n, amount: d('30000.00') }] }, 'FULLY_RETURNED'],
    [{ returned: [{ item_id: 11, qty: 3n, amount: d('30000.00') }], lines: [line(), line({ item_id: 12 })], saleRow: sale({ grand_total: d('60000.00'), subtotal: d('60000.00'), paid_amount: d('60000.00') }) }, 'RETURN_QUANTITY_EXCEEDED'],
    [{ registers: [] }, 'REGISTER_CLOSED'],
    [{ registers: [{ id: 20, id_kasir: 3, opened_on: '2026-10-05', opened_at: '2026-10-05 07:00:00', saldo_awal: d('0'), kasir_status: 1 }] }, 'REGISTER_STALE'],
    [{ items: [{ id: 11, status_so: 1 }], cash: '30000.00' }, 'STOCK_OPNAME'],
    [{ lines: [line({ foreign_rows: 1n })] }, 'LEGACY_TOTALS_UNSUPPORTED'],
    [{ saleRow: sale({ discount: d('100.00') }) }, 'LEGACY_TOTALS_UNSUPPORTED'],
    [{ saleRow: sale({ payment_status: 'Unpaid' }) }, 'PAYMENT_NOT_SETTLED'],
    [{ saleRow: null }, 'SALE_NOT_FOUND'],
  ];
  for (const [options, code] of cases) {
    const f = fake(options);
    const body = code === 'RETURN_QUANTITY_EXCEEDED' ? { ...request, items: [{ itemId: 11, quantity: 1 }] } : request;
    await assert.rejects(f.repo.create(actor, 500, body, now), { code }, code);
    assert.equal(f.writes.length, 0, code);
  }
  const scoped = fake();
  await scoped.repo.create(actor, 500, request, now).catch(() => {});
  assert.match(scoped.queries.find((q) => q.sql.includes('FROM db_sales s WHERE s.id')).sql, /s\.company_id = \? AND s\.ppob = 0/);
});

test('a replayed idempotency key returns the saved return; a different payload under the same key is a conflict', async () => {
  const saved = [{ id: 77, return_code: 'RTN-TB26100600005', sales_id: 500, payment_type: 'Cash', grand_total: d('10000.00') }];
  const replay = fake({ saved });
  assert.deepEqual(await replay.repo.create(actor, 500, request, now), { returnId: 77, returnCode: 'RTN-TB26100600005', saleId: 500, totalSen: 1_000_000, refundMethod: 'Cash', replayed: true });
  assert.equal(replay.writes.length, 0);
  await assert.rejects(fake({ saved }).repo.create(actor, 500, { ...request, items: [{ itemId: 11, quantity: 2 }] }, now), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(fake({ saved }).repo.create(actor, 501, request, now), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('a second partial return keeps the sale flag when MariaDB reports no changed row', async () => {
  const f = fake({ affected: 0, cash: '30000.00', returned: [{ item_id: 11, qty: 1n, amount: d('10000.00') }] });
  assert.equal((await f.repo.create(actor, 500, request, now)).totalSen, 1_000_000);
});

test('context is read-only and company-scoped', async () => {
  const reads = [];
  const read = { $queryRaw: async (query) => { reads.push(query.sql); if (query.sql.includes('FROM db_sales s WHERE')) return [sale()];
    if (query.sql.includes('FROM db_salesitems si')) return [line()]; return []; } };
  const context = await new PrismaSalesReturnRepository(read).context(1, 500);
  assert.equal(context.lines[0].soldQty, 3);
  assert.equal(context.lines[0].unitPriceSen, 1_050_000);
  assert.equal(context.facts.consistentTotals, true);
  assert.ok(reads.every((sql) => !/\b(INSERT|UPDATE|DELETE|FOR UPDATE)\b/.test(sql)));
  assert.match(reads[0], /s\.company_id = \? AND s\.ppob = 0/);
});
