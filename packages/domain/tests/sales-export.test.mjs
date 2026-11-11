import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { SalesHistoryError } from '../src/sales/history.ts';
import {
  parseSalesExportQuery,
  buildSalesExportWorkbook,
  buildSalesExportPdf,
  buildSalesExportFilename,
} from '../src/sales/export.ts';

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

function sampleBundle(scope = 'store') {
  return {
    scope,
    query: {
      from: '2026-10-01',
      to: '2026-10-03',
      source: 'pos',
      salesStatus: 'Final',
      paymentStatus: 'all',
      paymentType: 'all',
      createdBy: '',
      registerId: null,
      q: '',
      page: 1,
      pageSize: 25,
      sort: 'newest',
    },
    generatedAt: new Date('2026-10-31T10:00:00Z'),
    stores: scope === 'all'
      ? [
          { id: 1, name: 'TOKO S-MART TB II', code: 'TB2' },
          { id: 2, name: 'TOKO S-MART TB II (Kp. Bulu)', code: 'KPB' },
          { id: 3, name: 'TOKO S-MART GIIC', code: 'GIIC' },
        ]
      : [{ id: 1, name: 'TOKO S-MART TB II', code: 'TB2' }],
    sales: [
      {
        companyId: 1,
        saleId: 101,
        salesCode: 'SL101',
        saleDate: '2026-10-01',
        customerName: '041142 - DIDIT',
        memberNik: '041142',
        memberMasterName: 'DIDIT SETIAWAN',
        createdBy: 'kasir_tb2',
        source: 'pos',
        salesStatus: 'Final',
        paymentStatus: 'Paid',
        paymentType: 'Kredit',
        recordStatus: 1,
        returnBit: '0',
        grandTotalSen: 15000000,
        paidSen: 15000000,
        registerId: 12,
        registerReference: 'REG-12',
        cashierLabel: 'K-01',
      },
      {
        companyId: scope === 'all' ? 2 : 1,
        saleId: 102,
        salesCode: 'SL102',
        saleDate: '2026-10-02',
        customerName: 'WALK-IN CUSTOMER',
        memberNik: null,
        memberMasterName: null,
        createdBy: 'kasir_2',
        source: 'pos',
        salesStatus: 'Final',
        paymentStatus: 'Unpaid',
        paymentType: 'Cash',
        recordStatus: 1,
        returnBit: '0',
        grandTotalSen: 5000000,
        paidSen: 10000000,
        registerId: null,
        registerReference: null,
        cashierLabel: null,
      },
      {
        companyId: 1,
        saleId: 103,
        salesCode: 'SL103',
        saleDate: '2026-10-02',
        customerName: '041142 - DIDIT',
        memberNik: '041142',
        memberMasterName: 'DIDIT SETIAWAN',
        createdBy: 'kasir_tb2',
        source: 'pos',
        salesStatus: 'Quotation',
        paymentStatus: 'Unpaid',
        paymentType: 'Kredit',
        recordStatus: 1,
        returnBit: '0',
        grandTotalSen: 0,
        paidSen: 0,
        registerId: null,
        registerReference: null,
        cashierLabel: null,
      },
    ],
    returns: [
      {
        companyId: scope === 'all' ? 2 : 1,
        returnId: 1,
        returnCode: 'RTN-001',
        returnDate: '2026-10-02',
        salesCode: 'SL102',
        customerName: 'WALK-IN CUSTOMER',
        memberNik: null,
        refundMethod: 'Cash',
        totalSen: 950000,
        createdBy: 'kasir_2',
        note: 'Kemasan rusak',
      },
    ],
    categories: [
      {
        categoryId: 10,
        categoryName: 'SEMBAKO',
        uniqueItems: 5,
        txCount: 2,
        totalQty: 8,
        totalRevenueRp: 200000,
        estCogsRp: 175000,
      },
    ],
    topItems: [
      {
        itemId: 501,
        itemCode: 'IT501',
        barcode: '899123456',
        itemName: 'BERAS PREMIUM 5KG',
        categoryName: 'SEMBAKO',
        unitPriceRp: 75000,
        purchasePriceRp: 68000,
        txCount: 2,
        totalQty: 2,
        totalRevenueRp: 150000,
      },
    ],
    storeItemTotals: [
      {
        companyId: 1,
        lineCount: 3,
        uniqueItems: 2,
        totalQty: 5,
        totalRevenueRp: 150000,
        estCogsRp: 130000,
      },
      ...(scope === 'all'
        ? [
            {
              companyId: 2,
              lineCount: 1,
              uniqueItems: 1,
              totalQty: 3,
              totalRevenueRp: 50000,
              estCogsRp: 45000,
            },
          ]
        : []),
    ],
  };
}

test('parseSalesExportQuery validates format, scope, and delegates filter validation to parseSalesHistoryQuery', () => {
  const now = new Date('2026-10-20T08:00:00Z');
  const q1 = parseSalesExportQuery(new URLSearchParams('format=xlsx&from=2026-10-01&to=2026-10-31&paymentType=Kredit'), now);
  assert.equal(q1.format, 'xlsx');
  assert.equal(q1.scope, 'store');
  assert.equal(q1.from, '2026-10-01');
  assert.equal(q1.to, '2026-10-31');
  assert.equal(q1.paymentType, 'Kredit');

  const q2 = parseSalesExportQuery(new URLSearchParams('format=pdf&scope=all&from=2026-10-01&to=2026-10-15'), now);
  assert.equal(q2.format, 'pdf');
  assert.equal(q2.scope, 'all');

  for (const bad of ['format=csv', 'format=exe', 'format=xlsx&scope=other', 'format=pdf&unknown=1']) {
    assert.throws(
      () => parseSalesExportQuery(new URLSearchParams(bad), now),
      (err) => err instanceof SalesHistoryError && err.code === 'INVALID_INPUT',
      `expected INVALID_INPUT for ${bad}`,
    );
  }
});

test('buildSalesExportWorkbook creates 6 Master Format worksheets with dynamic Excel formulas (<f>), Rupiah styles, merges, and autofilter', () => {
  const bundle = sampleBundle('all');
  const bytes = buildSalesExportWorkbook(bundle);
  assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 1000);

  const entries = readZipEntries(bytes);
  const wbXml = entries.get('xl/workbook.xml');
  const expectedSheets = [
    'Ringkasan Eksekutif',
    'Rekap Harian',
    'Riwayat Transaksi (Final)',
    'Top Produk &amp; Kategori',
    'Rekap Belanja Anggota',
    'Quotation &amp; Catatan Audit',
  ];
  expectedSheets.forEach((name, idx) => {
    assert.ok(wbXml.includes(`name="${name}"`), `workbook contains sheet ${name}`);
    assert.ok(entries.has(`xl/worksheets/sheet${idx + 1}.xml`), `has worksheet xml ${idx + 1}`);
  });

  const stylesXml = entries.get('xl/styles.xml');
  assert.ok(stylesXml.includes('&quot;Rp&quot;#,##0;(&quot;Rp&quot;#,##0);&quot;-&quot;'), 'contains Master Rupiah number format');
  assert.ok(stylesXml.includes('0.00%'), 'contains percentage format');

  const sheet1 = entries.get('xl/worksheets/sheet1.xml');
  assert.ok(sheet1.includes('<mergeCells'), 'Sheet 1 has merged banner/section cells');
  assert.ok(sheet1.includes('<f>SUM('), 'Sheet 1 uses dynamic SUM formulas');
  assert.ok(sheet1.includes('TOKO S-MART TB II'), 'Sheet 1 includes store breakdown');
  assert.ok(sheet1.includes('TREN PENJUALAN MINGGUAN'), 'Sheet 1 includes weekly sales trend section');
  assert.ok(sheet1.includes('REKAPITULASI OPERATOR KASIR'), 'Sheet 1 includes cashier operator section');
  assert.ok(sheet1.includes('kasir_tb2'), 'Sheet 1 lists cashier operator');

  const sheet2 = entries.get('xl/worksheets/sheet2.xml');
  assert.ok(sheet2.includes('<f>IF('), 'Sheet 2 uses IF formula for daily average per receipt');
  assert.ok(sheet2.includes('<f>SUM('), 'Sheet 2 uses SUM formula in total row');

  const sheet3 = entries.get('xl/worksheets/sheet3.xml');
  assert.ok(sheet3.includes('<autoFilter'), 'Sheet 3 has AutoFilter enabled');
  assert.ok(sheet3.includes('state="frozen"'), 'Sheet 3 freezes header pane');
  assert.ok(sheet3.includes('<f>COUNTA('), 'Sheet 3 uses COUNTA formula for receipt count');
  assert.ok(sheet3.includes('DIDIT SETIAWAN'), 'Sheet 3 includes resolved master member name');

  const sheet4 = entries.get('xl/worksheets/sheet4.xml');
  assert.ok(sheet4.includes('SEMBAKO'), 'Sheet 4 includes category summary');
  assert.ok(sheet4.includes('BERAS PREMIUM 5KG'), 'Sheet 4 includes top products');

  const sheet5 = entries.get('xl/worksheets/sheet5.xml');
  assert.ok(sheet5.includes('041142'), 'Sheet 5 includes member spending ranking');

  const sheet6 = entries.get('xl/worksheets/sheet6.xml');
  assert.ok(sheet6.includes('RTN-001'), 'Sheet 6 includes sales return audit table');
  assert.ok(sheet6.includes('SL103'), 'Sheet 6 includes non-final Quotation audit table');
});

test('buildSalesExportPdf renders valid multi-page PDF 1.4 executive report with KPIs, daily recap, categories, members, and audit notes', () => {
  const bundle = sampleBundle('store');
  const pdfBytes = buildSalesExportPdf(bundle);
  assert.ok(pdfBytes instanceof Uint8Array && pdfBytes.byteLength > 800);
  const text = Buffer.from(pdfBytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'), 'starts with PDF-1.4 header');
  assert.ok(text.includes('LAPORAN PENJUALAN'), 'includes report title');
  assert.ok(text.includes('TOKO S-MART TB II'), 'includes store name');
  assert.ok(text.includes('SL101'), 'includes transaction code');
  assert.ok(text.includes('SEMBAKO'), 'includes category performance');
  assert.ok(text.includes('Halaman 1 dari'), 'includes page numbering footer');
});

test('buildSalesExportFilename generates clean deterministic filename for store and all scopes', () => {
  const storeBundle = sampleBundle('store');
  assert.equal(
    buildSalesExportFilename(storeBundle, 'xlsx'),
    'Laporan_Penjualan_TOKO_S-MART_TB_II_2026-10-01_sd_2026-10-03.xlsx',
  );
  const allBundle = sampleBundle('all');
  assert.equal(
    buildSalesExportFilename(allBundle, 'pdf'),
    'Laporan_Penjualan_SEMUA_TOKO_KKISI_2026-10-01_sd_2026-10-03.pdf',
  );
});
