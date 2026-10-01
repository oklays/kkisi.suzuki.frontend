import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

// Optional browser verification of the AUTHENTICATED POS. It needs SYNTHETIC identities on a database that is NOT the real
// staging: POS_FIXTURE = JSON {admin,koperasi,kepala,kasir1,kasir2,off,nobranch: <password>} written by the seeding script;
// users are synth_<name>; branches "SYNTH BRANCH n" with items "SYNTH ITEM BRANCHn ...". Point PLAYWRIGHT_MODULE at Playwright.
const { chromium, request: playwrightRequest } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const output = process.env.POS_SCREENSHOTS || '/private/tmp/ksm-pos-verification';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
await mkdir(output, { recursive: true });
assert.ok(new URL(base).hostname === '127.0.0.1', 'the app under test must be on loopback');

const browser = await chromium.launch({ headless: true });
const errors = [];
const secrets = [];
async function newSession() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|429|503)|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', async (r) => { if (r.url().includes('/api/')) { const t = await r.text().catch(() => ''); if (/\$2[aby]\$|mysql:|kkisi_auth|kkisi_read|password":/i.test(t)) secrets.push(r.url()); } });
  return { context, page };
}
async function login(page, user, password) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Username').fill(user); await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
}
const cards = (page) => page.locator('.pos-product-card h3').allInnerTexts();

try {
  console.log('1. anonymous: /pos and the API refuse; the login page renders');
  { const { context, page } = await newSession();
    await page.goto(`${base}/pos`); await page.waitForURL(`${base}/login`);
    assert.equal((await context.request.get(`${base}/api/pos/products`)).status(), 401);
    assert.equal((await context.request.get(`${base}/api/pos/register`)).status(), 401);
    assert.equal((await context.request.get(`${base}/api/auth/session`)).status(), 401);
    await page.getByRole('heading', { name: 'Masuk ke Akun Anda' }).waitFor();
    await page.screenshot({ path: `${output}/login-1440.png` });
    await login(page, 'synth_kasir1', 'wrong-password');
    await page.locator('.login-error').waitFor(); assert.equal(await page.locator('.login-error').innerText(), 'Username atau password salah.');
    await login(page, 'synth_off', pw.off); await page.locator('.login-error').waitFor();
    assert.equal(await page.locator('.login-error').innerText(), 'Username atau password salah.', 'a disabled user gets the same message');
    await login(page, 'synth_kepala', pw.kepala); await page.locator('.login-error').waitFor();
    assert.equal(await page.locator('.login-error').innerText(), 'Username atau password salah.', 'a user with an inactive role gets the same message');
    assert.ok(page.url().endsWith('/login'));
    await context.close(); }

  console.log('2. cashier (role 4): own branch only, cookie flags, IDOR, CSRF, persistent logout');
  let replay;
  { const { context, page } = await newSession();
    await login(page, 'synth_kasir1', pw.kasir1); await page.waitForURL(`${base}/pos`);
    await page.getByRole('heading', { name: 'POS / Kasir', exact: true }).waitFor();
    assert.match(await page.locator('.pos-status').innerText(), /SYNTH BRANCH 1/); assert.match(await page.locator('.pos-status').innerText(), /KRS-S-1/);
    assert.equal(await page.locator('.pos-branch-select').count(), 0, 'role 4 has no branch selector');
    await page.locator('.pos-product-card').first().waitFor();
    const names = await cards(page); assert.ok(names.length > 0 && names.every((n) => n.includes('BRANCH1')), names.join('|'));
    assert.match(await page.locator('.pos-product-card', { hasText: 'BRANCH1 A' }).innerText(), /Rp\s?4\.000,10/, 'fractional price is exact');
    assert.match(await page.locator('.pos-product-card', { hasText: 'BRANCH1 B' }).innerText(), /Rp\s?6\.000/, 'sold price = list price minus nominal discount');
    await page.screenshot({ path: `${output}/pos-cashier-1440.png` });
    const cookie = (await context.cookies()).find((c) => c.name === 'kkisi_sid');
    assert.ok(cookie && cookie.httpOnly && cookie.sameSite === 'Lax' && !cookie.secure && cookie.path === '/', JSON.stringify({ ...cookie, value: '<hidden>' }));
    assert.equal(await page.evaluate(() => document.cookie.includes('kkisi_sid')), false, 'JavaScript cannot read the session cookie');
    replay = cookie.value;
    // branch scope: client-supplied company is ignored, both for search and barcode
    const foreign = await (await context.request.get(`${base}/api/pos/products?company_id=2&companyId=2&q=BRANCH2`)).json(); assert.deepEqual(foreign.products, []);
    assert.deepEqual((await (await context.request.get(`${base}/api/pos/products?barcode=SYNTH2A&company_id=2`)).json()).products, []);
    assert.equal((await (await context.request.get(`${base}/api/pos/products?barcode=SYNTH1A`)).json()).products.length, 1);
    await page.getByRole('textbox', { name: /Cari produk/ }).fill('BRANCH2'); await page.getByRole('heading', { name: 'Produk tidak ditemukan' }).waitFor();
    // CSRF: forged origin / missing token / form body are refused; a role-4 branch change is forbidden even with a valid token
    const token = (await (await context.request.get(`${base}/api/auth/session`)).json()).csrfToken;
    const json = { 'Content-Type': 'application/json' };
    assert.equal((await context.request.post(`${base}/api/auth/company`, { data: { companyId: 2 }, headers: { ...json, Origin: 'http://evil.test', 'X-CSRF-Token': token } })).status(), 403);
    assert.equal((await context.request.post(`${base}/api/auth/company`, { data: { companyId: 2 }, headers: { ...json, Origin: base } })).status(), 403, 'no token');
    assert.equal((await context.request.post(`${base}/api/auth/company`, { data: { companyId: 2 }, headers: { ...json, Origin: base, 'X-CSRF-Token': token } })).status(), 403, 'role 4 cannot switch');
    assert.equal((await context.request.post(`${base}/api/auth/logout`, { data: {}, headers: { ...json, Origin: base } })).status(), 403, 'logout needs the token too');
    // logout through the UI, then the old id is dead everywhere (persistent revocation)
    await page.getByRole('button', { name: 'Keluar', exact: true }).click(); await page.waitForURL(`${base}/login`);
    await page.goto(`${base}/pos`); await page.waitForURL(`${base}/login`);
    const stranger = await playwrightRequest.newContext({ extraHTTPHeaders: { cookie: `kkisi_sid=${replay}` } });
    assert.equal((await stranger.get(`${base}/api/auth/session`)).status(), 401, 'the logged-out session id is refused');
    assert.equal((await stranger.get(`${base}/api/pos/products`)).status(), 401); await stranger.dispose();
    await context.close(); }

  console.log('3. cashier of branch 2 sees only branch 2 and a stale register warning');
  { const { context, page } = await newSession();
    await login(page, 'synth_kasir2', pw.kasir2); await page.waitForURL(`${base}/pos`); await page.locator('.pos-product-card').first().waitFor();
    assert.ok((await cards(page)).every((n) => n.includes('BRANCH2')));
    assert.match(await page.locator('.pos-status').innerText(), /SYNTH BRANCH 2/); assert.match(await page.locator('.pos-status').innerText(), /belum ditutup/);
    await context.close(); }

  console.log('4. role 2 chooses a branch; refused while a register is open in another branch');
  { const { context, page } = await newSession();
    await login(page, 'synth_koperasi', pw.koperasi); await page.waitForURL(`${base}/pos`); await page.locator('.pos-product-card').first().waitFor();
    assert.ok((await cards(page)).every((n) => n.includes('BRANCH1')));
    const select = page.locator('.pos-branch-select select');
    assert.deepEqual(await select.locator('option').allInnerTexts(), ['SYNTH BRANCH 1', 'SYNTH BRANCH 2', 'SYNTH BRANCH 3']);
    await select.selectOption({ label: 'SYNTH BRANCH 3' });
    await page.getByText('Tutup sesi kasir yang terbuka di cabang lain lebih dulu.').waitFor();
    assert.equal(await select.inputValue(), await select.inputValue()); assert.match(await page.locator('.pos-status').innerText(), /SYNTH BRANCH 1/);
    await select.selectOption({ label: 'SYNTH BRANCH 2' });
    await page.waitForFunction(() => document.querySelector('.pos-status')?.textContent?.includes('SYNTH BRANCH 2'));
    await page.locator('.pos-product-card').first().waitFor();
    assert.ok((await cards(page)).every((n) => n.includes('BRANCH2')), 'the catalog follows the session branch after the switch');
    assert.match(await page.locator('.pos-status').innerText(), /KRS-S-2/);
    await page.screenshot({ path: `${output}/pos-admin-1440.png` });
    await context.close(); }

  console.log('5. lockout: 10 wrong passwords lock the username; the right password is then refused with a generic message');
  { const { context, page } = await newSession();
    for (let i = 0; i < 10; i++) { const r = await context.request.post(`${base}/api/auth/login`, { data: { username: 'synth_admin', password: 'wrong' + i }, headers: { 'Content-Type': 'application/json', Origin: base } }); assert.equal(r.status(), 401); }
    await login(page, 'synth_admin', pw.admin); await page.locator('.login-error').waitFor();
    assert.match(await page.locator('.login-error').innerText(), /Terlalu banyak percobaan/);
    assert.ok(page.url().endsWith('/login'));
    await context.close(); }

  console.log('6. layout at 5 widths on the logged-in POS and the login page');
  { const { context, page } = await newSession();
    await login(page, 'synth_kasir1', pw.kasir1); await page.waitForURL(`${base}/pos`); await page.locator('.pos-product-card').first().waitFor();
    for (const [width, height] of [[1600, 900], [1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const doc = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(doc <= width, `overflow at ${width}: ${doc}`);
      await page.screenshot({ path: `${output}/pos-${width}.png`, fullPage: width < 900 });
    }
    await context.close(); }

  assert.deepEqual(errors, [], 'no browser errors');
  assert.deepEqual(secrets, [], 'no hash/DSN/credential text in any API response');
  console.log(JSON.stringify({ result: 'PASS', screenshots: output }));
} finally { await browser.close(); }
