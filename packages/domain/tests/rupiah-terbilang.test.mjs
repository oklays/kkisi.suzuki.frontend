import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRupiahTerbilang } from '@koperasi/domain/money/terbilang';

const table = [
  [0, 'Nol rupiah'], [1, 'Satu rupiah'], [10, 'Sepuluh rupiah'], [11, 'Sebelas rupiah'], [12, 'Dua belas rupiah'], [19, 'Sembilan belas rupiah'],
  [20, 'Dua puluh rupiah'], [21, 'Dua puluh satu rupiah'], [100, 'Seratus rupiah'], [101, 'Seratus satu rupiah'], [111, 'Seratus sebelas rupiah'],
  [200, 'Dua ratus rupiah'], [1000, 'Seribu rupiah'], [1001, 'Seribu satu rupiah'], [1100, 'Seribu seratus rupiah'], [2000, 'Dua ribu rupiah'],
  [11000, 'Sebelas ribu rupiah'], [12500, 'Dua belas ribu lima ratus rupiah'], [100000, 'Seratus ribu rupiah'],
  [125000, 'Seratus dua puluh lima ribu rupiah'], [111111, 'Seratus sebelas ribu seratus sebelas rupiah'],
  [1000000, 'Satu juta rupiah'], [1250000, 'Satu juta dua ratus lima puluh ribu rupiah'], [1001000, 'Satu juta seribu rupiah'],
  [1000100, 'Satu juta seratus rupiah'], [1000000000, 'Satu miliar rupiah'], [2500000000, 'Dua miliar lima ratus juta rupiah'],
  [1000000000000, 'Satu triliun rupiah'], ['1000000000000000', 'Satu kuadriliun rupiah'], ['999999999999999999999', 'Sembilan ratus sembilan puluh sembilan kuintiliun sembilan ratus sembilan puluh sembilan kuadriliun sembilan ratus sembilan puluh sembilan triliun sembilan ratus sembilan puluh sembilan miliar sembilan ratus sembilan puluh sembilan juta sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh sembilan rupiah'],
];

test('terbilang follows standard Indonesian numeral rules', () => {
  for (const [input, expected] of table) assert.equal(formatRupiahTerbilang(input), expected, String(input));
});

test('terbilang reads sen for two-decimal amounts without redundant words', () => {
  assert.equal(formatRupiahTerbilang('1000.50'), 'Seribu rupiah lima puluh sen');
  assert.equal(formatRupiahTerbilang('1000.01'), 'Seribu rupiah satu sen');
  assert.equal(formatRupiahTerbilang('1000.5'), 'Seribu rupiah lima puluh sen');
  assert.equal(formatRupiahTerbilang('1000.00'), 'Seribu rupiah');
  assert.equal(formatRupiahTerbilang('1000.5000'), 'Seribu rupiah lima puluh sen');
  assert.equal(formatRupiahTerbilang('0.50'), 'Lima puluh sen');
  assert.equal(formatRupiahTerbilang('0.11'), 'Sebelas sen');
  assert.equal(formatRupiahTerbilang(1250000.75), 'Satu juta dua ratus lima puluh ribu rupiah tujuh puluh lima sen');
});

test('terbilang negatives use minus; negative zero is zero', () => {
  assert.equal(formatRupiahTerbilang(-1000), 'Minus seribu rupiah');
  assert.equal(formatRupiahTerbilang('-1000.50'), 'Minus seribu rupiah lima puluh sen');
  assert.equal(formatRupiahTerbilang('-0.00'), 'Nol rupiah');
});

test('terbilang capitalisation, placeholder and bigint input', () => {
  assert.equal(formatRupiahTerbilang(1000, { capitalize: false }), 'seribu rupiah');
  assert.equal(formatRupiahTerbilang(null), '—');
  assert.equal(formatRupiahTerbilang(undefined, { placeholder: '' }), '');
  assert.equal(formatRupiahTerbilang(2000000n), 'Dua juta rupiah');
});

test('terbilang refuses unsupported precision, range and malformed input instead of stating a wrong amount', () => {
  for (const bad of ['1000.505', '1e3', 'abc', '', '1,000', 1e21, 2 ** 60, NaN, 0.001, '1000000000000000000000']) {
    assert.throws(() => formatRupiahTerbilang(bad), RangeError, String(bad));
  }
  assert.equal(formatRupiahTerbilang('1000.505', { fallback: '(tidak dapat dieja)' }), '(tidak dapat dieja)');
  assert.equal(formatRupiahTerbilang('1000000000000000000000', { fallback: '-' }), '-');
});
