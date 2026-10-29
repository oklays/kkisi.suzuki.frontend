import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftRupiahInput, formatRupiah, formatRupiahAccounting, formatRupiahCompact, formatRupiahDocument, formatRupiahNumberOnly,
  fromMinorUnits, parseRupiahInput, rupiahFromAmount4, rupiahFromSen, rupiahInputText,
} from '@koperasi/domain/money/rupiah';

test('standard format: Rp glued to the number, id-ID separators, no decimals for whole amounts', () => {
  const cases = [
    [0, 'Rp0'], [500, 'Rp500'], [1000, 'Rp1.000'], ['25000.00', 'Rp25.000'], ['1250000.00', 'Rp1.250.000'],
    ['1250000.50', 'Rp1.250.000,50'], ['1250000.75', 'Rp1.250.000,75'], [-1250000, '-Rp1.250.000'], ['0.05', 'Rp0,05'],
    [1000000000, 'Rp1.000.000.000'], ['9007199254740993.0001', 'Rp9.007.199.254.740.993,0001'], [10n ** 18n, 'Rp1.000.000.000.000.000.000'],
  ];
  for (const [input, expected] of cases) assert.equal(formatRupiah(input), expected);
  assert.equal(formatRupiah(1250000), 'Rp1.250.000');
  assert.equal(formatRupiah(1250000.75), 'Rp1.250.000,75');
});

test('standard format never emits a space, NBSP, dot after Rp, or the legacy ",-"', () => {
  for (const value of [0, 1, 1234567.89, -5]) assert.doesNotMatch(formatRupiah(value), /\s| |Rp\.|,-|IDR/);
});

test('standard format shows a real fraction as at least sen, drops all-zero fractions, and keeps longer exact fractions', () => {
  assert.equal(formatRupiah('4000.10'), 'Rp4.000,10');
  assert.equal(formatRupiah('4000.1'), 'Rp4.000,10');
  assert.equal(formatRupiah('4000.1000'), 'Rp4.000,10');
  assert.equal(formatRupiah('4000.0000'), 'Rp4.000');
  assert.equal(formatRupiah('50000.6660'), 'Rp50.000,666');
  assert.equal(formatRupiah('50000.6666'), 'Rp50.000,6666');
  assert.equal(formatRupiah('4000', { minFractionDigits: 2 }), 'Rp4.000,00');
});

test('negative zero is zero, and -0.00 never prints a sign', () => {
  assert.equal(formatRupiah('-0.00'), 'Rp0');
  assert.equal(formatRupiah(-0), 'Rp0');
  assert.equal(formatRupiah('-0.50'), '-Rp0,50');
});

test('null and undefined use an explicit placeholder, never zero', () => {
  assert.equal(formatRupiah(null), '—');
  assert.equal(formatRupiah(undefined), '—');
  assert.equal(formatRupiah(null, { placeholder: 'Tidak tersedia' }), 'Tidak tersedia');
  assert.equal(formatRupiahNumberOnly(undefined), '—');
  assert.equal(formatRupiahDocument(null), '—');
  assert.equal(formatRupiahCompact(null), '—');
});

test('invalid, ambiguous and unsafe numeric inputs are rejected instead of formatted wrongly', () => {
  for (const bad of ['', 'abc', '1e10', '1,000', '1.000,00', 'Rp1', '--1', '1.2.3', NaN, Infinity, 1e21, 2 ** 60, 1e-7]) {
    assert.throws(() => formatRupiah(bad), RangeError, String(bad));
  }
  // A JS number cannot carry this exactly (String(2 ** 60) is already rounded), so exact input must be a string or bigint.
  assert.equal(formatRupiah('1152921504606846976'), 'Rp1.152.921.504.606.846.976');
  assert.equal(formatRupiah(1152921504606846976n), 'Rp1.152.921.504.606.846.976');
});

test('maxFractionDigits reports unsupported precision instead of rounding or truncating', () => {
  assert.equal(formatRupiah('10.50', { maxFractionDigits: 2 }), 'Rp10,50');
  assert.equal(formatRupiah('10.5000', { maxFractionDigits: 2 }), 'Rp10,50');
  assert.throws(() => formatRupiah('10.505', { maxFractionDigits: 2 }), /not rounded/);
});

test('number-only format is the same grouping without the symbol', () => {
  assert.equal(formatRupiahNumberOnly(125000), '125.000');
  assert.equal(formatRupiahNumberOnly('1250000.75'), '1.250.000,75');
  assert.equal(formatRupiahNumberOnly(-75500), '-75.500');
  assert.equal(formatRupiahNumberOnly(0), '0');
});

test('formal documents use two decimals but keep legitimately longer precision', () => {
  assert.equal(formatRupiahDocument(25000), 'Rp25.000,00');
  assert.equal(formatRupiahDocument('125500'), 'Rp125.500,00');
  assert.equal(formatRupiahDocument('1250000.75'), 'Rp1.250.000,75');
  assert.equal(formatRupiahDocument('1250000.5'), 'Rp1.250.000,50');
  assert.equal(formatRupiahDocument('50000.6666'), 'Rp50.000,6666');
  assert.equal(formatRupiahDocument(-1250000), '-Rp1.250.000,00');
  assert.equal(formatRupiahDocument(0), 'Rp0,00');
});

test('accounting format puts negatives in parentheses', () => {
  assert.equal(formatRupiahAccounting(1250000), 'Rp1.250.000,00');
  assert.equal(formatRupiahAccounting(-1250000), '(Rp1.250.000,00)');
});

test('compact format abbreviates millions and above and leaves smaller amounts exact', () => {
  const cases = [
    [999999, 'Rp999.999'], [1000000, 'Rp1 juta'], [1250000, 'Rp1,25 juta'], [125500000, 'Rp125,5 juta'],
    [1250000000, 'Rp1,25 miliar'], ['1500000000000', 'Rp1,5 triliun'], [-2500000, '-Rp2,5 juta'], ['1254999', 'Rp1,25 juta'], ['1255000', 'Rp1,26 juta'],
    ['999999999', 'Rp1 miliar'], ['999994999', 'Rp999,99 juta'], [1000000000000000, 'Rp1.000 triliun'],
  ];
  for (const [input, expected] of cases) assert.equal(formatRupiahCompact(input), expected, String(input));
  assert.equal(formatRupiahCompact('1250000.50'), 'Rp1,25 juta');
  assert.equal(formatRupiahCompact(1250000, { compactFractionDigits: 1 }), 'Rp1,3 juta');
  assert.equal(formatRupiahCompact(1250000, { compactFractionDigits: 0 }), 'Rp1 juta');
});

test('minor-unit helpers build exact decimals without floating point', () => {
  assert.equal(rupiahFromSen(350000), '3500.00');
  assert.equal(rupiahFromSen(400010), '4000.10');
  assert.equal(rupiahFromSen(5), '0.05');
  assert.equal(rupiahFromSen(-105), '-1.05');
  assert.equal(rupiahFromAmount4(500006666), '50000.6666');
  assert.equal(rupiahFromAmount4(0), '0.0000');
  assert.equal(fromMinorUnits(12n, 0), '12');
  assert.equal(formatRupiah(rupiahFromSen(400010)), 'Rp4.000,10');
  assert.equal(formatRupiahDocument(rupiahFromSen(400010)), 'Rp4.000,10');
  assert.throws(() => fromMinorUnits(2 ** 60, 2), RangeError);
  assert.throws(() => fromMinorUnits(1.5, 2));
});

test('parser reads Indonesian input into the canonical dot-decimal contract', () => {
  const ok = (text, expected, options) => assert.deepEqual(parseRupiahInput(text, options), { ok: true, value: expected }, text);
  ok('1.250.000', '1250000'); ok('1.250.000,75', '1250000.75'); ok('1.250', '1250'); ok('500', '500'); ok('0', '0');
  ok('1,5', '1.5'); ok('0,05', '0.05'); ok('1.250.000,50', '1250000.50'); ok('007', '7'); ok('1,500', '1.50');
  ok('Rp1.250.000', '1250000'); ok('Rp. 1.250.000,75', '1250000.75'); ok('rp 1.000', '1000'); ok('  1.000  ', '1000');
});

test('parser keeps empty distinct from zero', () => {
  assert.deepEqual(parseRupiahInput(''), { ok: true, value: null });
  assert.deepEqual(parseRupiahInput('   '), { ok: true, value: null });
  assert.deepEqual(parseRupiahInput(null), { ok: true, value: null });
  assert.deepEqual(parseRupiahInput('Rp'), { ok: true, value: null });
  assert.deepEqual(parseRupiahInput('0'), { ok: true, value: '0' });
});

test('parser rejects ambiguous, mixed and malformed separators rather than guessing', () => {
  const code = (text, options) => { const r = parseRupiahInput(text, options); return r.ok ? `ok:${r.value}` : r.code; };
  assert.equal(code('4000.50'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('1.25'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('1,250,000'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('1,250,000.75'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('1.25.000'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('0.500'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('12.3456'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code('1.250,5.0'), 'AMBIGUOUS_SEPARATOR');
  assert.equal(code(',5'), 'MALFORMED');
  assert.equal(code('1.250,'), 'MALFORMED');
  assert.equal(code('1 250'), 'MALFORMED');
  assert.equal(code('-'), 'MALFORMED');
});

test('parser rejects invalid characters', () => {
  for (const bad of ['abc', '12a', '1e5', '١٢٣', '1_000', '$100', 'Rp1.000 ribu', '0x10', '1+1']) assert.equal(parseRupiahInput(bad).code, 'INVALID_CHARACTER', bad);
});

test('parser enforces the decimal, precision, sign and size limits of each field', () => {
  assert.equal(parseRupiahInput('1.000,5', { allowDecimals: false }).code, 'DECIMALS_NOT_ALLOWED');
  assert.deepEqual(parseRupiahInput('1.000', { allowDecimals: false }), { ok: true, value: '1000' });
  assert.equal(parseRupiahInput('1,255').code, 'PRECISION');
  assert.equal(parseRupiahInput('1,25', { maxFractionDigits: 1 }).code, 'PRECISION');
  assert.deepEqual(parseRupiahInput('1,2500', { maxFractionDigits: 4 }), { ok: true, value: '1.2500' });
  assert.equal(parseRupiahInput('-5').code, 'NEGATIVE_NOT_ALLOWED');
  assert.deepEqual(parseRupiahInput('-5', { allowNegative: true }), { ok: true, value: '-5' });
  assert.deepEqual(parseRupiahInput('Rp-1.000,5', { allowNegative: true }), { ok: true, value: '-1000.5' });
  assert.deepEqual(parseRupiahInput('-0'), { ok: true, value: '0' });
  assert.equal(parseRupiahInput('12345678901', { maxIntegerDigits: 10 }).code, 'TOO_LARGE');
  assert.deepEqual(parseRupiahInput('9.999.999.999,99', { maxIntegerDigits: 10 }), { ok: true, value: '9999999999.99' });
});

test('formatting then parsing returns the same canonical amount', () => {
  for (const amount of ['0', '5', '999', '1000', '1250000', '1250000.75', '9999999999.99', '0.05', '12.50', '4000.10']) {
    const shown = formatRupiahNumberOnly(amount);
    assert.deepEqual(parseRupiahInput(shown), { ok: true, value: amount }, shown);
  }
});

test('typing draft regroups digits, accepts one comma and caps lengths', () => {
  const draft = (raw, options) => draftRupiahInput(raw, options);
  assert.deepEqual(draft('1250000'), { text: '1.250.000', canonical: '1250000' });
  assert.deepEqual(draft('1.250.0000'), { text: '12.500.000', canonical: '12500000' });
  assert.deepEqual(draft('1250000,7'), { text: '1.250.000,7', canonical: '1250000.7' });
  assert.deepEqual(draft('1250000,755'), { text: '1.250.000,75', canonical: '1250000.75' });
  assert.deepEqual(draft('1250,,5'), { text: '1.250,5', canonical: '1250.5' });
  assert.deepEqual(draft('1.250,'), { text: '1.250,', canonical: '1250' });
  assert.deepEqual(draft(','), { text: '0,', canonical: '0' });
  assert.deepEqual(draft('0012'), { text: '12', canonical: '12' });
  assert.deepEqual(draft('Rp 12abc3'), { text: '123', canonical: '123' });
  assert.deepEqual(draft(''), { text: '', canonical: null });
  assert.deepEqual(draft('abc'), { text: '', canonical: null });
  assert.deepEqual(draft('1250,5', { allowDecimals: false }), { text: '12.505', canonical: '12505' });
  assert.deepEqual(draft('12345678901', { maxIntegerDigits: 10 }), { text: '1.234.567.890', canonical: '1234567890' });
  assert.deepEqual(draft('-1250', { allowNegative: true }), { text: '-1.250', canonical: '-1250' });
  assert.deepEqual(draft('-1250'), { text: '1.250', canonical: '1250' });
  assert.deepEqual(draft('-', { allowNegative: true }), { text: '-', canonical: null });
});

test('input text for an existing canonical amount round-trips and keeps empty empty', () => {
  assert.equal(rupiahInputText('1250000.75'), '1.250.000,75');
  assert.equal(rupiahInputText('4000.10'), '4.000,10');
  assert.equal(rupiahInputText('4000.00'), '4.000,00');
  assert.equal(rupiahInputText('4000'), '4.000');
  assert.equal(rupiahInputText(''), '');
  assert.equal(rupiahInputText(null), '');
  assert.equal(rupiahInputText('0'), '0');
});
