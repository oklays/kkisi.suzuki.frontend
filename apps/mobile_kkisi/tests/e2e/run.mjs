// End-to-end journeys in a real browser against the PRODUCTION build (`next build` first) and the synthetic stack.
// Run: pnpm --filter @koperasi/mobile-kkisi build && pnpm --filter @koperasi/mobile-kkisi test:e2e
// Screenshots: docs/mobile_design_pwa/implementation/screenshots/ (E2E_SCREENSHOTS=0 to skip).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { env as stackEnv } from '../../integration/stack.mjs';
import { MEMBERS, TEST_PASSWORD, seed } from '../../integration/seed.mjs';
import { loadConfig } from '../../integration/stack.mjs';

const PORT = 3240;
const B = `http://127.0.0.1:${PORT}`;
const app = new URL('../../', import.meta.url);
const shots = new URL('../../../../docs/mobile_design_pwa/implementation/screenshots/', import.meta.url).pathname;
const SHOOT = process.env.E2E_SCREENSHOTS !== '0';
const results = [];
mkdirSync(shots, { recursive: true });

async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`ok   ${name}`); }
  catch (e) { results.push({ name, ok: false, error: String(e?.message ?? e).split('\n')[0] }); console.log(`FAIL ${name}\n     ${String(e?.stack ?? e).split('\n').slice(0, 4).join('\n     ')}`); }
}

async function startServer() {
  const cfg = loadConfig();
  await seed(null, cfg.rootPassword, cfg.port, 'kkisi_mobile_legacy');
  const child = spawn(new URL('node_modules/.bin/next', app).pathname, ['start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: app.pathname, env: { ...process.env, ...stackEnv(), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${B}/health`)).ok) return child; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill(); throw new Error('server did not start (run `next build` first)');
}

const h1 = (page) => page.locator('h1').first().textContent();

const server = await startServer();
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'id-ID', timezoneId: 'Asia/Jakarta', serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('response', (r) => { if (r.status() === 403) consoleErrors.push(`403 ${r.request().method()} ${new URL(r.url()).pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(401|net::ERR_INTERNET_DISCONNECTED)/.test(m.text())) consoleErrors.push(m.text()); });

  await step('unauthenticated deep link redirects to Masuk and keeps the target', async () => {
    await page.goto(`${B}/simpanan?tab=setoran`);
    assert.match(page.url(), /\/masuk\?next=%2Fsimpanan%3Ftab%3Dsetoran/);
    assert.equal(await h1(page), 'Selamat datang kembali');
    assert.equal(await page.getByText('Lanjut sebagai tamu').count(), 0);
    await page.getByText('Bersama Membangun Kesejahteraan').waitFor();
    await page.getByText('Akses aman untuk anggota KKISI TB2').waitFor();
  });
  await step('unauthenticated API call is 401 JSON, never data', async () => {
    const r = await fetch(`${B}/api/belanja/harga?items=1:1`);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, 'UNAUTHENTICATED');
  });
  await step('wrong password shows a generic error and clears the password', async () => {
    await page.locator('button[type=submit]:not([disabled])').waitFor();
    await page.fill('#identity', MEMBERS.a.nik); await page.fill('#password', 'salah-sekali'); await page.click('button[type=submit]');
    await page.getByText('NIK/email/telepon atau password tidak sesuai.').waitFor();
    assert.equal(await page.inputValue('#password'), '');
  });
  await step('login + wrong PIN + correct PIN lands on the original deep link', async () => {
    await page.fill('#identity', MEMBERS.a.email); await page.fill('#password', TEST_PASSWORD); await page.click('button[type=submit]');
    await page.waitForURL('**/pin**');
    if (SHOOT) await page.screenshot({ path: `${shots}e2e-pin.png` });
    for (const d of '0000') await page.click(`button[aria-label="Angka ${d}"]`);
    await page.getByText('PIN tidak sesuai. Sisa 4 kali percobaan.').waitFor();
    for (const d of MEMBERS.a.pin) await page.click(`button[aria-label="Angka ${d}"]`);
    await page.waitForURL('**/simpanan?tab=setoran');
    assert.equal(await h1(page), 'Simpanan');
  });
  await step('session cookie is HttpOnly and never readable by scripts', async () => {
    const cookies = await ctx.cookies();
    const c = cookies.find((x) => x.name === 'kkisi_member');
    assert.ok(c && c.httpOnly && c.sameSite === 'Lax');
    assert.equal(await page.evaluate(() => document.cookie.includes('kkisi_member')), false);
  });
  await step('member pages are no-store with a strict CSP', async () => {
    const r = await page.request.get(`${B}/beranda`);
    assert.match(r.headers()['cache-control'], /no-store/);
    assert.match(r.headers()['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers()['x-frame-options'], 'DENY');
  });
  await step('bottom navigation reaches every tab with the right active item', async () => {
    await page.goto(`${B}/beranda`);
    for (const [label, path, title] of [['Favorit', '/favorit', 'Favorit'], ['Transaksi', '/transaksi', 'Transaksi'], ['Saldo', '/saldo', 'Saldo Kredit Toko'], ['Lainnya', '/lainnya', 'Lainnya'], ['Beranda', '/beranda', 'Beranda']]) {
      await page.locator('nav[aria-label="Navigasi utama"]').getByRole('link', { name: label }).click();
      await page.waitForURL(`**${path}`);
      assert.equal((await h1(page))?.trim(), title);
      assert.equal(await page.locator(`nav[aria-label="Navigasi utama"] a[href="${path}"]`).getAttribute('aria-current'), 'page');
    }
  });
  await step('home shows real member data, nested navigation and browser back/forward', async () => {
    await page.getByText('NIK 10234').waitFor();
    await page.getByText('Rp4.500.000').waitFor();
    await page.getByText('Angsuran ke-11 Pinjaman Regular').waitFor();
    if (SHOOT) await page.screenshot({ path: `${shots}e2e-beranda.png`, fullPage: true });
    await page.getByRole('link', { name: 'Lihat rincian' }).click();
    await page.waitForURL('**/simpanan');
    await page.getByRole('link', { name: 'Penarikan' }).click();
    await page.waitForURL('**/simpanan?tab=penarikan');
    await page.getByText('Simpanan Sukarela').first().waitFor();
    await page.goBack(); await page.waitForURL('**/beranda');
    await page.goForward(); await page.waitForURL('**/simpanan?tab=penarikan');
    await page.locator('a[aria-label="Kembali ke halaman sebelumnya"]').click();
    await page.waitForURL('**/beranda');
  });
  await step('refresh of a protected deep link keeps the screen', async () => {
    await page.goto(`${B}/pinjaman?tab=pengajuan`);
    await page.reload();
    assert.equal(await h1(page), 'Pinjaman');
    await page.getByText('Kasbon 1x Pot').first().waitFor();
  });
  await step('privacy toggle masks every amount', async () => {
    await page.goto(`${B}/beranda`);
    await page.getByRole('button', { name: 'Sembunyikan saldo' }).click();
    await page.waitForFunction(() => !document.body.innerText.includes('Rp4.500.000') && document.body.innerText.includes('••••••'));
    await page.getByRole('button', { name: 'Tampilkan saldo' }).click();
    await page.getByText('Rp4.500.000').first().waitFor();
  });
  await step('loan: schedule, application sheet, real simulation, honest submission', async () => {
    await page.goto(`${B}/pinjaman`);
    await page.getByText('10 dari 24').first().waitFor();
    if (SHOOT) await page.screenshot({ path: `${shots}e2e-pinjaman.png`, fullPage: true });
    await page.getByRole('link', { name: 'Ajukan pinjaman' }).click();
    await page.waitForURL('**/pinjaman/ajukan');
    await page.fill('#loan-amount', '25.000.000'); await page.fill('#loan-tenor', '24');
    await page.getByText('Rp1.291.666').waitFor();
    await page.click('button[type=submit][form=loan-form]');
    assert.ok(await page.locator('#purpose-error').textContent());
    await page.fill('#loan-purpose', 'Biaya pendidikan');
    await page.click('button[type=submit][form=loan-form]');
    await page.getByText('Belum ada yang dikirim.').waitFor();
    await page.getByRole('button', { name: 'Mengerti' }).click();
  });
  await step('deduction change validates the Simpanan Wajib rule', async () => {
    await page.goto(`${B}/potongan/ajukan`);
    await page.fill('#new-deduction', '50.000');
    await page.click('button[type=submit][form=deduction-form]');
    await page.getByText(/harus lebih besar dari Rp100\.000/).waitFor();
    await page.fill('#new-deduction', '150.000'); await page.check('#payroll-consent');
    await page.click('button[type=submit][form=deduction-form]');
    await page.getByText('Belum ada yang dikirim.').waitFor();
  });
  await step('catalog search, cart, server-priced checkout', async () => {
    await page.goto(`${B}/belanja`);
    await page.fill('#catalog-search', 'beras');
    await page.waitForURL('**/belanja?q=beras');
    await page.getByRole('button', { name: 'Tambah BERAS UJI 5 KG' }).click();
    await page.getByRole('button', { name: 'Tambah BERAS UJI 5 KG' }).click();
    await page.getByText('2 barang di keranjang').waitFor();
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
    await page.waitForURL('**/belanja/checkout');
    await page.getByText('sisa Rp4.500.000').waitFor();
    await page.getByText('Rp6.000', { exact: true }).first().waitFor();
    if (SHOOT) await page.screenshot({ path: `${shots}e2e-checkout.png`, fullPage: true });
    await page.getByRole('button', { name: 'Bayar dengan PIN' }).click();
    await page.getByText('Belum ada yang dikirim.').waitFor();
  });
  await step('transaction filters live in the URL', async () => {
    await page.goto(`${B}/transaksi`);
    await page.selectOption('#filter-jenis', 'PPOB');
    await page.waitForURL('**/transaksi?jenis=PPOB');
    await page.getByText('2 transaksi').waitFor();
    await page.reload();
    assert.equal(await page.inputValue('#filter-jenis'), 'PPOB');
    await page.locator('.transaction').first().click();
    await page.getByText('Rincian transaksi').waitFor();
  });
  await step('PPOB validates the number and never shows invented prices', async () => {
    await page.goto(`${B}/layanan/pulsa`);
    await page.fill('#service-account', '12345');
    await page.click('button[type=submit][form=service-form]');
    await page.getByText(/diawali 08 atau 62/).first().waitFor();
    await page.fill('#service-account', '0812-3456 7890');
    await page.click('button[type=submit][form=service-form]');
    await page.getByText('Belum ada yang dikirim.').waitFor();
    assert.equal(await page.getByText(/Rp\d/).count(), 0);
  });
  await step('Lainnya: signed member QR (P2) verifies for the session member, FAQ from the database', async () => {
    await page.goto(`${B}/lainnya?buka=qr`);
    await page.getByRole('dialog').getByRole('img', { name: 'QR ID anggota untuk dipindai kasir' }).waitFor();
    await page.getByRole('dialog').getByText(/Berlaku \d+ detik lagi/).waitFor();
    const qr = await (await page.request.get(`${B}/api/qr`)).json();
    assert.match(qr.image, /^data:image\/svg\+xml;base64,/);
    const { parseMemberQrVerifyKeys, verifyMemberQr } = await import('@koperasi/application/member-qr/token');
    const { syntheticQrKeys } = await import('../../integration/stack.mjs');
    const v = verifyMemberQr(parseMemberQrVerifyKeys(syntheticQrKeys().verify), qr.token);
    assert.equal(v.ok, true, 'the POS public key verifies the PWA token');
    assert.equal(v.claims.memberId, 9001, 'the QR names the session member only');
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await page.getByRole('button', { name: 'FAQ' }).click();
    await page.getByText('Pertanyaan uji: bagaimana cara melihat simpanan?').waitFor();
  });
  await step('IDOR: member A never sees member B data', async () => {
    for (const p of ['/pinjaman?tab=pengajuan', '/transaksi', '/simpanan']) {
      const html = await (await page.request.get(`${B}${p}`)).text();
      assert.ok(!html.includes('PJ-UJI-0002') && !html.includes('999.000') && !html.includes('7.770.000'), p);
    }
  });
  await step('P2 observability: X-Request-Id on every response, internal metrics with per-query p95 and cache stats', async () => {
    const res = await fetch(`${B}/masuk`);
    assert.match(res.headers.get('x-request-id') ?? '', /^[A-Za-z0-9._-]{8,64}$/);
    const kept = await fetch(`${B}/masuk`, { headers: { 'x-request-id': '0123456789abcdef0123456789abcdef' } });
    assert.equal(kept.headers.get('x-request-id'), '0123456789abcdef0123456789abcdef', 'the nginx id is propagated');
    const m = await (await fetch(`${B}/health?check=metrics`)).json();
    assert.ok(['ok', 'warn', 'critical'].includes(m.status));
    assert.deepEqual(m.checks, { readerDb: 'ok', authDb: 'ok' });
    assert.ok(m.queries.some((q) => q.label === 'select m_anggota' && q.count > 0 && Number.isFinite(q.p95)), 'reader latency is recorded per table');
    assert.ok(m.queries.every((q) => /^[a-z]+ [a-z_0-9]+$/.test(q.label)), 'labels never contain SQL text or values');
    assert.ok(m.caches.some((c) => c.name === 'loan-products'), 'cache statistics are reported');
  });
  await step('readiness health check and server-side mutation feature flag + CSRF enforcement', async () => {
    const ready = await (await fetch(`${B}/health?check=ready`)).json();
    assert.equal(ready.status, 'ok');
    assert.equal(ready.checks.readerDb, 'ok');
    assert.equal(ready.checks.authDb, 'ok');
    assert.equal(ready.features.enableLoanApplication, false);
    const cookie = (await ctx.cookies()).find((x) => x.name === 'kkisi_member');
    const csrfRes = await fetch(`${B}/api/transaksi/ajukan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: `kkisi_member=${cookie.value}` },
      body: JSON.stringify({ kind: 'loan_application', idempotencyKey: 'idem-e2e-test-0001' }),
    });
    assert.equal(csrfRes.status, 403);
    assert.equal((await csrfRes.json()).error, 'CSRF');
    const disabledRes = await fetch(`${B}/api/transaksi/ajukan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: B, cookie: `kkisi_member=${cookie.value}` },
      body: JSON.stringify({ kind: 'loan_application', idempotencyKey: 'idem-e2e-test-0001', productId: 1, amountRp: 5000000, months: 12, purpose: 'Uji' }),
    });
    assert.equal(disabledRes.status, 403);
    assert.equal((await disabledRes.json()).error, 'FEATURE_DISABLED');
  });
  await step('manifest and icons are installable', async () => {
    const m = await (await page.request.get(`${B}/manifest.webmanifest`)).json();
    assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/beranda?source=pwa'); assert.equal(m.scope, '/');
    for (const size of ['192x192', '512x512']) assert.ok(m.icons.some((i) => i.sizes === size && i.purpose === 'any') && m.icons.some((i) => i.sizes === size && i.purpose === 'maskable'));
    for (const i of m.icons) assert.equal((await page.request.get(`${B}${i.src}`)).status(), 200);
  });
  await step('service worker controls the page; caches hold public assets only', async () => {
    await page.goto(`${B}/beranda`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.goto(`${B}/simpanan`); await page.goto(`${B}/beranda`);
    const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))).flat());
    assert.ok(keys.includes('/offline.html'));
    const bad = keys.filter((k) => !/^\/(_next\/static\/|icons\/|images\/|offline\.html$|manifest\.webmanifest$)/.test(k));
    assert.deepEqual(bad, [], `unexpected cached URLs: ${bad.join(', ')}`);
  });
  await step('offline: navigation shows the offline screen, never stale member data', async () => {
    await ctx.setOffline(true);
    await page.goto(`${B}/pinjaman`).catch(() => {});
    await page.getByText('Kamu sedang offline').first().waitFor();
    assert.equal(await page.getByText('Rp1.240.000').count(), 0);
    if (SHOOT) await page.screenshot({ path: `${shots}e2e-offline.png` });
    await ctx.setOffline(false);
    // The offline page reloads itself when the connection returns: the same URL becomes the live screen again.
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Pinjaman', null, { timeout: 15000 });
  });
  await step('responsive: no horizontal overflow at 320/360/390/430 px', async () => {
    for (const [w, hgt] of [[320, 568], [360, 740], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const p of ['/beranda', '/simpanan', '/pinjaman', '/saldo', '/transaksi', '/lainnya', '/belanja', '/potongan', '/shu', '/favorit', '/pinjaman/ajukan', '/layanan/token']) {
        await page.goto(`${B}${p}`); await page.locator('h1').first().waitFor(); await page.waitForTimeout(150);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 0, `${p} overflows by ${over}px at ${w}px`);
        if (SHOOT) await page.screenshot({ path: `${shots}${w}-${p.slice(1).replaceAll('/', '_')}.png`, fullPage: false });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await step('every screen has one h1 and every button an accessible name', async () => {
    for (const p of ['/beranda', '/simpanan', '/pinjaman', '/saldo', '/transaksi', '/lainnya', '/belanja', '/potongan', '/shu', '/favorit', '/potongan/ajukan', '/layanan/pdam']) {
      await page.goto(`${B}${p}`); await page.locator('h1').first().waitFor(); await page.waitForTimeout(150);
      assert.equal(await page.locator('h1').count(), 1, `${p} h1 count`);
      const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter((el) => !(el.getAttribute('aria-label') || el.textContent?.trim())).length);
      assert.equal(unnamed, 0, `${p} has unnamed controls`);
    }
  });
  await step('logout revokes the session; protected screens redirect again', async () => {
    await page.goto(`${B}/lainnya`);
    await page.getByRole('button', { name: 'Keluar' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar', exact: true }).click();
    await page.waitForURL('**/masuk?reason=logged-out');
    await page.goto(`${B}/beranda`);
    assert.match(page.url(), /\/masuk/);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('kkisi:cart')), null, 'cart cleared on logout');
  });
  await step('inactive account is refused with a clear message', async () => {
    await page.goto(`${B}/masuk`);
    await page.fill('#identity', MEMBERS.inactive.nik); await page.fill('#password', TEST_PASSWORD); await page.click('button[type=submit]');
    await page.getByText('Akun ini tidak aktif.', { exact: false }).waitFor();
    // The refusal is a deliberate 403; it is the only expected failed request of the whole run.
    for (let i = consoleErrors.length - 1; i >= 0; i--) if (/403/.test(consoleErrors[i])) consoleErrors.splice(i, 1);
  });
  await step('no unexpected console errors', async () => { assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors.map((e) => e.slice(0, 200)))); });
  await ctx.close();
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} E2E steps passed`);
if (failed.length) process.exitCode = 1;
