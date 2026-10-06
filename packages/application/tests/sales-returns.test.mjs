import assert from 'node:assert/strict';
import test from 'node:test';
import { createSalesReturn, listSalesReturns, readReturnContext, readReturnDocument } from '../src/sales/returns.ts';

const facts = { salesStatus: 'Final', recordStatus: 1, paymentType: 'Cash', paymentStatus: 'Paid', saleDate: '2026-10-01', customerId: 0, consistentTotals: true,
  lines: [{ itemId: 1, soldQty: 1, returnedQty: 0, totalSen: 100, returnedSen: 0 }] };

test('context eligibility uses the Jakarta business day and never exposes raw facts', async () => {
  const repo = { context: async (companyId, saleId) => ({ sale: { saleId }, facts, lines: [], returns: [] }) };
  // 2026-10-08 17:30 UTC is already 2026-10-09 in Jakarta: one day past the 7-day Cash window.
  const late = await readReturnContext(repo, 1, '42', new Date('2026-10-08T17:30:00Z'));
  assert.deepEqual(late.eligibility.reasons, ['RETURN_WINDOW_EXPIRED']);
  assert.equal('facts' in late, false);
  assert.equal((await readReturnContext(repo, 1, '42', new Date('2026-10-08T16:59:00Z'))).eligibility.allowed, true);
});

test('ids are validated before the repository; absent rows are not found', async () => {
  let calls = 0;
  const repo = { context: async () => { calls++; return null; }, document: async () => { calls++; return null; }, create: async () => { calls++; },
    list: async () => ({ rows: [{}], total: 26 }) };
  await assert.rejects(readReturnContext(repo, 1, '0', new Date()), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(readReturnDocument(repo, 1, '1e3'), { code: 'RETURN_NOT_FOUND' });
  await assert.rejects(createSalesReturn(repo, { userId: 1, companyId: 1 }, '42', { items: [] }, new Date()), { code: 'INVALID_INPUT' });
  await assert.rejects(readReturnContext(repo, 0, '42', new Date()), { code: 'FORBIDDEN' });
  assert.equal(calls, 0);
  await assert.rejects(readReturnContext(repo, 1, '42', new Date()), { code: 'SALE_NOT_FOUND' });
  assert.deepEqual((await listSalesReturns(repo, 1, { from: '2026-10-01', to: '2026-10-06', q: '', page: 1, pageSize: 25 })).pagination, { page: 1, pageSize: 25, total: 26, hasNext: true });
});
