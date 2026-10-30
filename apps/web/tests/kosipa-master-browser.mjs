import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// FA-01 / FA-01.5 / FA-02 end-to-end in the Unified Console against the ISOLATED synthetic stack only:
//   two-administrator grant, Master Lokasi + Bagian + Jenis Dokumen + Rekening Bank + Periode Angsuran, legacy fail-closed, revocation.
//   node integration/kosipa-full-access/local-stack.mjs setup && node integration/kosipa-full-access/app-server.mjs build && ... start
//   node tests/kosipa-master-browser.mjs        (from apps/web)
const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
const config = await stack.loadConfig();
const accounts = JSON.parse(readFileSync(new URL('../../../.local/kosipa-fa01/accounts.json', import.meta.url), 'utf8'));
const base = `http://127.0.0.1:${stack.APP_PORT}`;
const output = process.env.KFA_SCREENSHOTS || '/private/tmp/kfa01-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const read = new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 1) });
const consoleDb = new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) });
const root = await stack.rootConnection(config);
const RUN = randomUUID().slice(0, 5).toUpperCase();
const page = (type) => `${base}/console/kosipa/master/${type}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const started = new Date(Date.now() - 1000);

async function session(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|404|409|422|503)|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${base}/login`);
  await p.getByLabel('Username').fill(accounts[name].username); await p.getByLabel('Password').fill(accounts[name].password);
  await p.getByRole('button', { name: 'Masuk', exact: true }).click();
  await p.waitForURL(/\/console/);
  return { context, page: p };
}
const shot = (p, name) => p.screenshot({ path: `${output}/${name}.png`, fullPage: true });
const row = (p, text) => p.locator('tr', { hasText: text });
const noOverflow = async (p) => { for (const width of [375, 768, 1440]) { await p.setViewportSize({ width, height: 860 }); const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 0, `overflow ${o}px at ${width}`); } await p.setViewportSize({ width: 1440, height: 900 }); };
const csrfLessPost = (p, path, body) => p.evaluate(async ([u, b]) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).status, [path, body]);
const ledgerCommands = async () => (await root.query(`SELECT command FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE actor_console_user_id = ? AND created_at >= ? ORDER BY id`, [stack.USERS.operator, started.toISOString().slice(0, 23).replace('T', ' ')]))[0].map((r) => r.command);
async function addRow(p, values) {
  for (const [k, v] of Object.entries(values)) await p.locator(`form.kosipa-master-form input[name="${k}"]`).fill(v);
  await p.locator('form.kosipa-master-form').getByRole('button', { name: 'Simpan' }).click();
}
async function editRow(p, rowText, values) {
  await row(p, rowText).first().getByRole('button', { name: 'Ubah' }).click();
  const form = p.locator('form[aria-label^="Ubah"]');
  for (const [k, v] of Object.entries(values)) await form.locator(`input[name="${k}"]`).fill(v);
  await form.getByRole('button', { name: 'Simpan' }).click();
  return form;
}

try {
  console.log('E1. viewer: master index lists the five masters; pages are read-only; a POST without CSRF is refused');
  const viewer = await session('viewer');
  await viewer.page.goto(`${base}/console/kosipa/master`);
  for (const title of ['Master Lokasi', 'Master Bagian', 'Master Jenis Dokumen', 'Master Rekening Bank', 'Master Periode Angsuran']) await viewer.page.getByText(title, { exact: true }).waitFor();
  assert.ok(await viewer.page.locator('#console-nav a[href="/console/kosipa/master"]').count() >= 1, 'sidebar lists Master Data');
  await viewer.page.goto(page('lokasi'));
  await row(viewer.page, 'SYN-TMB').waitFor();
  assert.equal(await viewer.page.getByRole('heading', { name: 'Tambah data' }).count(), 0);
  assert.equal(await csrfLessPost(viewer.page, '/api/kosipa/master/lokasi', { idempotencyKey: randomUUID(), code: 'X', name: 'X' }), 403);
  await noOverflow(viewer.page);
  await shot(viewer.page, '01-viewer-read-only');
  await viewer.context.close();

  console.log('E2. unlinked console user: no KOSIPA access');
  const unlinked = await session('unlinked');
  await unlinked.page.goto(page('bagian'));
  await unlinked.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA' }).waitFor();
  await unlinked.context.close();

  console.log('E3. two-administrator grant: admin requests; cannot approve own request; operator still read-only; second admin approves');
  const admin = await session('admin');
  await admin.page.goto(`${base}/console/settings/akses-kosipa`);
  await admin.page.getByRole('heading', { name: 'Hak Ubah KOSIPA' }).waitFor();
  for (const button of await admin.page.locator('tr', { hasText: 'SYNTH KFA OPERATOR' }).getByRole('button', { name: /Cabut hak…|Tolak…/ }).all()) {
    await button.click(); await admin.page.locator('input[placeholder^="Alasan"]').fill('reset uji e2e'); await admin.page.getByRole('button', { name: /^(Cabut|Tolak)$/ }).click(); await admin.page.locator('.console-message').waitFor();
  }
  const users = admin.page.locator('select[name="consoleUserId"]');
  assert.equal(await users.locator('option', { hasText: 'SYNTH KFA ADMIN' }).count(), 0, 'no self-request option');
  await users.selectOption(await users.locator('option', { hasText: 'SYNTH KFA OPERATOR' }).getAttribute('value'));
  await admin.page.locator('input[name="reason"]').fill('uji e2e FA-02 master data');
  await admin.page.getByRole('button', { name: 'Ajukan' }).click();
  await admin.page.getByText('Administrator lain harus menyetujuinya').waitFor();
  const pendingRow = admin.page.locator('section[aria-labelledby="grant-pending"] tr', { hasText: 'SYNTH KFA OPERATOR' });
  await pendingRow.getByText('Menunggu administrator lain').waitFor();
  assert.equal(await pendingRow.getByRole('button', { name: 'Setujui' }).count(), 0, 'the requester is not offered approval');
  await shot(admin.page, '02-grant-pending');
  const operator = await session('operator');
  await operator.page.goto(page('lokasi'));
  await operator.page.getByText('memerlukan hak').waitFor();
  const second = await session('second');
  await second.page.goto(`${base}/console/settings/akses-kosipa`);
  await second.page.locator('section[aria-labelledby="grant-pending"] tr', { hasText: 'SYNTH KFA OPERATOR' }).getByRole('button', { name: 'Setujui' }).click();
  await second.page.getByText('Hak disetujui dan berlaku.').waitFor();
  await second.page.locator('section[aria-labelledby="grant-list"] tr', { hasText: 'SYNTH KFA OPERATOR' }).waitFor();
  await shot(second.page, '03-grant-approved');

  console.log('E4. operator, Master Lokasi: create (double click -> one row), edit code, rename of a referenced name refused, deactivate with reason');
  await operator.page.goto(page('lokasi'));
  await operator.page.getByRole('heading', { name: 'Tambah data' }).waitFor();
  const code = `E2E-${RUN}`;
  await operator.page.locator('form.kosipa-master-form input[name="code"]').fill(code); await operator.page.locator('form.kosipa-master-form input[name="name"]').fill(`SYNTH E2E ${RUN}`);
  await operator.page.locator('form.kosipa-master-form').getByRole('button', { name: 'Simpan' }).dblclick();
  await operator.page.getByText('Data ditambahkan.').waitFor();
  assert.equal(Number((await read.$queryRaw`SELECT COUNT(*) AS n FROM m_lokasi WHERE code_lokasi = ${code}`)[0].n), 1, 'double submit -> one row');
  await editRow(operator.page, code, { code: `${code}-B` });
  await operator.page.getByText('Perubahan disimpan.').waitFor();
  const refused = await editRow(operator.page, 'SYN-TMB', { name: 'SYNTH Tambun Baru' });
  await operator.page.getByText('masih dipakai data lain').waitFor();
  await refused.getByRole('button', { name: 'Batal' }).click();
  await row(operator.page, `${code}-B`).getByRole('button', { name: 'Nonaktifkan…' }).click();
  await operator.page.getByPlaceholder('Alasan (wajib)').fill('ditutup uji e2e');
  await operator.page.getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await operator.page.getByText('Data dinonaktifkan.').waitFor();
  await noOverflow(operator.page);
  await shot(operator.page, '04-lokasi-after-commands');

  console.log('E5. stale edit from a second tab is refused');
  const tabB = await operator.context.newPage();
  await tabB.goto(page('lokasi'));
  await row(operator.page, `${code}-B`).getByRole('button', { name: 'Ubah' }).click();
  await row(tabB, `${code}-B`).getByRole('button', { name: 'Ubah' }).click();
  await operator.page.locator('form[aria-label^="Ubah"] input[name="code"]').fill(`${code}-C`);
  await operator.page.locator('form[aria-label^="Ubah"]').getByRole('button', { name: 'Simpan' }).click();
  await operator.page.getByText('Perubahan disimpan.').waitFor();
  await tabB.locator('form[aria-label^="Ubah"] input[name="code"]').fill(`${code}-D`);
  await tabB.locator('form[aria-label^="Ubah"]').getByRole('button', { name: 'Simpan' }).click();
  await tabB.getByText('baru saja diubah orang lain').waitFor();
  await tabB.close();

  console.log('E6. FA-02 masters: Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran with their protections');
  await operator.page.goto(page('bagian'));
  await addRow(operator.page, { name: `SYNTH Bagian E2E ${RUN}` });
  await operator.page.getByText('Data ditambahkan.').waitFor();
  const bagianRefused = await editRow(operator.page, 'SYNTH Produksi', { name: 'SYNTH Produksi Baru' });
  await operator.page.getByText('masih dipakai data lain').waitFor();
  await bagianRefused.getByRole('button', { name: 'Batal' }).click();
  await shot(operator.page, '05-bagian');
  await operator.page.goto(page('jenis-dokumen'));
  await addRow(operator.page, { code: `D${RUN}`, name: 'SYNTH DOK E2E', remarks: 'uji' });
  await operator.page.getByText('Data ditambahkan.').waitFor();
  await operator.page.goto(page('rekening-bank'));
  const bankRefused = await editRow(operator.page, 'SYN BANK A', { code: `SYN BANK A ${RUN}` });
  await operator.page.getByText('masih dipakai data lain').waitFor();
  await bankRefused.getByRole('button', { name: 'Batal' }).click();
  await editRow(operator.page, 'SYN BANK A', { remarks: `label e2e ${RUN}` });
  await operator.page.getByText('Perubahan disimpan.').waitFor();
  await shot(operator.page, '06-rekening-bank');
  await operator.page.goto(page('periode-angsuran'));
  await row(operator.page, '24 X').getByRole('button', { name: 'Ubah' }).click();
  assert.equal(await operator.page.locator('form[aria-label^="Ubah"] input[name="code"]').getAttribute('readonly'), '', 'the month count is read-only in the form');
  await operator.page.locator('form[aria-label^="Ubah"] input[name="remarks"]').fill(`DUA TAHUN ${RUN}`);
  await operator.page.locator('form[aria-label^="Ubah"]').getByRole('button', { name: 'Simpan' }).click();
  await operator.page.getByText('Perubahan disimpan.').waitFor();
  assert.equal((await read.$queryRaw`SELECT jangka_waktu_code FROM m_jangka_waktu WHERE id = 2`)[0].jangka_waktu_code, '24');
  await shot(operator.page, '07-periode-angsuran');

  console.log('E7. legacy controller re-enabled (adm_menu_c path): the page turns read-only and commands fail closed');
  await root.query("UPDATE ref_menu SET status = 1 WHERE url = 'master/bagian_c'");
  try {
    await operator.page.goto(page('bagian'));
    await operator.page.getByText('Menu KOSIPA lama untuk master ini masih aktif').waitFor();
    assert.equal(await operator.page.getByRole('heading', { name: 'Tambah data' }).count(), 0);
    await shot(operator.page, '08-legacy-active');
  } finally { await root.query("UPDATE ref_menu SET status = 0 WHERE url = 'master/bagian_c'"); }

  console.log('E8. revocation (one administrator): the operator loses write access on the next request');
  await admin.page.reload();
  await admin.page.locator('section[aria-labelledby="grant-list"] tr', { hasText: 'SYNTH KFA OPERATOR' }).getByRole('button', { name: 'Cabut hak…' }).click();
  await admin.page.getByPlaceholder('Alasan pencabutan').fill('akhir uji e2e FA-02');
  await admin.page.getByRole('button', { name: 'Cabut', exact: true }).click();
  await admin.page.getByText('Hak dicabut.').waitFor();
  await operator.page.goto(page('lokasi'));
  await operator.page.getByText('memerlukan hak').waitFor();

  console.log('E9. evidence: ledger (separate database) and audit rows for exactly these commands; grant workflow audited');
  assert.deepEqual(await ledgerCommands(), ['master.lokasi.create', 'master.lokasi.update', 'master.lokasi.deactivate', 'master.lokasi.update',
    'master.bagian.create', 'master.jenis_dokumen.create', 'master.rekening_bank.update', 'master.periode_angsuran.update']);
  const trail = (await consoleDb.$queryRaw`SELECT action, outcome FROM console_audit_event WHERE occurred_at >= ${started} AND action LIKE 'kosipa.%' ORDER BY id`).map((a) => `${a.action}:${a.outcome}`);
  for (const expected of ['kosipa.grant.request:success', 'kosipa.grant.approve:success', 'kosipa.grant.revoke:success', 'kosipa.master.create:success', 'kosipa.command.failed:failed']) assert.ok(trail.includes(expected), expected);

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`PASS — screenshots in ${output}`);
} finally {
  await browser.close(); await read.$disconnect(); await consoleDb.$disconnect(); await root.end();
}
