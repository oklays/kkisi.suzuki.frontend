import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

// Checkpoint 14 — DEV LOCAL smoke against the RUNNING owner-testing server (scripts/dev-local.sh start), synthetic data in kkisi_devlocal_staging only.
// Personas, landing, menus, unauthorised direct access, KOSIPA read pages and export, Warehouse preview banner, a real POS cash checkout on the synthetic
// database, responsive overflow at 375/390/768/1024/1440, and screenshots for the owner. Writes only the synthetic DEV LOCAL database (one sale).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEV_LOCAL_URL || 'http://127.0.0.1:3200';
const shots = process.env.DEV_LOCAL_SCREENSHOTS || '/private/tmp/kkisi-devlocal-screens';
assert.equal(new URL(base).hostname, '127.0.0.1');
const pw = JSON.parse(readFileSync(new URL('../.env.dev-local-accounts.json', import.meta.url), 'utf8'));
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = []; const results = [];
const ok = (name) => { results.push(`PASS ${name}`); console.log(`PASS ${name}`); };
async function session(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${user}: ${e.message}`));
  if (user) {
    await page.goto(`${base}/login`); await page.waitForLoadState('networkidle');
    await page.getByLabel('Username').fill(`synth_${user}`); await page.getByLabel('Password').fill(pw[user]); await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20000 }); await page.waitForLoadState('load');
  }
  return { context, page };
}
const nav = async (page) => { await page.locator('#console-nav').waitFor({ state: 'attached' }); return page.locator('#console-nav nav a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname)); };
const main = async (page) => { await page.waitForFunction(() => { const m = document.querySelector('main'); return m && m.innerText.trim() !== '' && !/(^|\n)Memuat/.test(m.innerText.trim()); }, null, { timeout: 20000 }); return page.locator('main').innerText(); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });

try {
  // ---------------------------------------------------------------- login, landing, menus
  { const { context, page } = await session(null); await page.goto(`${base}/login`); await page.waitForLoadState('networkidle');
    await page.getByLabel('Username').fill('synth_admin'); await page.getByLabel('Password').fill('Wrong-Synthetic-Password-1'); await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.locator('.login-error').waitFor(); assert.match(await page.locator('.login-error').innerText(), /Username atau password salah/); assert.equal(new URL(page.url()).search, '');
    await shot(page, '01-login-gagal'); ok('login: invalid credentials show a generic message, nothing in the URL'); await context.close(); }
  for (const [user, landing] of [['admin', '/console'], ['koperasi', '/console'], ['kepala', '/console'], ['kasir1', '/pos'], ['kasir2', '/console']]) {
    const { context, page } = await session(user);
    if (landing === '/pos') await page.waitForURL((u) => u.pathname === '/pos', { timeout: 15000 }); else await page.locator('#console-nav').waitFor({ state: 'attached' });
    assert.equal(new URL(page.url()).pathname, landing, `${user} landing`);
    await shot(page, `02-landing-${user}`); ok(`landing: synth_${user} -> ${landing}`); await context.close();
  }
  const expectNav = { admin: ['/console/settings/identitas', '/console/warehouse', '/inventory', '/products'], koperasi: ['/console/kosipa/anggota', '/console/kosipa/payroll', '/console/kosipa/laporan'], kasir2: ['/console/kosipa/anggota', '/console/kosipa/simpanan', '/console/kosipa/pinjaman'] };
  const forbidNav = { admin: ['/console/kosipa/anggota'], koperasi: ['/console/warehouse', '/console/settings/identitas'], kasir2: ['/console/kosipa/payroll', '/console/warehouse'] };
  for (const user of Object.keys(expectNav)) {
    const { context, page } = await session(user); await page.goto(`${base}/console`); const links = await nav(page);
    for (const h of expectNav[user]) assert.ok(links.includes(h), `${user} sees ${h}`); for (const h of forbidNav[user]) assert.ok(!links.includes(h), `${user} does not see ${h}`);
    ok(`menu visibility for synth_${user}`); await context.close();
  }
  // ---------------------------------------------------------------- unauthorised direct access (a hidden menu is not the only barrier)
  { const { context, page } = await session('kasir1');
    for (const path of ['/console/kosipa/anggota', '/console/kosipa/payroll', '/console/settings/identitas', '/console/warehouse']) { await page.goto(`${base}${path}`); const t = await page.locator('body').innerText(); assert.ok(/Akses ditolak|tidak ditemukan|404|belum ditautkan|tidak memiliki akses/i.test(t), `${path} refused for the cashier`); }
    for (const api of ['/api/kosipa/payroll', '/api/kosipa/loans', '/api/kosipa/reports/loans/export']) assert.equal((await context.request.get(`${base}${api}`)).status(), 403, api);
    ok('unauthorised direct pages and APIs are refused for the cashier'); await context.close(); }
  { const { context, page } = await session('kasir2');
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll`)).status(), 403); assert.equal((await context.request.get(`${base}/api/kosipa/reports/loans/export`)).status(), 403);
    await page.goto(`${base}/console/kosipa/simpanan/9001`); assert.match(await main(page), /SALDO RESMI|saldo resmi|tidak tersedia/i); await shot(page, '06-staf-simpanan');
    ok('KOSIPA staff: savings readable with official balance marked unavailable; payroll and export refused'); await context.close(); }
  // ---------------------------------------------------------------- KOSIPA read pages (administrator)
  { const { context, page } = await session('koperasi');
    const pages = [['/console/kosipa/anggota?q=S9001', /S9001|SYNTH/], ['/console/kosipa/anggota/9001', /Simpanan|Pinjaman/], ['/console/kosipa/simpanan/9001', /Saldo resmi belum tersedia/], ['/console/kosipa/pinjaman', /PINSYN/], ['/console/kosipa/pinjaman/PINSYN9001', /Jadwal|angsuran/i],
      ['/console/kosipa/payroll', /POTSYN202608A/], ['/console/kosipa/payroll/POTSYN202608A', /Batch POTSYN202608A/], ['/console/kosipa/payroll/POTSYN202608A/rekonsiliasi', /Rekonsiliasi kredit toko[\s\S]*Selisih adalah informasi untuk tinjauan, bukan keputusan akuntansi\./], ['/console/kosipa/laporan', /Laporan/], ['/console/kosipa/laporan/kualitas-data', /kualitas|Kualitas/]];
    for (const [i, [path, re]] of pages.entries()) { await page.goto(`${base}${path}`); assert.match(await main(page), re, path); await shot(page, `04-kosipa-${String(i + 1).padStart(2, '0')}`); }
    await page.goto(`${base}/console/kosipa/payroll?periode=2026-13`); assert.match(await main(page), /Filter tidak valid/);
    const csv = await context.request.get(`${base}/api/kosipa/reports/loans/export?tahun=2026`); assert.equal(csv.status(), 200); assert.match(csv.headers()['content-disposition'], /attachment/);
    ok('KOSIPA administrator: member 360, savings, loans, payroll, reconciliation, reports, data quality, invalid filter, CSV export'); await context.close(); }
  // ---------------------------------------------------------------- Warehouse preview
  { const { context, page } = await session('admin');
    for (const [i, path] of ['/console/warehouse', '/console/warehouse/distribusi', '/console/warehouse/pemetaan', '/console/warehouse/penerimaan'].entries()) {
      await page.goto(`${base}${path}`); const t = await main(page); assert.match(t, /DATA SINTETIS — BELUM TERHUBUNG KE GUDANG OPERASIONAL/, path);
      assert.equal(await page.locator('main button:not([disabled])').filter({ hasText: /kirim|terima|posting|setujui|simpan/i }).count(), 0, `${path}: no operational action`); await shot(page, `05-warehouse-${i + 1}`);
    }
    ok('Warehouse preview: banner on every page, no operational action'); await context.close(); }
  // ---------------------------------------------------------------- TOKO: real cash checkout on the synthetic DEV LOCAL database, then visible in sales history
  { const { context, page } = await session('kasir1'); await page.waitForURL((u) => u.pathname === '/pos');
    await page.locator('.pos-shell').waitFor(); await page.locator('.pos-product-card').first().waitFor({ timeout: 20000 });
    await page.locator('.pos-add').first().click(); await page.locator('#pos-paid').fill('1000000');
    await page.locator('.pos-checkout:not([disabled])').click(); await page.locator('.pos-receipt').waitFor({ timeout: 20000 });
    await shot(page, '03-pos-struk'); ok('TOKO: cash checkout writes a sale on the synthetic database and shows the receipt');
    // static QRIS: explicit verification dialog, then recorded as non-cash paid
    if (await page.locator('#pos-product-tab').isVisible()) await page.locator('#pos-product-tab').click();   // after a sale the POS shows the cart/receipt tab
    await page.locator('.pos-add').first().click(); if (await page.locator('#pos-cart-tab').isVisible()) await page.locator('#pos-cart-tab').click();
    await page.locator('.pos-payment button', { hasText: 'QRIS' }).click();
    await page.locator('.pos-checkout:not([disabled])').click(); await page.locator('#qris-confirm-title').waitFor();
    await page.locator('.pos-qris-dialog-confirm').click(); await page.locator('.pos-receipt', { hasText: 'QRIS' }).waitFor({ timeout: 20000 });
    assert.match(await page.locator('.pos-receipt').innerText(), /Lunas \(QRIS Non-Tunai\)/); await shot(page, '03-pos-struk-qris');
    ok('TOKO: static QRIS checkout requires the verification dialog and is recorded as non-cash paid'); await context.close(); }
  { const { context, page } = await session('kepala'); await page.goto(`${base}/sales`); assert.match(await main(page), /Final|Paid|Cash|SYNTH|Rp/i); await shot(page, '03-riwayat-penjualan');
    for (const path of ['/sales/returns', '/products', '/inventory']) { await page.goto(`${base}${path}`); await page.waitForLoadState('load'); assert.ok(!/Application error/.test(await page.locator('body').innerText()), path); }
    ok('TOKO supervisor: sales history, returns, products, inventory open'); await context.close(); }
  // ---------------------------------------------------------------- logout and protected access afterwards
  { const { context, page } = await session('admin'); const r = await context.request.get(`${base}/api/auth/session`); const { csrfToken } = await r.json();
    assert.equal((await context.request.post(`${base}/api/auth/logout`, { headers: { 'x-csrf-token': csrfToken, origin: base }, data: {} })).status() < 400, true);
    await page.goto(`${base}/console`); await page.waitForURL((u) => u.pathname === '/login'); ok('logout: protected pages redirect to /login afterwards'); await context.close(); }
  // ---------------------------------------------------------------- responsive
  for (const width of [375, 390, 768, 1024, 1440]) {
    const { context, page } = await session('koperasi', { width, height: 860 });
    for (const path of ['/console', '/console/kosipa/payroll/POTSYN202608A', '/console/kosipa/laporan', '/console/kosipa/pinjaman']) { await page.goto(`${base}${path}`); await main(page); assert.ok(await overflow(page) <= 1, `${path} @${width}: horizontal overflow ${await overflow(page)}px`); }
    if (width < 768) {   // drawer below 768 px (console.css); keyboard: Escape-free close button returns focus to the toggle
      await page.getByRole('button', { name: 'Buka menu' }).click(); await page.locator('#console-nav').waitFor({ state: 'visible' }); await shot(page, `07-mobile-menu-${width}`);
      await page.locator('.console-drawer-close').click(); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Buka menu', 'focus returns to the menu toggle');
    } else { assert.ok(await page.locator('#console-nav').isVisible(), 'sidebar inline'); await shot(page, `07-dashboard-${width}`); }
    ok(`responsive @${width}: no horizontal page overflow; ${width < 768 ? 'mobile drawer opens/closes with focus return' : 'sidebar inline'}`); await context.close();
  }
  assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
  console.log(`dev-local smoke passed (${results.length} checks); screenshots in ${shots}`);
} finally { await browser.close(); }
