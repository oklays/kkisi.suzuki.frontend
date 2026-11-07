import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavingsDeposit, approveSavingsDeposit, rejectSavingsDeposit, listSavingsDeposits, lookupDepositMember } from '../src/kosipa/commands/savings-deposit.ts';
import { KosipaError } from '../../domain/src/kosipa/errors.ts';

const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const V = 'd'.repeat(64);
const now = () => new Date('2026-11-07T03:00:00Z'); // Jakarta 10:00, 7 Nov 2026
const maker = { userId: 31, kosipaUserId: 70, capabilities: new Set(['kosipa.member.view', 'kosipa.savings.view', 'kosipa.savings.prepare']), requestId: 'r1' };
const checker = { userId: 20, kosipaUserId: 14, capabilities: new Set(['kosipa.member.view', 'kosipa.savings.view', 'kosipa.savings.approve']), requestId: 'r2' };
const body = (extra = {}) => ({ memberId: '9101', docDate: '2026-11-07', paymentType: 'CASH', amount: '50000', bankName: '', bankAccount: '', remarks: '', idempotencyKey: KEY(1), ...extra });
function world(owns = true) {
  const calls = [], events = [], ledger = new Map();
  const commit = async (method, envelope, ...args) => {
    calls.push({ method, envelope, args });
    const k = `${envelope.actorConsoleUserId}:${envelope.idempotencyKey}`; const s = ledger.get(k);
    if (s) { if (s.hash !== envelope.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
    const result = { id: 77, docNo: 'TFCSH20261100077', status: method === 'create' ? 'POSTING' : args[1] === 'approve' ? 'APPROVED' : 'REJECTED', version: V };
    ledger.set(k, { hash: envelope.requestHash, result, id: ledger.size + 1 }); return { result, replayed: false, ledgerId: ledger.size };
  };
  const rows = [{ id: 77, status: 'POSTING', makerConsoleUserId: 31 }, { id: 78, status: 'POSTING', makerConsoleUserId: 20 }, { id: 79, status: 'POSTING', makerConsoleUserId: null }, { id: 80, status: 'APPROVED', makerConsoleUserId: 31 }];
  const ports = { ownership: { owns: (f) => owns && f === 'savings.deposit' }, audit: { async append(e) { events.push(e); } }, now,
    deposits: { create: (e, i) => commit('create', e, i), decide: (e, id, kind, d) => commit('decide', e, id, kind, d), async list(filter) { calls.push({ method: 'list', filter }); return rows; },
      async member(nik) { return nik === 'SKFA0001' ? { id: 9101, nik, name: 'SYNTH', group: 'ANGGOTA', status: 'AKTIVE', balance: '0' } : null; }, async fenceState() { return 'fenced'; } } };
  return { ports, calls, events };
}

test('create: prepare grant + views + ownership; Jakarta clock decides the month (FD-36); command and audit names', async () => {
  await assert.rejects(createSavingsDeposit(world(false).ports, maker, body()), { code: 'WRITE_DISABLED' });
  for (const a of [checker, { ...maker, kosipaUserId: null }, { ...maker, capabilities: new Set(['kosipa.savings.prepare', 'kosipa.member.view']) }]) {
    const w = world(); await assert.rejects(createSavingsDeposit(w.ports, a, body()), { code: 'FORBIDDEN' }); assert.equal(w.calls.length, 0);
  }
  const w = world();
  const r = await createSavingsDeposit(w.ports, maker, body());
  assert.equal(r.result.status, 'POSTING');
  assert.equal(w.calls[0].envelope.command, 'savings.deposit.create'); assert.equal(w.calls[0].envelope.capability, 'kosipa.savings.prepare');
  assert.equal(w.calls[0].args[0].amount, '50000'); assert.equal(w.events[0].action, 'kosipa.savings.deposit.create');
  await assert.rejects(createSavingsDeposit(w.ports, maker, body({ docDate: '2026-10-31', idempotencyKey: KEY(2) })), { code: 'SAVINGS_DATE_INVALID' });
  assert.ok(!JSON.stringify(w.events).includes('50000'), 'no amounts in the console audit');
});

test('approve/reject: approve grant; reject needs a reason; the maker grant alone cannot decide; replay suppresses a second audit', async () => {
  const w = world();
  await assert.rejects(approveSavingsDeposit(w.ports, maker, '77', { expectedVersion: V, idempotencyKey: KEY(3) }), { code: 'FORBIDDEN' });
  const a = await approveSavingsDeposit(w.ports, checker, '77', { expectedVersion: V, idempotencyKey: KEY(3) });
  assert.equal(a.result.status, 'APPROVED'); assert.equal(w.calls.at(-1).envelope.command, 'savings.deposit.approve'); assert.equal(w.calls.at(-1).args[1], 'approve');
  assert.equal((await approveSavingsDeposit(w.ports, checker, '77', { expectedVersion: V, idempotencyKey: KEY(3) })).replayed, true);
  assert.equal(w.events.filter((e) => e.action === 'kosipa.savings.deposit.approve').length, 1);
  await assert.rejects(rejectSavingsDeposit(w.ports, checker, '77', { expectedVersion: V, idempotencyKey: KEY(4) }), { code: 'REASON_INVALID' });
  const r = await rejectSavingsDeposit(w.ports, checker, '77', { expectedVersion: V, reason: 'Nominal salah', idempotencyKey: KEY(5) });
  assert.equal(r.result.status, 'REJECTED'); assert.ok(!JSON.stringify(w.events).includes('Nominal salah'));
  await assert.rejects(approveSavingsDeposit(w.ports, checker, 'abc', { expectedVersion: V, idempotencyKey: KEY(6) }), { code: 'SAVINGS_DOC_ID_INVALID' });
});

test('list: views required; FD-35 already applied per row for the viewer; default filter = pending in the current Jakarta month', async () => {
  const w = world();
  const data = await listSavingsDeposits(w.ports, checker, {});
  assert.deepEqual(data.filter, { status: 'POSTING', month: '2026-11' }); assert.equal(data.writable, true);
  assert.deepEqual(data.rows.map((r) => [r.id, r.canApprove, r.canReject]), [[77, true, true], [78, false, true], [79, true, true], [80, false, false]], 'own deposit (78) cannot be approved by its maker');
  await assert.rejects(listSavingsDeposits(w.ports, { ...checker, capabilities: new Set(['kosipa.member.view']) }, {}), { code: 'FORBIDDEN' });
  assert.deepEqual((await listSavingsDeposits(w.ports, checker, { status: 'ALL', month: '2026-13' })).filter, { status: 'ALL', month: '2026-11' });
  assert.equal((await lookupDepositMember(w.ports, maker, 'SKFA0001')).name, 'SYNTH');
  await assert.rejects(lookupDepositMember(w.ports, checker, 'SKFA0001'), { code: 'FORBIDDEN' }, 'lookup exists only for preparing a deposit');
  await assert.rejects(lookupDepositMember(w.ports, maker, 'NOPE'), { code: 'MEMBER_NOT_FOUND' });
  await assert.rejects(lookupDepositMember(w.ports, maker, "1' OR 1=1"), { code: 'NIK_INVALID' });
});
