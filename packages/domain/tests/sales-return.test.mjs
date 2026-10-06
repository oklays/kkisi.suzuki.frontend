import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateRefund, evaluateReturnEligibility, parseReturnRequest, priceReturn, refundMethodFor, returnWindow } from '../src/sales/return.ts';

const key = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('return request is bounded, sorted, deduplicated and needs a printable reason', () => {
  const parsed = parseReturnRequest({ items: [{ itemId: 9, quantity: 1 }, { itemId: 3, quantity: 2 }], reason: '  Barang   rusak ', idempotencyKey: key.toUpperCase() });
  assert.deepEqual(parsed, { items: [{ itemId: 3, quantity: 2 }, { itemId: 9, quantity: 1 }], reason: 'Barang rusak', idempotencyKey: key });
  for (const body of [null, {}, { items: [], reason: 'abc', idempotencyKey: key }, { items: [{ itemId: 1, quantity: 0 }], reason: 'abc', idempotencyKey: key },
    { items: [{ itemId: 1, quantity: 1 }, { itemId: 1, quantity: 2 }], reason: 'abc', idempotencyKey: key }, { items: [{ itemId: 1, quantity: 10000 }], reason: 'abc', idempotencyKey: key },
    { items: [{ itemId: 1, quantity: 1 }], reason: 'abc', idempotencyKey: 'x' }, { items: [{ itemId: 1, quantity: 1 }], reason: 'bel\u0007l', idempotencyKey: key },
    { items: [{ itemId: 1, quantity: 1 }], reason: 'é'.repeat(5), idempotencyKey: key }, { items: [{ itemId: 1, quantity: 1 }], reason: 'x'.repeat(201), idempotencyKey: key }]) {
    assert.throws(() => parseReturnRequest(body), { code: 'INVALID_INPUT' });
  }
  assert.throws(() => parseReturnRequest({ items: [{ itemId: 1, quantity: 1 }], reason: ' a ', idempotencyKey: key }), { code: 'RETURN_REASON_REQUIRED' });
});

test('refund leaves the drawer for Cash and QRIS and reduces credit usage for Kredit', () => {
  assert.equal(refundMethodFor('Cash'), 'Cash');
  assert.equal(refundMethodFor('QRIS'), 'Cash');
  assert.equal(refundMethodFor('Kredit'), 'Kredit');
});

test('Cash/QRIS window is 7 calendar days across months; Kredit is the sale month only', () => {
  assert.deepEqual(returnWindow('Cash', '2026-09-28', '2026-10-05'), { open: true, deadline: '2026-10-05', reason: null });
  assert.deepEqual(returnWindow('QRIS', '2026-09-28', '2026-10-06'), { open: false, deadline: '2026-10-05', reason: 'RETURN_WINDOW_EXPIRED' });
  assert.deepEqual(returnWindow('Kredit', '2026-10-01', '2026-10-31'), { open: true, deadline: '2026-10-31', reason: null });
  assert.deepEqual(returnWindow('Kredit', '2026-09-30', '2026-10-01'), { open: false, deadline: '2026-09-30', reason: 'CREDIT_PERIOD_CLOSED' });
  assert.equal(returnWindow('Kredit', '2024-02-10', '2024-02-29').deadline, '2024-02-29');
  assert.equal(returnWindow('Cash', '2026-10-07', '2026-10-06').reason, 'SALE_DATE_INVALID');
  assert.equal(returnWindow('Cash', '2026-02-30', '2026-03-01').reason, 'SALE_DATE_INVALID');
});

test('cumulative allocation never drifts: partial refunds sum to the saved line total', () => {
  const line = { soldQty: 3, returnedQty: 0, totalSen: 1_000_000 };
  const first = allocateRefund(line, 1);
  const second = allocateRefund({ ...line, returnedQty: 1 }, 1);
  const third = allocateRefund({ ...line, returnedQty: 2 }, 1);
  assert.deepEqual([first, second, third], [333_300, 333_300, 333_400]);
  assert.equal(first + second + third, line.totalSen);
  assert.equal(allocateRefund({ soldQty: 3, returnedQty: 0, totalSen: 1001 }, 1), 333);
  assert.equal(allocateRefund({ soldQty: 9999, returnedQty: 0, totalSen: 99_999_999_999_900 }, 9999), 99_999_999_999_900);
  assert.throws(() => allocateRefund(line, 4), { code: 'RETURN_QUANTITY_EXCEEDED' });
  assert.throws(() => allocateRefund({ ...line, returnedQty: 3 }, 1), { code: 'RETURN_QUANTITY_EXCEEDED' });
});

test('pricing rejects foreign items and never refunds past earlier returns', () => {
  const lines = [{ itemId: 5, soldQty: 2, returnedQty: 1, totalSen: 20_000, returnedSen: 15_000 }];
  assert.deepEqual(priceReturn(lines, [{ itemId: 5, quantity: 1 }]).totalSen, 5_000);
  assert.throws(() => priceReturn(lines, [{ itemId: 6, quantity: 1 }]), { code: 'RETURN_ITEM_NOT_IN_SALE' });
  assert.throws(() => priceReturn(lines, [{ itemId: 5, quantity: 2 }]), { code: 'RETURN_QUANTITY_EXCEEDED' });
});

test('eligibility explains every blocking reason', () => {
  const base = { salesStatus: 'Final', recordStatus: 1, paymentType: 'Kredit', paymentStatus: 'Paid', saleDate: '2026-10-02', customerId: 7, consistentTotals: true,
    lines: [{ itemId: 1, soldQty: 2, returnedQty: 0, totalSen: 100, returnedSen: 0 }] };
  assert.deepEqual(evaluateReturnEligibility(base, '2026-10-06'), { allowed: true, reasons: [], refundMethod: 'Kredit', deadline: '2026-10-31' });
  const blocked = evaluateReturnEligibility({ ...base, salesStatus: 'Quotation', recordStatus: 0, paymentStatus: 'Unpaid', customerId: 0, consistentTotals: false,
    lines: [{ ...base.lines[0], returnedQty: 2 }] }, '2026-11-01');
  assert.deepEqual(blocked.reasons.sort(), ['CREDIT_PERIOD_CLOSED', 'FULLY_RETURNED', 'INACTIVE_RECORD', 'LEGACY_TOTALS_UNSUPPORTED', 'MEMBER_MISSING', 'NON_FINAL', 'PAYMENT_NOT_SETTLED']);
  assert.deepEqual(evaluateReturnEligibility({ ...base, paymentType: 'Transfer' }, '2026-10-06').reasons, ['PAYMENT_METHOD_UNSUPPORTED']);
});
