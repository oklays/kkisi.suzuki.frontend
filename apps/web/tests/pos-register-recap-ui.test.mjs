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
