import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of TASK-027 (read-only KOSIPA payroll) on the SYNTHETIC e2e schema. The built app must run on
// 127.0.0.1 with DATABASE_URL = the e2e reader (SELECT only), CONSOLE_ENABLED=true, KOSIPA_READ_ENABLED=true and
// DATABASE_URL_CONSOLE = the local console store. Needs the Checkpoint-6 seed (scripts/e2e-seed.mjs).
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

const PAGE_ROWS = Array.from({ length: 50 }, (_, i) => 9050 + i);
try {
  // ---- fixture additions owned by this test (removed in finally): payroll + store-credit menus, a member-only KOSIPA account
  await seed.$executeRawUnsafe("SET SESSION sql_mode=''");
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9005,'SYNTH Payroll','payroll/matrix_c',1,0,'WEB','PRIVATE'),(9006,'SYNTH Toko','anggota/trans_toko_c',1,0,'WEB','PRIVATE')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9005,9005,9001,1,0,0,0,0,0),(9006,9006,9001,1,0,0,0,0,0),(9007,9001,9002,1,0,0,0,0,0)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9003,'synth_ksp_member','SYNTH KOSIPA ANGGOTA SAJA',1,'x','',0,'')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group (id, nama_group, status) VALUES (9002,'SYNTH KOSIPA ANGGOTA',1)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9003,9003,9002,1)`);
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);
  for (const id of PAGE_ROWS) await seed.$executeRawUnsafe(`INSERT INTO trans_potongan_matrix (id, periode, doc_no_dtl, nik_kar, nama, kd_group, total_potongan) VALUES (?, 'POTSYN202608B', ?, ?, ?, 'BMP', 0)`, id, `PG-${id}`, `SYNP${id}`, `SYNTH PAGE ${id}`);

  console.log('1. administrator links synth_koperasi (full payroll grants) and synth_kasir1 (member directory only)');
  { const { context, page } = await session(); await login(page, 'admin');
    await page.goto(`${base}/console/settings/identitas`);
    const consoleSelect = page.getByLabel('Akun console');
    await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await context.close(); }

  console.log('2. batch list: newest first, status/period filters, zero date labelled, invalid filter refused, empty state, keyset "load more"');
  { const { context, page } = await session(); await login(page, 'koperasi');
    assert.ok((await sidebar(page)).includes('/console/kosipa/payroll'));
    await page.goto(`${base}/console/kosipa/payroll`);
    await page.getByRole('table', { name: '' }).first().waitFor().catch(() => {});
    await page.getByRole('link', { name: 'POTSYN202608A' }).waitFor();
    const docs = await page.locator('main tbody tr td:first-child').allInnerTexts();
    assert.deepEqual(docs, ['POTSYN202605A', 'POTSYN202606A', 'POTSYN202607A', 'POTSYN202608B', 'POTSYN202608A']);
    let t = await text(page);
    assert.match(t, /0000-00-00 \(kosong\)/, 'the zero period date is labelled, not shown as a real date');
    assert.match(t, /Status tidak dikenal/); assert.match(t, /APPROVED · disetujui/); assert.match(t, /OPEN · belum disetujui/);
    assert.doesNotMatch(t, /12\.345\.678/, 'salary never appears');
    await assertReadOnly(page); await page.screenshot({ path: `${output}/payroll-list-1440.png`, fullPage: true });
    await page.getByLabel('Periode').fill('2026-08'); await page.getByLabel('Status').selectOption('OPEN'); await page.getByRole('button', { name: 'Terapkan' }).click();
    await page.waitForURL(/periode=2026-08&status=OPEN/);
    assert.deepEqual(await page.locator('main tbody tr td:first-child').allInnerTexts(), ['POTSYN202608B']);
    await page.goto(`${base}/console/kosipa/payroll?periode=2026-13`); await page.getByRole('heading', { name: 'Filter tidak valid' }).waitFor();
    assert.equal(await page.locator('main table').count(), 0);
    await page.goto(`${base}/console/kosipa/payroll?status=${encodeURIComponent("OPEN' OR 1=1")}`); await page.getByRole('heading', { name: 'Filter tidak valid' }).waitFor();
    await page.goto(`${base}/console/kosipa/payroll?periode=2025-01`); await page.getByRole('heading', { name: 'Tidak ada batch' }).waitFor();
    await page.goto(`${base}/console/kosipa/payroll`); await noOverflow(page, 'list');
    await page.setViewportSize({ width: 375, height: 860 }); await page.screenshot({ path: `${output}/payroll-list-375.png`, fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
    await context.close(); }

  console.log('3. batch detail: recorded figures, integrity notes, component groups, member search, keyset paging, no write controls');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A`); await page.getByRole('heading', { name: 'Batch POTSYN202608A' }).waitFor();
    let t = await text(page);
    assert.match(t, /Total header \(tercatat\)\s+Rp 250\.000/); assert.match(t, /Baris \/ anggota unik\s+2 \/ 2/);
    assert.match(t, /Belanja toko \(Kredit\)\s+Rp 200\.000/); assert.match(t, /PPOB\s+Rp 50\.000/);
    assert.doesNotMatch(t, /Catatan integritas data/, 'a clean batch has no integrity notes');
    assert.doesNotMatch(t, /12\.345\.678/);
    await assertReadOnly(page); await page.screenshot({ path: `${output}/payroll-batch-1440.png`, fullPage: true });
    await page.getByLabel('NIK atau nama anggota').fill('kontrak'); await page.getByRole('button', { name: 'Cari' }).click();
    await page.waitForURL(/q=kontrak/); await page.getByRole('link', { name: 'S9002' }).waitFor();
    assert.deepEqual(await page.locator('main section[aria-labelledby=sec-anggota] tbody tr td:first-child').allInnerTexts(), ['S9002']);
    await page.getByLabel('NIK atau nama anggota').fill('%%'); await page.getByRole('button', { name: 'Cari' }).click();
    await page.getByRole('heading', { name: 'Tidak ada baris' }).waitFor();
    await noOverflow(page, 'batch');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202607A`); await page.getByRole('heading', { name: 'Batch POTSYN202607A' }).waitFor();
    t = await text(page);
    assert.match(t, /Catatan integritas data/); assert.match(t, /lebih dari satu baris/); assert.match(t, /Tanggal periode kosong atau tidak valid/);
    assert.match(t, /Baris \/ anggota unik\s+2 \/ 1/);
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202606A`); t = await text(page);
    assert.match(t, /tidak memiliki baris potongan/); await page.getByRole('heading', { name: 'Tidak ada baris' }).waitFor();
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202605A`); t = await text(page);
    assert.match(t, /Status tidak dikenal/); assert.match(t, /Total pada header berbeda dari jumlah seluruh baris/); assert.match(t, /Selisih: Rp 89\.999/);
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608B`); await page.getByRole('heading', { name: 'Batch POTSYN202608B' }).waitFor();
    const memberRows = page.locator('main section[aria-labelledby=sec-anggota] tbody tr');
    assert.equal(await memberRows.count(), 50, 'one bounded page of 50');
    await page.getByRole('link', { name: 'Muat anggota berikutnya' }).click(); await page.waitForURL(/after=\d+/); await page.getByRole('link', { name: 'SYNP9099' }).waitFor();
    assert.equal(await memberRows.count(), 1, 'the 51st row (SYNP9099) arrives on the second page, without overlap');
    await context.close(); }

  console.log('4. member detail: breakdown, installment references (orphan parent, zero / 9999 dates), duplicates, isolation');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/anggota/S9001`); await page.getByRole('heading', { name: 'Potongan anggota' }).waitFor();
    let t = await text(page);
    assert.match(t, /TOKO TAMBUN\s+Belanja toko \(Kredit\)\s+Rp 100\.000/); assert.match(t, /PPOB\s+PPOB\s+Rp 50\.000/);
    assert.match(t, /Total potongan tercatat\s+Rp 150\.000/);
    assert.match(t, /PINSYN9001/); assert.match(t, /PINSYN-ORPH\s+induk pinjaman tidak ditemukan/);
    assert.match(t, /1 angsuran merujuk pinjaman induk yang tidak ada/); assert.match(t, /2 memiliki tanggal jatuh tempo kosong\/nol\/tidak wajar/);
    assert.doesNotMatch(t, /9999-12-10/, 'an implausible date is counted, not listed as a due date in the month');
    await assertReadOnly(page); await page.screenshot({ path: `${output}/payroll-member-1440.png`, fullPage: true }); await noOverflow(page, 'member');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202607A/anggota/S9001`); t = await text(page);
    assert.match(t, /lebih dari satu baris di batch yang sama/); assert.match(t, /Baris 1:/); assert.match(t, /Baris 2:/); assert.match(t, /Tanggal periode batch kosong atau tidak valid/);
    const r = await page.goto(`${base}/console/kosipa/payroll/POTSYN202608B/anggota/S9002`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    assert.ok(r, 'a member who is not in this batch gets the not-found page, no other data');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/anggota/${encodeURIComponent("S9001' OR '1'='1")}`); await page.getByText(/tidak ditemukan|404/i).first().waitFor();
    await context.close(); }

  console.log('5. reconciliation: A recorded / B derived / C difference, review-only, unmapped branch, unusable period');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/rekonsiliasi`); await page.getByRole('heading', { name: 'Rekonsiliasi kredit toko' }).waitFor();
    let t = await text(page);
    assert.match(t, /Hanya untuk ditinjau/); assert.match(t, /belum dikonfirmasi pemilik proses/); assert.match(t, /berstatus OPEN/);
    assert.match(t, /Toko Tambun\s+Rp 200\.000\s+Rp 180\.000\s+Rp 20\.000/, 'A, B and C are separate columns');
    assert.match(t, /S9002\s+Toko Tambun\s+Rp 100\.000\s+Rp 100\.000\s+Rp 20\.000\s+Rp 80\.000\s+Rp 20\.000/);
    assert.match(t, /retur tampaknya tidak ikut dipotong/);
    assert.match(t, /Cabang belum dipetakan ke kolom toko payroll: 1 baris/);
    assert.match(t, /S9003\s+Toko GIIC[\s\S]*anggota tidak ada di payroll periode ini/);
    await assertReadOnly(page); await page.screenshot({ path: `${output}/payroll-reconcile-1440.png`, fullPage: true }); await noOverflow(page, 'reconciliation');
    const cells = page.locator('main section[aria-labelledby=sec-selisih] tbody tr'); const before = await cells.count();
    await page.getByRole('link', { name: 'Tampilkan juga yang sama' }).click(); await page.waitForURL(/all=1/); await page.getByRole('link', { name: 'Tampilkan hanya selisih' }).waitFor();
    assert.ok((await cells.count()) > before, 'MATCH rows appear only on request');
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202607A/rekonsiliasi`);
    await page.getByRole('heading', { name: 'Rekonsiliasi tidak tersedia' }).waitFor(); assert.match(await text(page), /tidak ditebak/);
    await context.close(); }

  console.log('6. Anggota 360 shows the member\'s recorded payroll history (bounded, headers looked up separately)');
  { const { context, page } = await session(); await login(page, 'koperasi');
    await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('heading', { name: 'Potongan payroll' }).waitFor();
    const t = await text(page);
    assert.match(t, /POTSYN202608A[\s\S]*Rp 150\.000/); assert.match(t, /POTSYN202607A/); assert.match(t, /nilai yang tercatat di KOSIPA/);
    assert.doesNotMatch(t, /12\.345\.678|5\.000\.000/, 'salary never shown');
    assert.equal((t.match(/Belum ditampilkan: sumber data ini menunggu tinjauan performa/g) ?? []).length, 1, 'only the installment section waits for the index review');
    await context.close(); }

  console.log('7. API: JSON, no-store, no salary, validation; anonymous 401');
  { const { context, page } = await session(); await login(page, 'koperasi');
    const list = await context.request.get(`${base}/api/kosipa/payroll?periode=2026-08`); assert.equal(list.status(), 200); assert.equal(list.headers()['cache-control'], 'no-store');
    const body = await list.text(); assert.ok(!body.includes('12345678'));
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll?periode=2026-13`)).status(), 400);
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll/POTSYN999999`)).status(), 404);
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll/POTSYN202608A/store-reconciliation`)).status(), 200);
    assert.equal((await context.request.post(`${base}/api/kosipa/payroll`, { data: {} })).status(), 405, 'no write verb');
    await context.close();
    const anon = await browser.newContext(); assert.equal((await anon.request.get(`${base}/api/kosipa/payroll`)).status(), 401); await anon.close(); }

  console.log('8. permission isolation: member-directory-only account, and an unlinked account, see no payroll');
  { const { context, page } = await session(); await login(page, 'kasir1');
    await page.goto(`${base}/console`); const links = await sidebar(page);
    assert.ok(links.includes('/console/kosipa/anggota') && !links.includes('/console/kosipa/payroll'));
    await page.goto(`${base}/console/kosipa/payroll`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/rekonsiliasi`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
    assert.doesNotMatch(await text(page), /POTSYN202608A\s+.*Rp/);
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll`)).status(), 403);
    assert.equal((await context.request.get(`${base}/api/kosipa/payroll/POTSYN202608A/anggota/S9001`)).status(), 403);
    await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('heading', { name: 'Profil' }).waitFor();
    assert.doesNotMatch(await text(page), /Potongan payroll/, 'no payroll section without the payroll grant');
    await context.close();
    const other = await session(); await login(other.page, 'kasir2');
    await other.page.goto(`${base}/console/kosipa/payroll`); await other.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
    assert.equal((await other.context.request.get(`${base}/api/kosipa/payroll`)).status(), 403);
    await other.context.close(); }

  console.log('9. audit trail: payroll reads are recorded with opaque subjects and no NIK');
  { const events = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE action LIKE 'kosipa.payroll.%' AND occurred_at > NOW(3) - INTERVAL 30 MINUTE ORDER BY id`;
    const actions = new Set(events.map((e) => e.action));
    for (const a of ['kosipa.payroll.batch.view', 'kosipa.payroll.member.view', 'kosipa.payroll.reconcile']) assert.ok(actions.has(a), `audit has ${a}`);
    assert.ok(events.every((e) => /^payroll:POT[A-Z0-9]+$/.test(e.subject_id) && e.outcome === 'success'), JSON.stringify(events.slice(0, 3)));
    assert.ok(!JSON.stringify(events).includes('S9001')); }

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`console payroll browser checks passed; screenshots in ${output}`);
} finally {
  for (const id of PAGE_ROWS) await seed.$executeRawUnsafe('DELETE FROM trans_potongan_matrix WHERE id = ?', id);
  await seed.$executeRawUnsafe('DELETE FROM ref_menu_akses WHERE id IN (9005,9006,9007)');
  await seed.$executeRawUnsafe('DELETE FROM ref_menu WHERE id IN (9005,9006)');
  await seed.$executeRawUnsafe('DELETE FROM ref_group_akses WHERE id = 9003'); await seed.$executeRawUnsafe('DELETE FROM ref_group WHERE id = 9002'); await seed.$executeRawUnsafe('DELETE FROM ref_users WHERE id_ref_user = 9003');
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
