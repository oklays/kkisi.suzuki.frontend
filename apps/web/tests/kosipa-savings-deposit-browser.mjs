import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';

// FA-03C T07: voluntary-savings deposits in the Unified Console against the ISOLATED synthetic stack (app server on :3230 from THIS checkout).
//   node --experimental-strip-types tests/kosipa-savings-deposit-browser.mjs     (from apps/web)
// Maker = operator (kosipa.savings.prepare), checker = viewer (kosipa.savings.approve). Created documents are removed by doc_no; grants revoked; menu restored.
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
const PAGE = `${base}/console/kosipa/simpanan/setoran`;
const [menu] = await q("SELECT id, status FROM ref_menu WHERE url = 'simpanan/sim_setor_c'");
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
const shot = (p, name) => p.screenshot({ path: `${output}/deposit-${name}.png`, fullPage: true });
const noOverflow = async (p, label) => {
  for (const width of [375, 768, 1440]) {
    await p.setViewportSize({ width, height: 860 });
    let o = 0; for (let i = 0; i < 10; i++) { o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o <= 0) break; await p.waitForTimeout(50); }
    assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
const grant = async (user, capability) => {
  const id = await store.request({ consoleUserId: user, capability, requestedBy: stack.USERS.admin, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: 'uji e2e setoran' });
  assert.equal(await store.decide(id, 'active', stack.USERS.second, new Date(), null), true); grants.push(id);
};
const docs = async () => q('SELECT id, doc_no, doc_status FROM trans_simpanan WHERE remarks LIKE ? ORDER BY id', [`E2E ${RUN}%`]);
async function createDeposit(p, amountText, remarks, transfer) {
  await p.locator('#dep-nik').fill('SKFA0001'); await p.getByRole('button', { name: 'Cari' }).click();
  await p.locator('.deposit-member').getByText('SYNTH ANGGOTA KFA 1').waitFor();
  if (transfer) { await p.locator('#dep-method').selectOption('TRANSFER'); await p.locator('#dep-bank').fill('SYNTH BANK'); await p.locator('#dep-account').fill('0099'); }
  await p.locator('#dep-amount').fill(amountText); await p.locator('#dep-remarks').fill(remarks);
  await p.getByRole('button', { name: 'Simpan setoran' }).click();
  await p.getByRole('status').filter({ hasText: 'menunggu persetujuan petugas lain' }).waitFor();
}

try {
  await q("UPDATE ref_menu SET status = 0 WHERE url = 'simpanan/sim_setor_c'");
  console.log('D1. viewer without grants: the deposit page is listed in the navigation and is read-only');
  const v0 = await session('viewer');
  await v0.page.goto(`${base}/console/kosipa/simpanan`);
  await v0.page.getByRole('heading', { name: 'Simpanan', exact: true }).waitFor();
  await v0.page.locator('main').getByRole('link', { name: 'Setoran simpanan', exact: true }).click();
  await v0.page.locator('h1', { hasText: 'Setoran simpanan' }).waitFor();
  assert.ok(await v0.page.locator('#console-nav a[href="/console/kosipa/simpanan/setoran"]').count() >= 1, 'sidebar lists Setoran simpanan');
  assert.equal(await v0.page.locator('form[aria-label="Buat setoran simpanan"]').count(), 0);
  await v0.page.getByText('Hanya lihat').waitFor();
  await v0.page.goto(`${base}/console/kosipa/simpanan/9101`);
  await v0.page.getByRole('heading', { name: 'Buku simpanan', exact: true }).waitFor();
  await v0.page.locator('main').getByRole('link', { name: 'Setoran simpanan', exact: true }).click();
  await v0.page.locator('h1', { hasText: 'Setoran simpanan' }).waitFor();
  await v0.context.close();

  console.log('D2. two administrators grant: operator prepares, viewer approves');
  await grant(stack.USERS.operator, 'kosipa.savings.prepare');
  await grant(stack.USERS.viewer, 'kosipa.savings.approve');

  console.log('D3. maker: unknown NIK is explained; a transfer deposit is saved as pending and cannot be approved by its maker');
  const op = await session('operator'); const p = op.page;
  await p.goto(PAGE);
  await p.locator('h1', { hasText: 'Setoran simpanan' }).waitFor();
  assert.equal(await p.locator('main').getByText('Mode baca saja', { exact: true }).count(), 0);
  await p.locator('#dep-nik').fill('TIDAKADA9'); await p.getByRole('button', { name: 'Cari' }).click();
  await p.getByRole('alert').filter({ hasText: 'tidak ditemukan' }).waitFor();
  await createDeposit(p, '125000', `E2E ${RUN} A`, true);
  await shot(p, '01-created');
  const [a] = await docs();
  assert.equal(a.doc_status, 'POSTING'); assert.match(a.doc_no, /^TFCSH\d{11,}$/);
  await p.locator(`tr[data-deposit-id="${a.id}"]`).getByText('Menunggu petugas lain').waitFor();
  await createDeposit(p, '7500', `E2E ${RUN} B`, false);
  await noOverflow(p, 'deposits (maker)');
  await op.context.close();

  console.log('D4. checker: approve with an explicit confirmation; reject with a mandatory reason; outcomes announced once');
  const ck = await session('viewer'); const c = ck.page;
  await c.goto(PAGE);
  const [, b] = await docs();
  await c.locator(`tr[data-deposit-id="${a.id}"]`).getByRole('button', { name: 'Setujui…' }).click();
  await c.getByText(/Setujui setoran Rp125\.000 untuk SYNTH ANGGOTA KFA 1\?/).waitFor();
  await shot(c, '02-confirm');
  await c.getByRole('button', { name: 'Ya, setujui' }).click();
  await c.getByRole('status').filter({ hasText: `${a.doc_no} disetujui.` }).waitFor();
  await c.locator(`tr[data-deposit-id="${b.id}"]`).getByRole('button', { name: 'Tolak…' }).click();
  await c.locator(`#dep-reason-${b.id}`).fill('Nominal salah ketik');
  await c.getByRole('button', { name: 'Tolak', exact: true }).click();
  await c.getByRole('status').filter({ hasText: `${b.doc_no} ditolak.` }).waitFor();
  const after = await docs();
  assert.deepEqual(after.map((d) => d.doc_status), ['APPROVED', 'REJECTED']);
  assert.deepEqual((await q('SELECT doc_status, tgl_cair IS NOT NULL AS paid FROM trans_simpanan_dtl WHERE doc_no = ?', [a.doc_no])).map((l) => [l.doc_status, Number(l.paid)]), [['APPROVED', 1]]);
  await c.goto(`${PAGE}?status=ALL`);
  assert.equal((await q('SELECT payment_type FROM trans_simpanan WHERE id = ?', [b.id]))[0].payment_type, 'CASH', 'the form returns to its default method after a save');
  await c.locator(`tr[data-deposit-id="${a.id}"]`).getByText('Disetujui').waitFor();
  await c.locator(`tr[data-deposit-id="${b.id}"]`).getByText('Ditolak').waitFor();
  await shot(c, '03-all');
  await noOverflow(c, 'deposits (checker)');

  console.log('D5. legacy Setor Simpanan re-enabled: notice, no form, actions locked');
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'simpanan/sim_setor_c'");
  await c.goto(PAGE);
  await c.getByText('Layar Setor Simpanan lama masih aktif').waitFor();
  await q("UPDATE ref_menu SET status = 0 WHERE url = 'simpanan/sim_setor_c'");
  await ck.context.close();
  assert.deepEqual(errors, []);
  console.log('savings deposit browser suite: all steps passed');
} finally {
  try {
    for (const g of grants) await store.revoke(g, stack.USERS.admin, new Date(), 'selesai uji e2e').catch(() => undefined);
    for (const d of await docs()) { await q('DELETE FROM trans_simpanan_dtl WHERE doc_no = ?', [d.doc_no]); await q('DELETE FROM trans_simpanan WHERE id = ?', [d.id]); }
    if (menu) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [menu.status, menu.id]);
  } finally { await browser.close(); await consoleDb.$disconnect(); await root.end(); }
}
