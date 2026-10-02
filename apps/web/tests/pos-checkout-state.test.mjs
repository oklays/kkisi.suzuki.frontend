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
});
