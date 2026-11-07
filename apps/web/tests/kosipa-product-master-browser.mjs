import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';

// FA-03B T06: product masters in the Unified Console against the ISOLATED synthetic stack only (app server on :3230 from THIS checkout).
//   node --experimental-strip-types tests/kosipa-product-master-browser.mjs     (from apps/web)
// Product tables and menus are snapshotted and restored; the operator's grant is revoked at the end.
const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
const config = await stack.loadConfig();
const accounts = JSON.parse(readFileSync(new URL('../../../.local/kosipa-fa01/accounts.json', import.meta.url), 'utf8'));
const base = `http://127.0.0.1:${stack.APP_PORT}`;
const output = process.env.KFA_SCREENSHOTS || '/private/tmp/kfa01-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const consoleDb = new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) });
const store = new PrismaKosipaGrantStore(consoleDb);
const root = await stack.rootConnection(config);
const q = async (sql, params = []) => (await root.query(sql, params))[0];
const RUN = randomUUID().slice(0, 4).toUpperCase();
const TABLES = ['m_jenis_simpanan', 'm_jenis_pinjaman', 'm_jenis_pembiayaan', 'm_suku_bunga'];
const snapshot = {}; for (const t of TABLES) snapshot[t] = await q(`SELECT * FROM \`${t}\``);
const menus = await q("SELECT id, status FROM ref_menu WHERE url IN ('master/jenis_simpanan_c','master/jenis_pinjaman_c','master/jenis_pembiayaan_c','master/suku_bunga_c')");
const browser = await chromium.launch({ headless: true });
const errors = []; const grants = [];

async function session(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of (400|401|403|404|409|422|503)|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${base}/login`);
  await p.getByLabel('Username').fill(accounts[name].username); await p.getByLabel('Password').fill(accounts[name].password);
  await p.getByRole('button', { name: 'Masuk', exact: true }).click();
  await p.waitForURL(/\/console/);
  return { context, page: p };
}
const shot = (p, name) => p.screenshot({ path: `${output}/product-${name}.png`, fullPage: true });
// Measured after the layout settles: right after a viewport resize the console frame can report a transient overflow for one frame (observed 18px for
// < 60 ms); only an overflow that persists for 500 ms is a defect a user would see.
const noOverflow = async (p, label) => {
  for (const width of [375, 768, 1440]) {
    await p.setViewportSize({ width, height: 860 });
    let o = 0;
    for (let i = 0; i < 10; i++) { o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o <= 0) break; await p.waitForTimeout(50); }
    assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
const status = (p, text) => p.getByRole('status').filter({ hasText: text }).waitFor();
const alert = (p, text) => p.getByRole('alert').filter({ hasText: text }).waitFor();

try {
  await q("UPDATE ref_menu SET status = 0 WHERE url IN ('master/jenis_simpanan_c','master/jenis_pinjaman_c','master/jenis_pembiayaan_c','master/suku_bunga_c')");
  console.log('P1. viewer: index shows the product group and the FD-33 retirements; product list is read-only; the form page is refused');
  const viewer = await session('viewer');
  await viewer.page.goto(`${base}/console/kosipa/master`);
  await viewer.page.getByRole('heading', { name: 'Produk Keuangan' }).waitFor();
  for (const t of ['Master Jenis Simpanan', 'Master Jenis Pinjaman', 'Master Jenis Pembiayaan', 'Master Suku Bunga']) await viewer.page.getByText(t, { exact: true }).waitFor();
  await viewer.page.getByRole('heading', { name: 'Master Dipensiunkan' }).waitFor();
  await shot(viewer.page, '01-index');
  await viewer.page.goto(`${base}/console/kosipa/master/jenis-pembiayaan`);
  await viewer.page.locator('tr[data-product-id="1"]').waitFor();
  assert.equal(await viewer.page.getByRole('link', { name: /Tambah jenis pembiayaan/ }).count(), 0);
  await viewer.page.goto(`${base}/console/kosipa/master/jenis-pembiayaan/baru`);
  assert.equal(await viewer.page.locator('form[aria-label^="Tambah"]').count(), 0);
  await viewer.context.close();

  console.log('P2. two administrators grant master management to the operator');
  const id = await store.request({ consoleUserId: stack.USERS.operator, capability: 'kosipa.master.manage', requestedBy: stack.USERS.admin, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: 'uji e2e master produk' });
  if (id) { assert.equal(await store.decide(id, 'active', stack.USERS.second, new Date(), null), true); grants.push(id); }
  const op = await session('operator'); const p = op.page;

  console.log('P3. create Jenis Pembiayaan: form standard, COA description derived, lands on the edit page with a confirmation');
  await p.goto(`${base}/console/kosipa/master/jenis-pembiayaan`);
  await p.getByRole('link', { name: /Tambah jenis pembiayaan/ }).click();
  await p.waitForURL(/jenis-pembiayaan\/baru$/);
  await p.locator('#pm-pembiayaan_code').fill(`SYN-E2E-${RUN}`); await p.locator('#pm-pembiayaan_name').fill(`SYNTH E2E ${RUN}`);
  await p.locator('#pm-jenis_bunga').selectOption('Flat'); await p.locator('#pm-biaya_jasa').fill('1.2345'); await p.locator('#pm-biaya_admin').fill('10000');
  await p.locator('#pm-tgl_tempo').fill('25'); await p.locator('#pm-akun_code').selectOption('1-1300');
  await p.getByText('Deskripsi tersimpan otomatis: SYNTH Piutang Pinjaman Anggota').waitFor();
  await shot(p, '02-create');
  await noOverflow(p, 'create');
  await p.getByRole('button', { name: 'Simpan', exact: true }).click();
  await p.waitForURL(/jenis-pembiayaan\/\d+\/ubah$/);
  await status(p, 'Data ditambahkan.');
  const [row] = await q('SELECT * FROM m_jenis_pembiayaan WHERE pembiayaan_code = ?', [`SYN-E2E-${RUN}`]);
  assert.equal(row.akun_desc, 'SYNTH Piutang Pinjaman Anggota'); assert.equal(row.biaya_jasa, '1.2345'); assert.equal(row.is_active, '1');

  console.log('P4. edit: a label change needs no reason; a financial change shows the FD-32 warning and needs a reason');
  await p.locator('#pm-pembiayaan_name').fill(`SYNTH E2E ${RUN} B`);
  assert.equal(await p.locator('#pm-reason').count(), 0);
  await p.getByRole('button', { name: /Simpan perubahan \(1\)/ }).click();
  await status(p, 'Perubahan disimpan.');
  await p.locator('#pm-lock_1angsuran').selectOption('1');
  await p.locator('#pm-reason').waitFor();
  await p.getByText('membaca nilai master SAAT INI').waitFor();
  assert.equal(await p.getByRole('button', { name: /Simpan perubahan/ }).isDisabled(), true, 'disabled until a reason is given');
  await shot(p, '03-financial-warning');
  await p.locator('#pm-reason').fill('Kunci angsuran per rapat pengurus');
  await p.getByRole('button', { name: /Simpan perubahan/ }).click();
  await status(p, 'Perubahan disimpan.');
  assert.equal((await q(`SELECT reason FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE command = 'master.jenis_pembiayaan.update' ORDER BY id DESC LIMIT 1`))[0].reason, 'Kunci angsuran per rapat pengurus');

  console.log('P5. a server field error names and marks the field');
  await p.locator('#pm-biaya_jasa').fill('1.23456');
  await p.locator('#pm-reason').fill('Uji validasi');
  await p.getByRole('button', { name: /Simpan perubahan/ }).click();
  await alert(p, 'Biaya jasa:');
  assert.equal(await p.locator('#pm-biaya_jasa').getAttribute('aria-invalid'), 'true');
  await shot(p, '04-field-error');
  await p.reload();

  console.log('P6. deactivate with a reason; the list shows the status');
  await p.locator('#pm-status-reason').fill('Produk dihentikan');
  await p.getByRole('button', { name: 'Nonaktifkan' }).click();
  await status(p, 'Data dinonaktifkan.');
  await p.goto(`${base}/console/kosipa/master/jenis-pembiayaan`);
  await p.locator(`tr[data-product-id="${row.id}"]`).getByText('Tidak aktif').waitFor();
  await noOverflow(p, 'list');

  console.log('P7. Jenis Pinjaman: a fixed legacy root cannot get a parent; Suku Bunga states deactivation has no effect');
  await p.goto(`${base}/console/kosipa/master/jenis-pinjaman/2/ubah`);
  await p.locator('#pm-parent_id').selectOption('1');
  await p.locator('#pm-reason').count();
  await p.getByRole('button', { name: /Simpan perubahan/ }).click();
  await alert(p, 'Induk jenis:');
  await shot(p, '05-pinjaman-parent');
  await p.goto(`${base}/console/kosipa/master/suku-bunga/baru`);
  await p.locator('#pm-code_suku_bunga').fill(`TT${RUN}`); await p.locator('#pm-desc_suku_bunga').fill('Tanggal jatuh tempo'); await p.locator('#pm-nilai_persen').fill('25');
  await p.getByRole('button', { name: 'Simpan', exact: true }).click();
  await p.waitForURL(/suku-bunga\/\d+\/ubah$/);
  await p.getByText(/Tidak berpengaruh pada perhitungan/).waitFor();
  await shot(p, '06-suku-bunga');

  console.log('P8. legacy controller re-enabled: notice, form locked');
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'master/jenis_pembiayaan_c'");
  await p.goto(`${base}/console/kosipa/master/jenis-pembiayaan/${row.id}/ubah`);
  await p.getByText('Menu KOSIPA lama masih aktif').waitFor();
  assert.equal(await p.locator('#pm-pembiayaan_name').isDisabled(), true);
  await q("UPDATE ref_menu SET status = 0 WHERE url = 'master/jenis_pembiayaan_c'");
  await op.context.close();
  assert.deepEqual(errors, []);
  console.log('product master browser suite: all steps passed');
} finally {
  try {
    for (const g of grants) await store.revoke(g, stack.USERS.admin, new Date(), 'selesai uji e2e').catch(() => undefined);
    for (const t of TABLES) {
      const ids = snapshot[t].map((r) => r.id);
      await q(`DELETE FROM \`${t}\`${ids.length ? ` WHERE id NOT IN (${ids.join(',')})` : ''}`);
      for (const r of snapshot[t]) { const { id, ...cols } = r; await q(`UPDATE \`${t}\` SET ? WHERE id = ?`, [cols, id]); }
    }
    for (const m of menus) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [m.status, m.id]);
  } finally { await browser.close(); await consoleDb.$disconnect(); await root.end(); }
}
