import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthError } from '@koperasi/domain/auth/errors';
import { parseSalesExportQuery } from '@koperasi/domain/sales/export';
import { exportSalesHistory } from '../src/sales/export-history.ts';

function fakeBundle(scope) {
  return {
    scope,
    query: {
      from: '2026-10-01',
      to: '2026-10-05',
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
    generatedAt: new Date('2026-10-05T12:00:00Z'),
    stores: [{ id: 1, name: 'TOKO S-MART TB II', code: 'TB2' }],
    sales: [],
    returns: [],
    categories: [],
    topItems: [],
    storeItemTotals: [],
  };
}

test('exportSalesHistory scopes store exports to actor.companyId and blocks scope=all when canSwitchBranch is false', async () => {
  const calls = [];
  const repo = {
    exportBundle: async (companyId, scope, query) => {
      calls.push({ companyId, scope, from: query.from });
      return fakeBundle(scope);
    },
  };
  const now = new Date('2026-10-05T12:00:00Z');
  const xlsxQuery = parseSalesExportQuery(new URLSearchParams('format=xlsx&scope=store&from=2026-10-01&to=2026-10-05'), now);
  const res = await exportSalesHistory(repo, { companyId: 1, canSwitchBranch: false }, xlsxQuery, now);
  assert.equal(res.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(res.filename, 'Laporan_Penjualan_TOKO_S-MART_TB_II_2026-10-01_sd_2026-10-05.xlsx');
  assert.ok(res.body instanceof Uint8Array && res.body.byteLength > 500);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { companyId: 1, scope: 'store', from: '2026-10-01' });

  const allQuery = parseSalesExportQuery(new URLSearchParams('format=pdf&scope=all&from=2026-10-01&to=2026-10-05'), now);
  await assert.rejects(
    exportSalesHistory(repo, { companyId: 1, canSwitchBranch: false }, allQuery, now),
    (err) => err instanceof AuthError && err.code === 'FORBIDDEN',
  );
  assert.equal(calls.length, 1, 'repository must not be called when scope=all is forbidden');

  const pdfRes = await exportSalesHistory(repo, { companyId: 1, canSwitchBranch: true }, allQuery, now);
  assert.equal(pdfRes.contentType, 'application/pdf');
  assert.equal(pdfRes.filename, 'Laporan_Penjualan_SEMUA_TOKO_KKISI_2026-10-01_sd_2026-10-05.pdf');
  assert.ok(pdfRes.body instanceof Uint8Array && pdfRes.body.byteLength > 500);
  assert.equal(calls.length, 2);
});

