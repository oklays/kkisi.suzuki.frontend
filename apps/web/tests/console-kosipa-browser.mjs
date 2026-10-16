import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of Checkpoint 3 (identity links + KOSIPA read + Anggota 360) on the SYNTHETIC e2e schema.
// The built app must run on 127.0.0.1 with DATABASE_URL = the e2e reader, CONSOLE_ENABLED=true, KOSIPA_READ_ENABLED=true and
// DATABASE_URL_CONSOLE = the local console store (EXPECT=ok) or an unreachable one (EXPECT=store-down).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const expect = process.env.CONSOLE_KOSIPA_EXPECT || 'ok';
const output = process.env.CONSOLE_SCREENSHOTS || '/private/tmp/ksm-console-verification';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.ok(process.env.E2E_SEED_URL?.includes('/kkisi_e2e_legacy'), 'E2E_SEED_URL must target the synthetic schema');
await mkdir(output, { recursive: true });

const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
await assertE2eTarget(seed);
const consoleDb = expect === 'ok' ? new PrismaClient({ datasourceUrl: process.env.CONSOLE_STORE_TEST_URL }) : null;
const granted = [[1, 'users_edit'], [1, 'sales_view'], [2, 'sales_view']];
const ADMIN = 900001, KOPERASI = 900002;

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
}
const choose = async (select, text) => select.selectOption(await select.locator('option', { hasText: text }).first().getAttribute('value'));
const sidebar = async (page) => { await page.waitForLoadState('networkidle'); await page.locator('#console-nav nav a').first().waitFor({ state: 'attached' }); return page.locator('#console-nav nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))); };
const noOverflow = async (page) => { for (const width of [375, 390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 860 }); const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 0, `overflow ${o}px at ${width}`); } await page.setViewportSize({ width: 1440, height: 900 }); };

try {
  for (const [role, slug] of granted) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', role, slug);

  if (expect === 'store-down') {
    console.log('DOWN-1. console store unreachable: TOKO works, KOSIPA and link administration fail closed');
    const { context, page } = await session();
    await login(page, 'admin'); await page.waitForURL(/\/console(\?entry=login)?$/);
    await page.getByText('Akses KOSIPA sementara tidak dapat diperiksa').waitFor();
    assert.ok((await sidebar(page)).includes('/sales'), 'TOKO navigation is still available');
    assert.ok(!(await sidebar(page)).includes('/console/kosipa/anggota'));
    await page.goto(`${base}/console/kosipa/anggota?q=S9001`); await page.getByRole('heading', { name: 'Layanan KOSIPA tidak tersedia' }).waitFor();
    await page.goto(`${base}/console/settings/identitas`); await page.getByRole('heading', { name: /Layanan tidak tersedia|Penyimpanan console/ }).waitFor();
    await page.goto(`${base}/sales`); await page.getByText('Telusuri transaksi').waitFor();   // TOKO Sales page fully rendered
    const ready = await (await context.request.get(`${base}/health/ready`)).json();
    assert.equal(ready.status, 'ready'); assert.equal(ready.checks.consoleDb, false, 'readiness reports the console store separately and stays ready');
    await context.close();
    const kasir = await session(); await login(kasir.page, 'kasir1'); await kasir.page.waitForURL(`${base}/pos`); await kasir.context.close();
  } else {
    console.log('1. administrator links synth_koperasi to KOSIPA account synth_ksp; own account is not offered; duplicate refused');
    { const { context, page } = await session();
      await login(page, 'admin'); await page.waitForURL(/\/console(\?entry=login)?$/);
      assert.ok((await sidebar(page)).includes('/console/settings/identitas'));
      assert.ok(!(await sidebar(page)).includes('/console/kosipa/anggota'), 'the administrator itself is not linked');
      await page.goto(`${base}/console/settings/identitas`);
      const consoleSelect = page.getByLabel('Akun console');
      assert.equal(await consoleSelect.locator('option', { hasText: 'synth_admin' }).count(), 0, 'cannot select own account');
      assert.equal(await page.getByLabel('Akun KOSIPA').locator('option', { hasText: 'synth_ksp_off' }).count(), 0, 'inactive KOSIPA accounts are not offered');
      await choose(consoleSelect, /synth_koperasi/);
      await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/);
      await page.getByRole('button', { name: 'Tautkan' }).click();
      await page.getByText('Tautan dibuat.').waitFor();
      await page.locator('table').getByText('SYNTH koperasi').waitFor();
      await choose(consoleSelect, /synth_koperasi/); await choose(page.getByLabel('Akun KOSIPA'), /synth_ksp\)/);
      await page.getByRole('button', { name: 'Tautkan' }).click();
      await page.getByText('Akun console ini sudah memiliki tautan aktif.').waitFor();
      await page.screenshot({ path: `${output}/identity-links-1440.png`, fullPage: true });
      await noOverflow(page);
      await context.close(); }

    console.log('2. linked staff: Keanggotaan appears; search by NIK and name; Anggota 360 shows confirmed data and honest gaps');
    { const { context, page } = await session();
      await login(page, 'koperasi'); await page.waitForURL(/\/console(\?entry=login)?$/);
      assert.ok((await sidebar(page)).includes('/console/kosipa/anggota'));
      await page.goto(`${base}/console/kosipa/anggota`);
      await page.getByLabel('NIK atau nama anggota').fill('S9001'); await page.getByRole('button', { name: 'Cari' }).click();
      await page.getByRole('link', { name: 'S9001' }).click(); await page.waitForURL(/\/console\/kosipa\/anggota\/9001$/);
      await page.getByRole('heading', { name: 'SYNTH ANGGOTA SATU' }).waitFor();
      const text = await page.locator('main').innerText();
      assert.match(text, /0812•+001/); assert.match(text, /s•••@example\.invalid/); assert.match(text, /••••9001/);
      assert.doesNotMatch(text, /081200009001|satu@example\.invalid|9900119001|5\.000\.000/, 'raw contact data and salary are never shown');
      assert.match(text, /SIMPANAN WAJIB\s+Rp\s?501\.000/); assert.match(text, /SIMPANAN SUKARELA\s+Rp\s?0\s+Rp\s?100\.000/);
      assert.match(text, /bukan saldo resmi/);
      assert.match(text, /PINSYN9001/); assert.match(text, /Rp\s?12\.000\.000/);
      assert.equal((text.match(/Belum ditampilkan: sumber data ini menunggu tinjauan performa/g) ?? []).length, 1, 'installments unavailable (payroll is restricted: no matrix grant)');
      assert.match(text, /Belanja Kredit\s+Rp\s?150\.000/); assert.match(text, /Retur Kredit\s+Rp\s?30\.000/); assert.match(text, /Pemakaian bersih\s+Rp\s?120\.000/); assert.match(text, /Rp\s?1\.000\.000 \/ Rp\s?880\.000/);
      await page.screenshot({ path: `${output}/anggota360-1440.png`, fullPage: true });
      await noOverflow(page);
      await page.setViewportSize({ width: 375, height: 860 }); await page.screenshot({ path: `${output}/anggota360-375.png`, fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${base}/console/kosipa/anggota?q=KONTRAK`); await page.getByRole('link', { name: 'S9002' }).click();
      await page.getByText(/Tidak memenuhi syarat: kontrak sudah berakhir/).waitFor();
      await page.getByText('Tidak berlaku (tidak memenuhi syarat kredit)').waitFor();
      await page.goto(`${base}/console/kosipa/anggota?q=tidak-ada-anggota`); await page.getByRole('heading', { name: 'Anggota tidak ditemukan' }).waitFor();
      // /console streams (loading.tsx), so an unknown record renders the console not-found UI after the status was sent.
      await page.goto(`${base}/console/kosipa/anggota/999999`); await page.getByRole('heading', { name: 'Data tidak ditemukan' }).waitFor();
      await page.goto(`${base}/console/settings/identitas`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
      assert.equal((await context.request.post(`${base}/api/console/identity-links`, { data: { consoleUserId: 900004, kosipaUserId: 9001 }, headers: { 'X-CSRF-Token': 'x' } })).status(), 403, 'CSRF/capability refused');
      await context.close(); }

    console.log('3. unlinked cashier: still lands on /pos; KOSIPA pages explain the missing link');
    { const { context, page } = await session();
      await login(page, 'kasir1'); await page.waitForURL(`${base}/pos`);
      await page.goto(`${base}/console/kosipa/anggota`); await page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
      await context.close(); }

    console.log('4. revocation takes effect on the next request; every change and member view is in the audit trail');
    { const { context, page } = await session();
      await login(page, 'admin'); await page.waitForURL(/\/console(\?entry=login)?$/);
      await page.goto(`${base}/console/settings/identitas`);
      await page.getByRole('row', { name: /SYNTH koperasi/ }).getByRole('button', { name: 'Cabut tautan…' }).click();
      await page.getByLabel('Alasan pencabutan').fill('uji sintetis');
      await page.getByRole('button', { name: 'Cabut', exact: true }).click();
      await page.getByText('Tautan dicabut.').waitFor();
      await context.close(); }
    { const { context, page } = await session();
      // Role 2 also holds sales_add: without its KOSIPA link this user is cashier-focused again and lands on /pos.
      await login(page, 'koperasi'); await page.waitForURL(`${base}/pos`);
      await page.goto(`${base}/console`);
      assert.ok(!(await sidebar(page)).includes('/console/kosipa/anggota'));
      await page.goto(`${base}/console/kosipa/anggota/9001`); await page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
      await context.close(); }
    const events = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE actor_user_id IN (${ADMIN}, ${KOPERASI}) AND occurred_at > NOW(3) - INTERVAL 15 MINUTE ORDER BY id`;
    const seen = new Set(events.map((e) => `${e.action}:${e.outcome}`));
    for (const k of ['identity_link.create:success', 'identity_link.denied:denied', 'kosipa.member.view:success', 'identity_link.revoke:success']) assert.ok(seen.has(k), `audit ${k}`);
    assert.ok(events.every((e) => !/S9001|SYNTH/.test(e.subject_id)), 'audit subjects are opaque ids, never NIK or names');
  }
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`console KOSIPA browser checks (${expect}) passed; screenshots in ${output}`);
} finally {
  for (const [role, slug] of granted) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', role, slug);
  // Leave no ACTIVE synthetic link behind (history rows stay: the store is append-only by design).
  if (consoleDb) await consoleDb.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${ADMIN}, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`;
  await browser.close(); await seed.$disconnect(); await consoleDb?.$disconnect();
}
