import assert from 'node:assert/strict';
import test from 'node:test';
import { readMember360, searchMembers, parseMemberSearch } from '../src/kosipa/member-360.ts';

const RP = (n) => n * 100;
const member = { id: 4410, nik: '00123', name: 'SYNTH SATU', group: 'ANGGOTA', status: 'AKTIVE', employment: 'TETAP', exitOn: null, joinedOn: '2020-01-01', division: 'D', section: 'S',
  phone: '081234567890', email: 'satu@example.test', bankAccount: '1234567890', bankName: 'BANK', limitTokoSen: RP(1_000_000), gajiMinusSen: 0, limitPpobSen: 0 };
function reader(over = {}) {
  const calls = [];
  return { calls, value: {
    async search(q) { calls.push(['search', q]); return []; },
    async member(id) { calls.push(['member', id]); return id === 4410 ? member : null; },
    async savings(nik) { calls.push(['savings', nik]); return [{ type: 'SIMPANAN WAJIB', docStatus: 'APPROVED', creditSen: RP(500_000), debitSen: 0, interestSen: RP(1_000) }, { type: 'SIMPANAN WAJIB', docStatus: 'OPEN', creditSen: 0, debitSen: RP(100_000), interestSen: 0 }, { type: 'SIMPANAN WAJIB', docStatus: 'AMBIGUOUS', creditSen: RP(999), debitSen: 0, interestSen: 0 }]; },
    async loans(nik) { calls.push(['loans', nik]); return [{ docNo: 'PIN1', principalSen: RP(1_000_000), installmentSen: RP(100_000) }]; },
    async storeCredit(nik, from, to) { calls.push(['storeCredit', nik, from, to]); return { spentSen: RP(150_000), returnedSen: RP(30_000) }; },
    ...over,
  } };
}
const ALL = new Set(['kosipa.member.view', 'kosipa.savings.view', 'kosipa.loan.view', 'kosipa.payroll.view', 'kosipa.store-credit.view']);
const now = () => new Date('2026-10-16T05:00:00Z');

test('search: needs member view; NIK-shaped input matches NIK keys exactly, other text matches names with LIKE escaped', async () => {
  assert.deepEqual(parseMemberSearch('00123'), { nikKeys: ['00123', '123'], nameLike: null });
  assert.deepEqual(parseMemberSearch('Budi 50%_x'), { nikKeys: null, nameLike: 'Budi 50\\%\\_x' });
  assert.equal(parseMemberSearch(' a '), null);
  const r = reader();
  await assert.rejects(searchMembers(r.value, new Set(), 'budi'), { code: 'FORBIDDEN' });
  await searchMembers(r.value, ALL, 'budi');
  assert.deepEqual(r.calls, [['search', { nikKeys: null, nameLike: 'budi', limit: 25 }]]);
});

test('360: audited before any member data is read; an audit failure stops the read (fail closed)', async () => {
  const r = reader(); const events = [];
  await readMember360({ reader: r.value, audit: { async append(e) { events.push(e); assert.equal(r.calls.length, 0, 'audit precedes reads'); } }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 4410);
  assert.deepEqual(events.map((e) => [e.action, e.subjectId]), [['kosipa.member.view', 'member:4410']]);
  const r2 = reader();
  await assert.rejects(readMember360({ reader: r2.value, audit: { async append() { throw new Error('console db down'); } }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 4410), /console db down/);
  assert.equal(r2.calls.length, 0);
});

test('360: masked contact data, savings by header status, honest unavailable sections, POS-identical Kredit limit', async () => {
  const v = await readMember360({ reader: reader().value, audit: { async append() {} }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 4410);
  assert.equal(v.profile.phone, '0812•••••890'); assert.equal(v.profile.email, 's•••@example.test'); assert.equal(v.profile.bankAccount, '••••7890');
  assert.ok(!('limitTokoSen' in v.profile) && !('gaji' in v.profile));
  assert.deepEqual(v.savings, { state: 'ok', data: [{ type: 'SIMPANAN WAJIB', postedSen: RP(501_000), pendingDebitSen: RP(100_000), pendingCreditSen: 0 }] }, 'ambiguous headers are excluded');
  assert.deepEqual(v.installments, { state: 'unavailable', reason: 'INDEX_REQUIRED' });
  assert.deepEqual(v.payroll, { state: 'unavailable', reason: 'INDEX_REQUIRED' });
  assert.deepEqual(v.storeCredit, { state: 'ok', data: { monthStart: '2026-10-01', limitSen: RP(1_000_000), spentSen: RP(150_000), returnedSen: RP(30_000), netSen: RP(120_000), remainingSen: RP(880_000) } });
  assert.equal(v.profile.eligibility.eligible, true);
});

test('360: sections without capability are restricted and never queried; a failing section does not hide the others', async () => {
  const r = reader({ async loans() { throw new Error('timeout 1969'); } });
  const v = await readMember360({ reader: r.value, audit: { async append() {} }, now }, { userId: 7, capabilities: new Set(['kosipa.member.view', 'kosipa.loan.view']), requestId: 'q' }, 4410);
  assert.deepEqual([v.savings, v.storeCredit, v.payroll], [{ state: 'restricted' }, { state: 'restricted' }, { state: 'restricted' }]);
  assert.deepEqual(v.loans, { state: 'unavailable', reason: 'READ_FAILED' });
  assert.ok(!r.calls.some(([c]) => c === 'savings' || c === 'storeCredit'));
  await assert.rejects(readMember360({ reader: r.value, audit: { async append() {} }, now }, { userId: 7, capabilities: new Set(), requestId: 'q' }, 4410), { code: 'FORBIDDEN' });
  assert.equal(await readMember360({ reader: r.value, audit: { async append() {} }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 1), null);
});

test('360: an ineligible (expired contract) member shows usage but no credit limit', async () => {
  const r = reader({ async member() { return { ...member, employment: 'KONTRAK', exitOn: '2026-10-01' }; } });
  const v = await readMember360({ reader: r.value, audit: { async append() {} }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 4410);
  assert.equal(v.storeCredit.data.limitSen, null); assert.equal(v.storeCredit.data.netSen, RP(120_000));
  assert.deepEqual(v.profile.eligibility.reasons, ['CONTRACT_EXPIRED']);
});

test('360: section reads never overlap (one shared-pool connection per page view)', async () => {
  let active = 0, peak = 0;
  const slow = (value) => async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return value; };
  const r = reader({ savings: slow([]), loans: slow([]), storeCredit: slow({ spentSen: 0, returnedSen: 0 }) });
  await readMember360({ reader: r.value, audit: { async append() {} }, now }, { userId: 7, capabilities: ALL, requestId: 'q' }, 4410);
  assert.equal(peak, 1);
});
