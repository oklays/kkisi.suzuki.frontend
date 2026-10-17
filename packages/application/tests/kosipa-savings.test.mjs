import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readMemberSavings } from '../src/kosipa/savings.ts';
import { makeSavingsWorld, mv, hd } from './helpers/savings-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const NOW = () => new Date('2026-10-17T05:00:00Z');
const actor = (caps = ['kosipa.savings.view', 'kosipa.member.view']) => ({ userId: 7, capabilities: new Set(caps), requestId: 'r1' });
const mk = (w) => { const events = []; return { events, deps: { savings: w.savings, members: w.members, audit: { async append(e) { events.push(e); } }, now: NOW } }; };

test('both the savings and the member grant are required BEFORE anything is audited or read', async () => {
  const w = makeSavingsWorld(); const { deps, events } = mk(w);
  for (const caps of [[], ['kosipa.savings.view'], ['kosipa.member.view'], ['kosipa.loan.view', 'kosipa.payroll.view']]) assert.equal(await code(readMemberSavings(deps, actor(caps), { memberId: '9001' })), 'FORBIDDEN');
  assert.equal(w.calls.length, 0); assert.equal(events.length, 0);
});

test('audit is written BEFORE the first read with an opaque member subject; an audit failure stops the read', async () => {
  const w = makeSavingsWorld({ movements: [mv(1, 'S1')], headers: [hd('S1')] }); const order = [];
  const deps = { savings: new Proxy(w.savings, { get: (t, k) => (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } }), members: new Proxy(w.members, { get: (t, k) => (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } }), audit: { async append(e) { order.push(`audit:${e.action}:${e.subjectId}`); } }, now: NOW };
  await readMemberSavings(deps, actor(), { memberId: '9001' }); assert.equal(order[0], 'audit:kosipa.savings.view:member:9001');
  const { deps: ok, events } = mk(w); await readMemberSavings(ok, actor(), { memberId: '9001' }); assert.ok(!JSON.stringify(events).includes('00100'));
  const f = makeSavingsWorld({ movements: [mv(1, 'S1')], headers: [hd('S1')] });
  await assert.rejects(readMemberSavings({ savings: f.savings, members: f.members, audit: { async append() { throw new Error('console db down'); } }, now: NOW }, actor(), { memberId: '9001' }), /console db down/);
  assert.equal(f.calls.length, 0);
});

test('invalid input is refused before any query; unknown member is null; member isolation: only that member\'s NIK keys are queried', async () => {
  const w = makeSavingsWorld({ movements: [mv(1, 'S1'), mv(2, 'S2', { nik: '00999', credit: '555.00' })], headers: [hd('S1'), hd('S2')] }); const { deps } = mk(w);
  for (const input of [{ memberId: '0' }, { memberId: "1' OR 1=1" }, { memberId: '9001', params: { jenis: "x'--" } }, { memberId: '9001', params: { after: '-4' } }]) assert.ok(['MEMBER_ID_INVALID', 'FILTER_INVALID', 'CURSOR_INVALID'].includes(await code(readMemberSavings(deps, actor(), input))));
  assert.equal(w.calls.length, 0);
  assert.equal(await readMemberSavings(deps, actor(), { memberId: '4242' }), null);
  const r = await readMemberSavings(deps, actor(), { memberId: '9001' });
  assert.deepEqual(r.ledger.data.items.map((i) => i.docNo), ['S1'], 'another member\'s movement never appears');
  assert.ok(w.named('movements')[0][1].every((k) => k.endsWith('100')), 'queried with this member\'s keys only');
});

test('ledger: header status decides the state, headers looked up separately, paging is keyset and bounded, official balance never stated', async () => {
  const movements = Array.from({ length: 130 }, (_, i) => mv(i + 1, `S${i + 1}`, { type: i % 2 ? 'SIMPANAN SUKARELA' : 'SIMPANAN WAJIB' }));
  const headers = movements.map((m, i) => hd(m.docNo, { header: { docDate: '2026-05-01', status: i % 10 === 0 ? 'OPEN' : 'APPROVED', kind: 'TRANSFER' } }));
  const w = makeSavingsWorld({ movements, headers }); const { deps } = mk(w);
  const seen = []; let after;
  for (let i = 0; i < 5; i++) { const r = await readMemberSavings(deps, actor(), { memberId: '9001', params: { after } }); assert.equal(r.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.ok(r.ledger.data.items.length <= 50); seen.push(...r.ledger.data.items.map((x) => x.id)); after = r.ledger.data.nextCursor ? String(r.ledger.data.nextCursor) : undefined; if (!after) break; }
  assert.deepEqual(seen, Array.from({ length: 130 }, (_, i) => 130 - i), 'every movement once, newest first');
  assert.equal(w.named('movements')[0][4], 51, 'page size + 1, never unbounded');
  const typed = await readMemberSavings(deps, actor(), { memberId: '9001', params: { jenis: 'SIMPANAN SUKARELA' } });
  assert.ok(typed.ledger.data.items.every((x) => x.type === 'SIMPANAN SUKARELA'));
  const pending = (await readMemberSavings(deps, actor(), { memberId: '9001' })).ledger.data.items.filter((x) => x.state === 'PENDING');
  assert.ok(pending.length > 0 && pending.every((x) => x.headerStatus === 'OPEN'));
});

test('summary: per type posted / pending / void / unverified; ambiguous and missing headers are kept apart and never counted as posted', async () => {
  const w = makeSavingsWorld({ movements: [mv(1, 'A'), mv(2, 'B', { debit: '30000.00', credit: '0.00' }), mv(3, 'C'), mv(4, 'D'), mv(5, 'E')], headers: [hd('A'), hd('B', { header: { docDate: '2026-05-01', status: 'OPEN', kind: 'CASH' } }), hd('C', { header: { docDate: '2026-05-01', status: 'POSTING', kind: 'CASH' } }), hd('D'), hd('D')] });
  const r = await readMemberSavings(mk(w).deps, actor(), { memberId: '9001' });
  const t = r.summary.data[0];
  assert.deepEqual([t.posted4, t.pendingDebit4, t.voidRows, t.unverifiedRows, t.rows], [1000000000, 300000000, 1, 2, 5]);
  const items = (await readMemberSavings(mk(w).deps, actor(), { memberId: '9001' })).ledger.data.items;
  assert.deepEqual(items.map((i) => i.state), ['UNVERIFIED', 'UNVERIFIED', 'VOID', 'PENDING', 'POSTED']);
});

test('outages are contained per section; an unusable member NIK yields explicit unavailable sections; unparsable stored amounts are an error', async () => {
  const w = makeSavingsWorld({ movements: [mv(1, 'S1')], headers: [hd('S1')] });
  w.failures.add('typeSummary'); const a = await readMemberSavings(mk(w).deps, actor(), { memberId: '9001' });
  assert.deepEqual([a.summary, a.ledger.state], [{ state: 'unavailable', reason: 'READ_FAILED' }, 'ok']);
  w.failures.clear(); w.failures.add('headersByDocNo'); const b = await readMemberSavings(mk(w).deps, actor(), { memberId: '9001' });
  assert.deepEqual([b.summary.state, b.ledger], ['ok', { state: 'unavailable', reason: 'READ_FAILED' }]);
  w.failures.clear(); w.failures.add('member'); await assert.rejects(readMemberSavings(mk(w).deps, actor(), { memberId: '9001' }), /timeout/);
  const odd = makeSavingsWorld({ members: [{ id: 9001, nik: "A B'C", name: 'X', group: null, status: null }] });
  const o = await readMemberSavings(mk(odd).deps, actor(), { memberId: '9001' });
  assert.deepEqual([o.summary.reason, o.ledger.reason], ['MEMBER_NIK_UNUSABLE', 'MEMBER_NIK_UNUSABLE']); assert.equal(odd.calls.filter((c) => c[0] !== 'member').length, 0);
  const bad = makeSavingsWorld({ movements: [mv(1, 'S1', { credit: 'oops' })], headers: [hd('S1')] });
  assert.equal(await code(readMemberSavings(mk(bad).deps, actor(), { memberId: '9001' })), 'AMOUNT_INVALID');
  bad.savings.typeSummary = async () => [];   // isolate the LEDGER path: the summary is fine, one movement is not
  assert.equal(await code(readMemberSavings(mk(bad).deps, actor(), { memberId: '9001' })), 'AMOUNT_INVALID');
});

test('the reader contract has no write capability', () => { assert.deepEqual(Object.keys(makeSavingsWorld().savings).sort(), ['headersByDocNo', 'movements', 'typeSummary']); });
