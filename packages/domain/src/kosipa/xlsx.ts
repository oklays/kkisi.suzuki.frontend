import { deflateRawSync } from 'node:zlib';
import { KosipaError } from './errors.ts';
import { neutralizeFormula, type CsvCell } from './csv.ts';

/**
 * Pure zero-dependency OOXML (.xlsx) workbook writer for KOSIPA exports.
 * - Numbers and exact `{ decimal }` amounts are written as numeric `<c t="n">` cells (so Excel SUM() works out of the box).
 * - Text cells are neutralised against formula injection (`=`, `+`, `-`, `@`, tab/CR) and written as `<c t="inlineStr">`.
 * - Top row of every worksheet is styled in KKISI Suzuki Blue (#003399) and frozen (`ySplit="1"`).
 */
export type XlsxSheet = {
  name: string;
  rows: readonly (readonly CsvCell[])[];
};

const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 0-indexed column number to Excel column letters (0 -> A, 25 -> Z, 26 -> AA). */
export function xlsxColName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function renderCell(ref: string, value: CsvCell, isHeader: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new KosipaError('AMOUNT_INVALID');
    const style = isHeader ? 1 : 2;
    return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
  }
  if (typeof value === 'object') {
    if (!EXACT_DECIMAL.test(value.decimal)) throw new KosipaError('AMOUNT_INVALID');
    const style = isHeader ? 1 : 3;
    return `<c r="${ref}" s="${style}" t="n"><v>${value.decimal}</v></c>`;
  }
  const clean = neutralizeFormula(value.replace(CTRL, ' '));
  const preserve = /^\s|\s$|\n|\r|\t/.test(clean) ? ' xml:space="preserve"' : '';
  const style = isHeader ? 1 : 0;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${preserve}>${xmlEscape(clean)}</t></is></c>`;
}

function renderWorksheet(rows: readonly (readonly CsvCell[])[]): string {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const colsXml = `<cols><col min="1" max="${maxCols}" width="18" customWidth="1"/></cols>`;
  const rowsXml = rows.map((row, rIdx) => {
    const rNum = rIdx + 1;
    const isHeader = rIdx === 0;
    const cells = row.map((cell, cIdx) => renderCell(`${xlsxColName(cIdx)}${rNum}`, cell, isHeader)).filter(Boolean).join('');
    return `<row r="${rNum}"${isHeader ? ' ht="22" customHeight="1"' : ''}>${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + colsXml
    + `<sheetData>${rowsXml}</sheetData>`
    + `</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="2">`
  + `<numFmt numFmtId="164" formatCode="#,##0"/>`
  + `<numFmt numFmtId="165" formatCode="#,##0.00"/>`
  + `</numFmts>`
  + `<fonts count="2">`
  + `<font><sz val="10"/><color rgb="FF101828"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`
  + `</fonts>`
  + `<fills count="3">`
  + `<fill><patternFill patternType="none"/></fill>`
  + `<fill><patternFill patternType="gray125"/></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FF003399"/><bgColor indexed="64"/></patternFill></fill>`
  + `</fills>`
  + `<borders count="2">`
  + `<border><left/><right/><top/><bottom/><diagonal/></border>`
  + `<border><left style="thin"><color rgb="FFD9DDE3"/></left><right style="thin"><color rgb="FFD9DDE3"/></right><top style="thin"><color rgb="FFD9DDE3"/></top><bottom style="thin"><color rgb="FFD9DDE3"/></bottom><diagonal/></border>`
  + `</borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="4">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`
  + `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>`
  + `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>`
  + `</cellXfs>`
  + `</styleSheet>`;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = deflateRawSync(f.data);
    const crc = crc32(f.data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...locals, ...centrals, eocd]));
}

export function xlsxDocument(sheets: readonly XlsxSheet[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }];
  const enc = new TextEncoder();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>`
    + safeSheets.map((s, i) => `<sheet name="${xmlEscape(s.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || `Sheet${i + 1}`)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + `</sheets>`
    + `</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + safeSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    ...safeSheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(renderWorksheet(s.rows)) })),
  ];

  return buildZip(files);
}
