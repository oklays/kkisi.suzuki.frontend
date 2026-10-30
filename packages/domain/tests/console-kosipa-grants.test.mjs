import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleError } from '../src/console/identity-link.ts';
import { ALL_CAPABILITIES, GRANTABLE_KOSIPA_CAPABILITIES, KOSIPA_WRITE_CAPABILITIES, KOSIPA_WRITE_REQUIRES } from '../src/console/capabilities.ts';
import { kosipaCapabilitiesFromMenus, KOSIPA_MENU_URLS } from '../src/console/kosipa-access.ts';
import { assertGrantDecisionAllowed, assertGrantRequestAllowed, assertGrantRevocable, parseGrantableCapability, parseGrantReason, writeCapabilitiesFromGrants } from '../src/console/kosipa-grants.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof ConsoleError, String(e)); return e.code; } };
const ok = { actorUserId: 1, target: { id: 2, active: true }, targetLinked: true, alreadyOpen: false };

test('write vocabulary: every write capability is known, needs a view capability, and only existing commands are grantable', () => {
  for (const cap of KOSIPA_WRITE_CAPABILITIES) {
    assert.ok(ALL_CAPABILITIES.includes(cap));
    assert.match(KOSIPA_WRITE_REQUIRES[cap], /^kosipa\.(member|savings|loan|payroll)\.view$/);
  }
  assert.equal(KOSIPA_WRITE_REQUIRES['kosipa.master.manage'], 'kosipa.member.view');
  assert.equal(KOSIPA_WRITE_REQUIRES['kosipa.loan.disburse'], 'kosipa.loan.view');
  assert.equal(KOSIPA_WRITE_REQUIRES['kosipa.deduction.manage'], 'kosipa.savings.view');
  assert.deepEqual(GRANTABLE_KOSIPA_CAPABILITIES, ['kosipa.master.manage'], 'FA-01: no financial capability is grantable');
});

test('legacy menus (even every KOSIPA controller) never yield a write capability (SEC-102)', () => {
  const caps = kosipaCapabilitiesFromMenus([...KOSIPA_MENU_URLS, 'master/lokasi_c', 'pinjaman/pinjaman_c']);
  for (const cap of KOSIPA_WRITE_CAPABILITIES) assert.ok(!caps.has(cap), cap);
});

test('grant request: another active, linked console user; no self-grant; no second open request or grant', () => {
  assert.equal(code(() => assertGrantRequestAllowed(ok)), null);
  assert.equal(code(() => assertGrantRequestAllowed({ ...ok, target: null })), 'CONSOLE_USER_NOT_FOUND');
  assert.equal(code(() => assertGrantRequestAllowed({ ...ok, actorUserId: 2 })), 'SELF_GRANT');
  assert.equal(code(() => assertGrantRequestAllowed({ ...ok, target: { id: 2, active: false } })), 'CONSOLE_USER_INACTIVE');
  assert.equal(code(() => assertGrantRequestAllowed({ ...ok, targetLinked: false })), 'NOT_LINKED');
  assert.equal(code(() => assertGrantRequestAllowed({ ...ok, alreadyOpen: true })), 'ALREADY_GRANTED');
  assert.equal(code(() => assertGrantRevocable(null)), 'GRANT_NOT_FOUND');
  assert.equal(code(() => assertGrantRevocable({ status: 'pending' })), 'GRANT_NOT_ACTIVE', 'a pending request is rejected, not revoked');
  assert.equal(code(() => assertGrantRevocable({ status: 'active' })), null);
});

test('two-administrator approval: no self-approval, no approval of own access, no duplicate, no expired or stale request', () => {
  const now = new Date('2026-10-30T05:00:00Z');
  const pending = { status: 'pending', consoleUserId: 2, requestedBy: 1, expiresAt: new Date('2026-10-31T05:00:00Z') };
  const facts = { actorUserId: 3, request: pending, now, requesterStillAdmin: true, target: { active: true }, targetLinked: true };
  const approve = (f) => code(() => assertGrantDecisionAllowed({ ...facts, ...f }, 'approve'));
  assert.equal(approve({}), null);
  assert.equal(approve({ request: null }), 'GRANT_NOT_FOUND');
  assert.equal(approve({ actorUserId: 1 }), 'SELF_APPROVAL', 'the requester cannot be the second administrator');
  assert.equal(approve({ actorUserId: 2 }), 'SELF_GRANT', 'the beneficiary cannot approve');
  assert.equal(approve({ request: { ...pending, status: 'active' } }), 'GRANT_NOT_PENDING', 'duplicate approval');
  for (const status of ['rejected', 'expired', 'revoked']) assert.equal(approve({ request: { ...pending, status } }), 'GRANT_NOT_PENDING');
  assert.equal(approve({ request: { ...pending, expiresAt: now } }), 'GRANT_REQUEST_EXPIRED');
  assert.equal(approve({ requesterStillAdmin: false }), 'GRANT_REQUEST_STALE', 'requester lost administrator rights meanwhile');
  assert.equal(approve({ targetLinked: false }), 'GRANT_REQUEST_STALE', 'identity link revoked meanwhile');
  assert.equal(approve({ target: { active: false } }), 'GRANT_REQUEST_STALE');
  const reject = (f) => code(() => assertGrantDecisionAllowed({ ...facts, ...f }, 'reject'));
  assert.equal(reject({ actorUserId: 1 }), null, 'the requester may withdraw');
  assert.equal(reject({ request: { ...pending, expiresAt: now }, requesterStillAdmin: false }), null, 'refusing never needs fresh facts');
  assert.equal(reject({ actorUserId: 2 }), 'SELF_GRANT');
  assert.equal(reject({ request: { ...pending, status: 'rejected' } }), 'GRANT_NOT_PENDING');
});

test('grant input: only grantable capabilities, reason 5-200 characters', () => {
  assert.equal(parseGrantableCapability('kosipa.master.manage'), 'kosipa.master.manage');
  for (const bad of ['kosipa.loan.disburse', 'kosipa.member.view', 'iam.kosipa.grant', '', 3]) assert.equal(code(() => parseGrantableCapability(bad)), 'CAPABILITY_NOT_GRANTABLE', String(bad));
  assert.equal(parseGrantReason('  admin   master data '), 'admin master data');
  for (const bad of ['', 'abcd', 'x'.repeat(201), 'ab\u0000cdef', null]) assert.equal(code(() => parseGrantReason(bad)), 'REASON_REQUIRED');
});

test('effective write capabilities need the view capability now held; unknown names grant nothing', () => {
  assert.deepEqual([...writeCapabilitiesFromGrants(['kosipa.master.manage'], new Set(['kosipa.member.view']))], ['kosipa.master.manage']);
  assert.equal(writeCapabilitiesFromGrants(['kosipa.master.manage'], new Set(['kosipa.loan.view'])).size, 0, 'link lost member access -> grant is inert');
  assert.equal(writeCapabilitiesFromGrants(['kosipa.everything', 'iam.kosipa.grant', 'toko.pos.checkout'], new Set(['kosipa.member.view'])).size, 0);
});
