import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of Checkpoint 10 SYNTHETIC Warehouse preview (WAREHOUSE_EXPECT=on: WAREHOUSE_PREVIEW_ENABLED=true; off: flag unset) on the SYNTHETIC e2e schema. The built app must run on
// 127.0.0.1 with DATABASE_URL = the e2e reader (SELECT only), CONSOLE_ENABLED=true, KOSIPA_READ_ENABLED=true and
// DATABASE_URL_CONSOLE = the local console store. Needs the Checkpoint-9 seed. UAT_MODE=ok (default) | reader-outage | store-down; see scripts/uat-run.sh (scripts/e2e-seed.mjs).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const output = process.env.CONSOLE_SCREENSHOTS || '/private/tmp/ksm-console-verification';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.ok(process.env.E2E_SEED_URL?.includes('/kkisi_e2e_legacy'), 'E2E_SEED_URL must target the synthetic schema');
await mkdir(output, { recursive: true });

const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
await assertE2eTarget(seed);
const consoleDb = new PrismaClient({ datasourceUrl: process.env.CONSOLE_STORE_TEST_URL });
const expectOn = (process.env.WAREHOUSE_EXPECT || 'on') === 'on';
const browser = await chromium.launch({ headless: true });
const errors = [];
async function session(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|404|409|422|503)|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { context, page };
}
async function login(page, user) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Username').fill(`synth_${user}`); await page.getByLabel('Password').fill(pw[user]);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(/\/(console(\?entry=login)?|pos)$/); await page.waitForLoadState('networkidle');
}
const sidebar = async (page) => { await page.waitForLoadState('networkidle'); await page.locator('#console-nav nav a').first().waitFor({ state: 'attached' }); return page.locator('#console-nav nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))); };
const noOverflow = async (page, label) => { for (const width of [375, 390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 860 }); const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`); } await page.setViewportSize({ width: 1440, height: 900 }); };
const text = async (page) => { await page.waitForFunction(() => { const m = document.querySelector('main'); return m && m.innerText.trim() !== 'Memuat…' && m.innerText.trim() !== ''; }); await page.waitForLoadState('networkidle'); return page.locator('main').innerText(); };
const FORBIDDEN_CONTROLS = /setujui|approve|posting|post\b|generate|buat matriks|hapus|ubah|simpan/i;
async function assertReadOnly(page) {
  const labels = await page.locator('main button, main [role=button], main input[type=submit]').evaluateAll((els) => els.map((e) => (e.textContent || e.value || '').trim()));
  for (const l of labels) assert.ok(!FORBIDDEN_CONTROLS.test(l), `write-looking control on a payroll page: "${l}"`);
  assert.equal(await page.locator('main form:not([method=get]):not([role=search])').count(), 0, 'no non-GET form');
}

const NOT_FOUND = /tidak ditemukan|404|not found/i;
try {
  for (const [role, slug] of [[1, 'inventory_view'], [1, 'sales_view'], [2, 'inventory_view'], [4, 'inventory_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);
  if (expectOn) {
    console.log('WH-1. global-warehouse staff see the preview in the sidebar; every page carries the SYNTHETIC banner and no action control');
    { const { context, page } = await session(); await login(page, 'admin'); const links = await sidebar(page);
      for (const href of ['/console/warehouse', '/console/warehouse/distribusi', '/console/warehouse/pemetaan', '/console/warehouse/penerimaan']) assert.ok(links.includes(href), `${href} in sidebar`);
      await page.goto(`${base}/console/warehouse`); await page.getByRole('heading', { name: 'Pratinjau Warehouse' }).waitFor(); let t = await text(page);
      assert.match(t, /DATA SINTETIS — BELUM TERHUBUNG KE GUDANG OPERASIONAL/); assert.match(t, /Dikonfirmasi\s+3/); assert.match(t, /Diusulkan \(belum dipakai\)\s+1/); assert.match(t, /Dihentikan\s+1/); assert.match(t, /Diterima penuh\s+1/); assert.match(t, /Diterima sebagian\s+1/); assert.match(t, /Diterima dengan selisih\s+2/); assert.match(t, /Belum diterima\s+3/);
      assert.match(t, /belum ditentukan/i); await assertReadOnly(page); await page.screenshot({ path: `${output}/warehouse-overview-1440.png`, fullPage: true }); await noOverflow(page, 'overview');
      await context.close(); }

    console.log('WH-2. mapping preview: explicit statuses and conversions, filters, no name matching');
    { const { context, page } = await session(); await login(page, 'admin'); await page.goto(`${base}/console/warehouse/pemetaan`); await page.getByRole('heading', { name: 'Pemetaan barang' }).waitFor();
      assert.equal(await page.locator('main tbody tr').count(), 5); let t = await text(page);
      assert.match(t, /DATA SINTETIS/); assert.match(t, /Rasio disetujui 12:1/); assert.match(t, /Satuan sama \(1:1\)/); assert.match(t, /Diusulkan \(belum dipakai\)/); assert.match(t, /Dihentikan/);
      await page.getByLabel('Status').selectOption('PROPOSED'); await page.getByRole('button', { name: 'Terapkan' }).click(); await page.waitForURL(/status=PROPOSED/); await page.getByText('map:g14:c1:s79').waitFor(); assert.equal(await page.locator('main tbody tr').count(), 1);
      await page.goto(`${base}/console/warehouse/pemetaan?cabang=2&status=%27%20OR%201%3D1`); assert.equal(await page.locator('main tbody tr').count(), 2, 'a malformed status is ignored, the branch filter applies');
      await assertReadOnly(page); await noOverflow(page, 'mapping'); await context.close(); }

    console.log('WH-3. distribution list and detail: reconciliation, receipts, discrepancy resolution, stock INTENTS (not postings), history');
    { const { context, page } = await session(); await login(page, 'admin'); await page.goto(`${base}/console/warehouse/distribusi`); await page.getByRole('heading', { name: 'Dokumen distribusi' }).waitFor();
      assert.equal(await page.locator('main tbody tr').count(), 7); await page.screenshot({ path: `${output}/warehouse-shipments-1440.png`, fullPage: true });
      await page.getByLabel('Status').selectOption('DRAFT'); await page.getByRole('button', { name: 'Terapkan' }).click(); await page.waitForURL(/status=DRAFT/); await page.getByRole('link', { name: 'synthetic:dispatch:0005' }).waitFor(); assert.equal(await page.locator('main tbody tr').count(), 1);
      await page.goto(`${base}/console/warehouse/distribusi/${encodeURIComponent('synthetic:dispatch:0002')}?cabang=1`); await page.getByRole('heading', { name: 'Distribusi synthetic:dispatch:0002' }).waitFor(); let t = await text(page);
      assert.match(t, /Diterima sebagian/); assert.match(t, /Dikirim\s+100/); assert.match(t, /Diterima\s+98/); assert.match(t, /Masih ditunggu\s+2/); assert.match(t, /Belum ditentukan \(menunggu keputusan pemilik\)/); assert.match(t, /tidak diposting/); assert.match(t, /synthetic:dispatch:0002\|event-synthetic-0002-1\|1/);
      assert.match(t, /Dokumen belum diterima penuh: selisih dan kekurangan ditampilkan apa adanya/); await assertReadOnly(page); await noOverflow(page, 'shipment detail'); await page.screenshot({ path: `${output}/warehouse-detail-1440.png`, fullPage: true });
      await page.goto(`${base}/console/warehouse/distribusi/${encodeURIComponent('synthetic:dispatch:0003')}?cabang=1`); t = await text(page); assert.match(t, /Diterima dengan selisih|Ditolak, belum ditangani\s+5/); assert.match(t, /Rusak/);
      await page.goto(`${base}/console/warehouse/distribusi/${encodeURIComponent('synthetic:dispatch:0004')}?cabang=1`); t = await text(page); assert.match(t, /Kekurangan ditutup/); assert.match(t, /Selesai/);
      for (const bad of [`${encodeURIComponent('synthetic:dispatch:0002')}?cabang=2`, `${encodeURIComponent('synthetic:dispatch:9999')}?cabang=1`, `${encodeURIComponent("x'; DROP")}?cabang=1`, `${encodeURIComponent('synthetic:dispatch:0002')}`, `${encodeURIComponent('synthetic:dispatch:0002')}?cabang=abc`]) { await page.goto(`${base}/console/warehouse/distribusi/${bad}`); assert.match(await text(page), NOT_FOUND, bad); }
      await context.close(); }

    console.log('WH-4. receiving and discrepancy overview lists only documents that still await units or hold unresolved rejections');
    { const { context, page } = await session(); await login(page, 'admin'); await page.goto(`${base}/console/warehouse/penerimaan`); await page.getByRole('heading', { name: 'Penerimaan dan selisih' }).waitFor();
      assert.deepEqual((await page.locator('main tbody tr td:first-child').allInnerTexts()).sort(), ['synthetic:dispatch:0002', 'synthetic:dispatch:0003', 'synthetic:dispatch:0007']);
      assert.match(await text(page), /tidak ada koreksi otomatis dan tidak ada posting stok/i); await assertReadOnly(page); await noOverflow(page, 'receiving'); await context.close(); }

    console.log('WH-5. no access without the global-warehouse capability: a cashier with inventory_view but no branch chooser, and anonymous visitors');
    { const { context, page } = await session(); await login(page, 'kasir1'); await page.goto(`${base}/console`); assert.ok(!(await sidebar(page)).includes('/console/warehouse'));
      for (const p of ['/console/warehouse', '/console/warehouse/pemetaan', '/console/warehouse/distribusi', '/console/warehouse/penerimaan', `/console/warehouse/distribusi/${encodeURIComponent('synthetic:dispatch:0002')}?cabang=1`]) { await page.goto(`${base}${p}`); assert.match(await text(page), NOT_FOUND, p); }
      await context.close();
      const anon = await browser.newContext(); const r = await anon.request.get(`${base}/console/warehouse`, { maxRedirects: 0 }); assert.ok([302, 303, 307, 308].includes(r.status()), `anonymous redirected, got ${r.status()}`); await anon.close(); }
  } else {
    console.log('WH-OFF. flag off: the preview does not exist for anyone, including global-warehouse staff');
    { const { context, page } = await session(); await login(page, 'admin'); const links = await sidebar(page);
      for (const href of ['/console/warehouse', '/console/warehouse/distribusi', '/console/warehouse/pemetaan', '/console/warehouse/penerimaan']) assert.ok(!links.includes(href), `${href} hidden`);
      assert.ok(links.includes('/inventory'), 'the existing TOKO warehouse/stock-opname entry is unaffected');
      for (const p of ['/console/warehouse', '/console/warehouse/distribusi']) { await page.goto(`${base}${p}`); assert.match(await text(page), NOT_FOUND, p); }
      await context.close(); }
  }
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`warehouse preview checks (${expectOn ? 'on' : 'off'}) passed`);
} finally {
  for (const [role, slug] of [[1, 'inventory_view'], [1, 'sales_view'], [2, 'inventory_view'], [4, 'inventory_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
