import assert from 'node:assert/strict';
import test from 'node:test';
const state = await import('../src/features/pos/checkout-state.ts').catch(() => null);
const session = { checkoutAvailable: true, register: { open: { stale: false }, multiple: false } };
const input = { session, payment: 'Cash', itemCount: 1, totalSen: 950000, paidSen: 1000000, remainingSen: null };
test('Cash tender only enables checkout with a configured writer and one current cashier session; each blocker is explained', () => {
  assert.ok(state?.checkoutBlockingReasons, 'checkout blockers are shared by button and explanation');
  const reasons = state.checkoutBlockingReasons;
  assert.deepEqual(reasons(input), []);
  assert.match(reasons({ ...input, session: { ...session, checkoutAvailable: false } }).join(' '), /belum diaktifkan/);
  assert.match(reasons({ ...input, session: { ...session, register: { open: null, multiple: false } } }).join(' '), /Buka sesi kasir/);
  assert.match(reasons({ ...input, session: { ...session, register: { open: { stale: true, openedOn: '2026-09-17' }, multiple: false } } }).join(' '), /2026-09-17/);
  assert.match(reasons({ ...input, session: { ...session, register: { open: { stale: true }, multiple: true } } }).join(' '), /lebih dari satu/);
  assert.match(reasons({ ...input, paidSen: 100 }).join(' '), /Uang bayar/);
  assert.match(reasons({ ...input, itemCount: 0, totalSen: 0 }).join(' '), /Tambahkan produk/);
  assert.match(reasons({ ...input, payment: 'Kredit' }).join(' '), /anggota aktif/);
  assert.match(reasons({ ...input, payment: 'Kredit', remainingSen: 100 }).join(' '), /limit/);
  assert.deepEqual(reasons({ ...input, payment: 'Kredit', remainingSen: input.totalSen }), []);
  // QRIS does not require paid amount or member credit
  assert.deepEqual(reasons({ ...input, payment: 'QRIS', paidSen: 0, remainingSen: null }), []);
  assert.match(reasons({ ...input, payment: 'QRIS', paidSen: 0, itemCount: 0, totalSen: 0 }).join(' '), /Tambahkan produk/);
  assert.match(reasons({ ...input, payment: 'QRIS', paidSen: 0, session: { ...session, register: { open: null, multiple: false } } }).join(' '), /Buka sesi kasir/);
});

test('domain payment behavior accurately reflects Static QRIS rules', async () => {
  const { PAYMENT_METHODS, PAYMENT_BEHAVIORS, isQrisPayment } = await import('@koperasi/domain/pos/payment-method');
  assert.deepEqual(PAYMENT_METHODS, ['Cash', 'QRIS', 'Kredit']);
  assert.equal(isQrisPayment('QRIS'), true);
  assert.equal(isQrisPayment('Cash'), false);
  assert.equal(isQrisPayment('Kredit'), false);

  assert.deepEqual(PAYMENT_BEHAVIORS.QRIS, {
    requiresTenderAmount: false,
    affectsCashDrawer: false,
    requiresMember: false,
    isReceivable: false,
  });
  assert.deepEqual(PAYMENT_BEHAVIORS.Cash, {
    requiresTenderAmount: true,
    affectsCashDrawer: true,
    requiresMember: false,
    isReceivable: false,
  });
  assert.deepEqual(PAYMENT_BEHAVIORS.Kredit, {
    requiresTenderAmount: false,
    affectsCashDrawer: false,
    requiresMember: true,
    isReceivable: true,
  });
});

test('barcode scans from a completed or cleared cart stay invalid after checkout unlocks', () => {
  assert.equal(typeof state.createCartScanGuard, 'function', 'a scan generation guard is available');
  const guard = state.createCartScanGuard();
  const beforeCheckout = guard.capture();
  guard.invalidate(); // checkout locks; unlocking cannot restore the old generation
  assert.equal(guard.isCurrent(beforeCheckout), false);
  const beforeClear = guard.capture();
  guard.invalidate(); // confirmed clear-all starts a fresh cart
  assert.equal(guard.isCurrent(beforeClear), false);
  assert.equal(guard.isCurrent(guard.capture()), true);
});

test('consecutive barcode scans in the same cart generation both remain valid', () => {
  assert.equal(typeof state.createCartScanGuard, 'function');
  const guard = state.createCartScanGuard();
  const firstScan = guard.capture();
  const secondScan = guard.capture();
  assert.equal(guard.isCurrent(firstScan), true);
  assert.equal(guard.isCurrent(secondScan), true);
});
