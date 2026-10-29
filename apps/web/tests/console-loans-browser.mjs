import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of TASK-026 (read-only KOSIPA loans) on the SYNTHETIC e2e schema. The built app must run on
// 127.0.0.1 with DATABASE_URL = the e2e reader (SELECT only), CONSOLE_ENABLED=true, KOSIPA_READ_ENABLED=true and
// DATABASE_URL_CONSOLE = the local console store. Needs the Checkpoint-7 seed (scripts/e2e-seed.mjs).
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
  // ---- fixture additions owned by this test (removed in finally): a member-directory-only KOSIPA account
  await seed.$executeRawUnsafe("SET SESSION sql_mode=''");
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9007,9001,9002,1,0,0,0,0,0)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9003,'synth_ksp_member','SYNTH KOSIPA ANGGOTA SAJA',1,'x','',0,'')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group (id, nama_group, status) VALUES (9002,'SYNTH KOSIPA ANGGOTA',1)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9003,9003,9002,1)`);
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);

  console.log('1. administrator links synth_koperasi (loan grant) and synth_kasir1 (member directory only)');
  { const { context, page } = await session(); await login(page, 'admin');
    await page.goto(`${base}/console/settings/identitas`);
    const consoleSelect = page.getByLabel('Akun console');
    await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await context.close(); }

  console.log('2. loan list: newest first, flags, zero dates labelled, filters, search, invalid and empty states, no salary or bank account');
  { const { context, page } = await session(); await login(page, 'koperasi');
    assert.ok((await sidebar(page)).includes('/console/kosipa/pinjaman'));
    await page.goto(`${base}/console/kosipa/pinjaman`); await page.getByRole('link', { name: 'PINSYN9002' }).waitFor();
    assert.deepEqual(await page.locator('main tbody tr td:first-child').allInnerTexts(), ['PINSYN9007', 'PINSYN9005', 'PINSYN9005', 'PINSYN9004', 'PINSYN9003', 'PINSYN9002', 'PINSYN9001']);
    let t = await text(page);
    assert.match(t, /Berstatus REJECTED tetapi LUNAS/); assert.match(t, /0000-00-00 \(kosong\)/);
    assert.doesNotMatch(t, /77\.000\.000|9900770077|9900119003/, 'salary and bank accounts never appear');
    await assertReadOnly(page); await page.screenshot({ path: `${output}/loans-list-1440.png`, fullPage: true });
    await page.getByLabel('Status dokumen').selectOption('REJECTED'); await page.getByLabel('Pelunasan').selectOption('LUNAS'); await page.getByRole('button', { name: 'Cari' }).click();
    await page.waitForURL(/status=REJECTED/); await page.getByRole('link', { name: 'PINSYN9004' }).waitFor();
    assert.deepEqual(await page.locator('main tbody tr td:first-child').allInnerTexts(), ['PINSYN9004']);
    await page.goto(`${base}/console/kosipa/pinjaman?q=S9001`); await page.getByRole('link', { name: 'PINSYN9001' }).waitFor();
    assert.deepEqual(await page.locator('main tbody tr td:first-child').allInnerTexts(), ['PINSYN9001']);
    await page.goto(`${base}/console/kosipa/pinjaman?status=OPEN`); await page.getByRole('heading', { name: 'Tidak ada pinjaman' }).waitFor();
    await page.goto(`${base}/console/kosipa/pinjaman?status=${encodeURIComponent("APPROVED' OR 1=1")}`); await page.getByRole('heading', { name: 'Filter tidak valid' }).waitFor();
    assert.equal(await page.locator('main table').count(), 0);
    await page.goto(`${base}/console/kosipa/pinjaman?q=%25%25`); await page.getByRole('heading', { name: 'Tidak ada pinjaman' }).waitFor();
    await page.goto(`${base}/console/kosipa/pinjaman`); await noOverflow(page, 'loan list');
    await page.setViewportSize({ width: 375, height: 860 }); await page.screenshot({ path: `${output}/loans-list-375.png`, fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
    await context.close(); }

  console.log('3. loan detail: recorded values, integrity notes, no official balance, bounded schedule with keyset paging');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9002`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9002' }).waitFor();
    let t = await text(page);
    assert.match(t, /SYNTH ANGGOTA TIGA · NIK S9003/); assert.match(t, /Pokok \(rencana\)\s+Rp1\.200\.000/); assert.match(t, /Σ pokok jadwal\s+Rp1\.200\.000/); assert.match(t, /Σ pokok belum dibayar \(jadwal\)\s+Rp1\.000\.000/);
    assert.match(t, /Sudah dibayar \/ belum\s+2 \/ 10/); assert.match(t, /saldo resmi|Saldo\/outstanding resmi belum tersedia/i); assert.doesNotMatch(t, /Catatan integritas data/);
    assert.match(t, /2 angsuran berstatus Bayar tidak mencatat tanggal bayar/);
    assert.equal(await page.locator('main section[aria-labelledby=sec-jadwal] tbody tr').count(), 12);
    assert.doesNotMatch(t, /77\.000\.000|9900770077/);
    await assertReadOnly(page); await page.screenshot({ path: `${output}/loan-detail-1440.png`, fullPage: true }); await noOverflow(page, 'loan detail');
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9003`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9003' }).waitFor();
    const rows = page.locator('main section[aria-labelledby=sec-jadwal] tbody tr');
    await page.getByRole('link', { name: 'Muat angsuran berikutnya' }).waitFor(); assert.equal(await rows.count(), 60, 'one bounded page of 60');
    await page.getByRole('link', { name: 'Muat angsuran berikutnya' }).click(); await page.waitForURL(/after=60\.\d+/); await page.getByText('Tidak ada baris lagi').or(rows.first()).waitFor();
    assert.equal(await rows.count(), 10, 'the remaining 10, without overlap'); assert.equal(await rows.first().locator('td').first().innerText(), '61');
    assert.equal(await page.getByRole('link', { name: 'Muat angsuran berikutnya' }).count(), 0);
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9003?after=${encodeURIComponent("1.2'--")}`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await context.close(); }

  console.log('4. anomalies stay visible: messy schedule, duplicate header, missing schedule, rejected-but-settled, unknown loan');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9001`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9001' }).waitFor(); let t = await text(page);
    assert.match(t, /Catatan integritas data/); assert.match(t, /Jumlah pokok seluruh angsuran berbeda/); assert.match(t, /Jumlah baris angsuran berbeda dari tenor/); assert.match(t, /1 nol, 0 kosong, 1 tidak wajar/);
    assert.match(t, /0000-00-00 \(kosong\)/); assert.match(t, /9999-12-10 \(tidak valid\)/);
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9005`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9005' }).waitFor(); t = await text(page);
    assert.match(t, /Ada 2 dokumen dengan nomor yang sama/); assert.match(t, /id 9006: REJECTED \/ OPEN \/ BELUM LUNAS/);
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9007`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9007' }).waitFor(); t = await text(page);
    assert.match(t, /APPROVED tetapi tidak memiliki jadwal angsuran/); assert.match(t, /tidak memiliki jadwal angsuran/);
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9004`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9004' }).waitFor(); t = await text(page);
    assert.match(t, /Berstatus REJECTED tetapi LUNAS/); assert.doesNotMatch(t, /Catatan integritas data/, 'a rejected loan without a schedule is normal');
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9999`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await page.goto(`${base}/console/kosipa/pinjaman/${encodeURIComponent("x' OR '1'='1")}`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await context.close(); }

  console.log('5. Anggota 360 links each loan to its detail page');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('link', { name: 'PINSYN9001' }).click();
    await page.waitForURL(/\/console\/kosipa\/pinjaman\/PINSYN9001$/); await page.getByRole('heading', { name: 'Pinjaman PINSYN9001' }).waitFor();
    await context.close(); }

  console.log('6. API: JSON, no-store, validation, no write verb, anonymous 401');
  { const { context, page } = await session(); await login(page, 'koperasi');
    const list = await context.request.get(`${base}/api/kosipa/loans?bayar=LUNAS`); assert.equal(list.status(), 200); assert.equal(list.headers()['cache-control'], 'no-store');
    const body = await list.text(); assert.ok(!body.includes('77000000') && !body.includes('9900770077'));
    const detail = await (await context.request.get(`${base}/api/kosipa/loans/PINSYN9002`)).json(); assert.equal(detail.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.equal(detail.schedule.rows.length, 12);
    assert.equal((await context.request.get(`${base}/api/kosipa/loans?status=DROP`)).status(), 400);
    assert.equal((await context.request.get(`${base}/api/kosipa/loans/PINSYN9999`)).status(), 404);
    assert.equal((await context.request.post(`${base}/api/kosipa/loans`, { data: {} })).status(), 405);
    await context.close();
    const anon = await browser.newContext(); assert.equal((await anon.request.get(`${base}/api/kosipa/loans`)).status(), 401); await anon.close(); }

  console.log('7. permission isolation: member-directory-only and unlinked accounts see no loans');
  { const { context, page } = await session(); await login(page, 'kasir1');
    await page.goto(`${base}/console`); const links = await sidebar(page);
    assert.ok(links.includes('/console/kosipa/anggota') && !links.includes('/console/kosipa/pinjaman'));
    await page.goto(`${base}/console/kosipa/pinjaman`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9002`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    assert.doesNotMatch(await text(page), /Rp1\.200\.000/);
    assert.equal((await context.request.get(`${base}/api/kosipa/loans`)).status(), 403); assert.equal((await context.request.get(`${base}/api/kosipa/loans/PINSYN9002`)).status(), 403);
    await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('heading', { name: 'Profil' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Pinjaman', exact: true }).count(), 0, 'no loan section without the loan grant');
    await context.close();
    const other = await session(); await login(other.page, 'kasir2');
    await other.page.goto(`${base}/console/kosipa/pinjaman`); await other.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
    assert.equal((await other.context.request.get(`${base}/api/kosipa/loans`)).status(), 403); await other.context.close(); }

  console.log('8. audit trail: loan reads are recorded with opaque subjects and no NIK');
  { const events = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE action LIKE 'kosipa.loan.%' AND occurred_at > NOW(3) - INTERVAL 30 MINUTE ORDER BY id`;
    const actions = new Set(events.map((e) => e.action)); for (const a of ['kosipa.loan.list.view', 'kosipa.loan.detail.view']) assert.ok(actions.has(a), `audit has ${a}`);
    assert.ok(events.every((e) => /^loan:(list|[A-Za-z0-9_-]+)$/.test(e.subject_id) && e.outcome === 'success'), JSON.stringify(events.slice(0, 3)));
    assert.ok(!JSON.stringify(events).includes('S9003') && !JSON.stringify(events).includes('S9001')); }

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`console loans browser checks passed; screenshots in ${output}`);
} finally {
  await seed.$executeRawUnsafe('DELETE FROM ref_menu_akses WHERE id = 9007');
  await seed.$executeRawUnsafe('DELETE FROM ref_group_akses WHERE id = 9003'); await seed.$executeRawUnsafe('DELETE FROM ref_group WHERE id = 9002'); await seed.$executeRawUnsafe('DELETE FROM ref_users WHERE id_ref_user = 9003');
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
