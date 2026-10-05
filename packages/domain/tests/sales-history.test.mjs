import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSalesHistoryQuery, evaluateReprintEligibility, escapeSqlLike } from '../src/sales/history.ts';

test('history defaults use the current Jakarta month and bound list pagination', () => {
  const parsed = parseSalesHistoryQuery(new URLSearchParams(), new Date('2026-10-01T18:00:00.000Z'));
  assert.deepEqual(parsed, {
    from: '2026-10-01', to: '2026-10-02', source: 'pos', salesStatus: 'Final',
    paymentStatus: 'all', paymentType: 'all', createdBy: '', registerId: null,
    q: '', page: 1, pageSize: 25, sort: 'newest',
  });
});

test('history date validation handles leap days, whole date ranges and the 93-day cap', () => {
  const leap = parseSalesHistoryQuery(new URLSearchParams('from=2024-02-29&to=2024-03-01'));
  assert.equal(leap.from, '2024-02-29');
  assert.throws(() => parseSalesHistoryQuery(new URLSearchParams('from=2026-02-29&to=2026-03-01')), { code: 'INVALID_INPUT' });
  assert.throws(() => parseSalesHistoryQuery(new URLSearchParams('from=2026-10-02&to=2026-10-01')), { code: 'INVALID_INPUT' });
  assert.throws(() => parseSalesHistoryQuery(new URLSearchParams('from=2026-01-01&to=2026-04-04')), { code: 'INVALID_INPUT' });
});

test('history query allows only bounded filters and rejects duplicate, unknown or injected sort keys', () => {
  const parsed = parseSalesHistoryQuery(new URLSearchParams('source=all&salesStatus=Quotation&paymentType=QRIS&registerId=42&page=3&pageSize=100&sort=oldest&q=a+b'));
  assert.equal(parsed.source, 'all');
  assert.equal(parsed.salesStatus, 'Quotation');
  assert.equal(parsed.paymentType, 'QRIS');
  assert.equal(parsed.registerId, 42);
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 100);
  assert.equal(parsed.q, 'a b');
  for (const query of ['page=1&page=2', 'ignored=x', 'sort=id%20desc', 'pageSize=101', 'registerId=0', 'q=1234567890'.repeat(11)]) {
    assert.throws(() => parseSalesHistoryQuery(new URLSearchParams(query)), { code: 'INVALID_INPUT' }, query.slice(0, 30));
  }
});

test('LIKE search escapes wildcard characters while retaining ordinary punctuation', () => {
  assert.equal(escapeSqlLike('A!_%\'B'), 'A!!!_!%\'B');
});

test('native filter submission accepts an empty optional register without weakening validation', () => {
  const params = new URLSearchParams('from=2026-10-01&to=2026-10-05&source=pos&salesStatus=Final&paymentType=all&paymentStatus=all&q=&createdBy=&registerId=&pageSize=25');
  assert.equal(parseSalesHistoryQuery(params).registerId, null);
  for (const value of [' ', '0', '-1', 'abc', '2147483648']) {
    params.set('registerId', value);
    assert.throws(() => parseSalesHistoryQuery(params), { code: 'INVALID_INPUT' });
  }
  params.set('registerId', ''); params.append('registerId', '');
  assert.throws(() => parseSalesHistoryQuery(params), { code: 'INVALID_INPUT' });
});

test('only complete settled POS sales with simple stored totals can print a reprint', () => {
  const eligible = {
    source: 'pos', salesStatus: 'Final', paymentStatus: 'Paid', paymentType: 'Cash', recordStatus: 1,
    returnBit: '0', hasItems: true, lineCount: 2, itemCount: 2, validMoney: true,
    grandTotalSen: 1000, paidSen: 1200, subtotalSen: 1000, lineTotalSen: 1000, discountSen: 0,
    otherChargesSen: 200, hasAmbiguousTax: false, activePaymentCount: 1, paymentTypeMatches: true,
  };
  assert.deepEqual(evaluateReprintEligibility(eligible), { allowed: true, reasons: [] });
  for (const [change, code] of [
    [{ returnBit: '1' }, 'RETURN_UNSUPPORTED'], [{ salesStatus: 'Quotation' }, 'NON_FINAL'],
    [{ paymentType: 'Unknown' }, 'PAYMENT_METHOD_UNSUPPORTED'], [{ paymentStatus: 'Partial' }, 'PAYMENT_NOT_SETTLED'],
    [{ itemCount: 0 }, 'ITEMS_MISSING'], [{ activePaymentCount: 2 }, 'PAYMENT_DATA_UNSUPPORTED'],
    [{ hasAmbiguousTax: true }, 'LEGACY_TOTALS_UNSUPPORTED'], [{ paidSen: 900 }, 'INVALID_SAVED_AMOUNT'],
  ]) {
    const result = evaluateReprintEligibility({ ...eligible, ...change });
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes(code), code);
  }
});

test('legacy metadata recognizes Cash change and rounded total without changing saved cents', async () => {
  const { hasAmbiguousLegacyTotals } = await import('../src/sales/history.ts');
  const base = { paymentType: 'Cash', grandTotalSen: 10005, paidSen: 12005, otherChargesInputSen: 2000, otherChargesTaxId: 0, roundOffSen: 10000 };
  assert.equal(hasAmbiguousLegacyTotals(base), false);
  assert.equal(hasAmbiguousLegacyTotals({ ...base, roundOffSen: 0 }), false);
  for (const change of [{ otherChargesInputSen: 100 }, { roundOffSen: 3000 }, { roundOffSen: null }, { otherChargesTaxId: 1 }, { paymentType: 'QRIS' }]) assert.equal(hasAmbiguousLegacyTotals({ ...base, ...change }), true);
  for (const paymentType of ['QRIS', 'Kredit']) assert.equal(hasAmbiguousLegacyTotals({ ...base, paymentType, paidSen: 10005, otherChargesInputSen: 0 }), false);
});
