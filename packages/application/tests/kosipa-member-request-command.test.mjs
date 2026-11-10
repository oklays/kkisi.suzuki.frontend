import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMemberRequest, listMemberRequests, submitMemberIntake } from '../src/kosipa/commands/member-request.ts';
import { INTAKE_HEADER, NonceCache, parseIntakeKeys, signIntakeRequest, verifyIntakeRequest } from '../src/member-intake/signature.ts';

const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const V = 'c'.repeat(64);
const now = () => new Date('2026-11-10T03:00:00Z');
const member = { memberId: 9001, userId: 101, nik: '10234' };
const decider = { userId: 20, kosipaUserId: 14, capabilities: new Set(['kosipa.savings.view', 'kosipa.loan.view', 'kosipa.member.view', 'kosipa.request.decide']), requestId: 'r1' };
const viewer = { userId: 40, kosipaUserId: 15, capabilities: new Set(['kosipa.savings.view', 'kosipa.loan.view', 'kosipa.member.view']), requestId: 'r2' };

function world({ owned = ['member.intake', 'request.loan', 'request.deduction'], legacy = 'fenced', sharedDeduction = false } = {}) {
  const calls = [], events = [], logs = [];
  const row = (type, docNo, status = 'OPEN') => ({ type, id: 1, docNo, docDate: '2026-11-10', status, channel: docNo.startsWith('PSS') ? 'public-link' : 'pwa', member: { nik: '10234', name: 'UJI', section: null }, detail: {}, version: V });
  const requests = {
    async intakeLoan(envelope, input) { calls.push({ envelope, input }); return { result: { docNo: 'PGJ-MBL-X', status: 'OPEN', type: 'loan', summary: {} }, replayed: false, ledgerId: 1 }; },
    async intakeDeduction(envelope, input) { calls.push({ envelope, input }); return { result: { docNo: 'PPS-MBL-X', status: 'OPEN', type: 'deduction', summary: {} }, replayed: false, ledgerId: 2 }; },
    async decide(envelope, type, docNo, action, decision) { calls.push({ envelope, type, docNo, action, decision }); return { result: { docNo, status: action === 'approve' ? 'APPROVED' : 'REJECTED', version: V }, replayed: false, ledgerId: 3 }; },
    async list(filter) { return [row(filter.type, 'PPS-MBL-20261110-AAAAAA'), row(filter.type, `PSS${'a'.repeat(32)}00000`), row(filter.type, 'PPS-MBL-20261109-BBBBBB', 'APPROVED')]; },
    async fenceState() { return legacy; },
    sharedWithLegacy: (type) => type === 'loan' || sharedDeduction,
  };
  const ports = { ownership: { owns: (f) => owned.includes(f) }, audit: { async append(e) { events.push(e); } }, now, requests, log: (e, f) => logs.push([e, f]) };
  return { ports, calls, events, logs };
}

test('intake: member channel envelope (actor 0, member.intake), derived ledger key, concrete command per type', async () => {
  const w = world();
  const out = await submitMemberIntake(w.ports, 'req-1', { kind: 'loan', clientKey: 'idem-loan-0000000001', member, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Sekolah' });
  assert.equal(out.result.docNo, 'PGJ-MBL-X');
  const e = w.calls[0].envelope;
  assert.deepEqual([e.command, e.capability, e.actorConsoleUserId, e.actorKosipaUserId, e.subjectType, e.subjectRef, e.requestId], ['member.request.loan.submit', 'member.intake', 0, 0, 'request.loan', 'member:9001', 'req-1']);
  assert.match(e.idempotencyKey, /^[0-9a-f-]{36}$/);
  await submitMemberIntake(w.ports, 'req-2', { kind: 'deduction', clientKey: 'idem-ded-00000000001', member, savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000 });
  assert.equal(w.calls[1].envelope.command, 'member.request.deduction.submit');
  assert.notEqual(w.calls[1].envelope.requestHash, e.requestHash);
  assert.equal(w.events.length, 0, 'no console audit event: the ledger row is the record');
});

test('intake: disabled feature and invalid bodies never reach the repository', async () => {
  const off = world({ owned: [] });
  await assert.rejects(submitMemberIntake(off.ports, 'r', { kind: 'loan' }), { code: 'WRITE_DISABLED' });
  const w = world();
  await assert.rejects(submitMemberIntake(w.ports, 'r', { kind: 'loan', clientKey: 'idem-loan-0000000001', member, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'x', status: 'APPROVED' }), { code: 'FIELD_NOT_ALLOWED' });
  assert.equal(w.calls.length, 0);
  assert.deepEqual(w.logs[0], ['member_intake_refused', { command: 'member.request.submit', code: 'FIELD_NOT_ALLOWED' }]);
});

test('decisions: request.decide capability, loan approve is legacy-only, audit actions', async () => {
  const w = world();
  await assert.rejects(decideMemberRequest(w.ports, viewer, 'deduction', 'PPS-MBL-20261110-AAAAAA', 'approve', { expectedVersion: V, idempotencyKey: KEY(1) }), { code: 'FORBIDDEN' });
  await assert.rejects(decideMemberRequest(w.ports, decider, 'loan', 'PGJ-MBL-20261110-AAAAAA', 'approve', { expectedVersion: V, idempotencyKey: KEY(2) }), { code: 'REQUEST_TYPE_UNSUPPORTED' });
  await assert.rejects(decideMemberRequest(w.ports, decider, 'deposit', 'X', 'approve', {}), { code: 'NOT_FOUND' });
  const ok = await decideMemberRequest(w.ports, decider, 'deduction', 'PPS-MBL-20261110-AAAAAA', 'approve', { expectedVersion: V, idempotencyKey: KEY(3) });
  assert.equal(ok.result.status, 'APPROVED');
  await decideMemberRequest(w.ports, decider, 'loan', 'PGJ-MBL-20261110-AAAAAA', 'reject', { expectedVersion: V, idempotencyKey: KEY(4), reason: 'Data tidak lengkap' });
  assert.deepEqual(w.calls.map((c) => [c.envelope.command, c.envelope.capability, c.type, c.action]), [['request.deduction.approve', 'kosipa.request.decide', 'deduction', 'approve'], ['request.loan.reject', 'kosipa.request.decide', 'loan', 'reject']]);
  assert.deepEqual(w.events.filter((e) => e.outcome === 'success').map((e) => e.action), ['kosipa.request.approve', 'kosipa.request.reject']);
  const off = world({ owned: ['member.intake'] });
  await assert.rejects(decideMemberRequest(off.ports, decider, 'deduction', 'PPS-MBL-20261110-AAAAAA', 'reject', { expectedVersion: V, idempotencyKey: KEY(5), reason: 'alasan valid' }), { code: 'WRITE_DISABLED' });
});

test('list: buttons only for OPEN, non-PSS rows, when owned + fenced (or shared) + granted; loans never get approve', async () => {
  const d = await listMemberRequests(world().ports, decider, { type: 'deduction', status: 'ALL', month: '2026-11' });
  assert.deepEqual(d.rows.map((r) => [r.docNo.slice(0, 7), r.canApprove, r.canReject]), [['PPS-MBL', true, true], ['PSSaaaa', false, false], ['PPS-MBL', false, false]]);
  const loan = await listMemberRequests(world({ legacy: 'legacy-active' }).ports, decider, { type: 'loan' });
  assert.deepEqual([loan.shared, loan.writable, loan.rows[0].canApprove, loan.rows[0].canReject, loan.filter.status], [true, true, false, true, 'OPEN']);
  const legacyOpen = await listMemberRequests(world({ legacy: 'legacy-active' }).ports, decider, { type: 'deduction' });
  assert.deepEqual([legacyOpen.writable, legacyOpen.rows[0].canApprove], [false, false]);
  const sharedDed = await listMemberRequests(world({ legacy: 'legacy-active', sharedDeduction: true }).ports, decider, { type: 'deduction' });
  assert.equal(sharedDed.rows[0].canApprove, true);
  const ro = await listMemberRequests(world().ports, viewer, { type: 'deduction' });
  assert.equal(ro.rows.some((r) => r.canApprove || r.canReject), false);
  await assert.rejects(listMemberRequests(world().ports, { ...viewer, capabilities: new Set(['kosipa.loan.view']) }, { type: 'loan' }), { code: 'FORBIDDEN' });
});

test('signed internal requests: valid, tampered, wrong key, expired, replayed, rotation', () => {
  const keys = parseIntakeKeys(`k2:${Buffer.alloc(32, 2).toString('base64')},k1:${Buffer.alloc(32, 1).toString('base64')}`);
  const req = { method: 'POST', path: '/api/internal/member-requests', body: '{"kind":"loan"}' };
  const t = new Date('2026-11-10T03:00:00Z');
  const header = signIntakeRequest(keys, req, t);
  assert.match(header, /^kid=k2,ts=\d+,nonce=[0-9a-f]{32},sig=[A-Za-z0-9_-]{43}$/);
  const nonces = new NonceCache();
  assert.equal(verifyIntakeRequest(keys, header, req, t, nonces).ok, true);
  assert.deepEqual(verifyIntakeRequest(keys, header, req, t, nonces), { ok: false, reason: 'REPLAYED' });
  assert.deepEqual(verifyIntakeRequest(keys, header, { ...req, body: '{"kind":"deduction"}' }, t), { ok: false, reason: 'BAD_SIGNATURE' });
  assert.deepEqual(verifyIntakeRequest(keys, header, { ...req, path: '/api/internal/other' }, t), { ok: false, reason: 'BAD_SIGNATURE' });
  assert.deepEqual(verifyIntakeRequest(keys, header, req, new Date(t.getTime() + 61_000)), { ok: false, reason: 'EXPIRED' });
  assert.deepEqual(verifyIntakeRequest(parseIntakeKeys(`k9:${Buffer.alloc(32, 9).toString('base64')}`), header, req, t), { ok: false, reason: 'UNKNOWN_KEY' });
  assert.deepEqual(verifyIntakeRequest(keys, null, req, t), { ok: false, reason: 'MISSING' });
  assert.deepEqual(verifyIntakeRequest(keys, 'kid=k2,ts=1', req, t), { ok: false, reason: 'MALFORMED' });
  const old = signIntakeRequest(parseIntakeKeys(`k1:${Buffer.alloc(32, 1).toString('base64')}`), req, t);
  assert.equal(verifyIntakeRequest(keys, old, req, t).ok, true, 'a request signed with the previous key still verifies during rotation');
  for (const bad of [undefined, '', 'k1:short', `k1:${Buffer.alloc(32).toString('base64')},k1:${Buffer.alloc(32).toString('base64')}`]) assert.throws(() => parseIntakeKeys(bad));
  assert.equal(INTAKE_HEADER, 'x-kkisi-intake');
});
