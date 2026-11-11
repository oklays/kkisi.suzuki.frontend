import { deflateRawSync } from 'node:zlib';
import { renderKosipaPdfDocument, type KosipaPdfDocumentSpec, type PdfSection } from '../kosipa/pdf-document.ts';
import { neutralizeFormula } from '../kosipa/csv.ts';
import { xlsxColName } from '../kosipa/xlsx.ts';
import { parseSalesHistoryQuery, SalesHistoryError, type SalesHistoryQuery, type SalesQueryParams } from './history.ts';

export type SalesExportFormat = 'xlsx' | 'pdf';
export type SalesExportScope = 'store' | 'all';
export type SalesExportQuery = SalesHistoryQuery & { format: SalesExportFormat; scope: SalesExportScope };

export type SalesExportStore = { id: number; name: string; code: string };

export type SalesExportRow = {
  companyId: number;
  saleId: number;
  salesCode: string;
  saleDate: string;
  customerName: string;
  memberNik: string | null;
  memberMasterName: string | null;
  createdBy: string;
  source: 'pos' | 'nonpos';
  salesStatus: string;
  paymentStatus: string;
  paymentType: string;
  recordStatus: number;
  returnBit: string | null;
  grandTotalSen: number | null;
  paidSen: number | null;
  registerId: number | null;
  registerReference: string | null;
  cashierLabel: string | null;
};

export type SalesExportReturnRow = {
  companyId: number;
  returnId: number;
  returnCode: string;
  returnDate: string;
  salesCode: string;
  customerName: string;
  memberNik: string | null;
  refundMethod: string;
  totalSen: number | null;
  createdBy: string;
  note: string;
};

export type SalesExportCategoryRow = {
  categoryId: number;
  categoryName: string;
  uniqueItems: number;
  txCount: number;
  totalQty: number;
  totalRevenueRp: number;
  estCogsRp: number;
};

export type SalesExportTopItemRow = {
  itemId: number;
  itemCode: string;
  barcode: string;
  itemName: string;
  categoryName: string;
  unitPriceRp: number;
  purchasePriceRp: number;
  txCount: number;
  totalQty: number;
  totalRevenueRp: number;
};

export type SalesExportStoreItemTotal = {
  companyId: number;
  lineCount: number;
  uniqueItems: number;
  totalQty: number;
  totalRevenueRp: number;
  estCogsRp: number;
};

export type SalesExportBundle = {
  scope: SalesExportScope;
  query: SalesHistoryQuery;
  generatedAt: Date;
  stores: readonly SalesExportStore[];
  sales: readonly SalesExportRow[];
  returns: readonly SalesExportReturnRow[];
  categories: readonly SalesExportCategoryRow[];
  topItems: readonly SalesExportTopItemRow[];
  storeItemTotals: readonly SalesExportStoreItemTotal[];
};

function singleParam(params: SalesQueryParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new SalesHistoryError('INVALID_INPUT');
  return values[0];
}

export function parseSalesExportQuery(params: SalesQueryParams, now = new Date()): SalesExportQuery {
  const rawFormat = singleParam(params, 'format')?.trim() ?? '';
  if (rawFormat !== 'xlsx' && rawFormat !== 'pdf') {
    throw new SalesHistoryError('INVALID_INPUT', 'Format ekspor harus xlsx atau pdf.');
  }
  const rawScope = singleParam(params, 'scope')?.trim() || 'store';
  if (rawScope !== 'store' && rawScope !== 'all') {
    throw new SalesHistoryError('INVALID_INPUT', 'Cakupan ekspor tidak valid.');
  }
  const forward = new URLSearchParams();
  for (const key of new Set(params.keys())) {
    if (key === 'format' || key === 'scope' || key === 'page' || key === 'pageSize') continue;
    for (const val of params.getAll(key)) forward.append(key, val);
  }
  const historyQuery = parseSalesHistoryQuery(forward, now);
  return { ...historyQuery, format: rawFormat, scope: rawScope };
}

export function buildSalesExportFilename(bundle: SalesExportBundle, format: SalesExportFormat): string {
  const storeSlug = bundle.scope === 'all'
    ? 'SEMUA_TOKO_KKISI'
    : (bundle.stores[0]?.name ?? 'TOKO_KKISI').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  return `Laporan_Penjualan_${storeSlug}_${bundle.query.from}_sd_${bundle.query.to}.${format}`;
}

const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

function dayNameId(ymd: string): string {
  const dt = new Date(`${ymd}T00:00:00Z`);
  return ID_DAYS[dt.getUTCDay()] ?? '-';
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cur <= end && out.length <= 95) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86_400_000;
  }
  return out;
}

const senToRp = (sen: number | null | undefined): number => Math.round((sen ?? 0) / 100);

const fmtRpText = (rp: number): string => {
  const v = Math.round(rp);
  if (v === 0) return 'Rp 0';
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return v < 0 ? `-Rp ${abs}` : `Rp ${abs}`;
};

const fmtIntText = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtPctText = (ratio: number): string => `${(ratio * 100).toFixed(2).replace('.', ',')}%`;

// ============================================================================
// Rich Master Format OOXML (.xlsx) Engine
// ============================================================================

const Style = {
  Default: 0,
  BannerTitle: 1,
  BannerSub: 2,
  SecHdr: 3,
  TblHdr: 4,
  KpiLabel: 5,
  TextW: 6,
  TextZ: 7,
  CenterW: 8,
  CenterZ: 9,
  BoldW: 10,
  BoldZ: 11,
  IntW: 12,
  IntZ: 13,
  RpW: 14,
  RpZ: 15,
  RpBoldW: 16,
  RpBoldZ: 17,
  PctW: 18,
  PctZ: 19,
  TotalText: 20,
  TotalInt: 21,
  TotalRp: 22,
  TotalPct: 23,
  MutedNote: 24,
  WarnCenter: 25,
} as const;

type StyleId = (typeof Style)[keyof typeof Style];

type RichCell =
  | null
  | { kind: 'str'; v: string; s: StyleId }
  | { kind: 'num'; v: number; s: StyleId }
  | { kind: 'formula'; f: string; v?: number | string; t?: 'n' | 'str'; s: StyleId };

type RichSheet = {
  name: string;
  cols: readonly number[];
  rows: { r: number; ht?: number; cells: { c: number; cell: RichCell }[] }[];
  merges: string[];
  freezeRow?: number;
  autoFilterRef?: string;
};

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

class SheetBuilder {
  readonly name: string;
  readonly cols: number[];
  readonly rows = new Map<number, { ht?: number; cells: Map<number, RichCell> }>();
  readonly merges: string[] = [];
  freezeRow?: number;
  autoFilterRef?: string;

  constructor(name: string, cols: number[]) {
    this.name = name;
    this.cols = cols;
  }

  private ensureRow(r: number) {
    let row = this.rows.get(r);
    if (!row) {
      row = { cells: new Map() };
      this.rows.set(r, row);
    }
    return row;
  }

  setRowHeight(r: number, ht: number): void {
    this.ensureRow(r).ht = ht;
  }

  str(r: number, c: number, v: string, s: StyleId = Style.TextW): void {
    this.ensureRow(r).cells.set(c, { kind: 'str', v, s });
  }

  num(r: number, c: number, v: number, s: StyleId = Style.IntW): void {
    this.ensureRow(r).cells.set(c, { kind: 'num', v: Number.isFinite(v) ? v : 0, s });
  }

  formula(r: number, c: number, f: string, s: StyleId, cachedValue: number | string = 0, t: 'n' | 'str' = 'n'): void {
    const cleanFormula = f.startsWith('=') ? f.slice(1) : f;
    this.ensureRow(r).cells.set(c, { kind: 'formula', f: cleanFormula, v: cachedValue, t, s });
  }

  merge(r1: number, c1: number, r2: number, c2: number, fillStyle?: StyleId): void {
    this.merges.push(`${xlsxColName(c1 - 1)}${r1}:${xlsxColName(c2 - 1)}${r2}`);
    if (fillStyle !== undefined) {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const existing = this.ensureRow(r).cells.get(c);
          if (!existing) this.str(r, c, '', fillStyle);
        }
      }
    }
  }

  banner(title: string, subtitle: string, maxCol: number): void {
    this.str(1, 1, title, Style.BannerTitle);
    this.merge(1, 1, 1, maxCol, Style.BannerTitle);
    this.setRowHeight(1, 30);
    this.str(2, 1, subtitle, Style.BannerSub);
    this.merge(2, 1, 2, maxCol, Style.BannerSub);
    this.setRowHeight(2, 20);
  }

  sectionHeader(r: number, title: string, maxCol: number): void {
    this.str(r, 1, title, Style.SecHdr);
    this.merge(r, 1, r, maxCol, Style.SecHdr);
    this.setRowHeight(r, 22);
  }

  tableHeader(r: number, headers: readonly string[], startCol = 1): void {
    headers.forEach((h, i) => this.str(r, startCol + i, h, Style.TblHdr));
    this.setRowHeight(r, 24);
  }

  build(): RichSheet {
    const sortedRows = [...this.rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, data]) => ({
        r,
        ht: data.ht,
        cells: [...data.cells.entries()].sort((a, b) => a[0] - b[0]).map(([c, cell]) => ({ c, cell })),
      }));
    return {
      name: this.name,
      cols: this.cols,
      rows: sortedRows,
      merges: this.merges,
      freezeRow: this.freezeRow,
      autoFilterRef: this.autoFilterRef,
    };
  }
}

function renderRichCell(ref: string, cell: RichCell): string {
  if (!cell) return '';
  if (cell.kind === 'num') {
    const v = Number.isFinite(cell.v) ? cell.v : 0;
    return `<c r="${ref}" s="${cell.s}" t="n"><v>${v}</v></c>`;
  }
  if (cell.kind === 'formula') {
    if (cell.t === 'str') {
      return `<c r="${ref}" s="${cell.s}" t="str"><f>${xmlEscape(cell.f)}</f><v>${xmlEscape(String(cell.v ?? ''))}</v></c>`;
    }
    const v = typeof cell.v === 'number' && Number.isFinite(cell.v) ? cell.v : 0;
    return `<c r="${ref}" s="${cell.s}" t="n"><f>${xmlEscape(cell.f)}</f><v>${v}</v></c>`;
  }
  const clean = neutralizeFormula(String(cell.v ?? '').replace(CTRL, ' '));
  const preserve = /^\s|\s$|\n|\r|\t/.test(clean) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t${preserve}>${xmlEscape(clean)}</t></is></c>`;
}

function renderRichWorksheet(sheet: RichSheet): string {
  const viewXml = sheet.freezeRow && sheet.freezeRow > 1
    ? `<sheetViews><sheetView showGridLines="1" workbookViewId="0"><pane ySplit="${sheet.freezeRow - 1}" topLeftCell="A${sheet.freezeRow}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView showGridLines="1" workbookViewId="0"/></sheetViews>`;

  const colsXml = `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;

  const rowsXml = sheet.rows.map((row) => {
    const htAttr = row.ht ? ` ht="${row.ht}" customHeight="1"` : '';
    const cellsXml = row.cells.map(({ c, cell }) => renderRichCell(`${xlsxColName(c - 1)}${row.r}`, cell)).join('');
    return `<row r="${row.r}"${htAttr}>${cellsXml}</row>`;
  }).join('');

  const filterXml = sheet.autoFilterRef ? `<autoFilter ref="${sheet.autoFilterRef}"/>` : '';
  const mergesXml = sheet.merges.length > 0
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + viewXml
    + colsXml
    + `<sheetData>${rowsXml}</sheetData>`
    + filterXml
    + mergesXml
    + `</worksheet>`;
}

const MASTER_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="3">`
  + `<numFmt numFmtId="164" formatCode="&quot;Rp&quot;#,##0;(&quot;Rp&quot;#,##0);&quot;-&quot;"/>`
  + `<numFmt numFmtId="165" formatCode="#,##0"/>`
  + `<numFmt numFmtId="166" formatCode="0.00%"/>`
  + `</numFmts>`
  + `<fonts count="8">`
  + `<font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`
  + `<font><i/><sz val="10"/><color rgb="FFE0E7FF"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>`
  + `<font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="10"/><color rgb="FFB45309"/><name val="Calibri"/></font>`
  + `</fonts>`
  + `<fills count="10">`
  + `<fill><patternFill patternType="none"/></fill>`
  + `<fill><patternFill patternType="gray125"/></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FF0F2942"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>`
  + `</fills>`
  + `<borders count="4">`
  + `<border><left/><right/><top/><bottom/><diagonal/></border>`
  + `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>`
  + `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="medium"><color rgb="FF1E3A5F"/></top><bottom style="medium"><color rgb="FF1E3A5F"/></bottom><diagonal/></border>`
  + `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="double"><color rgb="FF0F172A"/></bottom><diagonal/></border>`
  + `</borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="26">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>`
  + `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>`
  + `<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="4" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="5" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="165" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="5" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="5" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="166" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="166" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="5" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="165" fontId="5" fillId="7" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="5" fillId="7" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="166" fontId="5" fillId="7" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="7" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `</cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
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

function packRichWorkbook(sheets: readonly RichSheet[]): Uint8Array {
  const enc = new TextEncoder();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>`
    + sheets.map((s, i) => `<sheet name="${xmlEscape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + `</sheets>`
    + `</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(MASTER_STYLES_XML) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(renderRichWorksheet(s)) })),
  ];
  return buildZip(files);
}

export function buildSalesExportWorkbook(bundle: SalesExportBundle): Uint8Array {
  const storeMap = new Map(bundle.stores.map((s) => [s.id, s]));
  const storeName = (cid: number) => storeMap.get(cid)?.name ?? `Cabang #${cid}`;
  const isAll = bundle.scope === 'all';
  const titleStore = isAll ? 'SEMUA TOKO KKISI (KONSOLIDASI)' : (bundle.stores[0]?.name ?? 'TOKO S-MART');
  const subtitle = `Periode: ${bundle.query.from} s/d ${bundle.query.to} | Filter Status: ${bundle.query.salesStatus} · Pembayaran: ${bundle.query.paymentType} | Sumber: https://smart.kkisitb2.id/sales`;

  const finalSales = bundle.sales.filter((s) => s.salesStatus === 'Final' && s.recordStatus === 1);
  const nonFinalSales = bundle.sales.filter((s) => s.salesStatus !== 'Final' || s.recordStatus !== 1);

  const totalFinalTx = finalSales.length;
  const totalFinalRp = finalSales.reduce((acc, s) => acc + senToRp(s.grandTotalSen), 0);
  const totalPaidRp = finalSales.reduce((acc, s) => acc + senToRp(s.paidSen), 0);
  const totalChangeRp = Math.max(0, totalPaidRp - totalFinalRp);
  const avgTicketRp = totalFinalTx > 0 ? Math.round(totalFinalRp / totalFinalTx) : 0;
  const activeDays = new Set(finalSales.map((s) => s.saleDate)).size;
  const avgDailyRp = activeDays > 0 ? Math.round(totalFinalRp / activeDays) : 0;
  const totalQtySold = bundle.storeItemTotals.reduce((acc, t) => acc + Math.round(t.totalQty), 0);
  const totalLineItems = bundle.storeItemTotals.reduce((acc, t) => acc + t.lineCount, 0);
  const totalUniqueItems = bundle.storeItemTotals.reduce((acc, t) => acc + t.uniqueItems, 0);
  const totalEstCogsRp = bundle.storeItemTotals.reduce((acc, t) => acc + Math.round(t.estCogsRp), 0);
  const totalReturnsRp = bundle.returns.reduce((acc, r) => acc + senToRp(r.totalSen), 0);
  const netSalesRp = totalFinalRp - totalReturnsRp;

  // ==========================================================================
  // SHEET 1: Ringkasan Eksekutif
  // ==========================================================================
  const ws1 = new SheetBuilder('Ringkasan Eksekutif', [30, 18, 16, 20, 14, 18, 18, 20]);
  ws1.banner(`LAPORAN PENJUALAN · ${titleStore}`, subtitle, 8);

  let r = 4;
  ws1.sectionHeader(r, '1. IKHTISAR KINERJA UTAMA (EXECUTIVE KPI SUMMARY)', 8);
  r++;
  const kpiRows: [string, number, StyleId, string, number, StyleId][] = [
    ['Total Omzet Penjualan (Gross Final)', totalFinalRp, Style.RpBoldW, 'Total Transaksi Final (Struk)', totalFinalTx, Style.IntW],
    ['Total Retur Penjualan', totalReturnsRp, Style.RpW, 'Penjualan Bersih (Net Sales)', netSalesRp, Style.RpBoldW],
    ['Rata-rata Nilai per Struk (Basket Size)', avgTicketRp, Style.RpW, 'Rata-rata Omzet per Hari Aktif', avgDailyRp, Style.RpW],
    ['Total Uang Diterima / Terbayar', totalPaidRp, Style.RpW, 'Total Kembalian Tunai (Cash Change)', totalChangeRp, Style.RpW],
    ['Total Kuantitas Barang Terjual (Unit)', totalQtySold, Style.IntW, 'Total Baris Item / Estimasi HPP', totalEstCogsRp, Style.RpW],
  ];
  for (const [l1, v1, s1, l2, v2, s2] of kpiRows) {
    ws1.str(r, 1, l1, Style.KpiLabel);
    ws1.merge(r, 1, r, 2, Style.KpiLabel);
    ws1.num(r, 3, v1, s1);
    ws1.merge(r, 3, r, 4, s1);
    ws1.str(r, 5, l2, Style.KpiLabel);
    ws1.merge(r, 5, r, 6, Style.KpiLabel);
    ws1.num(r, 7, v2, s2);
    ws1.merge(r, 7, r, 8, s2);
    ws1.setRowHeight(r, 21);
    r++;
  }

  r++;
  ws1.sectionHeader(r, '2. PERBANDINGAN KINERJA PER CABANG TOKO', 8);
  r++;
  ws1.tableHeader(r, ['Cabang Toko', 'Transaksi Final', 'Porsi Struk', 'Total Omzet (Rp)', 'Porsi Omzet', 'Rata-rata / Struk', 'Retur (Rp)', 'Penjualan Bersih']);
  r++;
  const storeStartRow = r;
  bundle.stores.forEach((st, idx) => {
    const z = idx % 2 === 1;
    const stSales = finalSales.filter((s) => s.companyId === st.id);
    const stTx = stSales.length;
    const stRp = stSales.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const stRetRp = bundle.returns.filter((rt) => rt.companyId === st.id).reduce((a, rt) => a + senToRp(rt.totalSen), 0);
    const stNetRp = stRp - stRetRp;
    ws1.str(r, 1, st.name, z ? Style.BoldZ : Style.BoldW);
    ws1.num(r, 2, stTx, z ? Style.IntZ : Style.IntW);
    r++;
    void stNetRp;
  });
  const storeEndRow = r - 1;
  const storeTotalRow = r;
  bundle.stores.forEach((st, idx) => {
    const rowIdx = storeStartRow + idx;
    const z = idx % 2 === 1;
    const stSales = finalSales.filter((s) => s.companyId === st.id);
    const stTx = stSales.length;
    const stRp = stSales.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const stRetRp = bundle.returns.filter((rt) => rt.companyId === st.id).reduce((a, rt) => a + senToRp(rt.totalSen), 0);
    ws1.formula(rowIdx, 3, `IF(B${storeTotalRow}>0,B${rowIdx}/B${storeTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalTx > 0 ? stTx / totalFinalTx : 0);
    ws1.num(rowIdx, 4, stRp, z ? Style.RpBoldZ : Style.RpBoldW);
    ws1.formula(rowIdx, 5, `IF(D${storeTotalRow}>0,D${rowIdx}/D${storeTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? stRp / totalFinalRp : 0);
    ws1.formula(rowIdx, 6, `IF(B${rowIdx}>0,D${rowIdx}/B${rowIdx},0)`, z ? Style.RpZ : Style.RpW, stTx > 0 ? Math.round(stRp / stTx) : 0);
    ws1.num(rowIdx, 7, stRetRp, z ? Style.RpZ : Style.RpW);
    ws1.formula(rowIdx, 8, `D${rowIdx}-G${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, stRp - stRetRp);
    ws1.setRowHeight(rowIdx, 20);
  });
  ws1.str(storeTotalRow, 1, 'TOTAL KONSOLIDASI', Style.TotalText);
  ws1.formula(storeTotalRow, 2, `SUM(B${storeStartRow}:B${storeEndRow})`, Style.TotalInt, totalFinalTx);
  ws1.formula(storeTotalRow, 3, `SUM(C${storeStartRow}:C${storeEndRow})`, Style.TotalPct, 1);
  ws1.formula(storeTotalRow, 4, `SUM(D${storeStartRow}:D${storeEndRow})`, Style.TotalRp, totalFinalRp);
  ws1.formula(storeTotalRow, 5, `SUM(E${storeStartRow}:E${storeEndRow})`, Style.TotalPct, 1);
  ws1.formula(storeTotalRow, 6, `IF(B${storeTotalRow}>0,D${storeTotalRow}/B${storeTotalRow},0)`, Style.TotalRp, avgTicketRp);
  ws1.formula(storeTotalRow, 7, `SUM(G${storeStartRow}:G${storeEndRow})`, Style.TotalRp, totalReturnsRp);
  ws1.formula(storeTotalRow, 8, `SUM(H${storeStartRow}:H${storeEndRow})`, Style.TotalRp, netSalesRp);
  ws1.setRowHeight(storeTotalRow, 22);
  r = storeTotalRow + 2;

  // Section 3: Metode Pembayaran
  ws1.sectionHeader(r, '3. REKAPITULASI METODE PEMBAYARAN (FINAL)', 8);
  r++;
  ws1.tableHeader(r, ['Metode Pembayaran', 'Jumlah Struk', 'Porsi Struk', 'Total Penjualan (Rp)', 'Porsi Omzet', 'Rata-rata / Struk', 'Nominal Dibayar (Rp)', 'Kembalian (Rp)']);
  r++;
  const payMethods = ['Kredit', 'Cash', 'QRIS'];
  const payStartRow = r;
  const payTotalRow = payStartRow + payMethods.length;
  payMethods.forEach((m, idx) => {
    const rowIdx = payStartRow + idx;
    const z = idx % 2 === 1;
    const mSales = finalSales.filter((s) => s.paymentType === m);
    const mTx = mSales.length;
    const mRp = mSales.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const mPaid = mSales.reduce((a, s) => a + senToRp(s.paidSen), 0);
    const mChange = Math.max(0, mPaid - mRp);
    const label = m === 'Kredit' ? 'Kredit (Potong Gaji Anggota)' : m === 'Cash' ? 'Cash (Tunai Kasir)' : 'QRIS (Pembayaran Digital)';
    ws1.str(rowIdx, 1, label, z ? Style.BoldZ : Style.BoldW);
    ws1.num(rowIdx, 2, mTx, z ? Style.IntZ : Style.IntW);
    ws1.formula(rowIdx, 3, `IF(B${payTotalRow}>0,B${rowIdx}/B${payTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalTx > 0 ? mTx / totalFinalTx : 0);
    ws1.num(rowIdx, 4, mRp, z ? Style.RpBoldZ : Style.RpBoldW);
    ws1.formula(rowIdx, 5, `IF(D${payTotalRow}>0,D${rowIdx}/D${payTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? mRp / totalFinalRp : 0);
    ws1.formula(rowIdx, 6, `IF(B${rowIdx}>0,D${rowIdx}/B${rowIdx},0)`, z ? Style.RpZ : Style.RpW, mTx > 0 ? Math.round(mRp / mTx) : 0);
    ws1.num(rowIdx, 7, mPaid, z ? Style.RpZ : Style.RpW);
    ws1.formula(rowIdx, 8, `G${rowIdx}-D${rowIdx}`, z ? Style.RpZ : Style.RpW, mChange);
    ws1.setRowHeight(rowIdx, 20);
  });
  const payEndRow = payTotalRow - 1;
  ws1.str(payTotalRow, 1, 'TOTAL METODE PEMBAYARAN', Style.TotalText);
  ws1.formula(payTotalRow, 2, `SUM(B${payStartRow}:B${payEndRow})`, Style.TotalInt, totalFinalTx);
  ws1.formula(payTotalRow, 3, `SUM(C${payStartRow}:C${payEndRow})`, Style.TotalPct, 1);
  ws1.formula(payTotalRow, 4, `SUM(D${payStartRow}:D${payEndRow})`, Style.TotalRp, totalFinalRp);
  ws1.formula(payTotalRow, 5, `SUM(E${payStartRow}:E${payEndRow})`, Style.TotalPct, 1);
  ws1.formula(payTotalRow, 6, `IF(B${payTotalRow}>0,D${payTotalRow}/B${payTotalRow},0)`, Style.TotalRp, avgTicketRp);
  ws1.formula(payTotalRow, 7, `SUM(G${payStartRow}:G${payEndRow})`, Style.TotalRp, totalPaidRp);
  ws1.formula(payTotalRow, 8, `SUM(H${payStartRow}:H${payEndRow})`, Style.TotalRp, totalChangeRp);
  ws1.setRowHeight(payTotalRow, 22);
  r = payTotalRow + 2;

  // Section 4: Segmen Pelanggan
  ws1.sectionHeader(r, '4. SEGMEN PELANGGAN & OPERATOR KASIR', 8);
  r++;
  ws1.tableHeader(r, ['Segmen / Operator Kasir', 'Kategori', 'Jumlah Struk', 'Porsi Struk', 'Total Omzet (Rp)', 'Porsi Omzet', 'Rata-rata / Struk', 'Keterangan']);
  r++;
  const segStartRow = r;
  const memberSales = finalSales.filter((s) => !!s.memberNik);
  const generalSales = finalSales.filter((s) => !s.memberNik);
  const segData: [string, string, SalesExportRow[], string][] = [
    ['Anggota Koperasi (Terdaftar NIK)', 'Segmen Pelanggan', memberSales, `${new Set(memberSales.map((s) => s.memberNik)).size} NIK Anggota Unik`],
    ['Pelanggan Umum (Walk-In Non-NIK)', 'Segmen Pelanggan', generalSales, 'Transaksi Tunai / QRIS Umum'],
  ];
  const segTotalRow = segStartRow + segData.length;
  segData.forEach(([label, cat, list, note], idx) => {
    const rowIdx = segStartRow + idx;
    const z = idx % 2 === 1;
    const tx = list.length;
    const rp = list.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    ws1.str(rowIdx, 1, label, z ? Style.BoldZ : Style.BoldW);
    ws1.str(rowIdx, 2, cat, z ? Style.CenterZ : Style.CenterW);
    ws1.num(rowIdx, 3, tx, z ? Style.IntZ : Style.IntW);
    ws1.formula(rowIdx, 4, `IF(C${segTotalRow}>0,C${rowIdx}/C${segTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalTx > 0 ? tx / totalFinalTx : 0);
    ws1.num(rowIdx, 5, rp, z ? Style.RpBoldZ : Style.RpBoldW);
    ws1.formula(rowIdx, 6, `IF(E${segTotalRow}>0,E${rowIdx}/E${segTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? rp / totalFinalRp : 0);
    ws1.formula(rowIdx, 7, `IF(C${rowIdx}>0,E${rowIdx}/C${rowIdx},0)`, z ? Style.RpZ : Style.RpW, tx > 0 ? Math.round(rp / tx) : 0);
    ws1.str(rowIdx, 8, note, z ? Style.TextZ : Style.TextW);
    ws1.setRowHeight(rowIdx, 20);
  });
  ws1.str(segTotalRow, 1, 'TOTAL SEGMEN PELANGGAN', Style.TotalText);
  ws1.str(segTotalRow, 2, '-', Style.TotalText);
  ws1.formula(segTotalRow, 3, `SUM(C${segStartRow}:C${segTotalRow - 1})`, Style.TotalInt, totalFinalTx);
  ws1.formula(segTotalRow, 4, `SUM(D${segStartRow}:D${segTotalRow - 1})`, Style.TotalPct, 1);
  ws1.formula(segTotalRow, 5, `SUM(E${segStartRow}:E${segTotalRow - 1})`, Style.TotalRp, totalFinalRp);
  ws1.formula(segTotalRow, 6, `SUM(F${segStartRow}:F${segTotalRow - 1})`, Style.TotalPct, 1);
  ws1.formula(segTotalRow, 7, `IF(C${segTotalRow}>0,E${segTotalRow}/C${segTotalRow},0)`, Style.TotalRp, avgTicketRp);
  ws1.str(segTotalRow, 8, '100% Transaksi Final', Style.TotalText);
  ws1.setRowHeight(segTotalRow, 22);
  r = segTotalRow + 2;

  // Section 5: Tren Penjualan Mingguan
  ws1.sectionHeader(r, '5. TREN PENJUALAN MINGGUAN (WEEKLY SALES TREND)', 8);
  r++;
  ws1.tableHeader(r, ['Minggu Ke-', 'Rentang Tanggal', 'Jumlah Struk', 'Omzet Kredit (Rp)', 'Omzet Cash (Rp)', 'Omzet QRIS (Rp)', 'Total Omzet (Rp)', 'Porsi Mingguan']);
  r++;
  const weekBuckets = [
    { label: 'Minggu 1', minDay: 1, maxDay: 7 },
    { label: 'Minggu 2', minDay: 8, maxDay: 14 },
    { label: 'Minggu 3', minDay: 15, maxDay: 21 },
    { label: 'Minggu 4', minDay: 22, maxDay: 28 },
    { label: 'Minggu 5', minDay: 29, maxDay: 31 },
  ];
  const wkStartRow = r;
  const wkTotalRow = wkStartRow + weekBuckets.length;
  weekBuckets.forEach((wbk, idx) => {
    const rowIdx = wkStartRow + idx;
    const z = idx % 2 === 1;
    const wSales = finalSales.filter((s) => {
      const dom = Number(s.saleDate.slice(8, 10));
      return dom >= wbk.minDay && dom <= wbk.maxDay;
    });
    const wKr = wSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const wCa = wSales.filter((s) => s.paymentType === 'Cash').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const wQr = wSales.filter((s) => s.paymentType === 'QRIS').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const wTot = wKr + wCa + wQr;
    ws1.str(rowIdx, 1, wbk.label, z ? Style.BoldZ : Style.BoldW);
    ws1.str(rowIdx, 2, `Tanggal ${String(wbk.minDay).padStart(2, '0')} - ${String(wbk.maxDay).padStart(2, '0')}`, z ? Style.CenterZ : Style.CenterW);
    ws1.num(rowIdx, 3, wSales.length, z ? Style.IntZ : Style.IntW);
    ws1.num(rowIdx, 4, wKr, z ? Style.RpZ : Style.RpW);
    ws1.num(rowIdx, 5, wCa, z ? Style.RpZ : Style.RpW);
    ws1.num(rowIdx, 6, wQr, z ? Style.RpZ : Style.RpW);
    ws1.formula(rowIdx, 7, `D${rowIdx}+E${rowIdx}+F${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, wTot);
    ws1.formula(rowIdx, 8, `IF(G${wkTotalRow}>0,G${rowIdx}/G${wkTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? wTot / totalFinalRp : 0);
    ws1.setRowHeight(rowIdx, 20);
  });
  ws1.str(wkTotalRow, 1, 'TOTAL MINGGUAN', Style.TotalText);
  ws1.str(wkTotalRow, 2, `${bundle.query.from} s/d ${bundle.query.to}`, Style.TotalText);
  ws1.formula(wkTotalRow, 3, `SUM(C${wkStartRow}:C${wkTotalRow - 1})`, Style.TotalInt, totalFinalTx);
  ws1.formula(wkTotalRow, 4, `SUM(D${wkStartRow}:D${wkTotalRow - 1})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws1.formula(wkTotalRow, 5, `SUM(E${wkStartRow}:E${wkTotalRow - 1})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'Cash').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws1.formula(wkTotalRow, 6, `SUM(F${wkStartRow}:F${wkTotalRow - 1})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'QRIS').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws1.formula(wkTotalRow, 7, `SUM(G${wkStartRow}:G${wkTotalRow - 1})`, Style.TotalRp, totalFinalRp);
  ws1.formula(wkTotalRow, 8, `SUM(H${wkStartRow}:H${wkTotalRow - 1})`, Style.TotalPct, totalFinalRp > 0 ? 1 : 0);
  ws1.setRowHeight(wkTotalRow, 22);
  r = wkTotalRow + 2;

  // Section 6: Rekapitulasi Operator Kasir
  ws1.sectionHeader(r, '6. REKAPITULASI OPERATOR KASIR (CREATED_BY)', 8);
  r++;
  ws1.tableHeader(r, ['Operator Kasir', 'Cabang Aktif', 'Jumlah Struk', 'Omzet Kredit (Rp)', 'Omzet Cash & QRIS (Rp)', 'Total Omzet (Rp)', 'Rata-rata / Struk', 'Porsi Omzet']);
  r++;
  const opGroups = new Map<string, SalesExportRow[]>();
  for (const s of finalSales) {
    const key = s.createdBy || 'Tidak tersimpan';
    const arr = opGroups.get(key) ?? [];
    arr.push(s);
    opGroups.set(key, arr);
  }
  const sortedOps = [...opGroups.entries()].sort((a, b) => {
    const rpA = a[1].reduce((acc, s) => acc + senToRp(s.grandTotalSen), 0);
    const rpB = b[1].reduce((acc, s) => acc + senToRp(s.grandTotalSen), 0);
    return rpB - rpA;
  });
  const opStartRow = r;
  const opTotalRow = opStartRow + Math.max(1, sortedOps.length);
  if (sortedOps.length === 0) {
    ws1.str(opStartRow, 1, '-', Style.CenterW);
    ws1.str(opStartRow, 2, '-', Style.CenterW);
    for (let c = 3; c <= 8; c++) ws1.num(opStartRow, c, 0, Style.IntW);
  } else {
    sortedOps.forEach(([opName, opSales], idx) => {
      const rowIdx = opStartRow + idx;
      const z = idx % 2 === 1;
      const opTx = opSales.length;
      const opKr = opSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
      const opCq = opSales.filter((s) => s.paymentType !== 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
      const opTot = opKr + opCq;
      const opStores = [...new Set(opSales.map((s) => storeMap.get(s.companyId)?.code ?? storeName(s.companyId)))].join(', ');
      ws1.str(rowIdx, 1, opName, z ? Style.BoldZ : Style.BoldW);
      ws1.str(rowIdx, 2, opStores, z ? Style.CenterZ : Style.CenterW);
      ws1.num(rowIdx, 3, opTx, z ? Style.IntZ : Style.IntW);
      ws1.num(rowIdx, 4, opKr, z ? Style.RpZ : Style.RpW);
      ws1.num(rowIdx, 5, opCq, z ? Style.RpZ : Style.RpW);
      ws1.formula(rowIdx, 6, `D${rowIdx}+E${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, opTot);
      ws1.formula(rowIdx, 7, `IF(C${rowIdx}>0,F${rowIdx}/C${rowIdx},0)`, z ? Style.RpZ : Style.RpW, opTx > 0 ? Math.round(opTot / opTx) : 0);
      ws1.formula(rowIdx, 8, `IF(F${opTotalRow}>0,F${rowIdx}/F${opTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? opTot / totalFinalRp : 0);
      ws1.setRowHeight(rowIdx, 20);
    });
  }
  ws1.str(opTotalRow, 1, 'TOTAL OPERATOR KASIR', Style.TotalText);
  ws1.str(opTotalRow, 2, `${sortedOps.length} Operator`, Style.TotalText);
  ws1.formula(opTotalRow, 3, `SUM(C${opStartRow}:C${opTotalRow - 1})`, Style.TotalInt, totalFinalTx);
  ws1.formula(opTotalRow, 4, `SUM(D${opStartRow}:D${opTotalRow - 1})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws1.formula(opTotalRow, 5, `SUM(E${opStartRow}:E${opTotalRow - 1})`, Style.TotalRp, finalSales.filter((s) => s.paymentType !== 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws1.formula(opTotalRow, 6, `SUM(F${opStartRow}:F${opTotalRow - 1})`, Style.TotalRp, totalFinalRp);
  ws1.formula(opTotalRow, 7, `IF(C${opTotalRow}>0,F${opTotalRow}/C${opTotalRow},0)`, Style.TotalRp, avgTicketRp);
  ws1.formula(opTotalRow, 8, `SUM(H${opStartRow}:H${opTotalRow - 1})`, Style.TotalPct, totalFinalRp > 0 ? 1 : 0);
  ws1.setRowHeight(opTotalRow, 22);

  // ==========================================================================
  // SHEET 2: Rekap Harian
  // ==========================================================================
  const ws2 = new SheetBuilder('Rekap Harian', [14, 12, 14, 18, 14, 18, 14, 18, 16, 20, 18, 14]);
  ws2.banner(`REKAPITULASI PENJUALAN HARIAN · ${titleStore}`, subtitle, 12);
  ws2.freezeRow = 5;
  ws2.tableHeader(4, [
    'Tanggal', 'Hari',
    'Struk Kredit', 'Omzet Kredit (Rp)',
    'Struk Cash', 'Omzet Cash (Rp)',
    'Struk QRIS', 'Omzet QRIS (Rp)',
    'Total Struk', 'Total Omzet (Rp)',
    'Rata-rata / Struk', 'Porsi Harian',
  ]);
  const dates = enumerateDates(bundle.query.from, bundle.query.to);
  const dailyStart = 5;
  const dailyTotalRow = dailyStart + dates.length;
  dates.forEach((dStr, idx) => {
    const rowIdx = dailyStart + idx;
    const z = idx % 2 === 1;
    const daySales = finalSales.filter((s) => s.saleDate === dStr);
    const kr = daySales.filter((s) => s.paymentType === 'Kredit');
    const ca = daySales.filter((s) => s.paymentType === 'Cash');
    const qr = daySales.filter((s) => s.paymentType === 'QRIS');
    const krRp = kr.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const caRp = ca.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const qrRp = qr.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const dayTx = daySales.length;
    const dayRp = krRp + caRp + qrRp;

    ws2.str(rowIdx, 1, dStr, z ? Style.CenterZ : Style.CenterW);
    ws2.str(rowIdx, 2, dayNameId(dStr), z ? Style.TextZ : Style.TextW);
    ws2.num(rowIdx, 3, kr.length, z ? Style.IntZ : Style.IntW);
    ws2.num(rowIdx, 4, krRp, z ? Style.RpZ : Style.RpW);
    ws2.num(rowIdx, 5, ca.length, z ? Style.IntZ : Style.IntW);
    ws2.num(rowIdx, 6, caRp, z ? Style.RpZ : Style.RpW);
    ws2.num(rowIdx, 7, qr.length, z ? Style.IntZ : Style.IntW);
    ws2.num(rowIdx, 8, qrRp, z ? Style.RpZ : Style.RpW);
    ws2.formula(rowIdx, 9, `C${rowIdx}+E${rowIdx}+G${rowIdx}`, z ? Style.IntZ : Style.IntW, dayTx);
    ws2.formula(rowIdx, 10, `D${rowIdx}+F${rowIdx}+H${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, dayRp);
    ws2.formula(rowIdx, 11, `IF(I${rowIdx}>0,J${rowIdx}/I${rowIdx},0)`, z ? Style.RpZ : Style.RpW, dayTx > 0 ? Math.round(dayRp / dayTx) : 0);
    ws2.formula(rowIdx, 12, `IF(J${dailyTotalRow}>0,J${rowIdx}/J${dailyTotalRow},0)`, z ? Style.PctZ : Style.PctW, totalFinalRp > 0 ? dayRp / totalFinalRp : 0);
    ws2.setRowHeight(rowIdx, 19);
  });
  const dailyEnd = Math.max(dailyStart, dailyTotalRow - 1);
  if (dates.length === 0) {
    ws2.str(dailyStart, 1, '-', Style.CenterW);
  }
  ws2.str(dailyTotalRow, 1, 'TOTAL PERIODE', Style.TotalText);
  ws2.str(dailyTotalRow, 2, `${activeDays} Hari Aktif`, Style.TotalText);
  ws2.formula(dailyTotalRow, 3, `SUM(C${dailyStart}:C${dailyEnd})`, Style.TotalInt, finalSales.filter((s) => s.paymentType === 'Kredit').length);
  ws2.formula(dailyTotalRow, 4, `SUM(D${dailyStart}:D${dailyEnd})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws2.formula(dailyTotalRow, 5, `SUM(E${dailyStart}:E${dailyEnd})`, Style.TotalInt, finalSales.filter((s) => s.paymentType === 'Cash').length);
  ws2.formula(dailyTotalRow, 6, `SUM(F${dailyStart}:F${dailyEnd})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'Cash').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws2.formula(dailyTotalRow, 7, `SUM(G${dailyStart}:G${dailyEnd})`, Style.TotalInt, finalSales.filter((s) => s.paymentType === 'QRIS').length);
  ws2.formula(dailyTotalRow, 8, `SUM(H${dailyStart}:H${dailyEnd})`, Style.TotalRp, finalSales.filter((s) => s.paymentType === 'QRIS').reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws2.formula(dailyTotalRow, 9, `SUM(I${dailyStart}:I${dailyEnd})`, Style.TotalInt, totalFinalTx);
  ws2.formula(dailyTotalRow, 10, `SUM(J${dailyStart}:J${dailyEnd})`, Style.TotalRp, totalFinalRp);
  ws2.formula(dailyTotalRow, 11, `IF(I${dailyTotalRow}>0,J${dailyTotalRow}/I${dailyTotalRow},0)`, Style.TotalRp, avgTicketRp);
  ws2.formula(dailyTotalRow, 12, `SUM(L${dailyStart}:L${dailyEnd})`, Style.TotalPct, totalFinalRp > 0 ? 1 : 0);
  ws2.setRowHeight(dailyTotalRow, 22);

  // ==========================================================================
  // SHEET 3: Riwayat Transaksi (Final)
  // ==========================================================================
  const ws3 = new SheetBuilder('Riwayat Transaksi (Final)', [7, 10, 24, 12, 16, 13, 11, 14, 28, 28, 18, 10, 12, 20, 11, 13, 14, 15, 18, 18, 16, 15]);
  ws3.banner(`DAFTAR RIWAYAT TRANSAKSI FINAL · ${titleStore}`, subtitle, 22);
  ws3.freezeRow = 5;
  ws3.tableHeader(4, [
    'No', 'ID Toko', 'Nama Cabang Toko', 'ID Transaksi', 'Nomor Struk', 'Tanggal', 'Hari',
    'NIK Anggota', 'Nama Pelanggan (Di Struk)', 'Nama Anggota (Master NIK)', 'Segmen Pelanggan',
    'Sumber', 'Mesin Kasir', 'Referensi Sesi Kasir', 'ID Sesi',
    'Status Penjualan', 'Metode Pembayaran', 'Status Pembayaran',
    'Total Penjualan (Rp)', 'Nominal Dibayar (Rp)', 'Kembalian Tunai (Rp)', 'Operator Kasir',
  ]);
  const txStart = 5;
  finalSales.forEach((s, idx) => {
    const rowIdx = txStart + idx;
    const z = idx % 2 === 1;
    const grandRp = senToRp(s.grandTotalSen);
    const paidRp = senToRp(s.paidSen);
    const changeRp = Math.max(0, paidRp - grandRp);
    const isUnpaid = s.paymentStatus === 'Unpaid';
    ws3.num(rowIdx, 1, idx + 1, z ? Style.IntZ : Style.IntW);
    ws3.num(rowIdx, 2, s.companyId, z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 3, storeName(s.companyId), z ? Style.TextZ : Style.TextW);
    ws3.num(rowIdx, 4, s.saleId, z ? Style.IntZ : Style.IntW);
    ws3.str(rowIdx, 5, s.salesCode, z ? Style.BoldZ : Style.BoldW);
    ws3.str(rowIdx, 6, s.saleDate, z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 7, dayNameId(s.saleDate), z ? Style.TextZ : Style.TextW);
    ws3.str(rowIdx, 8, s.memberNik ?? '-', z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 9, s.customerName, z ? Style.TextZ : Style.TextW);
    ws3.str(rowIdx, 10, s.memberMasterName ?? (s.memberNik ? s.customerName : '-'), z ? Style.TextZ : Style.TextW);
    ws3.str(rowIdx, 11, s.memberNik ? 'Anggota Koperasi' : 'Pelanggan Umum', z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 12, s.source === 'pos' ? 'POS' : 'Non-POS', z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 13, s.cashierLabel || '-', z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 14, s.registerReference || 'Sesi tidak tersimpan', z ? Style.TextZ : Style.TextW);
    ws3.str(rowIdx, 15, s.registerId !== null ? String(s.registerId) : '-', z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 16, s.salesStatus, z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 17, s.paymentType, z ? Style.CenterZ : Style.CenterW);
    ws3.str(rowIdx, 18, s.paymentStatus, isUnpaid ? Style.WarnCenter : (z ? Style.CenterZ : Style.CenterW));
    ws3.num(rowIdx, 19, grandRp, z ? Style.RpBoldZ : Style.RpBoldW);
    ws3.num(rowIdx, 20, paidRp, z ? Style.RpZ : Style.RpW);
    ws3.formula(rowIdx, 21, `T${rowIdx}-S${rowIdx}`, z ? Style.RpZ : Style.RpW, changeRp);
    ws3.str(rowIdx, 22, s.createdBy || '-', z ? Style.CenterZ : Style.CenterW);
    ws3.setRowHeight(rowIdx, 19);
  });
  if (finalSales.length === 0) {
    ws3.str(txStart, 1, '-', Style.CenterW);
    ws3.str(txStart, 5, 'Tidak ada transaksi Final pada filter ini', Style.TextW);
    ws3.num(txStart, 19, 0, Style.RpW);
    ws3.num(txStart, 20, 0, Style.RpW);
    ws3.num(txStart, 21, 0, Style.RpW);
  }
  const txEnd = Math.max(txStart, txStart + finalSales.length - 1);
  const txTotalRow = txEnd + 1;
  ws3.autoFilterRef = `A4:V${txEnd}`;
  ws3.str(txTotalRow, 1, 'TOTAL', Style.TotalText);
  ws3.merge(txTotalRow, 1, txTotalRow, 4, Style.TotalText);
  ws3.formula(txTotalRow, 5, `COUNTA(E${txStart}:E${txEnd})`, Style.TotalInt, finalSales.length);
  ws3.str(txTotalRow, 6, 'Struk Final', Style.TotalText);
  ws3.merge(txTotalRow, 6, txTotalRow, 18, Style.TotalText);
  ws3.formula(txTotalRow, 19, `SUM(S${txStart}:S${txEnd})`, Style.TotalRp, totalFinalRp);
  ws3.formula(txTotalRow, 20, `SUM(T${txStart}:T${txEnd})`, Style.TotalRp, totalPaidRp);
  ws3.formula(txTotalRow, 21, `SUM(U${txStart}:U${txEnd})`, Style.TotalRp, totalChangeRp);
  ws3.str(txTotalRow, 22, '-', Style.TotalText);
  ws3.setRowHeight(txTotalRow, 22);

  // ==========================================================================
  // SHEET 4: Top Produk & Kategori
  // ==========================================================================
  const ws4 = new SheetBuilder('Top Produk & Kategori', [7, 14, 16, 36, 22, 16, 16, 14, 14, 20, 14]);
  ws4.banner(`ANALISIS KATEGORI & TOP 100 PRODUK TERLARIS · ${titleStore}`, subtitle, 11);

  let r4 = 4;
  ws4.sectionHeader(r4, '1. RINGKASAN ITEM TERJUAL PER CABANG TOKO', 9);
  r4++;
  ws4.tableHeader(r4, ['ID Toko', 'Nama Cabang Toko', 'Baris Item (Line Items)', 'SKU Unik Terjual', 'Total Qty (Unit)', 'Total Nilai Item (Rp)', 'Estimasi HPP (Rp)', 'Estimasi Margin Kotor (Rp)', 'Rasio Margin (%)']);
  r4++;
  const stItemStart = r4;
  bundle.stores.forEach((st, idx) => {
    const rowIdx = stItemStart + idx;
    const z = idx % 2 === 1;
    const info = bundle.storeItemTotals.find((x) => x.companyId === st.id) ?? {
      companyId: st.id, lineCount: 0, uniqueItems: 0, totalQty: 0, totalRevenueRp: 0, estCogsRp: 0,
    };
    const rev = Math.round(info.totalRevenueRp);
    const cogs = Math.round(info.estCogsRp);
    const mar = rev - cogs;
    ws4.num(rowIdx, 1, st.id, z ? Style.CenterZ : Style.CenterW);
    ws4.str(rowIdx, 2, st.name, z ? Style.BoldZ : Style.BoldW);
    ws4.num(rowIdx, 3, info.lineCount, z ? Style.IntZ : Style.IntW);
    ws4.num(rowIdx, 4, info.uniqueItems, z ? Style.IntZ : Style.IntW);
    ws4.num(rowIdx, 5, Math.round(info.totalQty), z ? Style.IntZ : Style.IntW);
    ws4.num(rowIdx, 6, rev, z ? Style.RpBoldZ : Style.RpBoldW);
    ws4.num(rowIdx, 7, cogs, z ? Style.RpZ : Style.RpW);
    ws4.formula(rowIdx, 8, `F${rowIdx}-G${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, mar);
    ws4.formula(rowIdx, 9, `IF(F${rowIdx}>0,H${rowIdx}/F${rowIdx},0)`, z ? Style.PctZ : Style.PctW, rev > 0 ? mar / rev : 0);
    ws4.setRowHeight(rowIdx, 20);
  });
  const stItemEnd = Math.max(stItemStart, stItemStart + bundle.stores.length - 1);
  const stItemTotRow = stItemEnd + 1;
  const totalItemRevRp = bundle.storeItemTotals.reduce((a, x) => a + Math.round(x.totalRevenueRp), 0);
  const totalItemMarginRp = totalItemRevRp - totalEstCogsRp;
  ws4.str(stItemTotRow, 1, 'TOTAL', Style.TotalText);
  ws4.str(stItemTotRow, 2, 'Total Item Seluruh Cabang Terpilih', Style.TotalText);
  ws4.formula(stItemTotRow, 3, `SUM(C${stItemStart}:C${stItemEnd})`, Style.TotalInt, totalLineItems);
  ws4.num(stItemTotRow, 4, totalUniqueItems, Style.TotalInt);
  ws4.formula(stItemTotRow, 5, `SUM(E${stItemStart}:E${stItemEnd})`, Style.TotalInt, totalQtySold);
  ws4.formula(stItemTotRow, 6, `SUM(F${stItemStart}:F${stItemEnd})`, Style.TotalRp, totalItemRevRp);
  ws4.formula(stItemTotRow, 7, `SUM(G${stItemStart}:G${stItemEnd})`, Style.TotalRp, totalEstCogsRp);
  ws4.formula(stItemTotRow, 8, `F${stItemTotRow}-G${stItemTotRow}`, Style.TotalRp, totalItemMarginRp);
  ws4.formula(stItemTotRow, 9, `IF(F${stItemTotRow}>0,H${stItemTotRow}/F${stItemTotRow},0)`, Style.TotalPct, totalItemRevRp > 0 ? totalItemMarginRp / totalItemRevRp : 0);
  ws4.setRowHeight(stItemTotRow, 22);

  r4 = stItemTotRow + 2;
  ws4.sectionHeader(r4, `2. PERFORMA KATEGORI BARANG (${bundle.categories.length} KATEGORI)`, 10);
  r4++;
  ws4.tableHeader(r4, ['No', 'Nama Kategori', 'SKU Unik', 'Frekuensi Struk', 'Total Qty', 'Total Omzet (Rp)', 'Porsi Omzet', 'Estimasi HPP (Rp)', 'Estimasi Margin Kotor (Rp)', 'Margin (%)']);
  r4++;
  const catStart = r4;
  const catTotRev = bundle.categories.reduce((a, c) => a + Math.round(c.totalRevenueRp), 0);
  const catTotCogs = bundle.categories.reduce((a, c) => a + Math.round(c.estCogsRp), 0);
  const catTotQty = bundle.categories.reduce((a, c) => a + Math.round(c.totalQty), 0);
  const catTotalRow = catStart + Math.max(1, bundle.categories.length);
  if (bundle.categories.length === 0) {
    ws4.num(catStart, 1, 1, Style.CenterW);
    ws4.str(catStart, 2, 'Tidak ada data kategori', Style.TextW);
    for (let c = 3; c <= 10; c++) ws4.num(catStart, c, 0, Style.IntW);
  } else {
    bundle.categories.forEach((cat, idx) => {
      const rowIdx = catStart + idx;
      const z = idx % 2 === 1;
      const rev = Math.round(cat.totalRevenueRp);
      const cogs = Math.round(cat.estCogsRp);
      const mar = rev - cogs;
      ws4.num(rowIdx, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws4.str(rowIdx, 2, cat.categoryName, z ? Style.BoldZ : Style.BoldW);
      ws4.num(rowIdx, 3, cat.uniqueItems, z ? Style.IntZ : Style.IntW);
      ws4.num(rowIdx, 4, cat.txCount, z ? Style.IntZ : Style.IntW);
      ws4.num(rowIdx, 5, Math.round(cat.totalQty), z ? Style.IntZ : Style.IntW);
      ws4.num(rowIdx, 6, rev, z ? Style.RpBoldZ : Style.RpBoldW);
      ws4.formula(rowIdx, 7, `IF(F${catTotalRow}>0,F${rowIdx}/F${catTotalRow},0)`, z ? Style.PctZ : Style.PctW, catTotRev > 0 ? rev / catTotRev : 0);
      ws4.num(rowIdx, 8, cogs, z ? Style.RpZ : Style.RpW);
      ws4.formula(rowIdx, 9, `F${rowIdx}-H${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, mar);
      ws4.formula(rowIdx, 10, `IF(F${rowIdx}>0,I${rowIdx}/F${rowIdx},0)`, z ? Style.PctZ : Style.PctW, rev > 0 ? mar / rev : 0);
      ws4.setRowHeight(rowIdx, 19);
    });
  }
  const catEnd = catTotalRow - 1;
  ws4.str(catTotalRow, 1, 'TOTAL', Style.TotalText);
  ws4.str(catTotalRow, 2, `${bundle.categories.length} Kategori`, Style.TotalText);
  ws4.formula(catTotalRow, 3, `SUM(C${catStart}:C${catEnd})`, Style.TotalInt, bundle.categories.reduce((a, c) => a + c.uniqueItems, 0));
  ws4.str(catTotalRow, 4, '-', Style.TotalText);
  ws4.formula(catTotalRow, 5, `SUM(E${catStart}:E${catEnd})`, Style.TotalInt, catTotQty);
  ws4.formula(catTotalRow, 6, `SUM(F${catStart}:F${catEnd})`, Style.TotalRp, catTotRev);
  ws4.formula(catTotalRow, 7, `SUM(G${catStart}:G${catEnd})`, Style.TotalPct, catTotRev > 0 ? 1 : 0);
  ws4.formula(catTotalRow, 8, `SUM(H${catStart}:H${catEnd})`, Style.TotalRp, catTotCogs);
  ws4.formula(catTotalRow, 9, `F${catTotalRow}-H${catTotalRow}`, Style.TotalRp, catTotRev - catTotCogs);
  ws4.formula(catTotalRow, 10, `IF(F${catTotalRow}>0,I${catTotalRow}/F${catTotalRow},0)`, Style.TotalPct, catTotRev > 0 ? (catTotRev - catTotCogs) / catTotRev : 0);
  ws4.setRowHeight(catTotalRow, 22);

  r4 = catTotalRow + 2;
  ws4.sectionHeader(r4, `3. TOP ${bundle.topItems.length} PRODUK TERLARIS BERDASARKAN OMZET`, 11);
  r4++;
  ws4.tableHeader(r4, ['Rank', 'Kode Item', 'Barcode', 'Nama Produk', 'Kategori', 'Harga Jual (Rp)', 'Harga Beli / HPP (Rp)', 'Frekuensi Struk', 'Total Qty', 'Total Omzet (Rp)', 'Porsi Omzet']);
  r4++;
  const topStart = r4;
  if (bundle.topItems.length === 0) {
    ws4.num(topStart, 1, 1, Style.CenterW);
    ws4.str(topStart, 4, 'Tidak ada data item', Style.TextW);
    ws4.num(topStart, 9, 0, Style.IntW);
    ws4.num(topStart, 10, 0, Style.RpW);
  } else {
    bundle.topItems.forEach((it, idx) => {
      const rowIdx = topStart + idx;
      const z = idx % 2 === 1;
      const rev = Math.round(it.totalRevenueRp);
      ws4.num(rowIdx, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws4.str(rowIdx, 2, it.itemCode || '-', z ? Style.CenterZ : Style.CenterW);
      ws4.str(rowIdx, 3, it.barcode || '-', z ? Style.CenterZ : Style.CenterW);
      ws4.str(rowIdx, 4, it.itemName, z ? Style.BoldZ : Style.BoldW);
      ws4.str(rowIdx, 5, it.categoryName, z ? Style.TextZ : Style.TextW);
      ws4.num(rowIdx, 6, Math.round(it.unitPriceRp), z ? Style.RpZ : Style.RpW);
      ws4.num(rowIdx, 7, Math.round(it.purchasePriceRp), z ? Style.RpZ : Style.RpW);
      ws4.num(rowIdx, 8, it.txCount, z ? Style.IntZ : Style.IntW);
      ws4.num(rowIdx, 9, Math.round(it.totalQty), z ? Style.IntZ : Style.IntW);
      ws4.num(rowIdx, 10, rev, z ? Style.RpBoldZ : Style.RpBoldW);
      ws4.formula(rowIdx, 11, `IF(F${catTotalRow}>0,J${rowIdx}/F${catTotalRow},0)`, z ? Style.PctZ : Style.PctW, catTotRev > 0 ? rev / catTotRev : 0);
      ws4.setRowHeight(rowIdx, 19);
    });
  }
  const topEnd = topStart + Math.max(1, bundle.topItems.length) - 1;
  const topTotRow = topEnd + 1;
  const topSumQty = bundle.topItems.reduce((a, i) => a + Math.round(i.totalQty), 0);
  const topSumRev = bundle.topItems.reduce((a, i) => a + Math.round(i.totalRevenueRp), 0);
  ws4.str(topTotRow, 1, 'TOTAL', Style.TotalText);
  ws4.merge(topTotRow, 1, topTotRow, 3, Style.TotalText);
  ws4.str(topTotRow, 4, `Total Top ${bundle.topItems.length} Produk`, Style.TotalText);
  ws4.merge(topTotRow, 4, topTotRow, 8, Style.TotalText);
  ws4.formula(topTotRow, 9, `SUM(I${topStart}:I${topEnd})`, Style.TotalInt, topSumQty);
  ws4.formula(topTotRow, 10, `SUM(J${topStart}:J${topEnd})`, Style.TotalRp, topSumRev);
  ws4.formula(topTotRow, 11, `SUM(K${topStart}:K${topEnd})`, Style.TotalPct, catTotRev > 0 ? topSumRev / catTotRev : 0);
  ws4.setRowHeight(topTotRow, 22);

  // ==========================================================================
  // SHEET 5: Rekap Belanja Anggota
  // ==========================================================================
  const ws5 = new SheetBuilder('Rekap Belanja Anggota', [7, 14, 30, 14, 18, 18, 18, 20, 18, 14, 14]);
  ws5.banner(`REKAPITULASI BELANJA ANGGOTA KOPERASI (BERDASARKAN NIK) · ${titleStore}`, subtitle, 11);
  ws5.freezeRow = 5;
  ws5.tableHeader(4, [
    'Rank', 'NIK Anggota', 'Nama Lengkap Anggota (Master m_anggota)',
    'Total Struk', 'Belanja Kredit (Rp)', 'Belanja Cash (Rp)', 'Belanja QRIS (Rp)',
    'Total Belanja (Rp)', 'Rata-rata / Struk', 'Porsi Belanja', 'Tanggal Terakhir',
  ]);
  const memberMap = new Map<string, { nik: string; name: string; tx: number; kreditRp: number; cashRp: number; qrisRp: number; lastDate: string }>();
  for (const s of memberSales) {
    const nik = s.memberNik!;
    const cur = memberMap.get(nik) ?? {
      nik,
      name: s.memberMasterName || s.customerName,
      tx: 0,
      kreditRp: 0,
      cashRp: 0,
      qrisRp: 0,
      lastDate: s.saleDate,
    };
    const rp = senToRp(s.grandTotalSen);
    cur.tx += 1;
    if (s.paymentType === 'Kredit') cur.kreditRp += rp;
    else if (s.paymentType === 'Cash') cur.cashRp += rp;
    else cur.qrisRp += rp;
    if (s.saleDate > cur.lastDate) cur.lastDate = s.saleDate;
    memberMap.set(nik, cur);
  }
  const sortedMembers = [...memberMap.values()].sort((a, b) => (b.kreditRp + b.cashRp + b.qrisRp) - (a.kreditRp + a.cashRp + a.qrisRp));
  const memStart = 5;
  const totalMemberRp = sortedMembers.reduce((a, m) => a + m.kreditRp + m.cashRp + m.qrisRp, 0);
  const memTotRow = memStart + Math.max(1, sortedMembers.length);
  if (sortedMembers.length === 0) {
    ws5.num(memStart, 1, 1, Style.CenterW);
    ws5.str(memStart, 2, '-', Style.CenterW);
    ws5.str(memStart, 3, 'Tidak ada transaksi anggota pada filter ini', Style.TextW);
    for (let c = 4; c <= 10; c++) ws5.num(memStart, c, 0, Style.IntW);
    ws5.str(memStart, 11, '-', Style.CenterW);
  } else {
    sortedMembers.forEach((m, idx) => {
      const rowIdx = memStart + idx;
      const z = idx % 2 === 1;
      const totRp = m.kreditRp + m.cashRp + m.qrisRp;
      ws5.num(rowIdx, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws5.str(rowIdx, 2, m.nik, z ? Style.CenterZ : Style.CenterW);
      ws5.str(rowIdx, 3, m.name, z ? Style.BoldZ : Style.BoldW);
      ws5.num(rowIdx, 4, m.tx, z ? Style.IntZ : Style.IntW);
      ws5.num(rowIdx, 5, m.kreditRp, z ? Style.RpZ : Style.RpW);
      ws5.num(rowIdx, 6, m.cashRp, z ? Style.RpZ : Style.RpW);
      ws5.num(rowIdx, 7, m.qrisRp, z ? Style.RpZ : Style.RpW);
      ws5.formula(rowIdx, 8, `E${rowIdx}+F${rowIdx}+G${rowIdx}`, z ? Style.RpBoldZ : Style.RpBoldW, totRp);
      ws5.formula(rowIdx, 9, `IF(D${rowIdx}>0,H${rowIdx}/D${rowIdx},0)`, z ? Style.RpZ : Style.RpW, Math.round(totRp / m.tx));
      ws5.formula(rowIdx, 10, `IF(H${memTotRow}>0,H${rowIdx}/H${memTotRow},0)`, z ? Style.PctZ : Style.PctW, totalMemberRp > 0 ? totRp / totalMemberRp : 0);
      ws5.str(rowIdx, 11, m.lastDate, z ? Style.CenterZ : Style.CenterW);
      ws5.setRowHeight(rowIdx, 19);
    });
  }
  const memEnd = memTotRow - 1;
  ws5.autoFilterRef = `A4:K${memEnd}`;
  ws5.str(memTotRow, 1, 'TOTAL', Style.TotalText);
  ws5.str(memTotRow, 2, `${sortedMembers.length} NIK`, Style.TotalText);
  ws5.str(memTotRow, 3, 'Total Belanja Seluruh Anggota Terdaftar', Style.TotalText);
  ws5.formula(memTotRow, 4, `SUM(D${memStart}:D${memEnd})`, Style.TotalInt, memberSales.length);
  ws5.formula(memTotRow, 5, `SUM(E${memStart}:E${memEnd})`, Style.TotalRp, sortedMembers.reduce((a, m) => a + m.kreditRp, 0));
  ws5.formula(memTotRow, 6, `SUM(F${memStart}:F${memEnd})`, Style.TotalRp, sortedMembers.reduce((a, m) => a + m.cashRp, 0));
  ws5.formula(memTotRow, 7, `SUM(G${memStart}:G${memEnd})`, Style.TotalRp, sortedMembers.reduce((a, m) => a + m.qrisRp, 0));
  ws5.formula(memTotRow, 8, `SUM(H${memStart}:H${memEnd})`, Style.TotalRp, totalMemberRp);
  ws5.formula(memTotRow, 9, `IF(D${memTotRow}>0,H${memTotRow}/D${memTotRow},0)`, Style.TotalRp, memberSales.length > 0 ? Math.round(totalMemberRp / memberSales.length) : 0);
  ws5.formula(memTotRow, 10, `SUM(J${memStart}:J${memEnd})`, Style.TotalPct, totalMemberRp > 0 ? 1 : 0);
  ws5.str(memTotRow, 11, '-', Style.TotalText);
  ws5.setRowHeight(memTotRow, 22);

  // ==========================================================================
  // SHEET 6: Quotation & Catatan Audit
  // ==========================================================================
  const ws6 = new SheetBuilder('Quotation & Catatan Audit', [7, 24, 16, 14, 14, 28, 16, 16, 18, 18, 28]);
  ws6.banner(`CATATAN AUDIT, RETUR PENJUALAN & TRANSAKSI NON-FINAL · ${titleStore}`, subtitle, 11);

  let r6 = 4;
  const unpaidFinal = finalSales.filter((s) => s.paymentStatus === 'Unpaid');
  ws6.sectionHeader(r6, `A. TRANSAKSI FINAL DENGAN FLAG PAYMENT_STATUS = 'UNPAID' (${unpaidFinal.length} STRUK)`, 11);
  r6++;
  ws6.tableHeader(r6, ['No', 'Cabang Toko', 'Nomor Struk', 'Tanggal', 'NIK Anggota', 'Nama Pelanggan', 'Metode Bayar', 'Status Bayar', 'Total Struk (Rp)', 'Nominal Dibayar (Rp)', 'Catatan Audit']);
  r6++;
  const unpStart = r6;
  if (unpaidFinal.length === 0) {
    ws6.num(unpStart, 1, 1, Style.CenterW);
    ws6.str(unpStart, 3, 'Tidak ada transaksi Final Unpaid', Style.TextW);
    ws6.num(unpStart, 9, 0, Style.RpW);
    ws6.num(unpStart, 10, 0, Style.RpW);
    r6++;
  } else {
    unpaidFinal.forEach((s, idx) => {
      const z = idx % 2 === 1;
      ws6.num(r6, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 2, storeName(s.companyId), z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 3, s.salesCode, z ? Style.BoldZ : Style.BoldW);
      ws6.str(r6, 4, s.saleDate, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 5, s.memberNik ?? '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 6, s.customerName, z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 7, s.paymentType, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 8, s.paymentStatus, Style.WarnCenter);
      ws6.num(r6, 9, senToRp(s.grandTotalSen), z ? Style.RpBoldZ : Style.RpBoldW);
      ws6.num(r6, 10, senToRp(s.paidSen), z ? Style.RpZ : Style.RpW);
      ws6.str(r6, 11, `Operator: ${s.createdBy || '-'} · Perlu verifikasi status bayar`, z ? Style.TextZ : Style.TextW);
      ws6.setRowHeight(r6, 19);
      r6++;
    });
  }
  const unpEnd = r6 - 1;
  ws6.str(r6, 1, 'TOTAL', Style.TotalText);
  ws6.merge(r6, 1, r6, 8, Style.TotalText);
  ws6.formula(r6, 9, `SUM(I${unpStart}:I${unpEnd})`, Style.TotalRp, unpaidFinal.reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws6.formula(r6, 10, `SUM(J${unpStart}:J${unpEnd})`, Style.TotalRp, unpaidFinal.reduce((a, s) => a + senToRp(s.paidSen), 0));
  ws6.str(r6, 11, `${unpaidFinal.length} Struk Unpaid`, Style.TotalText);
  ws6.setRowHeight(r6, 22);

  r6 += 2;
  ws6.sectionHeader(r6, `B. DAFTAR RETUR PENJUALAN (db_salesreturn · ${bundle.returns.length} DOKUMEN)`, 11);
  r6++;
  ws6.tableHeader(r6, ['No', 'Cabang Toko', 'Kode Retur', 'Tanggal Retur', 'Struk Asal', 'Nama Pelanggan', 'NIK Anggota', 'Metode Refund', 'Nilai Retur (Rp)', 'Operator', 'Alasan / Catatan']);
  r6++;
  const retStart = r6;
  if (bundle.returns.length === 0) {
    ws6.num(retStart, 1, 1, Style.CenterW);
    ws6.str(retStart, 3, 'Tidak ada transaksi retur pada periode ini', Style.TextW);
    ws6.num(retStart, 9, 0, Style.RpW);
    r6++;
  } else {
    bundle.returns.forEach((rt, idx) => {
      const z = idx % 2 === 1;
      ws6.num(r6, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 2, storeName(rt.companyId), z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 3, rt.returnCode, z ? Style.BoldZ : Style.BoldW);
      ws6.str(r6, 4, rt.returnDate, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 5, rt.salesCode || '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 6, rt.customerName, z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 7, rt.memberNik ?? '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 8, rt.refundMethod || '-', z ? Style.CenterZ : Style.CenterW);
      ws6.num(r6, 9, senToRp(rt.totalSen), z ? Style.RpBoldZ : Style.RpBoldW);
      ws6.str(r6, 10, rt.createdBy || '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 11, rt.note || '-', z ? Style.TextZ : Style.TextW);
      ws6.setRowHeight(r6, 19);
      r6++;
    });
  }
  const retEnd = r6 - 1;
  ws6.str(r6, 1, 'TOTAL RETUR', Style.TotalText);
  ws6.merge(r6, 1, r6, 8, Style.TotalText);
  ws6.formula(r6, 9, `SUM(I${retStart}:I${retEnd})`, Style.TotalRp, totalReturnsRp);
  ws6.str(r6, 10, `${bundle.returns.length} Retur`, Style.TotalText);
  ws6.merge(r6, 10, r6, 11, Style.TotalText);
  ws6.setRowHeight(r6, 22);

  r6 += 2;
  ws6.sectionHeader(r6, `C. TRANSAKSI NON-FINAL / QUOTATION (${nonFinalSales.length} DOKUMEN · DIKELUARKAN DARI OMZET FINAL)`, 11);
  r6++;
  ws6.tableHeader(r6, ['No', 'Cabang Toko', 'Nomor Dokumen', 'Tanggal', 'NIK Anggota', 'Nama Pelanggan', 'Status Dokumen', 'Metode Bayar', 'Nilai Dokumen (Rp)', 'Operator', 'Keterangan']);
  r6++;
  const nfStart = r6;
  if (nonFinalSales.length === 0) {
    ws6.num(nfStart, 1, 1, Style.CenterW);
    ws6.str(nfStart, 3, 'Tidak ada dokumen Quotation / Non-Final', Style.TextW);
    ws6.num(nfStart, 9, 0, Style.RpW);
    r6++;
  } else {
    nonFinalSales.forEach((s, idx) => {
      const z = idx % 2 === 1;
      ws6.num(r6, 1, idx + 1, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 2, storeName(s.companyId), z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 3, s.salesCode, z ? Style.BoldZ : Style.BoldW);
      ws6.str(r6, 4, s.saleDate, z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 5, s.memberNik ?? '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 6, s.customerName, z ? Style.TextZ : Style.TextW);
      ws6.str(r6, 7, s.salesStatus, Style.WarnCenter);
      ws6.str(r6, 8, s.paymentType, z ? Style.CenterZ : Style.CenterW);
      ws6.num(r6, 9, senToRp(s.grandTotalSen), z ? Style.RpZ : Style.RpW);
      ws6.str(r6, 10, s.createdBy || '-', z ? Style.CenterZ : Style.CenterW);
      ws6.str(r6, 11, 'Tidak dihitung dalam Omzet Final', Style.MutedNote);
      ws6.setRowHeight(r6, 19);
      r6++;
    });
  }
  const nfEnd = r6 - 1;
  ws6.str(r6, 1, 'TOTAL NON-FINAL', Style.TotalText);
  ws6.merge(r6, 1, r6, 8, Style.TotalText);
  ws6.formula(r6, 9, `SUM(I${nfStart}:I${nfEnd})`, Style.TotalRp, nonFinalSales.reduce((a, s) => a + senToRp(s.grandTotalSen), 0));
  ws6.str(r6, 10, `${nonFinalSales.length} Dokumen`, Style.TotalText);
  ws6.merge(r6, 10, r6, 11, Style.TotalText);
  ws6.setRowHeight(r6, 22);

  return packRichWorkbook([ws1.build(), ws2.build(), ws3.build(), ws4.build(), ws5.build(), ws6.build()]);
}

// ============================================================================
// Master Format Executive PDF Builder
// ============================================================================

export function buildSalesExportPdf(bundle: SalesExportBundle): Uint8Array {
  const storeMap = new Map(bundle.stores.map((s) => [s.id, s]));
  const storeName = (cid: number) => storeMap.get(cid)?.name ?? `Cabang #${cid}`;
  const isAll = bundle.scope === 'all';
  const titleStore = isAll ? 'SEMUA TOKO KKISI (KONSOLIDASI)' : (bundle.stores[0]?.name ?? 'TOKO S-MART');

  const finalSales = bundle.sales.filter((s) => s.salesStatus === 'Final' && s.recordStatus === 1);
  const nonFinalSales = bundle.sales.filter((s) => s.salesStatus !== 'Final' || s.recordStatus !== 1);
  const totalFinalTx = finalSales.length;
  const totalFinalRp = finalSales.reduce((acc, s) => acc + senToRp(s.grandTotalSen), 0);
  const totalPaidRp = finalSales.reduce((acc, s) => acc + senToRp(s.paidSen), 0);
  const avgTicketRp = totalFinalTx > 0 ? Math.round(totalFinalRp / totalFinalTx) : 0;
  const totalQtySold = bundle.storeItemTotals.reduce((acc, t) => acc + Math.round(t.totalQty), 0);
  const totalReturnsRp = bundle.returns.reduce((acc, r) => acc + senToRp(r.totalSen), 0);
  const netSalesRp = totalFinalRp - totalReturnsRp;

  // Store comparison rows
  const storeRows = bundle.stores.map((st) => {
    const stSales = finalSales.filter((s) => s.companyId === st.id);
    const tx = stSales.length;
    const rp = stSales.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const retRp = bundle.returns.filter((r) => r.companyId === st.id).reduce((a, r) => a + senToRp(r.totalSen), 0);
    return [
      st.name,
      fmtIntText(tx),
      fmtPctText(totalFinalTx > 0 ? tx / totalFinalTx : 0),
      fmtRpText(rp),
      fmtPctText(totalFinalRp > 0 ? rp / totalFinalRp : 0),
      fmtRpText(tx > 0 ? Math.round(rp / tx) : 0),
      fmtRpText(rp - retRp),
    ];
  });

  // Payment method rows
  const payRows = ['Kredit', 'Cash', 'QRIS'].map((m) => {
    const list = finalSales.filter((s) => s.paymentType === m);
    const tx = list.length;
    const rp = list.reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const paid = list.reduce((a, s) => a + senToRp(s.paidSen), 0);
    return [
      m === 'Kredit' ? 'Kredit (Potong Gaji)' : m === 'Cash' ? 'Cash (Tunai)' : 'QRIS (Digital)',
      fmtIntText(tx),
      fmtPctText(totalFinalTx > 0 ? tx / totalFinalTx : 0),
      fmtRpText(rp),
      fmtPctText(totalFinalRp > 0 ? rp / totalFinalRp : 0),
      fmtRpText(tx > 0 ? Math.round(rp / tx) : 0),
      fmtRpText(Math.max(0, paid - rp)),
    ];
  });

  // Daily rows
  const dates = enumerateDates(bundle.query.from, bundle.query.to);
  const dailyRows = dates.map((dStr) => {
    const dSales = finalSales.filter((s) => s.saleDate === dStr);
    const krRp = dSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const caRp = dSales.filter((s) => s.paymentType === 'Cash').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const qrRp = dSales.filter((s) => s.paymentType === 'QRIS').reduce((a, s) => a + senToRp(s.grandTotalSen), 0);
    const tot = krRp + caRp + qrRp;
    return [
      dStr,
      dayNameId(dStr),
      fmtIntText(dSales.length),
      fmtRpText(krRp),
      fmtRpText(caRp),
      fmtRpText(qrRp),
      dSales.length > 0 ? fmtRpText(tot) : 'Tutup',
      fmtPctText(totalFinalRp > 0 ? tot / totalFinalRp : 0),
    ];
  });

  // Categories top 15
  const catTotRev = bundle.categories.reduce((a, c) => a + Math.round(c.totalRevenueRp), 0);
  const catRows = bundle.categories.slice(0, 15).map((c, idx) => {
    const rev = Math.round(c.totalRevenueRp);
    const cogs = Math.round(c.estCogsRp);
    return [
      String(idx + 1),
      c.categoryName,
      fmtIntText(c.uniqueItems),
      fmtIntText(c.txCount),
      fmtIntText(c.totalQty),
      fmtRpText(rev),
      fmtPctText(catTotRev > 0 ? rev / catTotRev : 0),
      fmtRpText(rev - cogs),
    ];
  });

  // Top 25 Products
  const topItemRows = bundle.topItems.slice(0, 25).map((it, idx) => [
    String(idx + 1),
    it.itemCode || '-',
    it.itemName,
    it.categoryName,
    fmtRpText(it.unitPriceRp),
    fmtIntText(it.totalQty),
    fmtRpText(it.totalRevenueRp),
  ]);

  // Top 20 Members
  const memberMap = new Map<string, { nik: string; name: string; tx: number; kreditRp: number; cashQrisRp: number }>();
  for (const s of finalSales) {
    if (!s.memberNik) continue;
    const cur = memberMap.get(s.memberNik) ?? { nik: s.memberNik, name: s.memberMasterName || s.customerName, tx: 0, kreditRp: 0, cashQrisRp: 0 };
    const rp = senToRp(s.grandTotalSen);
    cur.tx += 1;
    if (s.paymentType === 'Kredit') cur.kreditRp += rp;
    else cur.cashQrisRp += rp;
    memberMap.set(s.memberNik, cur);
  }
  const topMembers = [...memberMap.values()]
    .sort((a, b) => (b.kreditRp + b.cashQrisRp) - (a.kreditRp + a.cashQrisRp))
    .slice(0, 20)
    .map((m, idx) => {
      const tot = m.kreditRp + m.cashQrisRp;
      return [
        String(idx + 1),
        m.nik,
        m.name,
        fmtIntText(m.tx),
        fmtRpText(m.kreditRp),
        fmtRpText(m.cashQrisRp),
        fmtRpText(tot),
      ];
    });

  // Transaction preview table (up to 100 rows so the PDF remains compact & fast while listing transactions)
  const txPreviewRows = finalSales.slice(0, 100).map((s) => [
    s.salesCode,
    s.saleDate,
    storeMap.get(s.companyId)?.code ?? storeName(s.companyId),
    s.memberNik ? `${s.memberNik} · ${s.memberMasterName || s.customerName}` : s.customerName,
    s.paymentType,
    s.paymentStatus,
    fmtRpText(senToRp(s.grandTotalSen)),
  ]);

  const sections: PdfSection[] = [
    {
      kind: 'kpi-strip',
      items: [
        { label: 'TOTAL OMZET FINAL', value: fmtRpText(totalFinalRp), subtext: `Net: ${fmtRpText(netSalesRp)}`, highlight: true },
        { label: 'TRANSAKSI FINAL', value: `${fmtIntText(totalFinalTx)} Struk`, subtext: `${nonFinalSales.length} Non-Final / Quotation` },
        { label: 'RATA-RATA / STRUK', value: fmtRpText(avgTicketRp), subtext: `Dibayar: ${fmtRpText(totalPaidRp)}` },
        { label: 'UNIT BARANG TERJUAL', value: `${fmtIntText(totalQtySold)} Unit`, subtext: `Retur: ${fmtRpText(totalReturnsRp)}` },
      ],
    },
    {
      kind: 'table',
      title: '1. Perbandingan Kinerja per Cabang Toko',
      columns: [
        { header: 'Cabang Toko', width: 135, align: 'left' },
        { header: 'Struk', width: 45, align: 'right' },
        { header: 'Porsi', width: 45, align: 'right' },
        { header: 'Omzet Gross', width: 85, align: 'right' },
        { header: '% Omzet', width: 45, align: 'right' },
        { header: 'Rata2/Struk', width: 75, align: 'right' },
        { header: 'Net Sales', width: 85, align: 'right' },
      ],
      rows: storeRows.length > 0 ? storeRows : [['-', '0', '0,00%', 'Rp 0', '0,00%', 'Rp 0', 'Rp 0']],
      footerRow: ['TOTAL', fmtIntText(totalFinalTx), '100,00%', fmtRpText(totalFinalRp), '100,00%', fmtRpText(avgTicketRp), fmtRpText(netSalesRp)],
    },
    {
      kind: 'table',
      title: '2. Rekapitulasi Metode Pembayaran (Transaksi Final)',
      columns: [
        { header: 'Metode Pembayaran', width: 135, align: 'left' },
        { header: 'Struk', width: 45, align: 'right' },
        { header: 'Porsi', width: 45, align: 'right' },
        { header: 'Total Penjualan', width: 85, align: 'right' },
        { header: '% Omzet', width: 45, align: 'right' },
        { header: 'Rata2/Struk', width: 75, align: 'right' },
        { header: 'Kembalian', width: 85, align: 'right' },
      ],
      rows: payRows,
      footerRow: ['TOTAL', fmtIntText(totalFinalTx), '100,00%', fmtRpText(totalFinalRp), '100,00%', fmtRpText(avgTicketRp), fmtRpText(Math.max(0, totalPaidRp - totalFinalRp))],
    },
    {
      kind: 'table',
      title: `3. Rekapitulasi Penjualan Harian (${bundle.query.from} s/d ${bundle.query.to})`,
      columns: [
        { header: 'Tanggal', width: 62, align: 'left', mono: true },
        { header: 'Hari', width: 48, align: 'left' },
        { header: 'Struk', width: 40, align: 'right' },
        { header: 'Kredit', width: 80, align: 'right' },
        { header: 'Cash', width: 80, align: 'right' },
        { header: 'QRIS', width: 70, align: 'right' },
        { header: 'Total Harian', width: 85, align: 'right' },
        { header: 'Porsi', width: 48, align: 'right' },
      ],
      rows: dailyRows.length > 0 ? dailyRows : [['-', '-', '0', 'Rp 0', 'Rp 0', 'Rp 0', 'Rp 0', '0,00%']],
      footerRow: [
        'TOTAL',
        '',
        fmtIntText(totalFinalTx),
        fmtRpText(finalSales.filter((s) => s.paymentType === 'Kredit').reduce((a, s) => a + senToRp(s.grandTotalSen), 0)),
        fmtRpText(finalSales.filter((s) => s.paymentType === 'Cash').reduce((a, s) => a + senToRp(s.grandTotalSen), 0)),
        fmtRpText(finalSales.filter((s) => s.paymentType === 'QRIS').reduce((a, s) => a + senToRp(s.grandTotalSen), 0)),
        fmtRpText(totalFinalRp),
        '100,00%',
      ],
    },
  ];

  if (catRows.length > 0) {
    sections.push({
      kind: 'table',
      title: '4. Performa Kategori Barang Teratas',
      columns: [
        { header: 'No', width: 28, align: 'center' },
        { header: 'Kategori Barang', width: 145, align: 'left' },
        { header: 'SKU', width: 40, align: 'right' },
        { header: 'Struk', width: 45, align: 'right' },
        { header: 'Qty', width: 50, align: 'right' },
        { header: 'Omzet Kategori', width: 85, align: 'right' },
        { header: 'Porsi', width: 45, align: 'right' },
        { header: 'Est. Margin', width: 80, align: 'right' },
      ],
      rows: catRows,
    });
  }

  if (topItemRows.length > 0) {
    sections.push({
      kind: 'table',
      title: '5. Top 25 Produk Terlaris Berdasarkan Omzet',
      columns: [
        { header: 'No', width: 28, align: 'center' },
        { header: 'Kode', width: 55, align: 'left', mono: true },
        { header: 'Nama Produk', width: 175, align: 'left' },
        { header: 'Kategori', width: 85, align: 'left' },
        { header: 'Harga Jual', width: 65, align: 'right' },
        { header: 'Qty', width: 40, align: 'right' },
        { header: 'Total Omzet', width: 80, align: 'right' },
      ],
      rows: topItemRows,
    });
  }

  if (topMembers.length > 0) {
    sections.push({
      kind: 'table',
      title: '6. Top 20 Anggota Koperasi dengan Nilai Belanja Terbesar',
      columns: [
        { header: 'No', width: 28, align: 'center' },
        { header: 'NIK', width: 55, align: 'left', mono: true },
        { header: 'Nama Anggota (Master m_anggota)', width: 165, align: 'left' },
        { header: 'Struk', width: 40, align: 'right' },
        { header: 'Kredit', width: 80, align: 'right' },
        { header: 'Cash & QRIS', width: 75, align: 'right' },
        { header: 'Total Belanja', width: 80, align: 'right' },
      ],
      rows: topMembers,
    });
  }

  sections.push(
    {
      kind: 'table',
      title: `7. Daftar Transaksi Final (${Math.min(100, finalSales.length)} dari ${fmtIntText(finalSales.length)} Struk)`,
      subtitle: finalSales.length > 100 ? 'Seluruh baris lengkap tersedia di Sheet 3 pada dokumen Excel (.xlsx).' : undefined,
      columns: [
        { header: 'No. Struk', width: 70, align: 'left', mono: true },
        { header: 'Tanggal', width: 58, align: 'left', mono: true },
        { header: 'Toko', width: 45, align: 'left' },
        { header: 'Pelanggan / Anggota', width: 155, align: 'left' },
        { header: 'Metode', width: 48, align: 'left' },
        { header: 'Status', width: 48, align: 'left' },
        { header: 'Total', width: 80, align: 'right' },
      ],
      rows: txPreviewRows.length > 0 ? txPreviewRows : [['-', '-', '-', 'Tidak ada transaksi pada filter ini', '-', '-', 'Rp 0']],
    },
    {
      kind: 'callout',
      tone: 'info',
      title: 'Catatan Audit & Rekonsiliasi Riwayat Transaksi',
      lines: [
        `Transaksi Final: ${fmtIntText(totalFinalTx)} struk (${fmtRpText(totalFinalRp)}) · Retur Penjualan: ${bundle.returns.length} dokumen (${fmtRpText(totalReturnsRp)}) · Penjualan Bersih: ${fmtRpText(netSalesRp)}.`,
        `Transaksi Non-Final / Quotation: ${nonFinalSales.length} dokumen (dipisahkan dari perhitungan omzet Final).`,
      ],
    },
  );

  const spec: KosipaPdfDocumentSpec = {
    orientation: 'portrait',
    title: `LAPORAN PENJUALAN · ${titleStore}`,
    subtitle: `Periode ${bundle.query.from} s/d ${bundle.query.to} · Sumber: Riwayat Transaksi POS/Kasir`,
    badge: { label: isAll ? 'KONSOLIDASI SEMUA TOKO' : 'LAPORAN CABANG', tone: 'info' },
    docMeta: [
      { label: 'Cakupan', value: isAll ? 'Semua Toko' : titleStore },
      { label: 'Periode', value: `${bundle.query.from} s/d ${bundle.query.to}` },
      { label: 'Dicetak (UTC)', value: bundle.generatedAt.toISOString().slice(0, 19).replace('T', ' ') },
    ],
    sections,
    footerNote: 'Dokumen Resmi Laporan Penjualan Koperasi Suzuki Mart (S-MART KKISI). Sesuai rekaman sistem.',
  };

  return renderKosipaPdfDocument(spec);
}
