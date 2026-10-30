import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Layout check for the 75 mm POS sales receipt and return note under the KKISI Rupiah document format (Rp25.000,00).
// It renders the REAL pages and the REAL receipt.css (data layer + auth stubbed), emulates a 75 mm print roll in Chromium and fails when
// any amount wraps, any line overflows the paper, or the paper is not 75 mm. No database, no printer and no network are used.
// Physical thermal printing is NOT covered here; it needs the real printer.
registerHooks({
  resolve(specifier, context, next) {
    const stubs = {
      'next/navigation': 'export function notFound(){throw new Error("NOT_FOUND")}',
      '@/infrastructure/auth/page-guard': 'export async function requirePagePermission(){return {kind:"ok",ctx:{companyId:1,hasPermission:async()=>true}}}',
      '@/infrastructure/repositories/prisma-receipt.repository': 'export class PrismaReceiptRepository{}',
      '@koperasi/application/pos/receipt': 'export async function readReceipt(){return globalThis.__receipt}',
      '@koperasi/application/sales/returns': 'export async function readReturnDocument(){return globalThis.__return}',
      '@/infrastructure/sales/return-handlers': 'export function returnReadRepository(){return {}}',
    };
    if (specifier in stubs) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL('../src/' + specifier.slice(2), import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const u = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(u.pathname)) for (const ext of ['.tsx', '.ts']) if (existsSync(fileURLToPath(u) + ext)) return next(u.href + ext, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export {};' };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { default: ReceiptPage } = await import('../src/app/pos/receipt/[id]/page.tsx');
const { default: ReturnReceiptPage } = await import('../src/app/pos/return-receipt/[id]/page.tsx');
const css = readFileSync(new URL('../src/app/pos/receipt/[id]/receipt.css', import.meta.url), 'utf8');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.RECEIPT_SHOTS || join(tmpdir(), 'kkisi-receipt-layout');
mkdirSync(output, { recursive: true });

const base = { saleId: 1, salesCode: 'INV-20261029-0042', saleDate: '2026-10-29', storeName: 'KOPERASI KKISI TB2 - TOKO TAMBUN', storeAddress: 'Jl. Raya Tambun No. 12, Bekasi', cashier: 'Kasir Satu', customerName: 'UMUM', memberNik: null, paymentType: 'Cash', limitSen: null, usedLimitSen: null, remainingLimitSen: null, taxTotalSen: null, mode: 'reprint' };
const scenarios = {
  'sale-typical-cash': { ...base, lines: [
    { name: 'Beras Premium 5kg', quantity: 2, unitPriceSen: 6500000, discountSen: 0, totalSen: 13000000, taxSen: null },
    { name: 'Minyak Goreng 2L', quantity: 1, unitPriceSen: 3250050, discountSen: 250000, totalSen: 3250050, taxSen: null }],
    subtotalSen: 16250050, discountSen: 0, grandTotalSen: 16250050, paidSen: 20000000, changeSen: 3749950 },
  'sale-long-values': { ...base, customerName: 'ANGGOTA DENGAN NAMA PANJANG SEKALI UNTUK UJI', memberNik: '3275011234560001', lines: [
    { name: 'Mesin Cuci Front Loading 10 Kg Inverter Dengan Garansi Resmi 5 Tahun', quantity: 12, unitPriceSen: 125000000, discountSen: 12500000, totalSen: 1500000000, taxSen: 165000000 },
    { name: 'Kulkas', quantity: 1, unitPriceSen: 9999999999, discountSen: 0, totalSen: 9999999999, taxSen: null }],
    subtotalSen: 11499999999, discountSen: 99999999, taxTotalSen: 1265000000, grandTotalSen: 99999999999, paidSen: 100000000000, changeSen: 1 },
  'sale-worst-case-width': { ...base, lines: [
    { name: 'Barang Mahal', quantity: 99, unitPriceSen: 999999999999, discountSen: 99999999999, totalSen: 98999999999901, taxSen: null }],
    subtotalSen: 98999999999901, discountSen: 0, grandTotalSen: 98999999999901, paidSen: 99000000000000, changeSen: 99 },
  'sale-kredit-member': { ...base, paymentType: 'Kredit', customerName: 'SYNTH ANGGOTA', memberNik: '0100100', limitSen: 500000000, usedLimitSen: 120000050, remainingLimitSen: 379999950, lines: [
    { name: 'Gula Pasir 1kg', quantity: 3, unitPriceSen: 1750000, discountSen: 0, totalSen: 5250000, taxSen: null }],
    subtotalSen: 5250000, discountSen: 0, grandTotalSen: 5250000, paidSen: 5250000, changeSen: 0 },
};
const returns = {
  'return-typical': { returnCode: 'RTN-20261029-0007', returnedAt: '2026-10-29 14:05', salesCode: 'INV-20261029-0042', createdBy: 'Kasir Satu', customerName: 'UMUM', memberNik: null, refundMethod: 'Tunai', reason: 'Barang rusak', storeName: base.storeName, storeAddress: base.storeAddress, totalSen: 6500050,
    lines: [{ label: 'Beras Premium 5kg', quantity: 1, unitPriceSen: 6500050, refundSen: 6500050 }] },
  'return-long-values': { returnCode: 'RTN-20261029-0008', returnedAt: '2026-10-29 14:05', salesCode: 'INV-20261029-0042', createdBy: 'Kasir Satu', customerName: 'SYNTH ANGGOTA', memberNik: '0100100', refundMethod: 'Kredit', reason: 'Salah pesan', storeName: base.storeName, storeAddress: base.storeAddress, totalSen: 98999999999901,
    lines: [{ label: 'Barang Mahal', quantity: 99, unitPriceSen: 999999999999, refundSen: 98999999999901 }] },
};
for (const paymentType of ['Cash', 'Kredit', 'QRIS']) {
  scenarios[`checkout-${paymentType.toLowerCase()}`] = { ...scenarios['sale-kredit-member'], paymentType, mode: 'checkout' };
  scenarios[`reprint-${paymentType.toLowerCase()}`] = { ...scenarios['sale-typical-cash'], paymentType, hasReturns: true };
}
scenarios['sale-long-identifiers'] = { ...scenarios['sale-long-values'], salesCode: 'TrX/CaseSensitive/610397/31/VeryLongIdentifierWithoutSpaces', cashier: 'Kasir Dengan Nama Sangat Panjang Sekali', memberNik: '00aB0100' };
const globals = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const browser = await chromium.launch({ headless: true });
const results = [];
async function check(name, markup) {
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  await page.emulateMedia({ media: 'print' });
  await page.setContent(`<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${globals}\n${css}</style></head><body>${markup}</body></html>`);
  const report = await page.evaluate(() => {
    const paper = document.querySelector('.receipt-paper');
    const box = paper.getBoundingClientRect();
    const problems = [];
    const lineHeight = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
    for (const el of paper.querySelectorAll('h1, header p, dt, dd, .receipt-line strong, .receipt-line > div > span, .receipt-amount, .receipt-line small, footer')) {
      const r = el.getBoundingClientRect();
      if (r.right > box.right + 0.5 || r.left < box.left - 0.5) problems.push(`outside paper: "${el.textContent}"`);
      // Every amount must sit on one line; `small` notes and labels may wrap only if they are text, never an Rp amount.
      if (el.matches('.receipt-line > div > span, .receipt-totals dd, .receipt-amount') && /Rp[\d.,]/.test(el.textContent) && r.height > lineHeight(el) * 1.5) problems.push(`amount wrapped: "${el.textContent}" (${Math.round(r.height)}px)`);
    }
    for (const row of paper.querySelectorAll('.receipt-meta > div, .receipt-totals > div, .receipt-line > div')) {
      const [a, b] = [...row.children].map(el => el.getBoundingClientRect());
      if (a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) problems.push(`collision: ${row.textContent}`);
    }
    for (const amount of paper.querySelectorAll('.receipt-totals dd, .receipt-line > div > span:last-child')) {
      if (Math.abs(amount.getBoundingClientRect().right - amount.parentElement.getBoundingClientRect().right) > 0.5) problems.push(`amount not right-aligned: ${amount.textContent}`);
    }
    const style = getComputedStyle(paper);
    const text = [...paper.querySelectorAll('h1, header p, dt, dd, .receipt-line strong, small, footer')];
    return { paperPx: box.width, paperMm: +(box.width / 96 * 25.4).toFixed(1), paddingLeftMm: parseFloat(style.paddingLeft) * 25.4 / 96, paddingRightMm: parseFloat(style.paddingRight) * 25.4 / 96, scrollOverflow: paper.scrollWidth - paper.clientWidth, problems,
      font: style.fontFamily, bodyPt: parseFloat(style.fontSize) * 72 / 96, color: style.color, weight: +style.fontWeight,
      titlePt: parseFloat(getComputedStyle(paper.querySelector('h1')).fontSize) * 72 / 96,
      totalPt: parseFloat(getComputedStyle(paper.querySelector('.receipt-grand')).fontSize) * 72 / 96,
      casing: text.map(el => ({ text: el.textContent, transform: getComputedStyle(el).textTransform, identifier: el.matches('.receipt-identifier') })),
      text: paper.textContent, rows: [...paper.querySelectorAll('.receipt-totals > div, .receipt-line > div')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()) };
  });
  await page.locator('.receipt-paper').screenshot({ path: join(output, `${name}.png`) });
  const screenshotWidth = readFileSync(join(output, `${name}.png`)).readUInt32BE(16);
  assert.ok(Math.abs(screenshotWidth - report.paperPx) <= 1, `${name}: preview must include only the paper, not the surrounding viewport (${screenshotWidth}px versus ${report.paperPx}px)`);
  assert.ok(Math.abs(report.paddingLeftMm - 1.5) < 0.01 && Math.abs(report.paddingRightMm - 1.5) < 0.01, `${name}: paper must have symmetric 1.5 mm padding`);
  assert.ok(Math.abs(report.paperMm - 75) < 0.6, `${name}: paper is ${report.paperMm} mm, expected 75 mm`);
  assert.ok(report.scrollOverflow <= 1, `${name}: paper overflows horizontally by ${report.scrollOverflow}px`);
  assert.deepEqual(report.problems, [], `${name}: ${report.problems.join(' | ')}`);
  assert.ok(report.rows.some((row) => /Rp/.test(row)), `${name}: no amounts rendered`);
  assert.ok(report.rows.every((row) => !/Rp\s|Rp\./.test(row)), `${name}: legacy Rp notation found`);
  assert.match(report.font, /monospace/i, `${name}: use a local monospace stack`);
  assert.equal(report.color, 'rgb(0, 0, 0)');
  assert.ok(report.bodyPt >= 9.99 && report.weight >= 600);
  assert.ok(report.titlePt > report.totalPt && report.totalPt > report.bodyPt);
  assert.ok(report.casing.every(row => row.transform === (row.identifier ? 'none' : 'uppercase')), `${name}: uppercase presentation with identifier exceptions`);
  if (name === 'sale-long-identifiers') {
    assert.ok(report.casing.some(row => row.text === scenarios[name].salesCode && row.identifier));
    assert.ok(report.casing.some(row => row.text === '00aB0100' && row.identifier));
  }
  if (name.startsWith('checkout-')) for (const label of ['Limit', 'Limit Terpakai', 'Sisa Limit', 'PPN', 'Harga Sudah Termasuk PPN']) assert.ok(report.text.includes(label));
  if (name.startsWith('reprint-')) {
    assert.ok(report.text.includes('Sebagian/seluruh barang telah diretur. Lihat nota retur.'));
    assert.ok(!report.text.includes('Sisa Limit'), 'reprints must not expose current credit aggregates');
  }
  // Also exercise the actual CSS at a narrow preview viewport, with all data intact.
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 320, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: narrow preview overflows`);
  await page.close();
  results.push([name, report]);
}
try {
  for (const [name, receipt] of Object.entries(scenarios)) {
    const original = structuredClone(receipt);
    globalThis.__receipt = receipt;
    await check(name, renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({ mode: receipt.mode }) })));
    assert.deepEqual(receipt, original, 'presentation must not mutate receipt data');
  }
  for (const [name, doc] of Object.entries(returns)) {
    const original = structuredClone(doc);
    globalThis.__return = doc;
    await check(name, renderToStaticMarkup(await ReturnReceiptPage({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({}) })));
    assert.deepEqual(doc, original, 'presentation must not mutate return data');
  }
  for (const [name, r] of results) console.log(`PASS ${name} — ${r.paperMm} mm, no overflow, no wrapped amount`);
  console.log('Representative rows:', results[1][1].rows.slice(-6).join(' | '));
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
