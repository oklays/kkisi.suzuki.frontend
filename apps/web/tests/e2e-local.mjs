import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Gate A: end-to-end through a real browser with SYNTHETIC identities. The app under test reads kkisi_e2e_legacy (never the real
// legacy schema) and uses the real auth store with synthetic user ids 900001-900007 only. Mutations of the synthetic legacy data go
// through the kkisi_e2e_seed account (INSERT/DELETE only) and are always restored. Nothing here touches kkisi_staging.
const { chromium, request: pwRequest } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const output = process.env.POS_SCREENSHOTS || '/private/tmp/ksm-e2e';
const pw = JSON.parse(readFileSync(process.env.E2E_FIXTURE, 'utf8'));
await mkdir(output, { recursive: true });
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.match(process.env.E2E_SEED_URL ?? '', /\/kkisi_e2e_legacy(\?|$)/, 'the seed URL must point at the synthetic schema');
assert.match(process.env.E2E_READ_URL ?? '', /\/kkisi_e2e_legacy(\?|$)/);

const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
const allRequests = [];                                   // every request of every context: used for the "no checkout/stock" proof
const errors = [];
const json = { 'Content-Type': 'application/json' };
const browser = await chromium.launch({ headless: true });
const step = (name) => console.log(`- ${name}`);

async function session(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  context.on('request', (r) => allRequests.push({ method: r.method(), url: r.url() }));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|429|503)|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  return { context, page };
}
async function login(page, user, password) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Username').fill(user); await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
}
const loginOk = async (page, user, password) => { await login(page, user, password); await page.waitForURL(`${base}/pos`); await page.locator('.pos-status').waitFor(); };
const warp = (kind, uid) => { const r = spawnSync('bash', ['scripts/e2e-timewarp.sh', kind, String(uid)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const sessionStatus = async (context) => (await context.request.get(`${base}/api/auth/session`)).status();
const productsStatus = async (context) => (await context.request.get(`${base}/api/pos/products`)).status();
const seedSql = (sql, ...p) => seed.$executeRawUnsafe(sql, ...p);
const seedTx = (fn) => seed.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET SESSION sql_mode=''"); return fn(tx); });

try {
  step('A. anonymous access is refused everywhere and creates nothing');
  { const { context, page } = await session();
    const before = allRequests.length;
    await page.goto(`${base}/pos`); await page.waitForURL(`${base}/login`);
    for (const path of ['/api/pos/products', '/api/pos/register', '/api/auth/session']) assert.equal((await context.request.get(`${base}${path}`)).status(), 401, path);
    for (const [path, body] of [['/api/auth/company', { companyId: 9002 }], ['/api/auth/logout', {}]]) {
      const status = (await context.request.post(`${base}${path}`, { data: body, headers: { ...json, Origin: base } })).status();
      // company change needs a session; logout without one is an idempotent no-op that only clears the cookie
      assert.ok(path === '/api/auth/logout' ? status === 200 : status === 401 || status === 403, `${path} -> ${status}`);
    }
    assert.equal((await context.request.get(`${base}/api/pos/products?company_id=9002`)).status(), 401);
    assert.deepEqual((await context.cookies()).filter((c) => c.name.includes('sid')), [], 'no session cookie for an anonymous visitor');
    assert.ok(allRequests.slice(before).every((r) => r.method === 'GET' || /\/api\/auth\/(company|logout)$/.test(r.url)));
    await context.close(); }

  step('B. catalog for the session branch: exact money, rules, search, category, barcode, cart; no request other than GETs to the catalog');
  { const { context, page } = await session();
    await loginOk(page, 'synth_kasir1', pw.kasir1);
    const before = allRequests.length;
    await page.locator('.pos-product-card').first().waitFor();
    const names = await page.locator('.pos-product-card h3').allInnerTexts();
    assert.deepEqual(names.sort(), ['SYNTH ITEM BRANCH1 A', 'SYNTH ITEM BRANCH1 B', 'SYNTH ITEM BRANCH1 D NOPRICE'], 'browse lists in-stock items of THIS branch only');
    const card = (n) => page.locator('.pos-product-card', { hasText: n });
    assert.match(await card('BRANCH1 A').innerText(), /Rp\s?4\.000,10/);
    assert.match(await card('BRANCH1 B').innerText(), /Rp\s?6\.000/); assert.equal(await card('BRANCH1 B').locator('s.pos-list-price').count(), 1, 'discounted item shows the struck-through list price');
    assert.match(await card('D NOPRICE').innerText(), /Harga belum diatur/); assert.equal(await card('D NOPRICE').getByRole('button', { name: /Tambah/ }).isDisabled(), true);
    const search = page.getByRole('textbox', { name: /Cari produk/ });
    await search.fill('EMPTY'); await card('C EMPTY').waitFor(); assert.match(await card('C EMPTY').innerText(), /Stok habis/); assert.equal(await card('C EMPTY').getByRole('button', { name: /Tambah/ }).isDisabled(), true, 'a search shows out-of-stock items, but they cannot be added');
    await search.fill('BRANCH2'); await page.getByRole('heading', { name: 'Produk tidak ditemukan' }).waitFor();
    await page.getByRole('button', { name: 'Tampilkan semua produk' }).click(); await card('BRANCH1 A').waitFor();
    await page.getByRole('button', { name: 'SYNTH MAKANAN' }).click(); await page.waitForFunction(() => document.querySelectorAll('.pos-product-card').length === 1);
    assert.deepEqual(await page.locator('.pos-product-card h3').allInnerTexts(), ['SYNTH ITEM BRANCH1 A'], 'category filter is applied by the server, still in-stock only');
    await page.getByRole('button', { name: 'Semua', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('.pos-product-card').length === 3);
    await search.fill('SYNTH1A'); await search.press('Enter'); await page.locator('.pos-cart-item').first().waitFor();
    await card('BRANCH1 B').getByRole('button', { name: /Tambah/ }).click();
    assert.match(await page.locator('.pos-total').innerText(), /Rp\s?10\.000,10/, '4.000,10 + 6.000 is exactly 10.000,10 (integer sen, no float drift)');
    await search.fill('SYNTH2A'); await search.press('Enter');                                  // a barcode of ANOTHER branch
    await page.getByText('Barcode tidak ditemukan. Pilih produk dari hasil pencarian.', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await page.getByRole('button', { name: 'Proses Pembayaran', exact: true }).isDisabled(), true, 'checkout stays disabled');
    await page.screenshot({ path: `${output}/e2e-catalog.png` });
    const mine = allRequests.slice(before).filter((r) => !r.url.includes('/_next/'));
    const odd = mine.filter((r) => !(r.method === 'GET' && (/\/api\/pos\/(products|register)/.test(r.url) || /\/pos(\?|$)/.test(r.url) || /\/login(\?|$)/.test(r.url) || /\.(png|svg|ico|css|js|woff2?)(\?|$)/.test(r.url) || /^\/(pos|login)?$/.test(new URL(r.url).pathname) && new URL(r.url).search.startsWith('?_rsc='))));   // Next.js link prefetch of a public page
    assert.deepEqual(odd.map((r) => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`), [], 'while browsing the catalog and filling the cart only GETs to the catalog/register/static files were made');
    await context.close(); }

  step('C. idle expiry (2 h) and absolute expiry (12 h) on real sessions (synthetic deadlines moved into the past)');
  { const { context, page } = await session();
    await loginOk(page, 'synth_kasir1', pw.kasir1); assert.equal(await sessionStatus(context), 200);
    warp('idle', 900004);
    assert.equal(await sessionStatus(context), 401, 'idle deadline passed'); assert.equal(await productsStatus(context), 401);
    await page.goto(`${base}/pos`); await page.waitForURL(`${base}/login`);
    await loginOk(page, 'synth_kasir1', pw.kasir1); assert.equal(await sessionStatus(context), 200, 'a fresh login works again');
    await page.getByRole('textbox', { name: /Cari produk/ }).waitFor();
    warp('absolute', 900004);                                            // idle deadline still in the future, absolute one is over
    await page.getByRole('textbox', { name: /Cari produk/ }).fill('SYNTH');
    await page.waitForURL(`${base}/login`);                              // the POS notices the ended session and leaves
    assert.equal(await sessionStatus(context), 401);
    await context.close(); }

  step('D. throttle: unknown and known usernames behave identically; 10 failures lock; the right password is refused; targeted unlock');
  { const { context, page } = await session();
    const attempt = (u, p) => context.request.post(`${base}/api/auth/login`, { data: { username: u, password: p }, headers: { ...json, Origin: base } });
    const bodies = new Set();
    for (let i = 0; i < 10; i++) { const a = await attempt('synth_ghost', 'nope' + i), b = await attempt('synth_ghost2', 'nope' + i); assert.equal(a.status(), 401); assert.equal(b.status(), 401); bodies.add(await a.text()); bodies.add(await b.text()); }
    const inactive = await attempt('synth_kepala', pw.kepala); assert.equal(inactive.status(), 401, 'a user with an inactive role is refused generically, even with the right password'); bodies.add(await inactive.text());
    const wrong = await attempt('synth_kasir2', 'wrong-password'); assert.equal(wrong.status(), 401); bodies.add(await wrong.text());
    assert.equal(bodies.size, 1, 'unknown user, inactive-role user and wrong password are indistinguishable');
    for (const u of ['synth_ghost', 'synth_ghost2']) { const r = await attempt(u, 'x'); assert.equal(r.status(), 429); assert.ok(Number(r.headers()['retry-after']) > 0); assert.deepEqual(await r.json(), { error: 'TOO_MANY_ATTEMPTS' }); }
    await login(page, 'synth_ghost', 'whatever'); await page.locator('.login-error').waitFor(); assert.match(await page.locator('.login-error').innerText(), /Terlalu banyak percobaan/);
    assert.equal((await attempt('synth_kasir2', pw.kasir2)).status(), 200, 'other usernames are not affected');
    const unlock = spawnSync('node', ['--experimental-strip-types', '--env-file=.env.local', 'scripts/auth-unlock.ts', '--username', 'synth_ghost'], { encoding: 'utf8' });
    assert.match(unlock.stdout, /"deleted":1/, unlock.stderr.slice(0, 200));
    assert.equal((await attempt('synth_ghost', 'nope')).status(), 401, 'unlocked: counted again from zero');
    assert.equal((await attempt('synth_ghost2', 'x')).status(), 429, 'the other locked username stays locked (the unlock was targeted)');
    await context.close(); }

  step('E. CSRF from a real cross-site page: the victim session survives');
  { const { context, page } = await session();
    await loginOk(page, 'synth_koperasi', pw.koperasi);
    const attack = `<html><body><form id=f method=post action="${base}/api/auth/logout"><input name=x value=1></form>
      <form id=g method=post enctype=text/plain action="${base}/api/auth/company"><input name='{"companyId":9003,"pad":"' value='"}'></form>
      <script>window.result=[];
      fetch("${base}/api/auth/logout",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>window.result.push("fetch:"+r.status),e=>window.result.push("fetch:blocked"));
      </script></body></html>`;
    await context.route('http://localhost:3199/**', (route) => route.fulfill({ contentType: 'text/html', body: attack }));
    const evil = await context.newPage(); await evil.goto('http://localhost:3199/attack.html'); await evil.waitForTimeout(800);
    assert.deepEqual(await evil.evaluate(() => window.result), ['fetch:blocked'], 'cross-origin JSON fetch is blocked by the browser (no CORS)');
    for (const form of ['#f', '#g']) { await evil.goto('http://localhost:3199/attack.html'); await Promise.all([evil.waitForNavigation({ waitUntil: 'commit' }).catch(() => {}), evil.evaluate((s) => document.querySelector(s).submit(), form)]); await evil.waitForTimeout(300); }
    assert.equal(await sessionStatus(context), 200, 'the victim session is still alive after the forged logout/company attempts');
    const me = await (await context.request.get(`${base}/api/auth/session`)).json(); assert.equal(me.company.name, 'SYNTH BRANCH 1', 'the branch was not changed by the forged request');
    assert.equal((await context.request.get(`${base}/api/auth/company`)).status(), 405, 'state-changing endpoints do not answer GET');
    for (const [label, headers] of [['foreign origin', { ...json, Origin: 'http://localhost:3199', 'X-CSRF-Token': me.csrfToken }], ['no token', { ...json, Origin: base }], ['form body', { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-CSRF-Token': me.csrfToken }]])
      assert.equal((await context.request.post(`${base}/api/auth/company`, { data: label === 'form body' ? 'companyId=9002' : { companyId: 9002 }, headers })).status(), 403, label);
    await evil.close(); await context.close(); }

  step('F. RBAC and legacy changes take effect on the very next request (synthetic legacy rows removed and restored)');
  { const { context, page } = await session();
    await loginOk(page, 'synth_kasir1', pw.kasir1);
    assert.equal(await productsStatus(context), 200);
    await seedSql("DELETE FROM db_permissions WHERE role_id = 4 AND permissions = 'sales_add'");
    try {
      assert.equal(await productsStatus(context), 403, 'permission removed');
      await page.goto(`${base}/pos`); await page.getByText('Akses ditolak').waitFor();
      assert.equal((await context.request.get(`${base}/api/pos/register`)).status(), 403);
    } finally { await seedSql("INSERT INTO db_permissions (role_id, permissions) VALUES (4, 'sales_add')"); }
    assert.equal(await productsStatus(context), 200, 'permission back');
    // no bypass for the administrator: role 1 without its permission row is refused like anybody else
    const admin = await session(); const okAdmin = await admin.context.request.post(`${base}/api/auth/login`, { data: { username: 'synth_admin', password: pw.admin }, headers: { ...json, Origin: base } });
    if (okAdmin.status() === 200) {
      await seedSql("DELETE FROM db_permissions WHERE role_id = 1 AND permissions = 'sales_add'");
      try { assert.equal(await productsStatus(admin.context), 403, 'the administrator has no bypass'); } finally { await seedSql("INSERT INTO db_permissions (role_id, permissions) VALUES (1, 'sales_add')"); }
    } else assert.equal(okAdmin.status(), 429, 'admin is locked by the earlier lockout scenario in pos-browser: acceptable');
    await admin.context.close();
    // branch disabled
    const branch = (await seed.$queryRawUnsafe('SELECT id, company_name, status, sales_init FROM db_company WHERE id = 9001'))[0];
    await seedSql('DELETE FROM db_company WHERE id = 9001');
    try { assert.equal(await sessionStatus(context), 401, 'branch gone -> session refused'); } finally { await seedTx((tx) => tx.$executeRawUnsafe('INSERT INTO db_company (id, company_name, status, sales_init) VALUES (?,?,?,?)', 9001, branch.company_name, Number(branch.status), branch.sales_init)); }
    // user removed, then back (same hash) -> valid again; then a NEW password -> dead for good
    const u = (await seed.$queryRawUnsafe('SELECT id, username, nik_account, role_id, company_id, akses_lokasi, fullname, password, status FROM db_users WHERE id = 900004'))[0];
    const put = (hash) => seedTx((tx) => tx.$executeRawUnsafe('INSERT INTO db_users (id, username, nik_account, role_id, company_id, akses_lokasi, fullname, password, status) VALUES (?,?,?,?,?,?,?,?,?)', 900004, u.username, u.nik_account, u.role_id, u.company_id, u.akses_lokasi, u.fullname, hash, Number(u.status)));
    const fresh = await session(); await loginOk(fresh.page, 'synth_kasir1', pw.kasir1);
    await seedSql('DELETE FROM db_users WHERE id = 900004');
    try { assert.equal(await sessionStatus(fresh.context), 401, 'user disabled/removed'); assert.equal(await sessionStatus(context), 401); } finally { await put(u.password); }
    const again = await session(); await loginOk(again.page, 'synth_kasir1', pw.kasir1);
    await seedSql('DELETE FROM db_users WHERE id = 900004'); await put('$2y$' + bcrypt.hashSync('a-new-password-1', 4).slice(4));
    try { assert.equal(await sessionStatus(again.context), 401, 'password changed -> every session of the user is dead'); }
    finally { await seedSql('DELETE FROM db_users WHERE id = 900004'); await put(u.password); }
    assert.equal(await sessionStatus(again.context), 401, 'and stays dead after the password is set back');
    await loginOk(again.page, 'synth_kasir1', pw.kasir1); assert.equal(await sessionStatus(again.context), 200, 'a new login works with the restored password');
    await Promise.all([fresh.context.close(), again.context.close(), context.close()]); }

  step('G. database failures: auth store unreachable / legacy credentials wrong -> 503 everywhere, never access');
  async function withApp(extra, run) {
    const p = 3101 + Math.floor(Math.random() * 50); const origin = `http://127.0.0.1:${p}`;
    const env = { ...process.env, DATABASE_URL: process.env.E2E_READ_URL, APP_ORIGIN: origin, ...extra };
    const child = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(p)], { env, stdio: 'ignore' });
    try {
      for (let i = 0; i < 60; i++) { try { if ((await fetch(`${origin}/login`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
      await run(origin);
    } finally { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); }
  }
  { const good = await session(); await loginOk(good.page, 'synth_kasir2', pw.kasir2);
    const cookie = (await good.context.cookies()).find((c) => c.name === 'kkisi_sid').value;
    const check = async (origin, label) => {
      const ctx = await pwRequest.newContext({ extraHTTPHeaders: { cookie: `kkisi_sid=${cookie}` } });
      for (const path of ['/api/auth/session', '/api/pos/products', '/api/pos/register']) { const r = await ctx.get(`${origin}${path}`); assert.equal(r.status(), 503, `${label} ${path}`); assert.deepEqual(await r.json(), { error: 'AUTH_UNAVAILABLE' }, 'no detail in the error'); }
      const l = await ctx.post(`${origin}/api/auth/login`, { data: { username: 'synth_kasir1', password: pw.kasir1 }, headers: { ...json, Origin: origin } }); assert.equal(l.status(), 503, `${label} login`);
      const page = await (await browser.newContext({ extraHTTPHeaders: { cookie: `kkisi_sid=${cookie}` } })).newPage();
      await page.goto(`${origin}/pos`); await page.getByText('Layanan tidak tersedia').waitFor();
      assert.equal(await page.locator('.pos-product-card').count(), 0, 'no POS content while a database is down');
      const html = await page.content(); assert.doesNotMatch(html, /mysql:|kkisi_auth|kkisi_e2e|ECONN|prisma|127\.0\.0\.1:3307/i, 'no connection detail in the page');
      await page.goto(`${origin}/login`); await page.getByLabel('Username').fill('synth_kasir1'); await page.getByLabel('Password').fill(pw.kasir1); await page.getByRole('button', { name: 'Masuk', exact: true }).click();
      await page.locator('.login-error').waitFor(); assert.match(await page.locator('.login-error').innerText(), /tidak tersedia/);
      await page.context().close(); await ctx.dispose();
    };
    const authDsn = new URL(process.env.DATABASE_URL_AUTH); const deadAuth = `mysql://${authDsn.username}:x@127.0.0.1:1${authDsn.pathname}?connect_timeout=2&pool_timeout=2&connection_limit=2`;
    await withApp({ DATABASE_URL_AUTH: deadAuth }, (origin) => check(origin, 'auth store down'));
    const readDsn = new URL(process.env.E2E_READ_URL); const badLegacy = `mysql://${readDsn.username}:wrong-password@${readDsn.host}${readDsn.pathname}?connection_limit=2`;
    await withApp({ DATABASE_URL: badLegacy }, (origin) => check(origin, 'legacy DB unreachable'));
    assert.equal(await sessionStatus(good.context), 200, 'the healthy instance is unaffected');
    await good.context.close(); }

  step('H. proof: no checkout / stock / sales request was ever made; every state-changing request went to /api/auth/*');
  { const own = allRequests.filter((r) => r.url.startsWith(base));
    assert.ok(own.length > 100, `${own.length} requests observed`);
    assert.deepEqual(own.filter((r) => /checkout|stock|sales|payment|cart|invoice|receipt|register\/open|register\/close/i.test(new URL(r.url).pathname)), [], 'no checkout, stock, sales, payment, cart or register-write request exists');
    const writes = own.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' && r.method !== 'OPTIONS');
    assert.ok(writes.length > 0 && writes.every((r) => r.method === 'POST' && /\/api\/auth\/(login|logout|company)$/.test(new URL(r.url).pathname)), JSON.stringify([...new Set(writes.map((r) => `${r.method} ${new URL(r.url).pathname}`))]));
    const paths = [...new Set(own.map((r) => new URL(r.url).pathname).filter((p) => !p.startsWith('/_next')))].sort();
    console.log('  distinct app paths requested:', JSON.stringify(paths)); }

  assert.deepEqual(errors, [], 'no unexpected browser errors');
  console.log(JSON.stringify({ result: 'PASS', requests: allRequests.length }));
} finally { await seed.$disconnect(); await browser.close(); }
