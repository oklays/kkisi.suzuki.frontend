import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { parseSalesHistoryQuery } from '@koperasi/domain/sales/history';
import { PrismaSalesHistoryRepository } from '../src/infrastructure/repositories/prisma-sales-history.repository.ts';

const decimal = (value) => new Prisma.Decimal(value);
const sqlText = (query) => query.sql ?? query.join('?');
const header = (overrides = {}) => ({
  id: 42, sales_code: 'INV42', sales_date: '2026-10-02', customer_name: 'UMUM', nik_kar: '0', created_by: 'cashier',
  pos: 1, sales_status: 'Final', payment_status: 'Paid', payment_type: 'Cash', record_status: 1, return_bit: '0',
  grand_total: decimal('10.00'), paid_amount: decimal('10.00'), subtotal: decimal('10.00'), discount: decimal('0.00'),
  other_charges_input: decimal('0.00'), other_charges_amt: decimal('0.00'), round_off: decimal('0.00'),
  register_id: 7, register_reference: 'REG-7', cashier_label: 'K-1', ...overrides,
});

test('list scopes branch outside grouped literal search, uses complete date boundaries and deterministic order', async () => {
  const queries = [];
  const db = { async $queryRaw(query) {
    queries.push(query);
    if (/COUNT\(\*\)/.test(query.sql)) return [{ total: 1n }];
    return [header()];
  } };
  const query = parseSalesHistoryQuery(new URLSearchParams('from=2026-09-30&to=2026-10-02&q=%25_a%21&source=all&salesStatus=all&page=1&pageSize=25'));
  const result = await new PrismaSalesHistoryRepository(db).list(8, query);
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0].grandTotalSen, 1000);
  const dataQuery = queries.find((entry) => !/COUNT\(\*\)/.test(entry.sql));
  assert.match(dataQuery.sql, /s\.company_id = \?/);
  assert.match(dataQuery.sql, /s\.sales_date >= \?/);
  assert.match(dataQuery.sql, /s\.sales_date < \?/);
  assert.match(dataQuery.sql, /ESCAPE '!'/);
  assert.match(dataQuery.sql, /ORDER BY s\.sales_date DESC, s\.id DESC/);
  assert.ok(dataQuery.values.includes(8));
  assert.ok(dataQuery.values.includes('%!%!_a!!%'));
  assert.ok(dataQuery.values.includes('2026-10-03'), 'date upper bound is represented as exclusive next day');
});

test('detail checks parent first, scopes lines/payment facts, and computes fail-closed receipt facts', async () => {
  const calls = [];
  const db = { async $queryRaw(query) {
    calls.push({ query, sql: sqlText(query) });
    const sql = sqlText(query);
    if (/FROM db_sales s/.test(sql)) return [header()];
    if (/COUNT\(\*\) AS all_count/.test(sql)) return [{ all_count: 2n, scoped_count: 2n, eligible_count: 2n }];
    if (/FROM db_salesitems si/.test(sql)) return [{
      id: 1, item_id: 5, barcode: '123', description: '', item_name: 'Current item', sales_qty: 1,
      price_per_unit: decimal('10.00'), discount_amt: decimal('0.00'), tax_id: 0, tax_amt: decimal('0.00'),
      tax_type: '', total_cost: decimal('10.00'), status: 1, sales_status: 'Final',
    }];
    if (/FROM db_salespayments/.test(sql)) return [{ active_count: 1n, matching_count: 1n, foreign_count: 0n }];
    return [];
  } };
  const result = await new PrismaSalesHistoryRepository(db).find(8, 42, 1, 50);
  assert.equal(result.sale.customerName, 'UMUM');
  assert.equal(result.lines[0].label, 'Current item');
  assert.equal(result.lines[0].labelSource, 'current_master');
  assert.equal(result.reprintFacts.activePaymentCount, 1);
  assert.equal(result.reprintFacts.paymentTypeMatches, true);
  assert.ok(calls.some(({ sql }) => /si\.company_id = \?/.test(sql)));
  assert.ok(calls.some(({ sql }) => /i\.company_id = \?/.test(sql)));
});

test('foreign or missing parent returns null before querying any child or payment table', async () => {
  let calls = 0;
  const db = { async $queryRaw(query) { calls++; assert.match(query.sql, /s\.company_id = \?/); return []; } };
  assert.equal(await new PrismaSalesHistoryRepository(db).find(8, 42, 1, 50), null);
  assert.equal(calls, 1);
});

test('detail pagination counts only visible company lines while retaining integrity warnings', async () => {
  const db = { async $queryRaw(query) {
    const sql = sqlText(query);
    if (/FROM db_sales s/.test(sql)) return [header()];
    if (/COUNT\(\*\) AS all_count/.test(sql)) return [{ all_count: 51n, scoped_count: 0n, eligible_count: 0n }];
    return [];
  } };
  const detail = await new PrismaSalesHistoryRepository(db).find(8, 42, 1, 50);
  assert.equal(detail.linePagination.total, 0);
  assert.equal(detail.linePagination.hasNext, false);
  assert.ok(detail.warnings.some(w => w.code === 'DATA_INCOMPLETE'));
  assert.equal(detail.reprintFacts.lineCount, 51);
});

test('missing charge amount stays unknown in receipt eligibility rather than becoming zero', async () => {
  const db = { async $queryRaw(query) {
    const sql = sqlText(query);
    if (/FROM db_sales s/.test(sql)) return [header({ other_charges_amt: null })];
    if (/COUNT\(\*\) AS all_count/.test(sql)) return [{ all_count: 1, scoped_count: 1, eligible_count: 1 }];
    if (/incomplete_count/.test(sql)) return [{ total: decimal('10'), incomplete_count: 0, ambiguous_tax_count: 0 }];
    if (/FROM db_salespayments/.test(sql)) return [{ active_count: 1, matching_count: 1, foreign_count: 0 }];
    return [];
  } };
  const detail = await new PrismaSalesHistoryRepository(db).find(8, 42, 1, 50);
  assert.equal(detail.reprintFacts.otherChargesSen, null);
});

test('normal saved round_off and Cash change metadata do not disable reprint', async () => {
  for (const method of ['Cash', 'QRIS', 'Kredit']) {
    const change = method === 'Cash' ? 2 : 0;
    const db = { async $queryRaw(query) {
      const sql = sqlText(query);
      if (/FROM db_sales s/.test(sql)) return [header({ payment_type: method, paid_amount: decimal(10 + change), other_charges_input: decimal(change), other_charges_amt: decimal(change), round_off: decimal(10) })];
      if (/COUNT\(\*\) AS all_count/.test(sql)) return [{ all_count: 1, scoped_count: 1, eligible_count: 1 }];
      if (/incomplete_count/.test(sql)) return [{ total: decimal(10), incomplete_count: 0, ambiguous_tax_count: 0 }];
      if (/FROM db_salespayments/.test(sql)) return [{ active_count: 1, matching_count: 1, foreign_count: 0 }];
      return [];
    } };
    const detail = await new PrismaSalesHistoryRepository(db).find(8, 42, 1, 50);
    assert.equal(detail.reprintFacts.hasAmbiguousTax, false, method);
  }
});
