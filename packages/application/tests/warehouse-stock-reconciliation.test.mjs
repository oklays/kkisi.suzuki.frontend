import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileOutboxAgainstPostings as rec } from '../src/warehouse/index.ts';

const out = (n, status = 'PENDING', over = {}) => ({ intentKey: `s|e|${n}`, sourceRef: 's', eventKey: 'e', storeCompanyId: 1, storeItemId: 7, mappingRef: 'm', quantity: 10, treatment: 'INTERNAL_TRANSFER', status, attempts: 0, lastError: null, enqueuedAt: 't', appliedAt: status === 'APPLIED' ? 't' : null, ...over });
const post = (n, over = {}) => ({ intentKey: `s|e|${n}`, sourceRef: 's', eventKey: 'e', storeCompanyId: 1, storeItemId: 7, mappingRef: 'm', quantity: 10, ...over });
const find = (r, n) => r.rows.find((x) => x.intentKey === `s|e|${n}`).finding;

test('every outcome of an interrupted hand-off is classified, and only the dangerous ones are critical', () => {
  const r = rec([out(1, 'APPLIED'), out(2, 'PENDING'), out(3, 'PENDING'), out(4, 'DEAD'), out(5, 'DEAD'), out(6, 'APPLIED'), out(7, 'APPLIED')],
    [post(1), post(3), post(5), post(7, { quantity: 11 }), post(9)], [{ storeCompanyId: 1, storeItemId: 7, quantity: 1 }]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 9].map((n) => find(r, n)), ['CONSISTENT', 'PENDING_NOT_POSTED', 'POSTED_NOT_ACKNOWLEDGED', 'DEAD_NOT_POSTED', 'DEAD_BUT_POSTED', 'ACKNOWLEDGED_WITHOUT_POSTING', 'CONTENT_MISMATCH', 'POSTING_WITHOUT_OUTBOX']);
  assert.equal(r.critical, true); assert.equal(r.repairable, false, 'a critical finding is never reported as simply repairable');
  assert.equal(r.rows.find((x) => x.intentKey === 's|e|9').outbox, 'MISSING');
});

test('an unacknowledged but identical posting is repairable by re-draining, and the stock invariant is the sum of postings', () => {
  const r = rec([out(1, 'APPLIED'), out(2, 'PENDING')], [post(1), post(2)], [{ storeCompanyId: 1, storeItemId: 7, quantity: 20 }]);
  assert.deepEqual([r.critical, r.repairable, r.invariantHolds, r.counts.POSTED_NOT_ACKNOWLEDGED, r.counts.CONSISTENT], [false, true, true, 1, 1]);
  const broken = rec([out(1, 'APPLIED')], [post(1)], [{ storeCompanyId: 1, storeItemId: 7, quantity: 30 }]);
  assert.equal(broken.invariantHolds, false); assert.deepEqual(broken.stock[0], { storeCompanyId: 1, storeItemId: 7, stock: 30, postedSum: 10, holds: false });
});

test('stock without any posting, and postings without a stock row, both break the invariant (nothing is silently assumed zero)', () => {
  assert.equal(rec([], [], [{ storeCompanyId: 2, storeItemId: 3, quantity: 5 }]).invariantHolds, false);
  assert.equal(rec([out(1, 'APPLIED')], [post(1)], []).invariantHolds, false);
  assert.equal(rec([], [], []).invariantHolds, true);
});
