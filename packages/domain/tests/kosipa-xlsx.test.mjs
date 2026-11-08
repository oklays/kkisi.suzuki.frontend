import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { xlsxDocument, xlsxColName, amount4ToDecimal, KosipaError } from '../src/kosipa/index.ts';

/** Minimal ZIP reader for test verification: extracts every local file entry using inflateRawSync. */
function readZipEntries(bytes) {
  const buf = Buffer.from(bytes);
  assert.equal(buf.subarray(0, 4).toString('binary'), 'PK\x03\x04', 'starts with ZIP local file header');
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 8 ? inflateRawSync(raw).toString('utf8') : raw.toString('utf8');
    entries.set(name, content);
    offset = dataStart + compSize;
  }
  assert.equal(buf.readUInt32LE(offset), 0x02014b50, 'followed by ZIP central directory');
  return entries;
}

test('xlsxColName converts 0-indexed column numbers into Excel A..Z, AA..ZZ column letters', () => {
  assert.equal(xlsxColName(0), 'A');
  assert.equal(xlsxColName(25), 'Z');
  assert.equal(xlsxColName(26), 'AA');
  assert.equal(xlsxColName(27), 'AB');
  assert.equal(xlsxColName(51), 'AZ');
  assert.equal(xlsxColName(52), 'BA');
});

test('xlsxDocument builds a valid multi-sheet OOXML package with frozen header row, numeric cells, and formula neutralisation', () => {
  const bytes = xlsxDocument([
    {
      name: 'Laporan',
      rows: [
        ['periode', 'jumlah_dokumen', 'pokok_rencana', 'catatan'],
        ['2026-03', 12, amount4ToDecimal(12500005000), '=HYPERLINK("http://evil","klik")'],
        ['2026-04', 0, { decimal: '-500.25' }, 'O\'Brien & Co <test>'],
      ],
    },
    {
      name: 'Info',
      rows: [
        ['kunci', 'nilai'],
        ['laporan', 'pinjaman'],
      ],
    },
  ]);

  assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 200);
  const files = readZipEntries(bytes);
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(files.has(required), `missing ${required}`);
  }

  const wb = files.get('xl/workbook.xml');
  assert.ok(wb.includes('<sheet name="Laporan" sheetId="1" r:id="rId1"/>'));
  assert.ok(wb.includes('<sheet name="Info" sheetId="2" r:id="rId2"/>'));

  const sheet1 = files.get('xl/worksheets/sheet1.xml');
  assert.ok(sheet1.includes('state="frozen"'), 'top header row is frozen');
  assert.ok(sheet1.includes('<c r="A1" s="1" t="inlineStr"><is><t>periode</t></is></c>'), 'header row uses style s="1"');
  assert.ok(sheet1.includes('<c r="B2" s="2" t="n"><v>12</v></c>'), 'integer cell is numeric t="n"');
  assert.ok(sheet1.includes('<c r="C2" s="3" t="n"><v>1250000.50</v></c>'), 'decimal cell is numeric t="n" with Rupiah style s="3"');
  assert.ok(sheet1.includes('<c r="C3" s="3" t="n"><v>-500.25</v></c>'), 'negative decimal cell stays numeric');
  assert.ok(sheet1.includes('<c r="D2" s="0" t="inlineStr"><is><t>&apos;=HYPERLINK(&quot;http://evil&quot;,&quot;klik&quot;)</t></is></c>'), 'formula string is neutralised and XML-escaped');
  assert.ok(sheet1.includes('O&apos;Brien &amp; Co &lt;test&gt;'), 'XML entities escaped');
});

test('xlsxDocument rejects floats, unsafe integers, and malformed decimals with AMOUNT_INVALID', () => {
  for (const bad of [0.5, 2 ** 60, { decimal: '1e5' }, { decimal: '1,5' }, { decimal: '=1' }, { decimal: 'NaN' }]) {
    assert.throws(() => xlsxDocument([{ name: 'S', rows: [['h'], [bad]] }]), (e) => e instanceof KosipaError && e.code === 'AMOUNT_INVALID');
  }
});
