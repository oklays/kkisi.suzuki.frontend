import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const reactPath = new URL('../node_modules/react/index.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export const useRouter=()=>({replace(){},refresh(){},push(){}});export const usePathname=()=>globalThis.__testPath??"/sales"', shortCircuit: true };
    if (specifier === 'next/link') return { url: `data:text/javascript,import React from '${reactPath}';export const useLinkStatus=()=>({pending:false});export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}`, shortCircuit: true };
    if (specifier === 'next/image') return { url: 'data:text/javascript,export default function Image(){return null}', shortCircuit: true };
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) for (const ext of ['.tsx', '.ts']) if (existsSync(fileURLToPath(url) + ext)) return nextResolve(url.href + ext, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return nextLoad(url, context);
  },
});

const { PosShell } = await import('../src/components/pos/PosShell.tsx');
const { SalesScreen } = await import('../src/components/sales/SalesScreen.tsx');
const { SalesDetail } = await import('../src/components/sales/SalesDetail.tsx');
const { default: SalesLoading } = await import('../src/app/sales/loading.tsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const session = { userId: 4, userName: 'Kasir', branchName: 'Cabang 1', companyId: 1, canSwitchBranch: false,
  companies: [], csrfToken: 'test', checkoutAvailable: false, canCheckout: false, canSales: true,
  register: { open: null, multiple: false } };
const query = { from: '2026-10-01', to: '2026-10-05', source: 'pos', salesStatus: 'Final',
  paymentStatus: 'all', paymentType: 'all', createdBy: '', registerId: null, q: '', page: 1, pageSize: 25, sort: 'newest' };

test('sidebar exposes history to sales_view and marks the selected page', () => {
  const html = render(PosShell, { branchName: 'Cabang 1', session, active: 'sales', children: React.createElement('main', null, 'History') });
  assert.match(html, /<a href="\/sales" aria-current="page">[\s\S]*?Riwayat Transaksi<\/a>/);
  assert.doesNotMatch(html, /href="\/pos"/);
});

test('history list labels filters and monetary/status columns and explains an empty result', () => {
  const props = { session, query, rows: [], total: 0, listHref: '/sales' };
  const html = render(SalesScreen, props);
  for (const text of ['Dari tanggal', 'Sampai tanggal', 'Sumber', 'Status penjualan', 'Metode pembayaran', 'Nomor struk, NIK, atau nama', 'Status pembayaran', 'Pembuat', 'ID sesi kasir', 'Belum ada transaksi']) assert.ok(html.includes(text), text);
  assert.match(html, /<form[^>]*method="get"/);
  assert.match(html, /type="date"/);
});

test('history renders fractional rupiah without rounding stored cents', () => {
  const row = { saleId: 42, salesCode: 'INV42', saleDate: '2026-10-05', customerName: 'UMUM', memberNik: null, createdBy: 'Kasir', source: 'pos', salesStatus: 'Final', paymentStatus: 'Paid', paymentType: 'Cash', recordStatus: 1, returnBit: '0', grandTotalSen: 10005, paidSen: 10005, registerId: 1, registerReference: 'REG-1', cashierLabel: 'K-1', warnings: [] };
  const html = render(SalesScreen, { session, query, rows: [row], total: 1 });
  assert.match(html, /100,05/);
  assert.match(html, />Total<\/th>/);
  assert.match(html, />Terbayar<\/th>/);
  assert.match(html, /sales-chip--cash/);
  assert.match(html, /sales-chip--success/);
});

test('loading stays inside the workspace and exposes a polite skeleton state', () => {
  const html = render(SalesLoading, {});
  assert.match(html, /sales-skeleton/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /login-shell/);
});

test('sales_view without sales_add can view history while sales actions stay hidden for unauthorized sessions', () => {
  const html = render(PosShell, { branchName: 'Cabang 1', session: { ...session, canSales: false }, active: 'pos', children: null });
  assert.doesNotMatch(html, /href="\/sales"/);
  assert.doesNotMatch(html, /href="\/pos"/);
});

test('detail only shows reprint for eligible stored sales and payment panel follows capability', () => {
  const detail = { sale: { saleId: 99, salesCode: 'R-99', saleDate: '2026-10-05', source: 'pos', customerName: 'Anggota', memberNik: '00123', createdBy: 'Kasir', salesStatus: 'Final', paymentStatus: 'Paid', paymentType: 'Cash', recordStatus: 1, returnBit: '0',
    grandTotalSen: 10000, paidSen: 10000, subtotalSen: 10000, discountSen: 0, otherChargesInputSen: 0, otherChargesSen: 0, roundOffLegacySen: 0, registerId: 4, registerReference: 'REG-4', cashierLabel: 'K-4', warnings: [] },
    lines: [], linePagination: { page: 1, pageSize: 50, total: 0, hasNext: false }, warnings: [],
    printEligibility: { allowed: true, reasons: [] } };
  const html = render(SalesDetail, { canViewPayments: false, detail, returnTo: '/sales?from=2026-10-01', linePage: 1, linePageHref: () => '?linePage=1' });
  assert.ok(html.includes('/pos/receipt/99?mode=reprint'));
  assert.match(html, /Nilai round_off legacy/);
  assert.doesNotMatch(html, /Lihat pembayaran tersimpan/);
  const blocked = render(SalesDetail, { session, detail: { ...detail, printEligibility: { allowed: false, reasons: ['RETURN_UNSUPPORTED'] } }, returnTo: '/sales', linePage: 1, linePageHref: () => '?linePage=1' });
  assert.match(blocked, /Struk tidak dapat dicetak ulang/);
  assert.doesNotMatch(blocked, /Cetak ulang struk/);
});

test('custom legacy filters remain selected and unknown methods do not look settled', async () => {
  const html = render(SalesScreen, { query: { ...query, paymentType: 'Transfer bank', salesStatus: 'LegacyStatus' }, rows: [], total: 0 });
  assert.match(html, /value="Transfer bank" selected=""/);
  assert.match(html, /value="LegacyStatus" selected=""/);
  const { PaymentMethodChip, StatusChip, salesListHref, safeSalesReturn } = await import('../src/components/sales/SalesChips.tsx');
  assert.match(render(PaymentMethodChip, { value: 'Transfer bank' }), /sales-chip--neutral/);
  assert.match(render(StatusChip, { value: 'Unpaid', payment: true }), /sales-chip--danger/);
  assert.match(render(StatusChip, { value: '<script>alert(1)</script>', payment: true }), /&lt;script&gt;/);
  assert.equal(new URL(salesListHref({ ...query, registerId: 1 }), 'https://local.test').searchParams.get('registerId'), '1');
  for (const href of ['https://evil.test', '//evil.test', '/sales/../pos', '/sales/invoice/1']) assert.equal(safeSalesReturn(href), '/sales');
});

test('collapsed payment disclosure points to an existing hidden accessible region', async () => {
  const { SalePaymentsPanel } = await import('../src/components/sales/SalePaymentsPanel.tsx');
  const html = render(SalePaymentsPanel, { saleId: 99 });
  const id = html.match(/aria-controls="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /hidden=""/);
  assert.doesNotMatch(html, /sales-payments-table/);
});

const returnContext = (eligibility = { allowed: true, reasons: [], refundMethod: 'Cash', deadline: '2026-10-12' }) => ({
  sale: { saleId: 99, salesCode: 'R-99', saleDate: '2026-10-05', customerName: 'Anggota', memberNik: null, paymentType: 'Cash', grandTotalSen: 30000 },
  lines: [{ itemId: 11, soldQty: 3, returnedQty: 1, totalSen: 30000, returnedSen: 10000, label: 'Sabun', barcode: 'B11', unitPriceSen: 10000, unitDiscountSen: 0 },
    { itemId: 12, soldQty: 1, returnedQty: 1, totalSen: 5000, returnedSen: 5000, label: 'Teh', barcode: 'B12', unitPriceSen: 5000, unitDiscountSen: 0 }],
  returns: [{ returnId: 5, returnCode: 'RTN-TB26100500001', returnedAt: '2026-10-05 10:00:00', saleId: 99, salesCode: 'R-99', refundMethod: 'Cash', totalSen: 15000, reason: 'Barang rusak', createdBy: 'kasir1', customerName: 'Anggota' }],
  eligibility,
});

test('sidebar shows the return list to sales_return_view and marks it instead of the history', () => {
  globalThis.__testPath = '/sales/returns/5';
  try {
    const html = render(PosShell, { branchName: 'Cabang 1', session: { ...session, canReturns: true }, active: 'sales', children: null });
    assert.match(html, /<a href="\/sales\/returns" aria-current="page">[\s\S]*?Retur Penjualan<\/a>/);
    assert.match(html, /<a href="\/sales">[\s\S]*?Riwayat Transaksi<\/a>/);
    assert.doesNotMatch(render(PosShell, { branchName: 'Cabang 1', session, active: 'sales', children: null }), /Retur Penjualan/);
  } finally { delete globalThis.__testPath; }
});

test('detail offers a return only to sales_return_add on an eligible sale and always lists earlier returns', () => {
  const detail = { sale: { saleId: 99, salesCode: 'R-99', saleDate: '2026-10-05', source: 'pos', customerName: 'Anggota', memberNik: null, createdBy: 'Kasir', salesStatus: 'Final', paymentStatus: 'Paid', paymentType: 'Cash', recordStatus: 1, returnBit: '1',
    grandTotalSen: 30000, paidSen: 30000, subtotalSen: 30000, discountSen: 0, otherChargesInputSen: 0, otherChargesSen: 0, roundOffLegacySen: 0, registerId: 4, registerReference: 'REG-4', cashierLabel: 'K-4', warnings: [] },
    lines: [], linePagination: { page: 1, pageSize: 50, total: 0, hasNext: false }, warnings: [], printEligibility: { allowed: true, reasons: [] } };
  const html = render(SalesDetail, { detail, returnTo: '/sales', linePage: 1, returns: { context: returnContext(), canCreate: true } });
  assert.ok(html.includes('href="/sales/invoice/99/return"'));
  assert.ok(html.includes('href="/sales/returns/5"'));
  assert.match(html, /Refund tunai dari laci kasir/);
  const viewer = render(SalesDetail, { detail, returnTo: '/sales', linePage: 1, returns: { context: returnContext(), canCreate: false } });
  assert.doesNotMatch(viewer, /\/sales\/invoice\/99\/return/);
  const expired = render(SalesDetail, { detail, returnTo: '/sales', linePage: 1, returns: { context: returnContext({ allowed: false, reasons: ['RETURN_WINDOW_EXPIRED'], refundMethod: 'Cash', deadline: '2026-10-12' }), canCreate: true } });
  assert.doesNotMatch(expired, /\/sales\/invoice\/99\/return/);
  assert.match(expired, /7 hari kalender/);
});

test('return form caps each line at its remaining quantity and needs review before submitting', async () => {
  const { SalesReturnForm } = await import('../src/components/sales/SalesReturnForm.tsx');
  const html = render(SalesReturnForm, { context: returnContext(), csrfToken: 'token' });
  assert.match(html, /maks\. 2/);
  assert.match(html, /Sudah diretur semua/);
  assert.match(html, /Tinjau retur<\/button>/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(html, /Konfirmasi &amp; proses retur/);
});
