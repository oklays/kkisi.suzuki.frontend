import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/pos/RegisterRecap.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const fixture = { exports: {} };
runInNewContext(code, { module: fixture, exports: fixture.exports, require: id => id === './register-recap.css' ? {} : id === './preview' ? { formatRupiah: sen => `Rp ${new Intl.NumberFormat('id-ID').format(sen / 100)}` } : require(id) });

test('Total Sales includes net cash and credit, without subtracting discount twice', () => {
  const html = renderToStaticMarkup(fixture.exports.RegisterRecap({ recap: { saldoAwal: '100.00', saldoAkhir: '175.00', saldoKredit: '50.00', discountTotal: '5.25', transactionCount: 2 }, onFinish: () => {} }));
  assert.match(html, /Total Sales<\/dt><dd>Rp 125<\/dd>/);
  assert.match(html, /Total Penjualan<\/span><strong>Rp 125<\/strong>/);
  assert.match(html, /Diskon \/ Penyesuaian<\/dt><dd>Rp 5,25<\/dd>/);
});

test('Total Sales includes QRIS and renders Penjualan QRIS in breakdown', () => {
  const html = renderToStaticMarkup(fixture.exports.RegisterRecap({ recap: { saldoAwal: '100.00', saldoAkhir: '175.00', saldoKredit: '50.00', saldoQris: '35.00', discountTotal: '0.00', transactionCount: 3 }, onFinish: () => {} }));
  // cash = 175 - 100 = 75, credit = 50, qris = 35 => totalSales = 160
  assert.match(html, /Total Sales<\/dt><dd>Rp 160<\/dd>/);
  assert.match(html, /Total Penjualan<\/span><strong>Rp 160<\/strong>/);
  assert.match(html, /Penjualan QRIS<\/dt><dd>Rp 35<\/dd>/);
  assert.match(html, /Non-Tunai \(QRIS\)<\/span><strong>Rp 35<\/strong>/);
});


test('recap shows session refunds: gross Cash sales, refunds as deductions and net Total Sales', () => {
  const html = renderToStaticMarkup(fixture.exports.RegisterRecap({ recap: { saldoAwal: '100.00', saldoAkhir: '137.50', saldoKredit: '40.00', saldoQris: '0.00', discountTotal: '0.00', transactionCount: 3, refundCash: '12.50', refundKredit: '30.00', returnCount: 3 }, onFinish: () => {} }));
  assert.match(html, /Penjualan Tunai<\/dt><dd>Rp 50<\/dd>/);
  assert.match(html, /Retur Tunai \(refund laci\)<\/dt><dd>−Rp 12,5<\/dd>/);
  assert.match(html, /Retur Kredit \(potong tagihan\)<\/dt><dd>−Rp 30<\/dd>/);
  assert.match(html, /Total Sales \(bersih retur\)<\/dt><dd>Rp 47,5<\/dd>/);
  assert.match(html, /Saldo Akhir Sistem<\/dt><dd>Rp 137,5<\/dd>/);
});
