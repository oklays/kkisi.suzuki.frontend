import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { registerMember, updateMemberProfile } from '@koperasi/application/kosipa/commands/member';
import { PrismaKosipaMemberRepository } from '../src/infrastructure/repositories/kosipa-member-write.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';

// MC12 (FA-03B T04): the REAL legacy PHP 5.6 / CodeIgniter 2.1.4 application reads rows written by the NATIVE member commands, i.e. the rollback
// path stays safe. Opt-in KOSIPA_FA01=1; synthetic stack + PHP56 image; legacy menus are switched on only AFTER the native writes (the native
// commands require them fenced) and restored to their exact previous statuses. No legacy write is performed.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1; synthetic stack and PHP56 image required', timeout: 600_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const runtime = ENABLED ? await import('../../../integration/kosipa-full-access/legacy-runtime/runtime.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'memberWrite', stack.DB, 2) }) : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const SECRET = 'synthetic-member-version-secret-0123456789abcdef';
const RUN = randomUUID().slice(0, 5).toUpperCase();
const MENUS = [9101, 9108]; // master/anggota_c, anggota/anggota_c
let rt, originalPassword, menus, createdId, createdNik;
const sql = (text, values = []) => rt.admin.query(text, values).then(([rows]) => rows);
const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test.before(async () => {
  if (!ENABLED) return;
  const db = await stack.rootConnection(config);
  try {
    [[{ password: originalPassword }]] = await db.query('SELECT password FROM ref_users WHERE id_ref_user=9102');
    [menus] = await db.query('SELECT id,status FROM ref_menu WHERE url IN (?, ?, ?)', ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c']);
    await db.query('UPDATE ref_menu SET status = 0 WHERE url IN (?, ?, ?)', ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c']);
  } finally { await db.end(); }
  rt = await runtime.startLegacyRuntime();
});
test.after(async () => {
  if (!ENABLED) return;
  const db = rt?.admin ?? await stack.rootConnection(config);
  try {
    if (createdId) { await db.query('DELETE FROM m_simpanan_aktif WHERE nik_kar = ?', [createdNik]); await db.query('DELETE FROM m_anggota WHERE id = ?', [createdId]); }
    if (originalPassword !== undefined) await db.query('UPDATE ref_users SET password=? WHERE id_ref_user=9102', [originalPassword]);
    for (const m of menus ?? []) await db.query('UPDATE ref_menu SET status=? WHERE id=?', [m.status, m.id]);
  } finally { if (rt) await rt.close(); else await db.end(); await Promise.all([write, read, consoleDb].filter(Boolean).map((c) => c.$disconnect())); }
});

async function legacy(path, form) {
  const [{ last }] = await sql('SELECT COALESCE(MAX(id_histori),0) AS last FROM ref_hist_akses_users');
  try {
    const { login, results } = await rt.session([{ method: 'POST', path, form }]);
    assert.equal(login[1].status, 302); assert.match(login[1].location, /dashboard/);
    assert.equal(results[0].status, 200, strip(results[0].body).slice(0, 600));
    assert.doesNotMatch(strip(results[0].body) + JSON.stringify(results[0].json ?? ''), /Database Error|A PHP Error|Fatal error|Error Number:/);
    return results[0].json ?? results[0].body;   // the harness client already JSON-decodes JSON responses
  } finally {
    const rows = await sql("SELECT id_histori FROM ref_hist_akses_users WHERE id_histori>? AND id_user=9102 AND id_session=? AND ip_user='127.0.0.1'", [last, String(last || '')]);
    assert.ok(rows.length <= 1, 'ambiguous login ownership: preserve rows and fail');
    for (const r of rows) await sql('DELETE FROM ref_hist_akses_users WHERE id_histori=?', [r.id_histori]);
  }
}

test('MC12: legacy master/anggota_c edit + list render a natively registered and edited member; payroll-config join sees the config rows', options, async () => {
  const bagian = (await sql("SELECT name_bagian AS n FROM m_bagian WHERE status = 1 ORDER BY id LIMIT 1"))[0].n;
  const lokasi = (await sql("SELECT name_lokasi AS n FROM m_lokasi WHERE status = 1 ORDER BY id LIMIT 1"))[0].n;
  createdNik = `C${RUN}1`;
  const actor = { userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.member.create', 'kosipa.member.update']), requestId: randomUUID() };
  const ports = { ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), members: new PrismaKosipaMemberRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, versionSecret: SECRET }) };
  const reg = await registerMember(ports, actor, { idempotencyKey: randomUUID(), fields: { nik_kar: createdNik, nama_kar: `SYNTH Legacy Compat ${RUN}`, bagian, lokasi, kd_group: 'ANGGOTA', status_anggota: 'AKTIVE', email: `compat.${RUN}@example.invalid`, alamat: 'Jl. Native 1\r\nBlok B', gaji: '1500000' }, initialDeductions: { pokok: '100000', wajib: '50000', sukarela: '0' } });
  createdId = reg.result.id;
  const found = await ports.members.detail(createdId);
  await updateMemberProfile(ports, { ...actor, requestId: randomUUID() }, String(createdId), { idempotencyKey: randomUUID(), expectedVersion: found.version, fields: { jabatan: 'STAF NATIVE', nama_kar: `SYNTH Legacy Compat ${RUN} B` } });

  // Only now does the (read-only here) legacy side get switched on, exactly as a rollback would.
  await sql('UPDATE ref_menu SET status = 1 WHERE id IN (?, ?)', MENUS);
  const edit = await legacy(`/master/anggota_c/ajax_edit/${createdId}`, {});
  assert.equal(edit.nik_kar, createdNik); assert.equal(edit.nama_kar, `SYNTH Legacy Compat ${RUN} B`); assert.equal(edit.jabatan, 'STAF NATIVE');
  assert.match(edit.doc_no, /^REG\d{6}\d{4,}$/); assert.match(edit.no_anggota, new RegExp(`${createdNik}$`));
  assert.equal(Number(edit.sim_pokok), 100000); assert.equal(Number(edit.sim_wajib), 50000); assert.equal(Number(edit.sim_sukarela), 0);
  assert.equal(edit.alamat, 'Jl. Native 1\r\nBlok B'); assert.equal(Number(edit.gaji), 1500000);

  const list = await legacy('/master/anggota_c/ajax_list', { draw: '1', start: '0', length: '10', 'search[value]': '', nik: createdNik, group: 'ANGGOTA', status: 'AKTIVE', id_menu: '9101' });
  const listed = JSON.stringify(list);
  assert.ok(listed.includes(createdNik), 'the legacy DataTable lists the native member');
  assert.ok(listed.includes('AKTIVE'));

  // simpanan/master_payroll_c has no menu row in the synthetic stack, so its ajax_edit_nik query is replayed verbatim (source line 158-162).
  const cfg = await sql(`SELECT a.*, format(a.potongan_payroll,0) AS potongan_payroll, b.bagian, b.no_rek, b.bank_rek FROM m_simpanan_aktif a LEFT JOIN m_anggota b ON a.nik_kar=b.nik_kar WHERE a.nik_kar = ? ORDER BY a.id`, [createdNik]);
  assert.deepEqual(cfg.map((r) => [r.jenis_simpanan, r.potongan_payroll, Number(r.status)]), [['SIMPANAN POKOK', '100,000', 1], ['SIMPANAN WAJIB', '50,000', 1]]);
  assert.ok(cfg.every((r) => r.bagian === bagian));
});
