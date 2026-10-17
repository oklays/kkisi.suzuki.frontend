import assert from 'node:assert/strict';

/**
 * Conformance suites for the two ports that carry quantities between Warehouse and TOKO. Any implementation (in-memory, local-database rehearsal, a future
 * production adapter) must pass the same checks; they encode the exactly-once assumptions the outbox design depends on.
 *   runOutboxContract({ name, make, reset })  make() -> { outbox, uniqueKeyPrefix }
 *   runApplierContract({ name, make })        make() -> { applier, balanceOf(companyId, itemId) }
 */
const rec = (prefix, n, over = {}) => ({ intentKey: `${prefix}|event-${n}|1`, sourceRef: prefix, eventKey: `event-${n}`, storeCompanyId: 1, storeItemId: 70 + n, mappingRef: `map:g${n}:c1:s${70 + n}`, quantity: 10 + n, treatment: 'INTERNAL_TRANSFER', status: 'PENDING', attempts: 0, lastError: null, enqueuedAt: `2026-10-17T05:00:0${n}.000Z`, appliedAt: null, ...over });

export function runOutboxContract({ name, make, test, skip = false }) {
  test(`${name}: StockOutbox contract — insert-if-absent, immutable content, deterministic bounded order, compare-and-set transitions`, { skip }, async () => {
    const { outbox, uniqueKeyPrefix } = await make(); const p = uniqueKeyPrefix;
    const a = rec(p, 1), b = rec(p, 2), c = rec(p, 3);
    assert.deepEqual(await outbox.enqueue([a, b]), { inserted: [a.intentKey, b.intentKey], existing: [], conflicts: [] });
    assert.deepEqual(await outbox.enqueue([a, c]), { inserted: [c.intentKey], existing: [a.intentKey], conflicts: [] }, 'a known key with identical content is "existing"');
    const changed = rec(p, 1, { quantity: a.quantity + 1 }); const r = await outbox.enqueue([changed]);
    assert.deepEqual([r.inserted, r.existing, r.conflicts], [[], [], [a.intentKey]], 'the same key with other content is a conflict, never an overwrite');
    const mine = (await outbox.pending(500)).filter((x) => x.sourceRef === p);
    assert.deepEqual(mine.map((x) => x.intentKey), [a.intentKey, b.intentKey, c.intentKey], 'pending order is (enqueuedAt, intentKey)'); assert.equal(mine[0].quantity, a.quantity);
    assert.ok((await outbox.pending(1)).length <= 1, 'bounded by the limit');
    assert.equal(await outbox.markApplied(a.intentKey, '2026-10-17T06:00:00.000Z'), true); assert.equal(await outbox.markApplied(a.intentKey, '2026-10-17T06:00:01.000Z'), false, 'compare-and-set: the second acknowledgement loses');
    assert.ok(!(await outbox.pending(500)).some((x) => x.intentKey === a.intentKey), 'an applied record is no longer pending');
    assert.equal(await outbox.markFailed(b.intentKey, 'boom', 2), 'PENDING'); assert.equal(await outbox.markFailed(b.intentKey, 'boom again', 2), 'DEAD');
    assert.ok(!(await outbox.pending(500)).some((x) => x.intentKey === b.intentKey), 'a dead record is not drained');
    assert.equal(await outbox.markApplied(b.intentKey, 'x'), false, 'a dead record cannot be acknowledged as applied without the explicit recovery rule');
  });
}

export function runApplierContract({ name, make, test, skip = false }) {
  test(`${name}: StockApplier contract — idempotent by intent key, independent keys add up exactly, nothing is half-applied`, { skip }, async () => {
    const { applier, balanceOf, uniqueKeyPrefix } = await make(); const p = uniqueKeyPrefix;
    const a = rec(p, 1, { storeItemId: 910_001 + (Date.now() % 1000) }), b = rec(p, 2, { storeItemId: a.storeItemId }), other = rec(p, 3, { storeItemId: a.storeItemId + 1 });
    assert.equal(await balanceOf(1, a.storeItemId), 0);
    assert.equal(await applier.apply(a), 'APPLIED'); assert.equal(await balanceOf(1, a.storeItemId), a.quantity);
    assert.equal(await applier.apply(a), 'ALREADY_APPLIED', 'the same key again changes nothing'); assert.equal(await balanceOf(1, a.storeItemId), a.quantity);
    assert.equal(await applier.apply(b), 'APPLIED'); assert.equal(await balanceOf(1, a.storeItemId), a.quantity + b.quantity, 'different keys add up exactly');
    const results = await Promise.all([applier.apply(other), applier.apply(other), applier.apply(other)]);
    assert.deepEqual(results.filter((x) => x === 'APPLIED').length, 1, 'concurrent deliveries of one key: exactly one wins'); assert.equal(await balanceOf(1, other.storeItemId), other.quantity);
  });
}
