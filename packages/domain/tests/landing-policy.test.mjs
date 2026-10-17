import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLandingPolicy, resolvePostLoginLanding } from '../src/console/landing-policy.ts';
import { tokoCapabilities } from '../src/console/capabilities.ts';

// R1 fixtures (synthetic): a cashier role that, like the real 30 Sep configuration, carries management slugs.
const MANAGEMENT_CASHIER = tokoCapabilities(new Set(['sales_add', 'sales_view', 'sales_payment_view', 'sales_return_view', 'sales_return_add', 'items_view', 'items_add', 'items_edit', 'inventory_so', 'inventory_view']), false);
const PURE_CASHIER = tokoCapabilities(new Set(['sales_add']), false);
const NO_CHECKOUT = tokoCapabilities(new Set(['items_view', 'inventory_so']), false);
const ADMIN = new Set([...tokoCapabilities(new Set(['sales_add', 'items_view', 'inventory_view']), true), 'iam.link.manage']);
const R1 = parseLandingPolicy('4:pos,1:console,2:console').policy;
const land = (roleId, capabilities, policy = R1, consoleEnabled = true) => resolvePostLoginLanding({ roleId, capabilities, policy, consoleEnabled });

test('R1: with the explicit policy a cashier role lands on /pos even though it inherits management grants; administrators land on /console', () => {
  assert.deepEqual(land(4, MANAGEMENT_CASHIER), { target: '/pos', reason: 'policy' });
  assert.deepEqual(land(1, ADMIN), { target: '/console', reason: 'policy' });
  assert.deepEqual(land(2, ADMIN), { target: '/console', reason: 'policy' });
});

test('without a configured policy behaviour is unchanged: the same cashier lands on /console (today\'s capability-derived rule); a pure cashier on /pos', () => {
  assert.deepEqual(land(4, MANAGEMENT_CASHIER, null), { target: '/console', reason: 'derived' });
  assert.deepEqual(land(4, PURE_CASHIER, null), { target: '/pos', reason: 'derived' });
  assert.deepEqual(land(3, MANAGEMENT_CASHIER), { target: '/console', reason: 'derived' }, 'an unmapped role keeps the derived rule');
});

test('no authorisation expansion, no loop: a role mapped to pos without checkout lands on /console; console disabled always lands on /pos', () => {
  assert.deepEqual(land(4, NO_CHECKOUT), { target: '/console', reason: 'policy-pos-without-checkout' });
  assert.deepEqual(land(4, new Set()), { target: '/console', reason: 'policy-pos-without-checkout' });
  for (const role of [1, 4, 9]) assert.deepEqual(land(role, MANAGEMENT_CASHIER, R1, false), { target: '/pos', reason: 'console-disabled' });
  // the decision never returns a third destination: /console never redirects to itself and /pos is only chosen with checkout
  for (const caps of [MANAGEMENT_CASHIER, PURE_CASHIER, NO_CHECKOUT, ADMIN, new Set()]) for (const role of [1, 2, 3, 4, 99]) {
    const d = land(role, caps); assert.ok(['/pos', '/console'].includes(d.target)); if (d.target === '/pos') assert.ok(caps.has('toko.pos.checkout'));
  }
});

test('the mapping is parsed strictly and a malformed value is ignored AS A WHOLE (never partially applied)', () => {
  assert.equal(parseLandingPolicy(undefined).policy, null); assert.equal(parseLandingPolicy('  ').policy, null);
  assert.deepEqual([...parseLandingPolicy(' 4:pos , 1:console ').policy], [[4, 'pos'], [1, 'console']]);
  for (const bad of ['4:POS', '4:admin', '0:pos', '-1:pos', 'x:pos', '4=pos', '4:pos,4:console', '4:pos,,1:console', '4:pos;1:console', Array.from({ length: 51 }, (_, i) => `${i + 1}:pos`).join(',')]) {
    const r = parseLandingPolicy(bad); assert.equal(r.policy, null, bad); assert.ok(r.error, bad);
  }
});
