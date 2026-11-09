import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLoan, readLoanDecision } from '../src/kosipa/commands/loan-decision.ts';
import { KosipaError } from '../../domain/src/kosipa/errors.ts';

const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const V = 'e'.repeat(64);
const now = () => new Date('2026-11-09T03:00:00Z');
const staff = { userId: 31, kosipaUserId: 70, capabilities: new Set(['kosipa.loan.view', 'kosipa.loan.prepare']), requestId: 'r1' };
const checker = { userId: 20, kosipaUserId: 14, capabilities: new Set(['kosipa.loan.view', 'kosipa.loan.approve']), requestId: 'r2' };
const viewer = { userId: 40, kosipaUserId: 15, capabilities: new Set(['kosipa.loan.view']), requestId: 'r3' };

function world({ owns = true, legacy = 'fenced', status = 'POSTING', poster = null, shared = false } = {}) {
  const calls = [], events = [], ledger = new Map();
  const loanDecisions = {
    async decide(envelope, docNo, action, input) {
      calls.push({ envelope, docNo, action, input });
      const k = `${envelope.actorConsoleUserId}:${envelope.idempotencyKey}`; const s = ledger.get(k);
      if (s) { if (s.hash !== envelope.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
      const result = { id: 9120, docNo, status: action === 'post' ? 'POSTING' : action === 'approve' ? 'APPROVED' : 'REJECTED', version: V };
      ledger.set(k, { hash: envelope.requestHash, result, id: ledger.size + 1 }); return { result, replayed: false, ledgerId: ledger.size };
    },
    async read(docNo) {
      if (docNo !== 'PIN20261100120') return null;
      return { facts: { id: 9120, docNo, status, disbursement: 'OPEN', repayment: 'BELUM LUNAS', planPrincipal: '6000000.00', type: 'PINJAMAN REGULAR', nik: 'SKFA0001', mobile: false, headerCount: 1 },
        context: { posterConsoleUserId: poster, members: [{ status: 'AKTIVE' }], mobileRequests: 0, ppobOrders: 0 }, version: V,
        stamps: { postedAt: null, postedBy: null, approvedAt: null, approvedBy: null, rejectedAt: null, rejectedBy: null, rejectReason: null } };
    },
    async fenceState() { return legacy; },
    sharedWithLegacy: shared,
  };
  const ports = { ownership: { owns: (f) => owns && f === 'loan.decision' }, audit: { async append(e) { events.push(e); } }, now, loanDecisions };
  return { ports, calls, events };
}

test('capabilities: post needs loan.prepare, approve/reject need loan.approve; a view-only or unlinked actor reaches nothing', async () => {
  const w = world();
  await assert.rejects(decideLoan(w.ports, checker, 'PIN20261100120', 'post', { expectedVersion: V, idempotencyKey: KEY(1) }), { code: 'FORBIDDEN' });
  await assert.rejects(decideLoan(w.ports, staff, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(2) }), { code: 'FORBIDDEN' });
  await assert.rejects(decideLoan(w.ports, viewer, 'PIN20261100120', 'reject', { expectedVersion: V, idempotencyKey: KEY(3), reason: 'alasan valid' }), { code: 'FORBIDDEN' });
  await assert.rejects(decideLoan(w.ports, { ...checker, kosipaUserId: null }, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(4) }), { code: 'FORBIDDEN' });
  // approve without the loan VIEW capability is refused too (KOSIPA_WRITE_REQUIRES)
  await assert.rejects(decideLoan(w.ports, { ...checker, capabilities: new Set(['kosipa.loan.approve']) }, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(5) }), { code: 'FORBIDDEN' });
  assert.equal(w.calls.length, 0);
  assert.ok(w.events.every((e) => e.action === 'kosipa.command.denied'));
});

test('ownership off -> WRITE_DISABLED before anything; unknown action -> NOT_FOUND; malformed doc number -> DOC_NO_INVALID', async () => {
  await assert.rejects(decideLoan(world({ owns: false }).ports, checker, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(1) }), { code: 'WRITE_DISABLED' });
  await assert.rejects(decideLoan(world().ports, checker, 'PIN20261100120', 'disburse', {}), { code: 'NOT_FOUND' });
  await assert.rejects(decideLoan(world().ports, checker, "PIN' OR 1=1", 'approve', { expectedVersion: V, idempotencyKey: KEY(1) }), { code: 'DOC_NO_INVALID' });
});

test('commands, subjects and audit names; reject carries the reason; replay returns the first result without a second audit event', async () => {
  const w = world();
  const p = await decideLoan(w.ports, staff, 'PIN20261100120', 'post', { expectedVersion: V, idempotencyKey: KEY(1) });
  assert.equal(p.result.status, 'POSTING');
  assert.deepEqual([w.calls[0].envelope.command, w.calls[0].envelope.capability, w.calls[0].envelope.subjectType, w.calls[0].envelope.subjectRef], ['loan.post', 'kosipa.loan.prepare', 'loan', 'PIN20261100120']);
  const a = await decideLoan(w.ports, checker, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(2) });
  assert.equal(a.result.status, 'APPROVED'); assert.equal(w.calls[1].envelope.capability, 'kosipa.loan.approve');
  const again = await decideLoan(w.ports, checker, 'PIN20261100120', 'approve', { expectedVersion: V, idempotencyKey: KEY(2) });
  assert.equal(again.replayed, true);
  assert.equal(w.events.filter((e) => e.action === 'kosipa.loan.approve').length, 1);
  const r = await decideLoan(w.ports, checker, 'PIN20261100120', 'reject', { expectedVersion: V, idempotencyKey: KEY(3), reason: 'Berkas tidak lengkap' });
  assert.equal(r.result.status, 'REJECTED'); assert.equal(w.calls.at(-1).input.reason, 'Berkas tidak lengkap');
  assert.deepEqual(w.events.map((e) => e.action), ['kosipa.loan.post', 'kosipa.loan.approve', 'kosipa.loan.reject']);
  assert.ok(!JSON.stringify(w.events).includes('Berkas'), 'the reason text stays in the ledger, not in the console audit');
  // The same key for another action is a conflict, never a silent replay.
  await assert.rejects(decideLoan(w.ports, checker, 'PIN20261100120', 'reject', { expectedVersion: V, idempotencyKey: KEY(2), reason: 'Berkas tidak lengkap' }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('decision state: view capability; options per viewer; legacy-active or not owned turns every allowed action off with a reason', async () => {
  await assert.rejects(readLoanDecision(world().ports, { ...checker, capabilities: new Set() }, 'PIN20261100120'), { code: 'FORBIDDEN' });
  assert.equal(await readLoanDecision(world().ports, checker, 'PIN20269999999'), null);
  const s = await readLoanDecision(world().ports, checker, 'PIN20261100120');
  assert.deepEqual(s.options.map((o) => [o.action, o.allowed, o.blocker]), [['post', false, 'FORBIDDEN'], ['approve', true, null], ['reject', true, null]]);
  assert.equal(s.writable, true); assert.equal(s.version, V);
  const open = await readLoanDecision(world({ status: 'OPEN' }).ports, staff, 'PIN20261100120');
  assert.deepEqual(open.options.map((o) => o.allowed), [true, false, false]);
  const fenced = await readLoanDecision(world({ legacy: 'legacy-active' }).ports, checker, 'PIN20261100120');
  assert.deepEqual(fenced.options.map((o) => o.blocker), ['FORBIDDEN', 'LEGACY_ACTIVE', 'LEGACY_ACTIVE']); assert.equal(fenced.writable, false);
  const off = await readLoanDecision(world({ owns: false }).ports, checker, 'PIN20261100120');
  assert.deepEqual(off.options.map((o) => o.blocker), ['FORBIDDEN', 'WRITE_DISABLED', 'WRITE_DISABLED']);
  const own = await readLoanDecision(world({ poster: 20 }).ports, checker, 'PIN20261100120');
  assert.equal(own.postedByViewer, true); assert.deepEqual(own.options.map((o) => o.blocker), ['FORBIDDEN', 'LOAN_MAKER_CHECKER', 'LOAN_MAKER_CHECKER']);
});

test('coexistence (owner decision, UAT): legacy screens open but shared mode on -> decisions allowed and flagged; off -> LEGACY_ACTIVE', async () => {
  const shared = await readLoanDecision(world({ legacy: 'legacy-active', shared: true }).ports, checker, 'PIN20261100120');
  assert.equal(shared.writable, true); assert.equal(shared.shared, true); assert.equal(shared.legacy, 'legacy-active');
  assert.deepEqual(shared.options.map((o) => o.allowed), [false, true, true]);
  const strict = await readLoanDecision(world({ legacy: 'legacy-active', shared: false }).ports, checker, 'PIN20261100120');
  assert.equal(strict.writable, false); assert.equal(strict.shared, false);
  // Not owned stays off even in shared mode.
  assert.equal((await readLoanDecision(world({ owns: false, shared: true }).ports, checker, 'PIN20261100120')).writable, false);
});
