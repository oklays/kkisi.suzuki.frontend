import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError, parseLedgerQuery, parseMemberId, stateOfHeaderStatus, describeMovement, summarizeTypes, SAVINGS_BALANCE } from '../src/kosipa/index.ts';

const RP = (n) => n * 10000;
const row = (over = {}) => ({ id: 1, docNo: 'SIM1', type: 'SIMPANAN WAJIB', credit: '100000.00', cashCredit: '0.00', debit: '0.00', interest: '0.00', detailStatus: null, remark: null, ...over });
const ref = (over = {}) => ({ docNo: 'SIM1', headerCount: 1, header: { docDate: '2026-05-01', status: 'APPROVED', kind: 'TRANSFER' }, ...over });

test('filters and ids: only plain values, unknown shapes refused before any query', () => {
  assert.deepEqual(parseLedgerQuery({}), { type: null, afterId: null });
  assert.deepEqual(parseLedgerQuery({ jenis: 'POT PAGUYUBAN-PAGUYUBAN', after: '77' }), { type: 'POT PAGUYUBAN-PAGUYUBAN', afterId: 77 });
  for (const bad of [{ jenis: "X' OR 1=1 --" }, { jenis: 'a;b' }, { after: '0' }, { after: '1;DROP' }]) assert.throws(() => parseLedgerQuery(bad), (e) => e instanceof KosipaError, JSON.stringify(bad));
  assert.equal(parseMemberId('9001'), 9001);
  for (const bad of ['0', '-1', '1x', '', 5, null, '12345678901']) assert.throws(() => parseMemberId(bad), (e) => e.code === 'MEMBER_ID_INVALID');
});

test('the HEADER status decides the state; the detail status never does, and a difference is flagged', () => {
  assert.deepEqual([stateOfHeaderStatus('APPROVED'), stateOfHeaderStatus('OPEN'), stateOfHeaderStatus('POSTING'), stateOfHeaderStatus(null)], ['POSTED', 'PENDING', 'VOID', 'VOID']);
  const m = describeMovement(row({ detailStatus: 'OPEN' }), ref());
  assert.deepEqual([m.state, m.flags, m.credit4], ['POSTED', ['DETAIL_STATUS_DIFFERS'], RP(100000)]);
  assert.deepEqual(describeMovement(row({ detailStatus: '' }), ref()).flags, [], 'an empty detail status is the legacy norm, not a finding');
});

test('missing or duplicated headers make a movement UNVERIFIED, never posted; unusable dates are labelled', () => {
  assert.deepEqual([describeMovement(row(), undefined).state, describeMovement(row(), undefined).flags], ['UNVERIFIED', ['HEADER_MISSING']]);
  assert.deepEqual([describeMovement(row(), ref({ headerCount: 2 })).state, describeMovement(row(), ref({ headerCount: 2 })).flags], ['UNVERIFIED', ['HEADER_AMBIGUOUS']]);
  const z = describeMovement(row(), ref({ header: { docDate: '0000-00-00', status: 'APPROVED', kind: 'SALDO AWAL' } }));
  assert.deepEqual([z.date.kind, z.flags, z.opening], ['zero', ['DATE_UNUSABLE'], true]);
});

test('credit includes cash credit; amounts are exact; unparsable amounts are an error, not zero', () => {
  assert.equal(describeMovement(row({ credit: '10.25', cashCredit: '0.75', debit: '3.00', interest: '1.50' }), ref()).credit4, 110000);
  assert.throws(() => describeMovement(row({ credit: 'x' }), ref()), (e) => e.code === 'AMOUNT_INVALID');
  assert.ok(describeMovement(row({ debit: '-1.00' }), ref()).flags.includes('NEGATIVE_AMOUNT'));
});

test('type sums: posted = credit + interest - debit of POSTED headers; pending kept apart; ambiguous/missing never counted as posted; not a balance', () => {
  const s = summarizeTypes([
    { type: 'SIMPANAN WAJIB', headerStatus: 'APPROVED', credit: '500000.00', debit: '100000.00', interest: '1000.00', rows: 5 },
    { type: 'SIMPANAN WAJIB', headerStatus: 'OPEN', credit: '0.00', debit: '40000.00', interest: '0.00', rows: 1 },
    { type: 'SIMPANAN WAJIB', headerStatus: 'POSTING', credit: '9.00', debit: '0.00', interest: '0.00', rows: 1 },
    { type: 'SIMPANAN WAJIB', headerStatus: 'AMBIGUOUS', credit: '7.00', debit: '0.00', interest: '0.00', rows: 1 },
    { type: 'PBS', headerStatus: 'MISSING_HEADER', credit: '5.00', debit: '0.00', interest: '0.00', rows: 2 },
  ]);
  assert.deepEqual(s.map((t) => t.type), ['PBS', 'SIMPANAN WAJIB']);
  const w = s[1];
  assert.deepEqual([w.posted4, w.pendingDebit4, w.pendingCredit4, w.voidRows, w.unverifiedRows, w.rows], [RP(401000), RP(40000), 0, 1, 1, 8]);
  assert.deepEqual([s[0].posted4, s[0].unverifiedRows], [0, 2]);
  assert.deepEqual(SAVINGS_BALANCE, { state: 'unavailable', reason: 'OFFICIAL_BALANCE_UNVERIFIED' });
});
