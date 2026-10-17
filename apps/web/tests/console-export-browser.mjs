import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of Checkpoint 10 secure CSV export (EXPORT_EXPECT=on: KOSIPA_EXPORT_ENABLED=true and KOSIPA_EXPORT_USER_IDS=<synth_koperasi id>; off: flag unset) on the SYNTHETIC e2e schema. The built app must run on
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
const expectExport = (process.env.EXPORT_EXPECT || 'on') === 'on';
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
const text = async (page) => { await page.waitForFunction(() => { const m = document.querySelector('main'); return m && m.innerText.trim() !== 'Memuat…' && m.innerText.trim() !== ''; }); await page.waitForLoadState('networkidle'); return page.locator('main').innerText(); };

const lines = (body) => body.trimEnd().split('\r\n');
try {
  await seed.$executeRawUnsafe("SET SESSION sql_mode=''");
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9007,9001,9002,1,0,0,0,0,0)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9003,'synth_ksp_member','SYNTH KOSIPA ANGGOTA SAJA',1,'x','',0,'')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group (id, nama_group, status) VALUES (9002,'SYNTH KOSIPA ANGGOTA',1)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9003,9003,9002,1)`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9005,'SYNTH Payroll','payroll/matrix_c',1,0,'WEB','PRIVATE'),(9006,'SYNTH Toko','anggota/trans_toko_c',1,0,'WEB','PRIVATE')`);
  await seed.$executeRawUnsafe(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9005,9005,9001,1,0,0,0,0,0),(9006,9006,9001,1,0,0,0,0,0)`);
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);
  { const { context, page } = await session(); await login(page, 'admin'); await page.goto(`${base}/console/settings/identitas`);
    const consoleSelect = page.getByLabel('Akun console');
    await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await choose(consoleSelect, /synth_kasir1/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp_member\)/); await page.getByRole('button', { name: 'Tautkan' }).click(); await page.getByText('Tautan dibuat.').waitFor();
    await context.close(); }

  if (expectExport) {
    console.log('EXP-1. an allow-listed, linked user with view grants sees download links and receives exact, safe CSV files');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/laporan/pinjaman`); await page.getByRole('heading', { name: 'Laporan pinjaman' }).waitFor();
      await page.getByRole('link', { name: 'Unduh CSV laporan ini' }).waitFor(); assert.match(await text(page), /tanpa nama, NIK atau gaji anggota/);
      await page.goto(`${base}/console/kosipa/laporan/payroll`); await page.getByRole('link', { name: 'Unduh CSV laporan ini' }).waitFor();
      await page.goto(`${base}/console/kosipa/laporan/kualitas-data`); await page.getByRole('link', { name: 'Unduh CSV diagnostik ini' }).waitFor();
      const dl = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Unduh CSV diagnostik ini' }).click()]).then(([d]) => d);
      assert.equal(dl.suggestedFilename(), 'kualitas-data-keuangan.csv');
      const loan = await context.request.get(`${base}/api/kosipa/reports/loans/export?tahun=2026`); assert.equal(loan.status(), 200);
      assert.equal(loan.headers()['content-type'], 'text/csv; charset=utf-8'); assert.equal(loan.headers()['content-disposition'], 'attachment; filename="laporan-pinjaman-2026.csv"'); assert.equal(loan.headers()['cache-control'], 'no-store'); assert.equal(loan.headers()['x-content-type-options'], 'nosniff');
      const lb = lines(await loan.text());
      assert.ok(lb.includes('BULAN,2026-03,APPROVED,BELUM LUNAS,4,3100000.00'), 'exact decimals'); assert.ok(lb.includes('TANGGAL_TIDAK_DAPAT_DIPAKAI,ZERO,,,1,500000.00'));
      assert.ok(lb.some((l) => l.startsWith('saldo_resmi,"TIDAK TERSEDIA')));
      const pay = lines(await (await context.request.get(`${base}/api/kosipa/reports/payroll/export?tahun=2026`)).text());
      assert.ok(pay.some((l) => l.startsWith('2026-08,YA,POTSYN202608A,ANGGOTA,APPROVED,2,2,250000.00,250000.00,0.00,')), 'recorded totals exact'); assert.ok(pay.some((l) => l.startsWith('2026-07,TIDAK') === false && l.startsWith('2026-07,YA,POTSYN202607A') && l.includes('50000.6666')), 'sub-sen kept');
      assert.ok(pay.some((l) => l.includes('HEADER_TOTAL_MISMATCH')) && pay.some((l) => l.includes('NO_ROWS')));
      const dq = await (await context.request.get(`${base}/api/kosipa/reports/data-quality/export`)).text(); const dqLines = lines(dq);
      assert.ok(dqLines.some((l) => l.includes('nomor dokumen pinjaman ganda') && l.includes('CONFIRMED,OK,1,,PINSYN9005')));
      assert.ok(dqLines.some((l) => l.includes('tingkat sub-sen') && l.includes('EXPECTED_PRECISION,OK,')) && dqLines.some((l) => l.includes('pemetaan cabang') && l.includes('UNVERIFIED,BELUM_DIVERIFIKASI')));
      for (const body of [lb.join('\n'), pay.join('\n'), dq]) { assert.doesNotMatch(body, /S900\d|12345678|SYNTH ANGGOTA|9900/, 'no NIK, name, salary or bank detail in any export'); for (const line of body.split(/\r?\n/)) for (const cell of line.split(',')) assert.doesNotMatch(cell.replace(/^"/, ''), /^[=+@]/); }
      const mem = lines(await (await context.request.get(`${base}/api/kosipa/reports/membership/export`)).text());
      assert.ok(mem.includes('STATUS,AKTIVE,TETAP,YA,2,0,0,0') && mem.includes('STATUS,AKTIVE,KONTRAK,YA,1,1,1,0') && mem.includes('GRUP,,ANGGOTA,YA,3,,,'), mem.join('\n'));
      const sav = lines(await (await context.request.get(`${base}/api/kosipa/reports/savings-movements/export?tahun=2026`)).text());
      assert.ok(sav.some((l) => l.startsWith('saldo_resmi,TIDAK TERSEDIA')) && sav.includes('BULAN,2026-05,SIMPANAN SUKARELA,61,60250.00,500.00,12.50,0.00,40000.00,0') && sav.includes('TIDAK_DITEMPATKAN,HEADER_AMBIGUOUS,SIMPANAN WAJIB,1,,,,,,'), sav.join('\n'));
      assert.doesNotMatch(mem.join('\n') + sav.join('\n'), /S900\d|SYNTH ANGGOTA|@example|9900/);
      assert.equal((await context.request.get(`${base}/api/kosipa/reports/loans/export?tahun=26`)).status(), 400);
      assert.equal((await context.request.get(`${base}/api/kosipa/reports/loans/export`, { headers: { 'sec-fetch-site': 'cross-site' } })).status(), 403);
      assert.equal((await context.request.post(`${base}/api/kosipa/reports/loans/export`, { data: {} })).status(), 405);
      await context.close(); }

    console.log('EXP-2. rate limit: the 7th export in the window is refused (429) and audited as denied');
    { const { context, page } = await session(); await login(page, 'koperasi'); const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await context.request.get(`${base}/api/kosipa/reports/loans/export?tahun=2025`)).status());
      const limited = await context.request.get(`${base}/api/kosipa/reports/loans/export?tahun=2025`); statuses.push(limited.status());
      assert.ok(statuses.slice(-1)[0] === 429 && statuses.includes(429) && limited.headers()['retry-after'] === '60', JSON.stringify(statuses));
      console.log('EXP-2b. the limiter is ONE instance per process: another export route is refused too after the loans budget is exhausted');
      for (const route of ['payroll', 'membership', 'savings-movements', 'data-quality']) assert.equal((await context.request.get(`${base}/api/kosipa/reports/${route}/export`)).status(), 429, `${route} export shares the per-process budget`);
      if (process.env.EXPORT_SECOND_BASE) {   // optional: a SECOND app process (same database, same allow-list) has its own, empty window
        const b2 = process.env.EXPORT_SECOND_BASE; assert.equal(new URL(b2).hostname, '127.0.0.1'); assert.notEqual(new URL(b2).port, new URL(base).port);
        const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); await p2.goto(`${b2}/login`);
        await p2.getByLabel('Username').fill('synth_koperasi'); await p2.getByLabel('Password').fill(pw.koperasi); await p2.getByRole('button', { name: 'Masuk', exact: true }).click(); await p2.waitForURL(/\/(console(\?entry=login)?|pos)$/);
        const second = []; for (let i = 0; i < 7; i++) second.push((await ctx2.request.get(`${b2}/api/kosipa/reports/loans/export?tahun=2025`)).status());
        console.log(`EXP-2c. per-process limiter: second instance, same user, same window -> ${JSON.stringify(second)}`);
        assert.deepEqual(second, [200, 200, 200, 200, 200, 200, 429], 'each process counts separately: the effective limit is 6 x instances'); await ctx2.close();
        await context.close(); await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
        console.log('export limiter two-instance probe passed (probe-only: the remaining checks run in the single-instance phase)'); process.exit(0);
      }
      await context.close(); }

    console.log('EXP-3. a user who may only view / a user outside the allow-list / an unlinked user cannot export; the download link is not even rendered');
    { const { context, page } = await session(); await login(page, 'kasir1');
      assert.equal((await context.request.get(`${base}/api/kosipa/reports/loans/export`)).status(), 403); assert.equal((await context.request.get(`${base}/api/kosipa/reports/data-quality/export`)).status(), 403); assert.equal((await context.request.get(`${base}/api/kosipa/reports/membership/export`)).status(), 403, 'may view members, may not export them');
      await context.close();
      const admin = await session(); await login(admin.page, 'admin'); assert.equal((await admin.context.request.get(`${base}/api/kosipa/reports/payroll/export`)).status(), 403, 'unlinked administrator'); await admin.context.close();
      const anon = await browser.newContext(); assert.equal((await anon.request.get(`${base}/api/kosipa/reports/loans/export`)).status(), 401); await anon.close(); }

    console.log('EXP-A. audit trail: every export (and the refusal) is recorded with opaque subjects and no figures');
    { const events = await consoleDb.$queryRaw`SELECT outcome, subject_id, detail FROM console_audit_event WHERE action = 'kosipa.report.export' AND occurred_at > NOW(3) - INTERVAL 30 MINUTE ORDER BY id`;
      assert.ok(events.some((e) => e.outcome === 'success' && e.subject_id === 'report:loan') && events.some((e) => e.outcome === 'success' && e.subject_id === 'report:payroll') && events.some((e) => e.outcome === 'success' && e.subject_id === 'report:quality') && events.some((e) => e.outcome === 'denied'));
      assert.ok(!JSON.stringify(events).match(/2000000|3100000|S900/)); }
  } else {
    console.log('EXP-OFF. flag off: no link is rendered and every export endpoint refuses, even for a user who could view the report');
    { const { context, page } = await session(); await login(page, 'koperasi');
      await page.goto(`${base}/console/kosipa/laporan/pinjaman`); await page.getByRole('heading', { name: 'Laporan pinjaman' }).waitFor(); assert.equal(await page.getByRole('link', { name: /Unduh CSV/ }).count(), 0);
      for (const r of ['loans', 'payroll', 'data-quality', 'membership', 'savings-movements']) assert.equal((await context.request.get(`${base}/api/kosipa/reports/${r}/export`)).status(), 403, r);
      assert.equal((await context.request.get(`${base}/api/kosipa/reports/loans`)).status(), 200, 'viewing the report is unaffected'); await context.close(); }
  }
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`export checks (${expectExport ? 'on' : 'off'}) passed`);
} finally {
  await seed.$executeRawUnsafe('DELETE FROM ref_menu_akses WHERE id IN (9005,9006,9007)'); await seed.$executeRawUnsafe('DELETE FROM ref_menu WHERE id IN (9005,9006)');
  await seed.$executeRawUnsafe('DELETE FROM ref_group_akses WHERE id = 9003'); await seed.$executeRawUnsafe('DELETE FROM ref_group WHERE id = 9002'); await seed.$executeRawUnsafe('DELETE FROM ref_users WHERE id_ref_user = 9003');
  for (const [role, slug] of [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view'], [4, 'sales_view']]) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
