import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of Checkpoint 9 integrated read-only UAT (KOSIPA + TOKO) on the SYNTHETIC e2e schema. The built app must run on
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
const ADMIN = 900001;
const mode = process.env.UAT_MODE || 'ok';
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

const outage = (what) => execFileSync('bash', ['scripts/uat-outage.sh', what], { stdio: 'pipe' });
try {
  await seed.$executeRawUnsafe("SET SESSION sql_mode=''");
  if (mode !== 'store-down') {
    await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9007,9001,9002,1,0,0,0,0,0)`);
    await seed.$executeRawUnsafe(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9003,'synth_ksp_member','SYNTH KOSIPA ANGGOTA SAJA',1,'x','',0,'')`);
    await seed.$executeRawUnsafe(`INSERT INTO ref_group (id, nama_group, status) VALUES (9002,'SYNTH KOSIPA ANGGOTA',1)`);
    await seed.$executeRawUnsafe(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9003,9003,9002,1)`);
    await seed.$executeRawUnsafe(`INSERT INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9005,'SYNTH Payroll','payroll/matrix_c',1,0,'WEB','PRIVATE'),(9006,'SYNTH Toko','anggota/trans_toko_c',1,0,'WEB','PRIVATE')`);
    await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9005,9005,9001,1,0,0,0,0,0),(9006,9006,9001,1,0,0,0,0,0)`);
  }
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);

  async function linkAccounts() {
    const { context, page } = await session(); await login(page, 'admin');
    await page.goto(`${base}/console/settings/identitas`);
    const consoleSelect = page.getByLabel('Akun console');
    await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await context.close();
  }

  if (mode === 'ok') {
    console.log('UAT-1/2. console login, authorised navigation, member identity resolution (administrator links the KOSIPA accounts)');
    { const { context, page } = await session(); await login(page, 'admin');
      assert.ok(!(await sidebar(page)).includes('/console/kosipa/anggota'), 'an unlinked administrator has no KOSIPA navigation');
      await page.goto(`${base}/console/settings/identitas`);
      const consoleSelect = page.getByLabel('Akun console');
      await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
      await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
      await context.close(); }
    { const { context, page } = await session(); await login(page, 'koperasi');
      const links = await sidebar(page);
      for (const href of ['/console/kosipa/anggota', '/console/kosipa/simpanan', '/console/kosipa/pinjaman', '/console/kosipa/payroll', '/console/kosipa/laporan', '/sales']) assert.ok(links.includes(href), `${href} in the sidebar of the linked staff account`);
      await context.close(); }

    console.log('UAT-3/4. Anggota 360 profile, savings ledger navigation, official balance missing');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/anggota`); await page.getByLabel('NIK atau nama anggota').fill('S9001'); await page.getByRole('button', { name: 'Cari' }).click();
      await page.getByRole('link', { name: 'S9001' }).click(); await page.getByRole('heading', { name: 'SYNTH ANGGOTA SATU' }).waitFor();
      let t = await text(page); assert.match(t, /0812•+001/); assert.doesNotMatch(t, /081200009001|9900119001|5\.000\.000/); assert.match(t, /bukan saldo resmi/);
      await page.getByRole('link', { name: 'Lihat buku simpanan lengkap' }).click(); await page.getByRole('heading', { name: 'Buku simpanan' }).waitFor(); t = await text(page);
      assert.match(t, /Saldo resmi belum tersedia/); assert.match(t, /SIMPANAN WAJIB/); await assertReadOnly(page);
      await context.close(); }

    console.log('UAT-5/9. loan detail and schedule; official balance undefined everywhere');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('link', { name: 'PINSYN9001' }).click(); await page.getByRole('heading', { name: 'Pinjaman PINSYN9001' }).waitFor();
      let t = await text(page); assert.match(t, /Saldo\/outstanding resmi belum tersedia/); assert.match(t, /Catatan integritas data/);
      await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9003`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9003' }).waitFor();
      assert.equal(await page.locator('main section[aria-labelledby=sec-jadwal] tbody tr').count(), 60);
      await page.goto(`${base}/console/kosipa/laporan/pinjaman`); await page.getByRole('heading', { name: 'Laporan pinjaman' }).waitFor(); t = await text(page);
      assert.match(t, /Saldo\/outstanding resmi belum tersedia/); await context.close(); }

    console.log('UAT-6/8. payroll history and components; unverified branch mapping; informational (not error) comparison');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('heading', { name: 'Potongan payroll' }).waitFor(); let t = await text(page); assert.match(t, /POTSYN202608A[\s\S]*Rp 150\.000/);
      await page.goto(`${base}/console/kosipa/payroll`); await page.getByRole('heading', { name: 'Payroll', exact: true }).waitFor(); assert.match(await text(page), /POTSYN202608A/);   // A4: the list is audited
      await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A`); await page.getByRole('heading', { name: 'Batch POTSYN202608A' }).waitFor(); assert.match(await text(page), /Belanja toko \(Kredit\)\s+Rp 200\.000/);
      await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/anggota/S9001`); await page.getByRole('heading', { name: 'Potongan anggota' }).waitFor(); t = await text(page);
      assert.match(t, /TOKO TAMBUN\s+Belanja toko \(Kredit\)\s+Rp 100\.000/); assert.match(t, /PPOB\s+PPOB\s+Rp 50\.000/);
      await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A/rekonsiliasi`); await page.getByRole('heading', { name: 'Rekonsiliasi kredit toko' }).waitFor(); t = await text(page);
      assert.match(t, /belum dikonfirmasi pemilik proses/); assert.match(t, /Selisih bukan otomatis kesalahan/); assert.match(t, /per komponen/);
      await page.goto(`${base}/console/kosipa/laporan/kualitas-data`); await page.getByRole('heading', { name: 'Kualitas data keuangan' }).waitFor(); t = await text(page);
      assert.match(t, /Belum diverifikasi\./); assert.match(t, /berasal dari pola data/);
      await context.close(); }

    console.log('UAT-R. reports and data-quality diagnostics');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/laporan`); await page.getByRole('heading', { name: 'Laporan KOSIPA' }).waitFor();
      for (const name of ['Laporan pinjaman', 'Laporan payroll', 'Ringkasan keanggotaan', 'Ringkasan mutasi simpanan', 'Kualitas data keuangan']) await page.getByRole('link', { name }).waitFor();
      await page.getByRole('link', { name: 'Laporan pinjaman' }).click(); await page.getByRole('heading', { name: 'Laporan pinjaman' }).waitFor(); let t = await text(page);
      assert.match(t, /2026-03\s+5\s+Rp 3\.400\.000/); assert.match(t, /2026-08\s+1\s+Rp 12\.000\.000/); assert.match(t, /Tanggal dokumen 0000-00-00 \(kosong\)\s+1\s+Rp 500\.000/);
      assert.match(t, /APPROVED \/ BELUM LUNAS: 4 \(Rp 3\.100\.000\)/); assert.doesNotMatch(t, /77\.000\.000|9900770077/);
      await page.getByRole('link', { name: '2026-03' }).click(); await page.waitForURL(/periode=2026-03/); await page.getByRole('link', { name: 'PINSYN9002' }).waitFor();
      assert.deepEqual((await page.locator('main tbody tr td:first-child').allInnerTexts()).sort(), ['PINSYN9002', 'PINSYN9003', 'PINSYN9005', 'PINSYN9005', 'PINSYN9007'], 'the report month drills into the list; the zero-dated loan is not in it');
      await page.goto(`${base}/console/kosipa/laporan/pinjaman?tahun=26`); await page.getByRole('heading', { name: 'Tahun tidak valid' }).waitFor();
      await page.goto(`${base}/console/kosipa/laporan/payroll`); await page.getByRole('heading', { name: 'Laporan payroll' }).waitFor(); t = await text(page);
      for (const period of ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04']) assert.ok(t.includes(`Periode ${period}`), period);
      assert.match(t, /total header ≠ jumlah baris/); assert.match(t, /NIK ganda/); assert.match(t, /tanpa baris/); assert.doesNotMatch(t, /12\.345\.678/);
      await page.goto(`${base}/console/kosipa/laporan/keanggotaan`); await page.getByRole('heading', { name: 'Ringkasan keanggotaan' }).waitFor(); t = await text(page);
      assert.match(t, /AKTIVE\s+TETAP\s+2/); assert.match(t, /bukan daftar nonaktif/i); assert.doesNotMatch(t, /S900\d|SYNTH ANGGOTA|@example/, 'counts only, no personal data');
      await page.goto(`${base}/console/kosipa/laporan/simpanan`); await page.getByRole('heading', { name: 'Ringkasan mutasi simpanan' }).waitFor(); t = await text(page);
      assert.match(t, /Saldo resmi belum tersedia/); assert.match(t, /2026-05\s+SIMPANAN SUKARELA\s+61/); assert.match(t, /Header dokumen ganda/); assert.match(t, /Tanggal dokumen kosong \/ 0000-00-00/);
      await page.goto(`${base}/console/kosipa/laporan/kualitas-data`); await page.getByRole('heading', { name: 'Kualitas data keuangan' }).waitFor(); t = await text(page);
      assert.match(t, /1 nomor dokumen dipakai lebih dari satu dokumen/); assert.match(t, /REJECTED tetapi LUNAS\s+1/); assert.match(t, /1 nomor dokumen angsuran \(1 baris\) tidak memiliki dokumen pinjaman/); assert.match(t, /1 pinjaman APPROVED tidak memiliki baris angsuran/);
      assert.match(t, /3 dengan temuan/); assert.match(t, /berbeda setengah sen atau lebih/); assert.match(t, /hanya selisih sub-sen: presisi desimal/); assert.match(t, /Anomali terkonfirmasi/); assert.match(t, /Potensi anomali/); assert.match(t, /Perbandingan belum diverifikasi/);
      assert.doesNotMatch(t, /perbaiki sekarang|hapus data/i); await assertReadOnly(page);
      await page.screenshot({ path: `${output}/uat-quality-1440.png`, fullPage: true });
      for (const path of ['/console/kosipa/laporan', '/console/kosipa/laporan/pinjaman', '/console/kosipa/laporan/payroll', '/console/kosipa/laporan/keanggotaan', '/console/kosipa/laporan/simpanan', '/console/kosipa/laporan/kualitas-data']) { await page.goto(`${base}${path}`); await text(page); await noOverflow(page, path); }
      const api = await context.request.get(`${base}/api/kosipa/reports/data-quality`); assert.equal(api.status(), 200); assert.ok(!(await api.text()).includes('12345678'));
      assert.equal((await context.request.post(`${base}/api/kosipa/reports/loans`, { data: {} })).status(), 405);
      await context.close(); }

    console.log('UAT-7. branch / member / grant isolation: member-directory-only and unlinked accounts');
    { const { context, page } = await session(); await login(page, 'kasir1');
      await page.goto(`${base}/console`); const links = await sidebar(page);
      assert.ok(links.includes('/console/kosipa/anggota')); for (const href of ['/console/kosipa/pinjaman', '/console/kosipa/payroll', '/console/kosipa/simpanan']) assert.ok(!links.includes(href), `${href} hidden`);
      assert.ok(links.includes('/console/kosipa/laporan'), 'the member grant gives the membership summary, so the hub is listed');
      await page.goto(`${base}/console/kosipa/laporan`); await page.getByRole('link', { name: 'Ringkasan keanggotaan' }).waitFor(); for (const name of ['Laporan pinjaman', 'Laporan payroll', 'Ringkasan mutasi simpanan', 'Kualitas data keuangan']) assert.equal(await page.getByRole('link', { name }).count(), 0, `${name} not offered`);
      for (const path of ['/console/kosipa/pinjaman', '/console/kosipa/pinjaman/PINSYN9002', '/console/kosipa/payroll', '/console/kosipa/simpanan/9003', '/console/kosipa/laporan/pinjaman', '/console/kosipa/laporan/payroll', '/console/kosipa/laporan/simpanan', '/console/kosipa/laporan/kualitas-data']) { await page.goto(`${base}${path}`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor(); }
      for (const api of ['loans', 'savings/9003', 'payroll', 'reports/loans', 'reports/payroll', 'reports/data-quality', 'reports/savings-movements', 'reports/savings-movements/export', 'reports/membership/export']) assert.equal((await context.request.get(`${base}/api/kosipa/${api}`)).status(), 403, api);
      await context.close();
      const other = await session(); await login(other.page, 'kasir2'); await other.page.goto(`${base}/console/kosipa/laporan/kualitas-data`); await other.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
      assert.equal((await other.context.request.get(`${base}/api/kosipa/reports/loans`)).status(), 403); await other.context.close(); }

    console.log('UAT-A. audit trail covers every protected read, opaque subjects, no NIK');
    { const events = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE action LIKE 'kosipa.%' AND occurred_at > NOW(3) - INTERVAL 30 MINUTE ORDER BY id`;
      const actions = new Set(events.map((e) => e.action));
      for (const a of ['kosipa.member.view', 'kosipa.savings.view', 'kosipa.loan.list.view', 'kosipa.loan.detail.view', 'kosipa.payroll.list.view', 'kosipa.payroll.batch.view', 'kosipa.payroll.member.view', 'kosipa.payroll.reconcile', 'kosipa.report.loan.view', 'kosipa.report.payroll.view', 'kosipa.report.quality.view', 'kosipa.report.membership.view', 'kosipa.report.savings.view']) assert.ok(actions.has(a), `audit has ${a}`);
      assert.ok(!JSON.stringify(events).includes('S900')); }
  }

  if (mode === 'reader-outage') {
    console.log('UAT-11. KOSIPA reader outage (synthetic tables renamed): sections degrade independently, nothing is invented, TOKO keeps working');
    await linkAccounts();
    outage('break');
    try {
      const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/pinjaman/PINSYN9002`); await page.getByRole('heading', { name: 'Pinjaman PINSYN9002' }).waitFor(); let t = await text(page);
      assert.match(t, /Pokok \(rencana\)\s+Rp 1\.200\.000/, 'the loan header (a table that is still readable) renders'); assert.match(t, /Jadwal angsuran tidak dapat dibaca saat ini/); assert.doesNotMatch(t, /Σ pokok jadwal/);
      await page.goto(`${base}/console/kosipa/simpanan/9003`); await page.getByRole('heading', { name: 'Buku simpanan' }).waitFor(); t = await text(page);
      assert.match(t, /Bagian ini|Data tidak dapat dibaca saat ini/); assert.match(t, /Saldo resmi belum tersedia/); assert.doesNotMatch(t, /Rp 250\.000/);
      await page.goto(`${base}/console/kosipa/payroll/POTSYN202608A`); await page.getByRole('heading', { name: 'Batch tidak dapat dibaca' }).waitFor();
      await page.goto(`${base}/console/kosipa/laporan/kualitas-data`); await page.getByRole('heading', { name: 'Kualitas data keuangan' }).waitFor(); t = await text(page);
      assert.ok((t.match(/Bagian ini tidak dapat dibaca saat ini/g) ?? []).length >= 4, 'each failing diagnostic says so on its own'); assert.match(t, /Tanggal dokumen pinjaman tidak dapat dipakai[\s\S]*Dari 7 dokumen/, 'the diagnostics that can still be read are shown');
      assert.doesNotMatch(t, /tidak memiliki dokumen pinjaman\b.*0 nomor/, 'a failed scan is never shown as clean');
      await page.goto(`${base}/console/kosipa/anggota/9003`); await page.getByRole('heading', { name: 'Profil' }).waitFor();
      const api = await context.request.get(`${base}/api/kosipa/payroll/POTSYN202608A`); assert.equal(api.status(), 503); assert.equal(await api.text(), '{"error":"KOSIPA_UNAVAILABLE"}');
      await page.goto(`${base}/sales`); await page.getByText('Telusuri transaksi').waitFor();   // TOKO is unaffected
      await context.close();
    } finally { outage('restore'); }
  }

  if (mode === 'store-down') {
    console.log('UAT-10. console store (identity + audit) unreachable: every KOSIPA read fails closed, TOKO keeps working');
    const { context, page } = await session(); await login(page, 'admin'); await page.waitForURL(/\/console(\?entry=login)?$/);
    await page.getByText('Akses KOSIPA sementara tidak dapat diperiksa').waitFor();
    for (const path of ['/console/kosipa/anggota?q=S9001', '/console/kosipa/simpanan', '/console/kosipa/pinjaman', '/console/kosipa/payroll', '/console/kosipa/laporan', '/console/kosipa/laporan/kualitas-data']) { await page.goto(`${base}${path}`); await page.getByRole('heading', { name: /Layanan KOSIPA tidak tersedia|Akses ditolak|Akun belum ditautkan/ }).waitFor(); assert.doesNotMatch(await text(page), /PINSYN|POTSYN|Rp \d/, `${path} shows no data`); }
    for (const api of ['loans', 'savings/9003', 'payroll', 'reports/loans', 'reports/data-quality']) assert.ok([403, 503].includes((await context.request.get(`${base}/api/kosipa/${api}`)).status()), api);
    await page.goto(`${base}/sales`); await page.getByText('Telusuri transaksi').waitFor(); await context.close();
    const kasir = await session(); await login(kasir.page, 'kasir1'); await kasir.page.waitForURL(`${base}/pos`); await kasir.context.close();
  }

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`integrated UAT (${mode}) passed; screenshots in ${output}`);
} finally {
  if (mode !== 'store-down') {
    await seed.$executeRawUnsafe('DELETE FROM ref_menu_akses WHERE id IN (9005,9006,9007)'); await seed.$executeRawUnsafe('DELETE FROM ref_menu WHERE id IN (9005,9006)');
    await seed.$executeRawUnsafe('DELETE FROM ref_group_akses WHERE id = 9003'); await seed.$executeRawUnsafe('DELETE FROM ref_group WHERE id = 9002'); await seed.$executeRawUnsafe('DELETE FROM ref_users WHERE id_ref_user = 9003');
  }
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
