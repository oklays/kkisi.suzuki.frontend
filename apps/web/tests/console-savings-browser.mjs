import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of TASK-025 savings read side (read-only KOSIPA savings ledger) on the SYNTHETIC e2e schema. The built app must run on
// 127.0.0.1 with DATABASE_URL = the e2e reader (SELECT only), CONSOLE_ENABLED=true, KOSIPA_READ_ENABLED=true and
// DATABASE_URL_CONSOLE = the local console store. Needs the Checkpoint-8 seed (scripts/e2e-seed.mjs).
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
const ADMIN = 900001;
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
  await page.waitForURL(/\/(console(\?entry=login)?|pos)$/);
}
const choose = async (select, text) => select.selectOption(await select.locator('option', { hasText: text }).first().getAttribute('value'));
const sidebar = async (page) => { await page.waitForLoadState('networkidle'); await page.locator('#console-nav nav a').first().waitFor({ state: 'attached' }); return page.locator('#console-nav nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))); };
const noOverflow = async (page, label) => { for (const width of [375, 390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 860 }); const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`); } await page.setViewportSize({ width: 1440, height: 900 }); };
const text = async (page) => { await page.waitForFunction(() => { const m = document.querySelector('main'); return m && m.innerText.trim() !== 'Memuat…' && m.innerText.trim() !== ''; }); await page.waitForLoadState('networkidle'); return page.locator('main').innerText(); };
const FORBIDDEN_CONTROLS = /setujui|approve|posting|post\b|generate|buat matriks|hapus|ubah|simpan/i;
async function assertReadOnly(page) {
  const labels = await page.locator('main button, main [role=button], main input[type=submit]').evaluateAll((els) => els.map((e) => (e.textContent || e.value || '').trim()));
  for (const l of labels) assert.ok(!FORBIDDEN_CONTROLS.test(l), `write-looking control on a payroll page: "${l}"`);
  assert.equal(await page.locator('main form:not([method=get]):not([role=search])').count(), 0, 'no non-GET form');
}

try {
  await seed.$executeRawUnsafe("SET SESSION sql_mode=''");
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9007,9001,9002,1,0,0,0,0,0)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9003,'synth_ksp_member','SYNTH KOSIPA ANGGOTA SAJA',1,'x','',0,'')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group (id, nama_group, status) VALUES (9002,'SYNTH KOSIPA ANGGOTA',1)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9003,9003,9002,1)`);
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);

  console.log('1. administrator links synth_koperasi (savings grant) and synth_kasir1 (member directory only)');
  { const { context, page } = await session(); await login(page, 'admin');
    await page.goto(`${base}/console/settings/identitas`);
    const consoleSelect = page.getByLabel('Akun console');
    await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await context.close(); }

  console.log('2. search -> ledger: honest balance notice, per-type sums, header status decides, keyset paging, type filter');
  { const { context, page } = await session(); await login(page, 'koperasi');
    assert.ok((await sidebar(page)).includes('/console/kosipa/simpanan'));
    await page.goto(`${base}/console/kosipa/simpanan`); await page.getByLabel('NIK atau nama anggota').fill('S9003'); await page.getByRole('button', { name: 'Cari' }).click();
    await page.getByRole('link', { name: 'S9003' }).click(); await page.waitForURL(/\/console\/kosipa\/simpanan\/9003$/);
    await page.getByRole('heading', { name: 'Buku simpanan' }).waitFor();
    let t = await text(page);
    assert.match(t, /Saldo resmi belum tersedia/); assert.match(t, /SYNTH ANGGOTA TIGA · NIK S9003/);
    assert.match(t, /SIMPANAN SUKARELA\s+61\s+Rp59\.762,50\s+Rp40\.000/); assert.match(t, /SIMPANAN WAJIB\s+4\s+Rp100\.000/); assert.match(t, /SIMPANAN POKOK\s+1\s+Rp250\.000/);
    assert.doesNotMatch(t, /9900119003|6\.000\.000/, 'bank account and salary never shown');
    await assertReadOnly(page); await page.screenshot({ path: `${output}/savings-ledger-1440.png`, fullPage: true });
    const rows = page.locator('main section[aria-labelledby=sec-mutasi] tbody tr');
    assert.equal(await rows.count(), 50, 'one bounded page of 50');
    await page.getByRole('link', { name: 'Muat mutasi lebih lama' }).click(); await page.waitForURL(/after=\d+/); await page.getByText('Saldo resmi belum tersedia').waitFor();
    assert.equal(await rows.count(), 16, 'the remaining 16, without overlap');
    t = await text(page);
    assert.match(t, /\(saldo awal\)/); assert.match(t, /0000-00-00 \(kosong\)/); assert.match(t, /header dokumen tidak ditemukan/); assert.match(t, /header dokumen ganda/); assert.match(t, /status baris berbeda dari header/);
    assert.match(t, /Tidak berlaku \(status lain\) · POSTING/); assert.match(t, /Menunggu \(OPEN\) · OPEN/);
    await page.goto(`${base}/console/kosipa/simpanan/9003`); await page.getByRole('link', { name: 'SIMPANAN POKOK' }).click(); await page.waitForURL(/jenis=SIMPANAN\+POKOK|jenis=SIMPANAN%20POKOK/);
    await page.getByRole('link', { name: 'Tampilkan semua jenis' }).waitFor(); assert.equal(await rows.count(), 1);
    await page.goto(`${base}/console/kosipa/simpanan/9003`); await noOverflow(page, 'ledger');
    await page.setViewportSize({ width: 375, height: 860 }); await page.screenshot({ path: `${output}/savings-ledger-375.png`, fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
    await context.close(); }

  console.log('3. empty member, invalid input, unknown member, 360 link');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/simpanan/9002`); await page.getByRole('heading', { name: 'Buku simpanan' }).waitFor(); assert.match(await text(page), /Belum ada mutasi simpanan tercatat/);
    await page.goto(`${base}/console/kosipa/simpanan/9003?jenis=${encodeURIComponent("X' OR 1=1")}`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await page.goto(`${base}/console/kosipa/simpanan/99999`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await page.goto(`${base}/console/kosipa/simpanan/${encodeURIComponent("1 OR 1=1")}`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('link', { name: 'Lihat buku simpanan lengkap' }).click();
    await page.waitForURL(/\/console\/kosipa\/simpanan\/9001$/); await page.getByRole('heading', { name: 'Buku simpanan' }).waitFor(); assert.match(await text(page), /SIMPANAN WAJIB/);
    await context.close(); }

  console.log('4. API: JSON, no-store, validation, no write verb, anonymous 401');
  { const { context, page } = await session(); await login(page, 'koperasi');
    const res = await context.request.get(`${base}/api/kosipa/savings/9003`); assert.equal(res.status(), 200); assert.equal(res.headers()['cache-control'], 'no-store');
    const body = await res.json(); assert.equal(body.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.equal(body.ledger.data.items.length, 50); assert.ok(!JSON.stringify(body).includes('9900119003'));
    assert.equal((await context.request.get(`${base}/api/kosipa/savings/9003?jenis=x%27--`)).status(), 400); assert.equal((await context.request.get(`${base}/api/kosipa/savings/abc`)).status(), 400);
    assert.equal((await context.request.get(`${base}/api/kosipa/savings/99999`)).status(), 404); assert.equal((await context.request.post(`${base}/api/kosipa/savings/9003`, { data: {} })).status(), 405);
    await context.close();
    const anon = await browser.newContext(); assert.equal((await anon.request.get(`${base}/api/kosipa/savings/9003`)).status(), 401); await anon.close(); }

  console.log('5. permission isolation: member-directory-only and unlinked accounts see no savings');
  { const { context, page } = await session(); await login(page, 'kasir1');
    await page.goto(`${base}/console`); const links = await sidebar(page);
    assert.ok(links.includes('/console/kosipa/anggota') && !links.includes('/console/kosipa/simpanan'));
    await page.goto(`${base}/console/kosipa/simpanan`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    await page.goto(`${base}/console/kosipa/simpanan/9003`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor(); assert.doesNotMatch(await text(page), /Rp250\.000/);
    assert.equal((await context.request.get(`${base}/api/kosipa/savings/9003`)).status(), 403);
    await page.goto(`${base}/console/kosipa/anggota/9003`); await page.getByRole('heading', { name: 'Profil' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Simpanan', exact: true }).count(), 0, 'no savings section without the savings grant');
    await context.close();
    const other = await session(); await login(other.page, 'kasir2');
    await other.page.goto(`${base}/console/kosipa/simpanan`); await other.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
    assert.equal((await other.context.request.get(`${base}/api/kosipa/savings/9003`)).status(), 403); await other.context.close(); }

  console.log('6. audit trail: savings reads are recorded with opaque member subjects, no NIK');
  { const events = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE action = 'kosipa.savings.view' AND occurred_at > NOW(3) - INTERVAL 30 MINUTE ORDER BY id`;
    assert.ok(events.length >= 3); assert.ok(events.every((e) => /^member:\d+$/.test(e.subject_id) && e.outcome === 'success'), JSON.stringify(events.slice(0, 3))); assert.ok(!JSON.stringify(events).includes('S9003')); }

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`console savings browser checks passed; screenshots in ${output}`);
} finally {
  await seed.$executeRawUnsafe('DELETE FROM ref_menu_akses WHERE id = 9007');
  await seed.$executeRawUnsafe('DELETE FROM ref_group_akses WHERE id = 9003'); await seed.$executeRawUnsafe('DELETE FROM ref_group WHERE id = 9002'); await seed.$executeRawUnsafe('DELETE FROM ref_users WHERE id_ref_user = 9003');
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
