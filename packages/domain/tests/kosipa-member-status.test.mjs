import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_STATUSES, parseMemberStatus, planMemberStatus } from '../src/kosipa/member-command.ts';

const KEY = '00000000-0000-4000-8000-000000000001';
const VERSION = 'a'.repeat(64);
const body = (extra = {}) => ({ status: 'RESIGN', reason: 'Karyawan mengundurkan diri', expectedVersion: VERSION, idempotencyKey: KEY, ...extra });
const fail = (fn, code) => assert.throws(fn, (e) => e.code === code, code);

test('status vocabulary is exactly the five legacy values', () => {
  assert.deepEqual([...MEMBER_STATUSES], ['AKTIVE', 'LUAR BIASA', 'KONTRAK', 'RESIGN', 'PENSIUN']);
});

test('parse: exact shape, mandatory reason (FD-17 subset), valid status and opaque version', () => {
  const p = parseMemberStatus(body());
  assert.deepEqual(p, { status: 'RESIGN', reason: 'Karyawan mengundurkan diri', expectedVersion: VERSION, idempotencyKey: KEY });
  for (const status of MEMBER_STATUSES) assert.equal(parseMemberStatus(body({ status })).status, status);
  for (const status of ['aktive', 'DELETED', '', null, 1, 'AKTIVE ']) fail(() => parseMemberStatus(body({ status })), 'MEMBER_STATUS_INVALID');
  const { reason, ...noReason } = body(); void reason;
  fail(() => parseMemberStatus(noReason), 'REASON_INVALID');
  fail(() => parseMemberStatus(body({ reason: 'x' })), 'REASON_INVALID');
  for (const expectedVersion of ['', 'A'.repeat(64), 'a'.repeat(63), null]) fail(() => parseMemberStatus(body({ expectedVersion })), 'VERSION_INVALID');
  fail(() => parseMemberStatus(body({ idempotencyKey: 'x' })), 'IDEMPOTENCY_KEY_INVALID');
  fail(() => parseMemberStatus(body({ limit_toko: 5 })), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberStatus(body({ gaji_minus: 5 })), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberStatus(null), 'INVALID_INPUT');
});

test('plan: to non-AKTIVE zeroes the three ceilings and disables the mobile identity; to AKTIVE is member-only (FD-30); same status is NO_CHANGE', () => {
  const input = parseMemberStatus(body());
  const toOff = planMemberStatus({ id: 7, status: 'AKTIVE' }, input);
  assert.deepEqual(toOff, { id: 7, from: 'AKTIVE', to: 'RESIGN', kind: 'deactivate', zeroLimits: true, disableMobile: true });
  for (const to of ['LUAR BIASA', 'KONTRAK', 'PENSIUN']) assert.equal(planMemberStatus({ id: 7, status: 'AKTIVE' }, parseMemberStatus(body({ status: to }))).kind, 'deactivate');
  // non-AKTIVE -> another non-AKTIVE re-applies the same safe effects (a stale mobile identity or ceiling is never left behind)
  assert.deepEqual(planMemberStatus({ id: 7, status: 'RESIGN' }, parseMemberStatus(body({ status: 'PENSIUN' }))), { id: 7, from: 'RESIGN', to: 'PENSIUN', kind: 'deactivate', zeroLimits: true, disableMobile: true });
  const on = planMemberStatus({ id: 7, status: 'RESIGN' }, parseMemberStatus(body({ status: 'AKTIVE' })));
  assert.deepEqual(on, { id: 7, from: 'RESIGN', to: 'AKTIVE', kind: 'reactivate', zeroLimits: false, disableMobile: false });
  fail(() => planMemberStatus({ id: 7, status: 'RESIGN' }, input), 'NO_CHANGE');
  fail(() => planMemberStatus({ id: 7, status: 'AKTIVE' }, parseMemberStatus(body({ status: 'AKTIVE' }))), 'NO_CHANGE');
  fail(() => planMemberStatus(null, input), 'MEMBER_NOT_FOUND');
  // historical/garbage stored status: any other target is allowed (it can be corrected), AKTIVE target is a reactivation
  assert.equal(planMemberStatus({ id: 7, status: null }, parseMemberStatus(body({ status: 'AKTIVE' }))).kind, 'reactivate');
});
