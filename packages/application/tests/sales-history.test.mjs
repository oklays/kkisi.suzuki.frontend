import assert from 'node:assert/strict';
import test from 'node:test';
import { readSalesHistory, readSaleDetail, readSalePayments } from '../src/sales/read-history.ts';

test('history use case scopes every read by an authoritative valid company', async () => {
  const calls = [];
  const repo = { list: async (companyId, query) => { calls.push(['list', companyId, query]); return { items: [], pagination: { total: 0 } }; } };
  await readSalesHistory(repo, 8, { page: 1 });
  assert.equal(calls[0][1], 8);
  await assert.rejects(readSalesHistory(repo, 0, { page: 1 }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 1);
});

test('detail validates IDs and returns server-computed print reasons', async () => {
  let calls = 0;
  const repo = { find: async (companyId, saleId, page, pageSize) => {
    calls++;
    assert.deepEqual([companyId, saleId, page, pageSize], [8, 42, 1, 50]);
    return { sale: { saleId }, lines: [], linePagination: { total: 0 }, reprintFacts: { source: 'nonpos' }, warnings: [] };
  } };
  const result = await readSaleDetail(repo, 8, '42');
  assert.equal(result.printEligibility.allowed, false);
  assert.deepEqual(result.printEligibility.reasons, ['NON_POS', 'NON_FINAL', 'INACTIVE_RECORD', 'RETURN_UNSUPPORTED', 'PAYMENT_METHOD_UNSUPPORTED', 'PAYMENT_NOT_SETTLED', 'ITEMS_MISSING', 'INVALID_SAVED_AMOUNT', 'PAYMENT_DATA_UNSUPPORTED', 'LEGACY_TOTALS_UNSUPPORTED']);
  await assert.rejects(readSaleDetail(repo, 8, '0'), { code: 'INVALID_INPUT' });
  assert.equal(calls, 1);
});

test('payment reads require an authorized existing sale ID and bounded pagination', async () => {
  let calls = 0;
  const repo = { payments: async (companyId, saleId, page, pageSize) => { calls++; return { rows: [companyId, saleId, page, pageSize] }; } };
  assert.deepEqual(await readSalePayments(repo, 8, '42'), { rows: [8, 42, 1, 25] });
  await assert.rejects(readSalePayments(repo, 8, '999999999999'), { code: 'INVALID_INPUT' });
  assert.equal(calls, 1);
});
