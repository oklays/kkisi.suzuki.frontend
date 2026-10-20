import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

// KOSIPA navigation integration — real-browser check of the RENDERED sidebar on the running DEV LOCAL server (synthetic data only).
// It exercises what the owner does: sign in, find KOSIPA in the sidebar, expand it, open every destination, check active state, breadcrumb,
// refresh, mobile drawer, CSV export authorisation, other personas and the identity-link lifecycle. Machine evidence only; never owner acceptance.
//   node tests/console-kosipa-nav-browser.mjs        (DEV LOCAL up on :3200 or :3201; default state: synth_admin NOT linked to KOSIPA)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEV_LOCAL_URL || 'http://127.0.0.1:3200';
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.ok(['3200', '3201'].includes(new URL(base).port), 'DEV LOCAL only');
const pw = JSON.parse(readFileSync(new URL('../.env.dev-local-accounts.json', import.meta.url), 'utf8'));
const out = process.env.KOSIPA_NAV_OUT || '/private/tmp/kkisi-kosipa-nav'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = []; const results = {};
const secrets = Object.values(pw);

async function step(id, fn) {
  try { const note = await fn(); results[id] = { status: 'PASS', note: note ?? '' }; }
  catch (e) { results[id] = { status: 'FAIL', note: String(e.message).split('\n')[0].slice(0, 300) }; }
  console.log(`RESULT ${id} ${results[id].status}${results[id].note ? ' — ' + results[id].note : ''}`);
}
async function open(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${user}: ${e.message}`));
  page.on('request', (r) => { const u = r.url(); if (secrets.some((s) => u.includes(s)) || /[?&](username|password)=/i.test(u)) errors.push(`CREDENTIAL IN URL (${user})`); });
  await page.goto(`${base}/login`); await page.waitForLoadState('networkidle');
  await page.getByLabel('Username').fill(`synth_${user}`); await page.getByLabel('Password').fill(pw[user]);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20000 }); await page.waitForLoadState('load');
  return { context, page };
}
const nav = (page) => page.locator('#console-nav');
const hrefs = (page) => nav(page).locator('nav a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
const waitMain = async (page) => { await page.waitForFunction(() => { const m = document.querySelector('main'); return m && m.innerText.trim() !== '' && !/^Memuat/.test(m.innerText.trim()); }, null, { timeout: 20000 }); return page.locator('main').innerText(); };
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const KOSIPA_TOP = ['/console/kosipa', '/console/kosipa/anggota', '/console/kosipa/simpanan', '/console/kosipa/pinjaman', '/console/kosipa/payroll', '/console/kosipa/laporan'];
const REPORTS = ['/console/kosipa/laporan/keanggotaan', '/console/kosipa/laporan/simpanan', '/console/kosipa/laporan/pinjaman', '/console/kosipa/laporan/payroll', '/console/kosipa/laporan/kualitas-data'];
const DENIED = /Akses ditolak|belum ditautkan|tidak memiliki akses|tidak tersedia|tidak ditemukan/i;

// ---------------------------------------------------------------------------------------------------------------- authorised KOSIPA user
await step('N1 sidebar shows a KOSIPA group (synth_koperasi)', async () => {
  const { context, page } = await open('koperasi'); assert.equal(new URL(page.url()).pathname, '/console');
  await nav(page).waitFor({ state: 'visible' });
  assert.ok(await nav(page).locator('.console-nav-label', { hasText: 'KOSIPA' }).isVisible(), 'KOSIPA group label');
  for (const h of KOSIPA_TOP) assert.ok(await nav(page).locator(`a[href="${h}"]`).isVisible(), `${h} visible in the sidebar`);
  const toggle = nav(page).getByRole('button', { name: 'Submenu Laporan' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'the report submenu starts collapsed away from reports');
  for (const h of REPORTS) assert.ok(!(await nav(page).locator(`a[href="${h}"]`).isVisible()), `${h} hidden while collapsed`);
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  for (const h of REPORTS) assert.ok(await nav(page).locator(`a[href="${h}"]`).isVisible(), `${h} visible once expanded`);
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'collapses again');
  await toggle.click(); await shot(page, 'N1-sidebar-koperasi-expanded'); await context.close();
  return 'KOSIPA group + 6 top-level entries; Laporan expands/collapses with 5 report entries';
});

await step('N2 every KOSIPA destination opens from the sidebar with one active item and a KOSIPA breadcrumb', async () => {
  const { context, page } = await open('koperasi'); let n = 0;
  for (const href of [...KOSIPA_TOP, ...REPORTS]) {
    if (REPORTS.includes(href) && !(await nav(page).locator(`a[href="${href}"]`).isVisible())) await nav(page).getByRole('button', { name: 'Submenu Laporan' }).click();
    await nav(page).locator(`a[href="${href}"]`).click(); await page.waitForURL((u) => u.pathname === href, { timeout: 20000 });
    const body = await waitMain(page);
    assert.ok(!DENIED.test(await page.locator('main h1').first().innerText()), `${href}: the page shows an access/availability notice instead of its content`);
    const current = await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
    assert.deepEqual(current, [href], `${href}: exactly one active item`);
    const crumb = await page.locator('.console-breadcrumb').innerText(); assert.match(crumb, /KOSIPA/, `${href}: breadcrumb`);
    if (REPORTS.includes(href)) assert.match(crumb, /Laporan/, `${href}: report breadcrumb has the Laporan level`);
    assert.ok(body.length > 40); n += 1;
    if (['/console/kosipa', '/console/kosipa/payroll', '/console/kosipa/laporan/payroll'].includes(href)) await shot(page, `N2-${href.replace(/\W+/g, '-').slice(1)}`);
  }
  await context.close(); return `${n} destinations`;
});

await step('N3 refresh and direct navigation keep the authorised menu, active state and the open submenu', async () => {
  const { context, page } = await open('koperasi');
  await page.goto(`${base}/console/kosipa/laporan/pinjaman`); await waitMain(page);
  assert.equal(await nav(page).getByRole('button', { name: 'Submenu Laporan' }).getAttribute('aria-expanded'), 'true', 'submenu open on a report page');
  await page.reload(); await waitMain(page);
  assert.deepEqual(await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => new URL(a.href).pathname)), ['/console/kosipa/laporan/pinjaman']);
  assert.ok(await nav(page).locator('a[href="/console/kosipa/payroll"]').isVisible());
  await page.goto(`${base}/console/kosipa/payroll`); await waitMain(page);
  assert.equal(await nav(page).getByRole('button', { name: 'Submenu Laporan' }).getAttribute('aria-expanded'), 'false', 'submenu closed away from reports');
  await context.close(); return 'reload + direct URL';
});

await step('N4 detail pages: member, savings, loan, payroll batch and reconciliation keep the right menu and a "Detail" breadcrumb', async () => {
  const { context, page } = await open('koperasi'); const seen = [];
  await page.goto(`${base}/console/kosipa/anggota?q=S9001`); await waitMain(page);
  await page.locator('main table a').first().click(); await page.waitForURL(/\/console\/kosipa\/anggota\/\d+/); await waitMain(page);
  assert.deepEqual(await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => a.textContent.trim())), ['Keanggotaan']);
  assert.match(await page.locator('.console-breadcrumb').innerText(), /Keanggotaan[\s\S]*Detail/); seen.push('Anggota 360'); await shot(page, 'N4-anggota-360');
  const toSavings = page.locator('main a[href^="/console/kosipa/simpanan/"]').first(); assert.ok(await toSavings.count(), 'Anggota 360 links to the savings ledger');
  await toSavings.click(); await page.waitForURL(/\/console\/kosipa\/simpanan\/\d+/); await waitMain(page); seen.push('buku simpanan');
  assert.deepEqual(await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => a.textContent.trim())), ['Simpanan']);
  await page.goto(`${base}/console/kosipa/pinjaman`); await waitMain(page);
  await page.locator('main table a[href^="/console/kosipa/pinjaman/"]').first().click(); await page.waitForURL(/\/console\/kosipa\/pinjaman\/.+/); await waitMain(page); seen.push('detail pinjaman');
  assert.deepEqual(await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => a.textContent.trim())), ['Pinjaman']);
  await page.goto(`${base}/console/kosipa/payroll`); await waitMain(page);
  await page.locator('main table a[href^="/console/kosipa/payroll/"]').first().click(); await page.waitForURL(/\/console\/kosipa\/payroll\/[^/]+$/); await waitMain(page); seen.push('batch payroll');
  const recon = page.locator('main a[href$="/rekonsiliasi"]').first(); assert.ok(await recon.count(), 'the payroll batch links to the TOKO credit reconciliation');
  await recon.click(); await page.waitForURL(/\/rekonsiliasi$/); const text = await waitMain(page); seen.push('rekonsiliasi'); assert.ok(/ditinjau|peninjauan|review/i.test(text), 'reconciliation is labelled review-only');
  assert.deepEqual(await nav(page).locator('[aria-current="page"]').evaluateAll((as) => as.map((a) => a.textContent.trim())), ['Payroll']);
  await shot(page, 'N4-rekonsiliasi'); await context.close(); return seen.join(', ');
});

await step('N5 no dead links: every sidebar link and dashboard shortcut answers 200 inside the app (no redirect to /login, no loop)', async () => {
  const { context, page } = await open('koperasi'); await page.goto(`${base}/console`); await waitMain(page);
  const all = new Set([...(await hrefs(page)), ...(await page.locator('main a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname)))]);
  let checked = 0;
  for (const path of all) {
    const res = await context.request.get(`${base}${path}`, { maxRedirects: 0 }); assert.equal(res.status(), 200, `${path} -> ${res.status()}`); checked += 1;
  }
  await context.close(); return `${checked} distinct links`;
});

await step('N6 mobile drawer lists KOSIPA and navigates (375 px)', async () => {
  const { context, page } = await open('koperasi', { width: 375, height: 800 }); await page.goto(`${base}/console`); await waitMain(page);
  const toggle = page.getByRole('button', { name: 'Buka menu' }); await toggle.click(); await nav(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => { const r = document.getElementById('console-nav').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  assert.ok(await nav(page).locator('.console-nav-label', { hasText: 'KOSIPA' }).isVisible());
  await nav(page).getByRole('button', { name: 'Submenu Laporan' }).click(); await nav(page).locator('a[href="/console/kosipa/laporan/kualitas-data"]').waitFor({ state: 'visible' });
  await shot(page, 'N6-drawer-375-kosipa');
  await nav(page).locator('a[href="/console/kosipa/laporan/kualitas-data"]').click(); await page.waitForURL((u) => u.pathname === '/console/kosipa/laporan/kualitas-data'); await waitMain(page);
  assert.equal(await page.getByRole('button', { name: 'Buka menu' }).getAttribute('aria-expanded'), 'false', 'drawer closes after navigating');
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'no horizontal page scroll');
  await shot(page, 'N6-kualitas-data-375'); await context.close(); return 'drawer + Laporan submenu + navigation';
});

await step('N7 export is a separate grant: the allow-listed user may download CSV; a viewer of the same report may not', async () => {
  const k = await open('koperasi'); await k.page.goto(`${base}/console/kosipa/laporan/pinjaman`); await waitMain(k.page);
  assert.ok(await k.page.getByRole('link', { name: /Unduh CSV/ }).count(), 'export link shown to the allow-listed user');
  const csv = await k.context.request.get(`${base}/api/kosipa/reports/loans/export`); assert.equal(csv.status(), 200); assert.match(csv.headers()['content-type'] ?? '', /csv/i);
  const csvText = await csv.text(); assert.ok(!secrets.some((x) => csvText.includes(x)), 'no credential in the export'); await k.context.close();
  const s = await open('kasir2'); await s.page.goto(`${base}/console/kosipa/laporan/pinjaman`); await waitMain(s.page);
  assert.equal(await s.page.getByRole('link', { name: /Unduh CSV/ }).count(), 0, 'no export link for a viewer');
  assert.ok([401, 403].includes((await s.context.request.get(`${base}/api/kosipa/reports/loans/export`)).status()), 'export API refused for a viewer');
  await s.context.close(); return 'koperasi 200 text/csv; kasir2 no link and API refused';
});

// ---------------------------------------------------------------------------------------------------------------- other personas
await step('N8 read-only KOSIPA staff (synth_kasir2) sees only the granted entries; payroll is refused on page and API', async () => {
  const { context, page } = await open('kasir2'); await page.goto(`${base}/console`); await waitMain(page);
  const l = await hrefs(page);
  for (const h of ['/console/kosipa', '/console/kosipa/anggota', '/console/kosipa/simpanan', '/console/kosipa/pinjaman', '/console/kosipa/laporan']) assert.ok(l.includes(h), h);
  for (const h of ['/console/kosipa/payroll', '/console/kosipa/laporan/payroll', '/console/settings/identitas', '/console/warehouse']) assert.ok(!l.includes(h), `${h} must not be shown`);
  await page.goto(`${base}/console/kosipa/payroll`); assert.match(await waitMain(page), /Akses ditolak/);
  assert.equal((await context.request.get(`${base}/api/kosipa/payroll`)).status(), 403);
  await shot(page, 'N8-kasir2-denied-payroll'); await context.close(); return 'menu = page guard = API';
});

await step('N9 TOKO cashier (synth_kasir1): lands on /pos, has no KOSIPA menu and no KOSIPA access', async () => {
  const { context, page } = await open('kasir1'); await page.waitForURL((u) => u.pathname === '/pos', { timeout: 15000 });
  await page.goto(`${base}/console`); await waitMain(page);
  assert.deepEqual(await hrefs(page), ['/console', '/pos'], 'cashier navigation unchanged');
  await page.goto(`${base}/console/kosipa`); assert.match(await waitMain(page), DENIED);
  assert.equal((await context.request.get(`${base}/api/kosipa/loans`)).status(), 403);
  await context.close(); return 'POS only';
});

await step('N10 console administrator (synth_admin): is NOT linked — no KOSIPA menu, an honest status card instead of "Segera hadir", KOSIPA refused', async () => {
  const { context, page } = await open('admin'); await page.goto(`${base}/console`); await waitMain(page);
  const l = await hrefs(page);
  assert.ok(l.includes('/console/settings/identitas') && l.includes('/console/warehouse'), 'administration + Warehouse preview present');
  assert.ok(!l.some((x) => x.startsWith('/console/kosipa')), 'no KOSIPA menu without an identity link');
  const card = page.locator('.console-module', { has: page.getByRole('heading', { name: 'KOSIPA' }) });
  assert.match(await card.innerText(), /Akun belum ditautkan/); assert.doesNotMatch(await card.innerText(), /Segera hadir/);
  await shot(page, 'N10-admin-dashboard-unlinked');
  await page.goto(`${base}/console/kosipa`); assert.match(await waitMain(page), /belum ditautkan/i);
  assert.equal((await context.request.get(`${base}/api/kosipa/loans`)).status(), 403);
  await context.close(); return 'administrator role alone never opens KOSIPA';
});

await step('N11 disabled account cannot sign in', async () => {
  const context = await browser.newContext(); const res = await context.request.post(`${base}/api/auth/login`, { data: { username: 'synth_off', password: pw.off }, headers: { origin: base } });
  assert.ok([401, 403].includes(res.status()), String(res.status())); await context.close();
});

await step('N12 a console administrator cannot grant themselves KOSIPA: the application refuses a self link and nothing changes', async () => {
  const a = await browser.newContext(); const login = await a.request.post(`${base}/api/auth/login`, { data: { username: 'synth_admin', password: pw.admin }, headers: { origin: base } });
  assert.equal(login.status(), 200); const { csrfToken } = await login.json();
  const res = await a.request.post(`${base}/api/console/identity-links`, { data: { consoleUserId: 900001, kosipaUserId: 9004 }, headers: { origin: base, 'x-csrf-token': csrfToken, 'content-type': 'application/json' } });
  assert.equal(res.status(), 422); assert.equal((await res.json()).error, 'SELF_LINK');
  assert.equal((await a.request.get(`${base}/api/kosipa/loans`)).status(), 403, 'still no KOSIPA access'); await a.close(); return 'SELF_LINK refused; KOSIPA still 403';
});

// Machine evidence keyed by owner-uat-checklist.md section G (merged into the findings register; never an owner result).
const G = { G1: ['N1'], G2: ['N1'], G3: ['N2'], G4: ['N4'], G5: ['N3'], G6: ['N6'], G7: ['N7'], G8: ['N8'], G9: ['N9'], G10: ['N10', 'N12'] };
const byStep = (key) => Object.entries(results).filter(([k]) => k.split(' ')[0] === key).map(([, r]) => r);
const checklist = Object.fromEntries(Object.entries(G).map(([id, keys]) => { const rs = keys.flatMap(byStep); return [id, { role: 'machine', status: rs.length && rs.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL', note: rs.map((r) => r.note).filter(Boolean).join('; ').slice(0, 200) }]; }));
const { writeFileSync } = await import('node:fs'); writeFileSync(`${out}/results.json`, JSON.stringify(checklist, null, 1));
await browser.close();
const failed = Object.entries(results).filter(([, r]) => r.status !== 'PASS');
if (errors.length) { console.log(`BROWSER ERRORS: ${errors.join(' | ')}`); }
console.log(`${Object.keys(results).length - failed.length}/${Object.keys(results).length} KOSIPA navigation checks passed; screenshots in ${out}`);
process.exitCode = failed.length || errors.length ? 1 : 0;   // never process.exit(): the isolation guard forbids it in browser suites
