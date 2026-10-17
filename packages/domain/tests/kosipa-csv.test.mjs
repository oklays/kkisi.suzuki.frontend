import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, csvLine, csvDocument, neutralizeFormula, amount4ToDecimal, KosipaError } from '../src/kosipa/index.ts';

test('formula injection: every text cell a spreadsheet could execute is neutralised; ordinary text is untouched', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(1)', '\t=cmd', '\r=cmd', ' =1+1', '   +1', '=HYPERLINK("http://x","y")']) {
    const out = csvCell(evil);
    assert.ok(out.replace(/^"/, '').startsWith("'"), `${JSON.stringify(evil)} -> ${out}`);
  }
  for (const ok of ['SYNTH ANGGOTA', 'PIN-0001', 'a=b', 'x+y', "O'Brien", '12.50 m']) assert.equal(csvCell(ok), ok);
  assert.equal(neutralizeFormula('=1'), "'=1");
});

test('RFC 4180 quoting: commas, quotes and line breaks are quoted and doubled; control characters cannot smuggle a new row', () => {
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell('l1\nl2'), '"l1\nl2"');
  assert.equal(csvLine(['a', null, 'b']), 'a,,b');
  assert.equal(csvCell('x\u0007y\u0000z'), 'x y z');
  assert.equal(csvDocument([['h1', 'h2'], ['1', '2']]), 'h1,h2\r\n1,2\r\n');
  assert.equal(csvDocument([['a\r\nb,=1']]), '"a\r\nb,=1"\r\n', 'a cell with CRLF stays inside its quotes: still one record');
});

test('exact amounts: decimals come from exact text; negatives are not neutralised; floats and malformed decimals are refused', () => {
  assert.equal(csvCell({ decimal: '-1234.5678' }), '-1234.5678'); assert.equal(csvCell({ decimal: '0.00' }), '0.00');
  for (const bad of ['1e5', '1,5', '12.34567', '=1', '', '--1', '1.', 'NaN']) assert.throws(() => csvCell({ decimal: bad }), (e) => e instanceof KosipaError && e.code === 'AMOUNT_INVALID', bad);
  assert.equal(csvCell(42), '42'); assert.throws(() => csvCell(0.1), (e) => e.code === 'AMOUNT_INVALID'); assert.throws(() => csvCell(2 ** 60), (e) => e.code === 'AMOUNT_INVALID');
  assert.deepEqual([1500000000, 500006666, 0, -50000, 12, 100, 123456789].map((u) => amount4ToDecimal(u).decimal), ['150000.00', '50000.6666', '0.00', '-5.00', '0.0012', '0.01', '12345.6789']);
  assert.throws(() => amount4ToDecimal(1.5), (e) => e.code === 'AMOUNT_INVALID');
});
