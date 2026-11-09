import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';

// FA-04 loan decision in the Unified Console against the ISOLATED synthetic stack (app server on :3230 from THIS checkout).
//   node --experimental-strip-types tests/kosipa-loan-decision-browser.mjs     (from apps/web)
// Poster = operator (kosipa.loan.prepare), checker = viewer (kosipa.loan.approve). The three FA-04 fixture loans are restored afterwards; grants revoked.
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
const OPEN = 'PIN20261100120', MOBILE = 'PINMOB20261100121', PPOB = 'INV20261100122';
const detail = (docNo) => `${base}/console/kosipa/pinjaman/${docNo}`;
const browser = await chromium.launch({ headless: true });
const errors = []; const grants = [];

const restore = async () => {
  const reset = 'posting_doc = NULL, posting_doc_usr = NULL, approved_doc = NULL, approved_doc_usr = NULL, rejected_doc = NULL, rejected_doc_usr = NULL, keterangan_riject = NULL, ud = NULL, ud_usr = NULL';
  await q(`UPDATE trans_pinjaman SET doc_status = 'OPEN', ${reset} WHERE id = 9120`);
  await q(`UPDATE trans_pinjaman SET doc_status = 'POSTING', ${reset} WHERE id IN (9121, 9122)`);
  await q("UPDATE trans_pinjaman_pengajuan SET doc_status = 'POSTING', keterangan_riject = NULL WHERE id = 9121");
};
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
const shot = (p, name) => p.screenshot({ path: `${output}/loan-decision-${name}.png`, fullPage: true });
const noOverflow = async (p, label) => {
  for (const width of [375, 768, 1440]) {
    await p.setViewportSize({ width, height: 860 });
    let o = 0; for (let i = 0; i < 10; i++) { o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o <= 0) break; await p.waitForTimeout(50); }
    assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
const grant = async (user, capability) => {
  const id = await store.request({ consoleUserId: user, capability, requestedBy: stack.USERS.admin, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: 'uji e2e keputusan pinjaman' });
  assert.equal(await store.decide(id, 'active', stack.USERS.second, new Date(), null), true); grants.push(id);
};
const header = async (id) => (await q('SELECT doc_status, cd_usr, posting_doc_usr, approved_doc_usr, rejected_doc_usr, keterangan_riject FROM trans_pinjaman WHERE id = ?', [id]))[0];
const panel = (p) => p.locator('section.kloan-decision');

try {
  await restore();
  console.log('L1. viewer without grants: the waiting list filter works; the detail shows the panel read-only');
  const v0 = await session('viewer');
  await v0.page.goto(`${base}/console/kosipa/pinjaman/daftar?status=MENUNGGU_KEPUTUSAN`);
  await v0.page.getByText('Menampilkan dokumen yang menunggu keputusan').waitFor();
  for (const d of [OPEN, MOBILE, PPOB]) await v0.page.locator('main').getByText(d).first().waitFor();
  await v0.page.goto(detail(OPEN));
  await panel(v0.page).getByRole('heading', { name: 'Keputusan pinjaman' }).waitFor();
  await panel(v0.page).getByText('Hanya lihat').waitFor();
  assert.equal(await panel(v0.page).getByRole('button').count(), 0, 'no decision buttons without a grant');
  await v0.context.close();

  console.log('L2. two administrators grant: operator posts (prepare), viewer decides (approve)');
  await grant(stack.USERS.operator, 'kosipa.loan.prepare');
  await grant(stack.USERS.viewer, 'kosipa.loan.approve');

  console.log('L3. operator posts the OPEN loan; cd_usr (maker) stays; approval is not offered to the poster');
  const op = await session('operator');
  await op.page.goto(detail(OPEN));
  await panel(op.page).getByRole('button', { name: 'Posting dokumen…' }).click();
  await panel(op.page).getByText('Posting menandai berkas sudah diperiksa').waitFor();
  await noOverflow(op.page, 'post confirmation');
  await shot(op.page, 'post-confirm');
  await panel(op.page).getByRole('button', { name: 'Ya, posting' }).click();
  await op.page.getByRole('status').filter({ hasText: 'diposting dan menunggu persetujuan' }).waitFor();
  assert.deepEqual(Object.values(await header(9120)).slice(0, 3), ['POSTING', 'SYNTH LEGACY MAKER', 'SYNTH KFA KOSIPA OPERATOR']);
  await op.page.reload();
  assert.equal(await panel(op.page).getByRole('button', { name: 'Setujui pinjaman…' }).count(), 0);
  await op.context.close();

  console.log('L4. viewer approves: confirmation names member, principal and that disbursement is separate; record panel afterwards');
  const ck = await session('viewer');
  const c = ck.page;
  await c.goto(detail(OPEN));
  await panel(c).getByRole('button', { name: 'Setujui pinjaman…' }).click();
  await panel(c).getByText('Pencairan tetap langkah terpisah.').waitFor();
  await panel(c).getByText('SYNTH ANGGOTA KFA 1').waitFor();
  await noOverflow(c, 'approve confirmation');
  await shot(c, 'approve-confirm');
  await panel(c).getByRole('button', { name: 'Ya, setujui' }).click();
  await c.getByText('disetujui. Pencairan dilakukan terpisah.').waitFor();
  await panel(c).getByText('Disetujui', { exact: true }).waitFor();
  const approved = await header(9120);
  assert.deepEqual([approved.doc_status, approved.cd_usr, approved.approved_doc_usr], ['APPROVED', 'SYNTH LEGACY MAKER', 'SYNTH KFA KOSIPA VIEWER']);
  await shot(c, 'approved');

  console.log('L5. viewer rejects the mobile loan with a reason; the member request follows');
  await c.goto(detail(MOBILE));
  await panel(c).getByRole('button', { name: 'Tolak pengajuan…' }).click();
  await panel(c).getByRole('button', { name: 'Tolak pengajuan', exact: true }).isDisabled();
  await c.locator('#loan-reject-reason').fill('Slip gaji tidak terbaca');
  await noOverflow(c, 'reject form');
  await shot(c, 'reject-form');
  await panel(c).getByRole('button', { name: 'Tolak pengajuan', exact: true }).click();
  await c.getByText('ditolak.', { exact: false }).first().waitFor();
  await panel(c).getByText('Slip gaji tidak terbaca').waitFor();
  const rejected = await header(9121);
  assert.deepEqual([rejected.doc_status, rejected.keterangan_riject, rejected.rejected_doc_usr], ['REJECTED', 'Slip gaji tidak terbaca', 'SYNTH KFA KOSIPA VIEWER']);
  const [req] = await q('SELECT doc_status, keterangan_riject FROM trans_pinjaman_pengajuan WHERE id = 9121');
  assert.deepEqual([req.doc_status, req.keterangan_riject], ['REJECTED', 'Slip gaji tidak terbaca']);

  console.log('L6. PPOB pay-later kasbon: blocked with the reason, no approve/reject button');
  await c.goto(detail(PPOB));
  await panel(c).getByText('berasal dari pesanan PPOB').waitFor();
  assert.equal(await panel(c).getByRole('button').count(), 0);
  await noOverflow(c, 'ppob blocker');
  await shot(c, 'ppob-blocked');

  console.log('L7. a legacy loan screen re-enabled: notice, no buttons');
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'pinjaman/kasbon_c'");
  try {
    await q("UPDATE trans_pinjaman SET doc_status = 'POSTING' WHERE id = 9120");
    await c.goto(detail(OPEN));
    await panel(c).getByText('Layar pinjaman di KOSIPA lama masih aktif').waitFor();
    assert.equal(await panel(c).getByRole('button').count(), 0);
  } finally { await q("UPDATE ref_menu SET status = 0 WHERE url = 'pinjaman/kasbon_c'"); }
  await ck.context.close();
  assert.deepEqual(errors, []);
  console.log('loan decision browser suite: all steps passed');
} finally {
  try {
    for (const g of grants) await store.revoke(g, stack.USERS.admin, new Date(), 'selesai uji e2e').catch(() => undefined);
    await restore();
  } finally { await browser.close(); await consoleDb.$disconnect(); await root.end(); }
}
