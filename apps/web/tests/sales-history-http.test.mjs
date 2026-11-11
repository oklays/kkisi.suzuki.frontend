import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { handleSalesHistory, handleSalesDetail, handleSalePayments, handleSalesExport } from '../src/infrastructure/sales/handlers.ts';

async function signedIn() {
  const world = makeWorld();
  world.data.permissions = new Set(['4:sales_view']);
  world.addUser({ id: 4, roleId: 4 });
  const response = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(response) };
}

test('history API checks session and sales_view before querying; company is derived from the session', async () => {
  const { world, cookie } = await signedIn(); let calls = 0;
  const repo = { list: async (companyId, query) => { calls++; assert.equal(companyId, 1); assert.equal(query.paymentType, 'QRIS'); return { items: [], pagination: { page: 1, pageSize: 25, total: 0, hasNext: false } }; } };
  assert.equal((await handleSalesHistory(world.services, makeRequest('/api/sales?paymentType=QRIS', { cookie: undefined }), () => repo)).status, 401);
  assert.equal((await handleSalesHistory(world.services, makeRequest('/api/sales?companyId=999', { cookie }), () => repo)).status, 400);
  const response = await handleSalesHistory(world.services, makeRequest('/api/sales?paymentType=QRIS', { cookie }), () => repo);
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).pagination.total, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);
});

test('history detail hides another company and payment rows require both existing read permissions', async () => {
  const { world, cookie } = await signedIn(); let detailCalls = 0; let paymentCalls = 0;
  const repo = {
    find: async () => { detailCalls++; return null; },
    payments: async () => { paymentCalls++; return { rows: [], pagination: { page: 1, pageSize: 25, total: 0, hasNext: false } }; },
  };
  assert.equal((await handleSalesDetail(world.services, makeRequest('/api/sales/999', { cookie }), '999', () => repo)).status, 404);
  assert.equal((await handleSalePayments(world.services, makeRequest('/api/sales/42/payments', { cookie }), '42', () => repo)).status, 403);
  assert.equal(detailCalls, 1);
  assert.equal(paymentCalls, 0);
  world.data.permissions.add('4:sales_payment_view');
  const payment = await handleSalePayments(world.services, makeRequest('/api/sales/42/payments', { cookie }), '42', () => repo);
  assert.equal(payment.status, 200);
  assert.equal(paymentCalls, 1);
});

test('history invalid query is rejected before repository calls and database failures stay unavailable', async () => {
  const { world, cookie } = await signedIn(); let calls = 0;
  assert.equal((await handleSalesHistory(world.services, makeRequest('/api/sales?page=1&page=2', { cookie }), () => ({ list: async () => { calls++; } }))).status, 400);
  const unavailable = await handleSalesHistory(world.services, makeRequest('/api/sales', { cookie }), () => ({ list: async () => { calls++; throw Object.assign(new Error('sql hidden'), { code: 'P2021' }); } }));
  assert.equal(unavailable.status, 503);
  assert.equal(await unavailable.text(), '{"error":"SALES_UNAVAILABLE"}');
  assert.equal(calls, 1);
});

test('handleSalesExport enforces sales_view, blocks cross-site and unauthorized scope=all, and streams attachment', async () => {
  const { world, cookie } = await signedIn();
  let exportCalls = 0;
  const repo = {
    exportBundle: async (companyId, scope, query, now) => {
      exportCalls++;
      return {
        scope,
        query,
        generatedAt: now,
        stores: [{ id: companyId, name: 'TOKO S-MART TB II', code: 'TB2' }],
        sales: [],
        returns: [],
        categories: [],
        topItems: [],
        storeItemTotals: [],
      };
    },
  };
  assert.equal((await handleSalesExport(world.services, makeRequest('/api/sales/export?format=xlsx', { cookie: undefined }), () => repo)).status, 401);
  assert.equal((await handleSalesExport(world.services, makeRequest('/api/sales/export?format=xlsx', { cookie, headers: { 'sec-fetch-site': 'cross-site' } }), () => repo)).status, 403);
  assert.equal((await handleSalesExport(world.services, makeRequest('/api/sales/export?format=csv', { cookie }), () => repo)).status, 400);
  // roleId 4 cannot switch branch -> scope=all is 403 FORBIDDEN
  assert.equal((await handleSalesExport(world.services, makeRequest('/api/sales/export?format=xlsx&scope=all', { cookie }), () => repo)).status, 403);
  assert.equal(exportCalls, 0);

  const xlsxRes = await handleSalesExport(world.services, makeRequest('/api/sales/export?format=xlsx&from=2026-10-01&to=2026-10-05', { cookie }), () => repo);
  assert.equal(xlsxRes.status, 200);
  assert.equal(xlsxRes.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(xlsxRes.headers.get('content-disposition') ?? '', /attachment; filename="Laporan_Penjualan_TOKO_S-MART_TB_II_2026-10-01_sd_2026-10-05\.xlsx"/);
  assert.equal(xlsxRes.headers.get('cache-control'), 'no-store');
  assert.equal(exportCalls, 1);

  const pdfRes = await handleSalesExport(world.services, makeRequest('/api/sales/export?format=pdf&from=2026-10-01&to=2026-10-05', { cookie }), () => repo);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  assert.match(pdfRes.headers.get('content-disposition') ?? '', /\.pdf"/);
  assert.equal(exportCalls, 2);
});
