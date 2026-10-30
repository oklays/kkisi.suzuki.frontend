import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '../src/kosipa/errors.ts';
import {
  DOCUMENT_NUMBER_SCHEMES, documentNumberScheme, formatDocumentNumber, nextPeriodSequence, numberingPeriod, parseDocumentSequence, resolveNumberingPeriod,
} from '../src/kosipa/document-number.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e)); return e.code; } };
const S = DOCUMENT_NUMBER_SCHEMES;

test('schemes reproduce the verified legacy conventions (prefix, minimum width, strategy, period source)', () => {
  assert.deepEqual(Object.values(S).map((s) => `${s.prefix}/${s.width}/${s.strategy}/${s.period}`),
    ['REG/4/period-sequence/clock', 'DBT/4/period-sequence/clock', 'PIN/5/row-id/clock', 'KAS/5/row-id/clock', 'POT/5/row-id/document']);
  assert.equal(documentNumberScheme('loan').prefix, 'PIN');
  for (const bad of ['', 'LOAN', 'shu', '__proto__', 'constructor']) assert.equal(code(() => documentNumberScheme(bad)), 'NUMBERING_SCHEME_UNKNOWN', bad);
});

test('period: Asia/Jakarta month for clock schemes (month boundary at 17:00 UTC); document period for payroll batches', () => {
  assert.equal(numberingPeriod(new Date('2026-10-31T16:59:59Z')), '202610');
  assert.equal(numberingPeriod(new Date('2026-10-31T17:00:00Z')), '202611', '00:00 in Jakarta is already November');
  assert.equal(numberingPeriod(new Date('2026-12-31T17:00:00Z')), '202701');
  assert.equal(resolveNumberingPeriod(S.loan, new Date('2026-11-05T01:00:00Z')), '202611');
  assert.equal(code(() => resolveNumberingPeriod(S.loan, new Date(), '202611')), 'NUMBERING_PERIOD_NOT_ALLOWED');
  assert.equal(resolveNumberingPeriod(S['payroll-batch'], new Date('2026-11-05T01:00:00Z'), '202610'), '202610', 'POT uses the payroll period, not today');
  for (const bad of [undefined, '2026-10', '202613', '202600', '20261']) assert.equal(code(() => resolveNumberingPeriod(S['payroll-batch'], new Date(), bad)), 'NUMBERING_PERIOD_INVALID', String(bad));
});

test('format: legacy str_pad semantics — padded to the minimum width, never truncated, bounded by the 30-character identifier', () => {
  assert.equal(formatDocumentNumber(S.loan, '202611', 42), 'PIN20261100042');
  assert.equal(formatDocumentNumber(S.loan, '202611', 32001), 'PIN20261132001');
  assert.equal(formatDocumentNumber(S.loan, '202611', 1234567), 'PIN2026111234567', 'wider ids are not cut');
  assert.equal(formatDocumentNumber(S['member-registration'], '202611', 7), 'REG2026110007');
  assert.equal(formatDocumentNumber(S['member-registration'], '202611', 1000), 'REG2026111000');
  for (const n of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(code(() => formatDocumentNumber(S.loan, '202611', n)), 'NUMBERING_SEQUENCE_INVALID');
  assert.equal(code(() => formatDocumentNumber(S.loan, '2026-11', 1)), 'NUMBERING_PERIOD_INVALID');
  assert.equal(formatDocumentNumber(S.loan, '202611', Number.MAX_SAFE_INTEGER).length, 25, 'every real scheme fits the 30-character identifier');
  assert.equal(code(() => formatDocumentNumber({ ...S.loan, prefix: 'X'.repeat(20) }, '202611', 12345)), 'NUMBERING_OVERFLOW');
});

test('parse: only this scheme and period count; other prefixes, periods and legacy eras are ignored', () => {
  assert.equal(parseDocumentSequence(S.loan, '202611', 'PIN20261100042'), 42);
  assert.equal(parseDocumentSequence(S.loan, '202611', 'PINREG20261100042'), null, 'PINREG never parses as PIN');
  assert.equal(parseDocumentSequence(S.loan, '202611', 'PIN20261000042'), null, 'other period');
  assert.equal(parseDocumentSequence(S.loan, '202611', 'PIN202611-0042'), null);
  assert.equal(parseDocumentSequence(S.loan, '202611', 'PINKFA9101'), null);
  assert.equal(parseDocumentSequence(S['member-registration'], '202611', 'REG20261101000'), 1000, "legacy's 5-digit '0n' form for n >= 1000 still parses");
});

test('next period sequence: strictly above every legacy and native number of the scheme and period', () => {
  const reg = S['member-registration'];
  assert.equal(nextPeriodSequence([], reg, '202611', null), 1);
  assert.equal(nextPeriodSequence(['REG2026110007', 'REG2026110003', 'REG2026100099', 'XYZ'], reg, '202611', null), 8, 'legacy floor; other periods ignored');
  assert.equal(nextPeriodSequence(['REG2026110007'], reg, '202611', 12), 13, 'native registry above the legacy floor');
  assert.equal(nextPeriodSequence(['REG20261101000'], reg, '202611', null), 1001);
});

test('legacy floor includes every safely representable sequence supported by the formatter', () => {
  const scheme = S['member-registration'];
  const n = 1_000_000_000_001;
  const docNo = formatDocumentNumber(scheme, '202611', n);
  assert.equal(parseDocumentSequence(scheme, '202611', docNo), n);
  assert.equal(nextPeriodSequence([docNo], scheme, '202611', null), n + 1);
  assert.equal(parseDocumentSequence(scheme, '202611', `REG202611${Number.MAX_SAFE_INTEGER}`), Number.MAX_SAFE_INTEGER);
  assert.equal(parseDocumentSequence(scheme, '202611', 'REG2026119007199254740992'), null);
});

test('format rejects impossible months and invalid clock dates before persistence', () => {
  for (const period of ['202600', '202613']) assert.equal(code(() => formatDocumentNumber(S.loan, period, 1)), 'NUMBERING_PERIOD_INVALID');
  assert.equal(code(() => numberingPeriod(new Date('invalid'))), 'NUMBERING_PERIOD_INVALID');
});
