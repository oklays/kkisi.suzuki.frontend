import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';

// FA-03B: native member registration, profile and status in the Unified Console against the ISOLATED synthetic stack only.
//   node integration/kosipa-full-access/local-stack.mjs setup && node integration/kosipa-full-access/app-server.mjs build && node integration/kosipa-full-access/app-server.mjs start
//   node tests/kosipa-member-browser.mjs        (from apps/web)
// The legacy member menus are fenced for the run (the native commands require it) and restored to their exact previous statuses; grants are revoked at the end.
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
const RUN = randomUUID().slice(0, 5).toUpperCase();
const CONTROLLERS = ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c'];
const CAPS = ['kosipa.member.create', 'kosipa.member.update', 'kosipa.member.status'];
const browser = await chromium.launch({ headless: true });
const errors = [];
const created = { members: [], niks: [], users: [], grants: [] };
const fenceBefore = await q('SELECT id, status FROM ref_menu WHERE UPPER(url) IN (?, ?, ?)', CONTROLLERS.map((c) => c.toUpperCase()));

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
const shot = (p, name) => p.screenshot({ path: `${output}/member-${name}.png`, fullPage: true });
// Measured after the layout settles (a resize can report a one-frame transient overflow); only an overflow persisting 500 ms fails.
const noOverflow = async (p, label) => {
  for (const width of [375, 768, 1440]) {
    await p.setViewportSize({ width, height: 860 });
    let o = 0;
    for (let i = 0; i < 10; i++) { o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o <= 0) break; await p.waitForTimeout(50); }
    assert.ok(o <= 0, `${label}: overflow ${o}px at ${width}`);
  }
};
const fence = (open) => q('UPDATE ref_menu SET status = ? WHERE UPPER(url) IN (?, ?, ?)', [open ? 1 : 0, ...CONTROLLERS.map((c) => c.toUpperCase())]);
const memberBy = async (nik) => (await q('SELECT * FROM m_anggota WHERE nik_kar = ?', [nik]))[0];

try {
  await fence(false);
  const nik = `E${RUN}1`;

  console.log('E1. viewer and an operator without grants: no register/edit entry points; direct URLs show the no-capability notice; the edit API is 403');
  for (const name of ['viewer', 'operator']) {
    const s = await session(name);
    await s.page.goto(`${base}/console/kosipa/anggota`);
    await s.page.locator('h1', { hasText: 'Keanggotaan' }).waitFor({ state: 'attached' });
    assert.equal(await s.page.getByRole('link', { name: 'Daftarkan anggota baru' }).count(), 0, `${name}: no register link`);
    await s.page.goto(`${base}/console/kosipa/anggota/baru`);
    assert.equal(await s.page.locator('form[aria-label="Daftarkan anggota"]').count(), 0, `${name}: no register form`);
    await s.page.goto(`${base}/console/kosipa/anggota/1/ubah`);
    assert.equal(await s.page.locator('form[aria-label="Ubah profil anggota"]').count(), 0, `${name}: no edit form`);
    assert.equal(await s.page.evaluate(async () => (await fetch('/api/kosipa/members/1')).status), 403);
    if (name === 'viewer') await shot(s.page, '01-viewer-no-capability');
    await s.context.close();
  }

  console.log('E2. two administrators grant create + update + status to the operator');
  for (const capability of CAPS) {
    const id = await store.request({ consoleUserId: stack.USERS.operator, capability, requestedBy: stack.USERS.admin, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: 'uji e2e anggota' });
    assert.equal(await store.decide(id, 'active', stack.USERS.second, new Date(), null), true);
    created.grants.push(id);
  }

  const op = await session('operator');
  const p = op.page;

  console.log('E3. register: form, validation feedback, duplicate NIK refusal, success lands on the member profile');
  await p.goto(`${base}/console/kosipa/anggota`);
  await p.getByRole('link', { name: 'Daftarkan anggota baru' }).click();
  await p.waitForURL(/anggota\/baru/);
  await p.locator('form[aria-label="Daftarkan anggota"]').waitFor();
  assert.equal(await p.locator('#member-nik_kar').isDisabled(), false, 'form is enabled after hydration');
  await p.locator('#member-nik_kar').fill(nik); await p.locator('#member-nama_kar').fill(`SYNTH Browser ${RUN}`);
  await p.locator('#member-bagian').selectOption({ index: 1 }); await p.locator('#member-lokasi').selectOption({ index: 1 });
  await p.locator('#member-email').fill(`e2e.${RUN.toLowerCase()}@example.invalid`); await p.locator('#member-ktp').fill(`KTP${RUN}`); await p.locator('#member-no_telp').fill('0812345');
  await p.locator('#member-alamat').fill('Jl. Uji 1\nBlok B'); await p.locator('#member-gaji').fill('3500000');
  await p.locator('#member-ded-pokok').fill('100000'); await p.locator('#member-ded-wajib').fill('50000');
  await shot(p, '02-register-filled');
  await p.locator('#member-gaji').fill('abc');
  await p.getByRole('button', { name: 'Daftarkan anggota' }).click();
  await p.getByRole('alert').filter({ hasText: 'Jumlah tidak valid' }).waitFor();
  await p.locator('#member-gaji').fill('3500000');
  await p.getByRole('button', { name: 'Daftarkan anggota' }).click();
  await p.waitForURL(/\/console\/kosipa\/anggota\/\d+$/);
  const row = await memberBy(nik); created.members.push(row.id); created.niks.push(nik);
  assert.equal(row.nama_kar, `SYNTH Browser ${RUN}`); assert.equal(row.alamat, 'Jl. Uji 1\nBlok B'); assert.match(row.doc_no, /^REG\d{10,}$/);
  assert.deepEqual([row.limit_toko, row.limit_ppob, row.gaji_minus].map(Number), [0, 0, 0]);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM m_simpanan_aktif WHERE nik_kar = ?', [nik]))[0].n), 2);
  await p.getByRole('link', { name: 'Ubah profil / status' }).waitFor();
  await shot(p, '03-registered-profile');
  // duplicate
  await p.goto(`${base}/console/kosipa/anggota/baru`);
  await p.locator('#member-nik_kar').fill(`${nik.toLowerCase()}`); await p.locator('#member-nama_kar').fill('SYNTH Duplikat');
  await p.locator('#member-bagian').selectOption({ index: 1 }); await p.locator('#member-lokasi').selectOption({ index: 1 });
  await p.getByRole('button', { name: 'Daftarkan anggota' }).click();
  await p.getByRole('alert').filter({ hasText: 'NIK ini sudah terdaftar' }).waitFor();
  await noOverflow(p, 'register');

  console.log('E4. edit: only changed fields are sent; bank change demands a reason; saved; version refreshes');
  await p.goto(`${base}/console/kosipa/anggota/${row.id}/ubah`);
  await p.locator('form[aria-label="Ubah profil anggota"]').waitFor();
  assert.equal(await p.getByRole('button', { name: /Simpan perubahan/ }).isDisabled(), true, 'nothing changed yet');
  await p.locator('#member-jabatan').fill('STAF E2E'); await p.locator('#member-nama_kar').fill(`SYNTH Browser ${RUN} B`);
  assert.equal(await p.locator('#member-reason').count(), 0);
  await p.locator('#member-no_rek').fill('998877');
  await p.locator('#member-reason').waitFor();
  await shot(p, '04-edit-bank-reason');
  await p.locator('#member-reason').fill('Koreksi rekening e2e');
  await p.getByRole('button', { name: /Simpan perubahan \(3\)/ }).click();
  await p.getByRole('status').filter({ hasText: 'Perubahan disimpan.' }).waitFor();
  const edited = await memberBy(nik);
  assert.equal(edited.jabatan, 'STAF E2E'); assert.equal(edited.no_rek, '998877'); assert.equal(edited.nama_kar, `SYNTH Browser ${RUN} B`); assert.equal(edited.status_anggota, 'AKTIVE');
  const ledger = (await q(`SELECT reason FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE command = 'member.update_profile' AND subject_ref = ? ORDER BY id DESC LIMIT 1`, [String(row.id)]))[0];
  assert.equal(ledger.reason, 'Koreksi rekening e2e');
  await p.locator('#member-reason').waitFor({ state: 'detached' });
  assert.equal(await p.getByRole('button', { name: /Simpan perubahan/ }).isDisabled(), true, 'form re-keyed to the new version');

  console.log('E5. a concurrent change (legacy writer) makes the held version stale: refused with guidance, nothing overwritten, reload recovers');
  await p.locator('#member-jabatan').fill('SETELAH BENTROK');
  await q('UPDATE m_anggota SET rt = ? WHERE id = ?', ['7', row.id]);
  await p.getByRole('button', { name: /Simpan perubahan/ }).click();
  await p.getByRole('alert').filter({ hasText: 'baru saja diubah' }).waitFor();
  assert.equal((await memberBy(nik)).jabatan, 'STAF E2E');
  await shot(p, '05-stale');
  await p.reload();
  await p.locator('#member-jabatan').fill('SETELAH MUAT ULANG');
  await p.getByRole('button', { name: /Simpan perubahan/ }).click();
  await p.getByRole('status').filter({ hasText: 'Perubahan disimpan.' }).waitFor();
  assert.equal((await memberBy(nik)).jabatan, 'SETELAH MUAT ULANG');

  console.log('E6. status: deactivation zeroes ceilings and disables an existing mobile identity; reactivation is member-only');
  await q('UPDATE m_anggota SET limit_toko = 500000, limit_ppob = 100000, gaji_minus = 250000 WHERE id = ?', [row.id]);
  const [u] = await root.query('INSERT INTO users SET ?', [{ nik, ktp: `UK${RUN}`, phone: `0877${RUN}`.slice(0, 25), image: 'x', email: `u.${RUN.toLowerCase()}@example.invalid`, password: 'x', persetujuan: 0, name: 'SYNTH MOBILE', is_active: 1, is_delete: 0, admin_verifikasi: 1, wallet_balance: 5, temporary_token: 't' }]);
  created.users.push(u.insertId);
  await root.query('INSERT INTO oauth_access_tokens (id, user_id, client_id, revoked) VALUES (?, ?, 1, 0)', [`TK${RUN}`, u.insertId]);
  await p.reload();
  await p.locator('#member-status-reason').waitFor();
  await p.locator('#member-status-target').selectOption('RESIGN');
  await shot(p, '06-status-deactivate');
  assert.match(await p.locator('.mstatus-effect').innerText(), /limit toko, limit PPOB, dan gaji minus menjadi 0/);
  await p.locator('#member-status-reason').fill('Karyawan mengundurkan diri');
  await p.getByRole('button', { name: 'Ubah status', exact: true }).click();
  await p.getByRole('status').filter({ hasText: 'Status diubah menjadi RESIGN.' }).waitFor();
  const off = await memberBy(nik);
  assert.equal(off.status_anggota, 'RESIGN'); assert.deepEqual([off.limit_toko, off.limit_ppob, off.gaji_minus].map(Number), [0, 0, 0]);
  const mob = (await q('SELECT is_active, is_delete, admin_verifikasi, wallet_balance, temporary_token FROM users WHERE id = ?', [u.insertId]))[0];
  assert.deepEqual([mob.is_active, mob.is_delete, mob.admin_verifikasi, Number(mob.wallet_balance), mob.temporary_token], [0, 1, 0, 0, '']);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM oauth_access_tokens WHERE user_id = ?', [u.insertId]))[0].n), 0);
  await p.getByText('Status saat ini:').waitFor();
  // The panel re-renders after router.refresh(); wait for the new status instead of reading the header before the refresh lands.
  await p.locator('#member-status-title').locator('xpath=..').filter({ hasText: 'RESIGN' }).waitFor();
  await p.locator('#member-status-target').selectOption('AKTIVE');
  assert.match(await p.locator('.mstatus-effect').innerText(), /Batas kredit tetap 0/);
  await p.locator('#member-status-reason').fill('Aktif kembali per SK');
  await p.getByRole('button', { name: 'Ubah status', exact: true }).click();
  await p.getByRole('status').filter({ hasText: 'Status diubah menjadi AKTIVE.' }).waitFor();
  const back = await memberBy(nik);
  assert.equal(back.status_anggota, 'AKTIVE'); assert.deepEqual([back.limit_toko, back.limit_ppob, back.gaji_minus].map(Number), [0, 0, 0]);
  assert.equal(Number((await q('SELECT is_active FROM users WHERE id = ?', [u.insertId]))[0].is_active), 0, 'mobile identity is not restored');
  await shot(p, '07-status-reactivated');
  await noOverflow(p, 'edit');

  console.log('E7. legacy menu re-enabled: forms stay visible but cannot be submitted; the server refuses too');
  await fence(true);
  await p.reload();
  await p.getByText('belum aktif di lingkungan ini').first().waitFor();
  assert.equal(await p.getByRole('button', { name: 'Ubah status', exact: true }).isDisabled(), true);
  assert.equal(await p.locator('#member-jabatan').isDisabled(), true);
  await shot(p, '08-legacy-active');
  await fence(false);

  console.log('E8. revocation applies on the next request; no console errors');
  for (const id of created.grants) assert.equal(await store.revoke(id, stack.USERS.admin, new Date(), 'selesai uji e2e'), true);
  created.grants.length = 0;
  await p.goto(`${base}/console/kosipa/anggota/${row.id}/ubah`);
  assert.equal(await p.locator('form[aria-label="Ubah profil anggota"]').count(), 0);
  await op.context.close();
  assert.deepEqual(errors, []);
  console.log('member browser suite: all steps passed');
} finally {
  try {
    for (const id of created.grants) await store.revoke(id, stack.USERS.admin, new Date(), 'pembersihan uji').catch(() => undefined);
    await q('DELETE FROM oauth_access_tokens WHERE user_id IN (?) OR id = ?', [created.users.length ? created.users : [0], `TK${RUN}`]);
    for (const id of created.users) await q('DELETE FROM users WHERE id = ?', [id]);
    for (const n of created.niks) await q('DELETE FROM m_simpanan_aktif WHERE nik_kar = ?', [n]);
    for (const id of created.members) await q('DELETE FROM m_anggota WHERE id = ?', [id]);
  } finally {
    for (const r of fenceBefore) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [r.status, r.id]);
    await browser.close(); await consoleDb.$disconnect(); await root.end();
  }
}
