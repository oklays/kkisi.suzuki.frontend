import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';
import { parseIntakeKeys, signIntakeRequest } from '@koperasi/application/member-intake/signature';

// P1 member requests in the Unified Console + the signed internal intake, against the ISOLATED synthetic stack (app server on :3230 from THIS checkout).
//   node --experimental-strip-types tests/kosipa-member-request-browser.mjs     (from apps/web)
// Requests are created through the real internal endpoint (as the PWA does), then rejected / approved in the browser by `viewer` (kosipa.request.decide).
// Rows of member 9101 created here, its active deductions and the grants are restored afterwards.
const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
const config = await stack.loadConfig();
const accounts = JSON.parse(readFileSync(new URL('../../../.local/kosipa-fa01/accounts.json', import.meta.url), 'utf8'));
const env = Object.fromEntries(readFileSync(new URL('../.env.kosipa-fa01', import.meta.url), 'utf8').split('\n').map((l) => /^([A-Z_0-9]+)="(.*)"$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
const base = `http://127.0.0.1:${stack.APP_PORT}`;
const output = process.env.KFA_SCREENSHOTS || '/private/tmp/kfa01-browser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const consoleDb = new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) });
const store = new PrismaKosipaGrantStore(consoleDb);
const root = await stack.rootConnection(config);
const q = async (sql, params = []) => (await root.query(sql, params))[0];
const keys = parseIntakeKeys(env.MEMBER_INTAKE_KEYS);
const RUN = Date.now().toString(36);
const browser = await chromium.launch({ headless: true });
const errors = []; const grants = [];
const PAGE = `${base}/console/kosipa/pengajuan-mobile`;

const cleanup = async () => {
  await q("DELETE FROM trans_pinjaman_pengajuan WHERE nik_kar = 'SKFA0001' AND doc_no LIKE 'PGJ-MBL-%'");
  await q("DELETE FROM trans_simpanan_pengajuan WHERE nik_kar = 'SKFA0001'");
  await q("DELETE FROM m_simpanan_aktif WHERE nik_kar = 'SKFA0001'");
  await q('UPDATE m_anggota SET sim_wajib = 0 WHERE id = 9101');
};
async function intake(body) {
  const text = JSON.stringify(body);
  const res = await fetch(`${base}/api/internal/member-requests`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kkisi-intake': signIntakeRequest(keys, { method: 'POST', path: '/api/internal/member-requests', body: text }) }, body: text });
  return { status: res.status, body: await res.json() };
}
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
const shot = (p, name) => p.screenshot({ path: `${output}/member-request-${name}.png`, fullPage: true });
const noOverflow = async (p, label) => {
  for (const width of [375, 768, 1440]) {
    await p.setViewportSize({ width, height: 860 });
    let o = 0; for (let i = 0; i < 10; i++) { o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o <= 0) break; await p.waitForTimeout(50); }
    assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`);
    await shot(p, `${label}-${width}`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
const grant = async (user, capability) => {
  const id = await store.request({ consoleUserId: user, capability, requestedBy: stack.USERS.admin, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: 'uji e2e pengajuan anggota' });
  assert.equal(await store.decide(id, 'active', stack.USERS.second, new Date(), null), true); grants.push(id);
};
const row = (p, docNo) => p.locator(`tr[data-request="${docNo}"]`);
const step = async (name, fn) => { await fn(); console.log(`ok   ${name}`); };

try {
  await cleanup();
  await q("INSERT INTO m_simpanan_aktif (doc_no, jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_old, potongan_payroll, status, periode_start, periode_end, is_mobile) VALUES ('OLD','SIMPANAN WAJIB','SKFA0001','SYNTH ANGGOTA KFA 1','ANGGOTA',0,100000,1,'2026-01-01','2026-12-31',0)");
  const member = { memberId: 9101, userId: 9100, nik: 'SKFA0001' };
  let loanDoc, dedDoc;

  await step('signed internal intake records a loan and a deduction request (and replays)', async () => {
    const loan = await intake({ kind: 'loan', clientKey: `idem-browser-loan-${RUN}`, member, productId: 9160, amountRp: 5_000_000, months: 12, purpose: 'Renovasi rumah' });
    assert.equal(loan.status, 201, JSON.stringify(loan.body));
    loanDoc = loan.body.docNo;
    assert.equal((await intake({ kind: 'loan', clientKey: `idem-browser-loan-${RUN}`, member, productId: 9160, amountRp: 5_000_000, months: 12, purpose: 'Renovasi rumah' })).status, 200);
    const ded = await intake({ kind: 'deduction', clientKey: `idem-browser-ded-${RUN}`, member, savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000 });
    assert.equal(ded.status, 201, JSON.stringify(ded.body));
    dedDoc = ded.body.docNo;
    const unsigned = await fetch(`${base}/api/internal/member-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unsigned.status, 401);
  });

  await step('without the decide grant the page lists requests read-only', async () => {
    const { context, page } = await session('operator');
    await page.goto(`${PAGE}?type=loan`);
    await page.getByRole('heading', { name: 'Pengajuan anggota', level: 1 }).waitFor();
    await row(page, loanDoc).waitFor();
    assert.equal(await row(page, loanDoc).getByRole('button', { name: 'Tolak…' }).count(), 0);
    assert.ok(await page.getByText('Konversi menjadi pinjaman tetap di KOSIPA lama').isVisible());
    await context.close();
  });

  await grant(stack.USERS.viewer, 'kosipa.request.decide');

  await step('reject a loan request with a reason', async () => {
    const { context, page } = await session('viewer');
    await page.goto(`${PAGE}?type=loan`);
    const r = row(page, loanDoc);
    await r.getByRole('button', { name: 'Tolak…' }).click();
    await r.getByPlaceholder('Alasan penolakan (wajib)').fill('Slip gaji belum dilampirkan');
    await r.getByRole('button', { name: 'Tolak', exact: true }).click();
    await page.getByText(`${loanDoc} ditolak.`).waitFor();
    const [db] = await q('SELECT doc_status, keterangan_riject FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [loanDoc]);
    assert.deepEqual([db.doc_status, db.keterangan_riject], ['REJECTED', 'Slip gaji belum dilampirkan']);
    await page.goto(`${PAGE}?type=loan&status=ALL`);
    await noOverflow(page, 'loan');
    await context.close();
  });

  await step('approve a deduction change: active deduction and member amount follow', async () => {
    const { context, page } = await session('viewer');
    await page.goto(`${PAGE}?type=deduction`);
    const r = row(page, dedDoc);
    await r.getByRole('button', { name: 'Setujui…' }).click();
    await r.getByRole('button', { name: 'Ya, setujui' }).click();
    await page.getByText(`${dedDoc} disetujui.`).waitFor();
    const [a] = await q("SELECT doc_no, potongan_payroll FROM m_simpanan_aktif WHERE nik_kar = 'SKFA0001'");
    const [m] = await q('SELECT sim_wajib FROM m_anggota WHERE id = 9101');
    assert.deepEqual([a.doc_no, Number(a.potongan_payroll), Number(m.sim_wajib)], [dedDoc, 150_000, 150_000]);
    await page.goto(`${PAGE}?type=deduction&status=ALL`);
    await noOverflow(page, 'deduction');
    await context.close();
  });

  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('member request browser suite: all steps passed');
} finally {
  try {
    for (const g of grants) await store.revoke(g, stack.USERS.admin, new Date(), 'selesai uji e2e').catch(() => undefined);
    await cleanup();
  } finally { await browser.close(); await consoleDb.$disconnect(); await root.end(); }
}
