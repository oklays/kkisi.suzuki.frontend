import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { createMaster, setMasterStatus, updateMaster } from '@koperasi/application/kosipa/commands/master';
import { MASTER_DEFINITIONS, masterVersion } from '@koperasi/domain/kosipa/master';
import { PrismaKosipaMasterRepository } from '../src/infrastructure/repositories/kosipa-master-write.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';

// FA-03A — legacy compatibility on the REAL legacy runtime: the unchanged KOSIPA CodeIgniter 2.1.4 application (PHP 5.6, internal Docker
// network, isolated synthetic database) reads, searches, filters and edits rows that the native Next.js commands wrote, for all five masters;
// plus the fence boundary (Objective B) and the proposed database ownership guard (FD-22).
// Opt-in: KOSIPA_FA01=1 with the FA stack up and its app server stopped (writer connection cap). Builds nothing; image kkisi-kfa-php56-ci2.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 (stack up, app server stopped, image kkisi-kfa-php56-ci2 built)', timeout: 600_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const legacyRuntime = ENABLED ? await import('../../../integration/kosipa-full-access/legacy-runtime/runtime.mjs') : null;
const { dataTables, MENU_ID } = ENABLED ? await import('../../../integration/kosipa-full-access/legacy-runtime/screens.mjs') : {};
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 2) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'masterWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
let rt = null;
test.before(async () => { if (ENABLED) rt = await legacyRuntime.startLegacyRuntime(); });
test.after(async () => { await rt?.close(); await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); });

const RUN = randomUUID().slice(0, 5).toUpperCase();
const actor = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: randomUUID() });
const ports = () => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), masters: new PrismaKosipaMasterRepository(read, write, { ledgerDatabase: stack.LEDGER_DB }) });
const nativeCreate = (type, values) => createMaster(ports(), actor(), type, { idempotencyKey: randomUUID(), ...values });
const nativeUpdate = (type, row, values) => updateMaster(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), ...row.values, ...values, expectedVersion: row.version });
const nativeStatus = (type, row, active) => setMasterStatus(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), expectedVersion: row.version, reason: 'uji kompatibilitas legacy' }, active);
const load = async (type, id) => { const def = MASTER_DEFINITIONS[type]; const r = (await ports().masters.list(def)).find((x) => x.id === id); return { ...r, version: masterVersion(def, r) }; };
const sql = (q, args = []) => rt.admin.query(q, args).then(([rows]) => rows);
const setMenu = (ids, status) => sql(`UPDATE ref_menu SET status = ? WHERE id IN (${ids.map(Number).join(',')})`, [status]);
const strip = (html) => String(html ?? '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** The financial tables FA-03A must never touch, fingerprinted by row count + CRC over every column (whole row as JSON-ish text). */
async function financialFingerprint() {
  const out = {};
  for (const t of ['trans_pinjaman', 'trans_pinjaman_dtl', 'trans_simpanan', 'trans_simpanan_dtl', 'trans_potongan_bulanan', 'trans_potongan_matrix']) {
    const cols = (await sql('SELECT GROUP_CONCAT(CONCAT("`", COLUMN_NAME, "`") ORDER BY ORDINAL_POSITION) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t]))[0].c;
    out[t] = (await sql(`SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|', ${cols}))), 0) AS crc FROM \`${t}\``))[0];
  }
  return JSON.stringify(out);
}
/** Legacy session (real login) with the given controllers' menus open; asserts the login itself worked. */
async function legacy(controllers, steps) {
  if (controllers.length) await setMenu(controllers.map((c) => MENU_ID[c]), 1);
  try {
    const { login, results } = await rt.session(steps);
    assert.equal(login[1].status, 302); assert.match(login[1].location, /dashboard/, 'legacy login succeeded');
    return results;
  } finally { if (controllers.length) await setMenu(controllers.map((c) => MENU_ID[c]), 0); }
}
/**
 * PRE-EXISTING LEGACY DEFECT (FA-03A finding LEG-01): these models call $this->db->group_start()/group_end(), CodeIgniter 3 methods that do
 * not exist in the CodeIgniter 2.1.4 framework the app runs on (system/core/CodeIgniter.php CI_VERSION), so ANY non-empty search on those
 * screens is a PHP fatal error — for legacy-created rows exactly as for native ones (asserted below). bagian_m has the call commented out.
 */
const LEGACY_SEARCH_BROKEN = { 'jenis-dokumen': 'jenis_dokumen_m.php', 'rekening-bank': 'rekening_bank_m.php', 'periode-angsuran': 'periode_angsuran_m.php' };
const GROUP_START_FATAL = /Call to undefined method CI_DB_mysqli_driver::group_start\(\)/;
const rowsOf = (result) => { assert.ok(result.json?.data, `DataTables JSON expected from ${result.path}: ${strip(result.body).slice(0, 300)}`); return result.json.data; };
const label = (cell) => (/Tidak Aktif/.test(cell) ? 'Tidak Aktif' : /Aktif/.test(cell) ? 'Aktif' : cell);

test('A1–A7: legacy master screens list, search, filter and open native-created rows of all five masters with legacy column formats', options, async () => {
  const before = await financialFingerprint();
  const created = {
    lokasi: (await nativeCreate('lokasi', { code: `LG-${RUN}`, name: `SYNTH Legacy Lokasi ${RUN}` })).result,
    bagian: (await nativeCreate('bagian', { name: `SYNTH Legacy Bagian ${RUN}` })).result,
    'jenis-dokumen': (await nativeCreate('jenis-dokumen', { code: `LD${RUN}`, name: 'SYNTH LEGACY DOK', remarks: 'dibuat native' })).result,
    'rekening-bank': (await nativeCreate('rekening-bank', { code: `LB ${RUN}`, name: 'SYNTH LEGACY BANK', remarks: '' })).result,
    'periode-angsuran': null,
  };
  const months = String(200 + Math.floor(Math.random() * 150));
  created['periode-angsuran'] = (await nativeCreate('periode-angsuran', { code: months, name: `${months} X`, remarks: 'dibuat native' }).catch(async (e) => {
    if (e.code !== 'MASTER_CODE_DUPLICATE') throw e;
    const def = MASTER_DEFINITIONS['periode-angsuran'];
    const row = (await ports().masters.list(def)).find((r) => r.values.code === months);
    return { result: { ...row, version: masterVersion(def, row) } };
  })).result;
  // A native label change, so legacy also sees an UPDATE written natively (ud/ud_usr for the stamped masters).
  created['jenis-dokumen'] = (await nativeUpdate('jenis-dokumen', created['jenis-dokumen'], { remarks: 'diubah native' })).result;

  const ctl = { lokasi: 'lokasi_c', bagian: 'bagian_c', 'jenis-dokumen': 'jenis_dokumen_c', 'rekening-bank': 'rekening_bank_c', 'periode-angsuran': 'periode_angsuran_c' };
  const search = { lokasi: RUN, bagian: RUN, 'jenis-dokumen': `LD${RUN}`, 'rekening-bank': `LB ${RUN}`, 'periode-angsuran': `${months} X` };
  const seedTerm = { 'jenis-dokumen': 'SYN-KTP', 'rekening-bank': 'SYN BANK', 'periode-angsuran': '12 X' };
  const steps = Object.keys(ctl).flatMap((type) => [
    { path: `/master/${ctl[type]}?id_menu=0&id_sub_menu=${MENU_ID[ctl[type]]}` },
    { method: 'POST', path: `/master/${ctl[type]}/ajax_list`, form: dataTables(ctl[type], search[type]) },
    { method: 'POST', path: `/master/${ctl[type]}/ajax_list`, form: dataTables(ctl[type], LEGACY_SEARCH_BROKEN[type] ? seedTerm[type] : `NO-SUCH-${RUN}`) },
    { method: 'POST', path: `/master/${ctl[type]}/ajax_list`, form: { ...dataTables(ctl[type], ''), length: '5000' } },
    { method: 'POST', path: `/master/${ctl[type]}/ajax_edit/${created[type].id}` },
  ]);
  const results = await legacy(Object.values(ctl), steps);
  Object.keys(ctl).forEach((type, i) => {
    const [page, searched, control, all, edit] = results.slice(i * 5, i * 5 + 5);
    const v = created[type].values;
    assert.equal(page.status, 200, `${type} legacy screen renders`); assert.doesNotMatch(strip(page.body), /Database Error|A PHP Error/, `${type}: no legacy error`);
    let rows;
    if (LEGACY_SEARCH_BROKEN[type]) {
      assert.match(strip(searched.body), GROUP_START_FATAL, `${type}: searching the native row hits LEG-01`);
      assert.match(strip(control.body), GROUP_START_FATAL, `${type}: searching a legacy SEED row fails identically — the defect predates native writes`);
      rows = rowsOf(all).filter((r) => r.includes(v.code));
      assert.equal(rows.length, 1, `${type}: the unfiltered legacy list (the path that works) shows the native row exactly once`);
    } else {
      rows = rowsOf(searched);
      assert.equal(rows.length, 1, `${type}: legacy search finds exactly the native row`);
      assert.equal(rowsOf(control).length, 0, `${type}: legacy search filter still filters`);
      assert.ok(rowsOf(all).some((r) => r.includes(v.name)), `${type}: unfiltered list shows it too`);
    }
    for (const value of Object.values(v).filter(Boolean)) assert.ok(rows[0].includes(value), `${type}: legacy list shows ${value}`);
    assert.equal(label(rows[0].find((c) => /label/.test(String(c)))), 'Aktif');
    const e = edit.json;
    assert.equal(String(e.id), String(created[type].id));
    if (type === 'lokasi') { assert.deepEqual([e.code_lokasi, e.name_lokasi, e.status], [v.code, v.name, '1']); }
    if (type === 'bagian') { assert.deepEqual([e.name_bagian, e.id_lokasi, e.status], [v.name, null, '1'], 'id_lokasi untouched (NULL)'); }
    if (['jenis-dokumen', 'rekening-bank', 'periode-angsuran'].includes(type)) {
      const p = { 'jenis-dokumen': 'jenis_dokumen', 'rekening-bank': 'rekening', 'periode-angsuran': 'jangka_waktu' }[type];
      assert.deepEqual([e[`${p}_code`], e[`${p}_name`], e[`${p}_remarks`], e.is_active], [v.code, v.name, v.remarks, '1'], `${type}: legacy columns and text status`);
      assert.match(e.cd, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(e.cd_usr, 'SYNTH KFA KOSIPA OPERATOR', 'legacy cd_usr = KOSIPA display name');
      if (type === 'jenis-dokumen') { assert.match(e.ud, /^\d{4}-/); assert.equal(e.ud_usr, 'SYNTH KFA KOSIPA OPERATOR'); }
    }
  });
  // Every master uses its native status convention on the real legacy list/edit paths, not only the two consumer dropdowns below.
  for (const type of Object.keys(ctl)) {
    const off = (await nativeStatus(type, created[type], false)).result;
    const [listed, edited] = await legacy([ctl[type]], [
      { method: 'POST', path: `/master/${ctl[type]}/ajax_list`, form: { ...dataTables(ctl[type], ''), length: '5000' } },
      { method: 'POST', path: `/master/${ctl[type]}/ajax_edit/${off.id}` },
    ]);
    const legacyRow = rowsOf(listed).find((r) => r.includes(off.values.code ?? off.values.name));
    assert.ok(legacyRow, `${type}: deactivation retains the legacy row`);
    assert.equal(label(legacyRow.find((c) => /label/.test(String(c)))), 'Tidak Aktif', `${type}: legacy labels native deactivation correctly`);
    assert.equal(edited.json[type === 'lokasi' || type === 'bagian' ? 'status' : 'is_active'], '0', `${type}: legacy edit sees inactive status`);
    created[type] = (await nativeStatus(type, off, true)).result;
  }
  assert.equal(await financialFingerprint(), before, 'A8: no financial row changed');
});

test('A5/A6: deactivated native rows stay listed (Tidak Aktif) on master screens but disappear from every legacy consumer; reactivation brings them back', options, async () => {
  let bagian = (await nativeCreate('bagian', { name: `SYNTH Konsumen ${RUN}` })).result;
  let lokasi = (await nativeCreate('lokasi', { code: `KO-${RUN}`, name: `SYNTH Konsumen Lokasi ${RUN}` })).result;
  const consumers = [
    { method: 'POST', path: '/anggota/anggota_c/get_bagian' },
    { method: 'POST', path: '/mobile/users_c/get_bagian' },
    { path: '/anggota/anggota_c?id_menu=0&id_sub_menu=9108' },
    { path: '/mobile/users_c/detail_user/9101/SKFA0001' },
  ];
  const see = async () => {
    const [a, m, form, mobile] = await legacy(['bagian_c'], consumers);
    return {
      memberBagian: a.json.map((r) => r.nama).includes(bagian.values.name), mobileBagian: m.json.map((r) => r.nama).includes(bagian.values.name),
      memberLokasi: String(form.body).includes(`<option value="${lokasi.values.name}">`), mobileLokasi: String(mobile.body).includes(lokasi.values.name),
      mobileBagianOption: String(mobile.body).includes(bagian.values.name),
    };
  };
  assert.deepEqual(await see(), { memberBagian: true, mobileBagian: true, memberLokasi: true, mobileLokasi: true, mobileBagianOption: true }, 'active native rows are offered by every consumer');
  bagian = (await nativeStatus('bagian', bagian, false)).result; lokasi = (await nativeStatus('lokasi', lokasi, false)).result;
  assert.deepEqual(await see(), { memberBagian: false, mobileBagian: false, memberLokasi: false, mobileLokasi: false, mobileBagianOption: false }, 'deactivated rows vanish from new-entry lists');
  const [list] = await legacy(['bagian_c'], [{ method: 'POST', path: '/master/bagian_c/ajax_list', form: dataTables('bagian_c', `Konsumen ${RUN}`) }]);
  assert.equal(label(rowsOf(list)[0].find((c) => /label/.test(String(c)))), 'Tidak Aktif', 'the master screen still lists it as inactive');
  bagian = (await nativeStatus('bagian', bagian, true)).result; lokasi = (await nativeStatus('lokasi', lokasi, true)).result;
  assert.equal((await see()).memberBagian, true);
});

test('A7: existing members keep resolving after native master changes (legacy member list and the public-savings BINARY join)', options, async () => {
  const [members] = await legacy([], [{ method: 'POST', path: '/anggota/anggota_c/ajax_list', form: { draw: '1', start: '0', length: '50', 'search[value]': 'SKFA0001', id_menu: '9108' } }]);
  const member = rowsOf(members).find((r) => r.includes('SKFA0001'));
  assert.ok(member?.includes('SYNTH Produksi') && member.includes('SYNTH Tambun'), 'legacy member list shows the stored bagian and lokasi names');
  const [joined] = await sql("SELECT b.name_bagian FROM m_anggota m JOIN m_bagian b ON (BINARY CAST(b.id AS CHAR) = BINARY m.bagian OR BINARY b.name_bagian = BINARY m.bagian) WHERE m.nik_kar = 'SKFA0001'");
  assert.equal(joined?.name_bagian, 'SYNTH Produksi', 'the public-savings join still resolves');
  const produksi = await load('bagian', 1);
  await assert.rejects(nativeUpdate('bagian', produksi, { name: 'SYNTH PRODUKSI' }), { code: 'MASTER_REFERENCED' }, 'a case-only rename that would break the BINARY join is refused');
});

test('rollback compatibility: legacy edits a native-created row; native reads the legacy change and refuses its own stale version', options, async () => {
  const row = (await nativeCreate('jenis-dokumen', { code: `RB${RUN}`, name: 'SYNTH ROLLBACK', remarks: '' })).result;
  const [saved] = await legacy(['jenis_dokumen_c'], [{ method: 'POST', path: '/master/jenis_dokumen_c/ajax_update', form: { id: String(row.id), jenis_dokumen_code: `RB${RUN}`, jenis_dokumen_name: 'SYNTH ROLLBACK LEGACY', jenis_dokumen_remarks: 'diubah legacy', is_active: '1' } }]);
  assert.equal(saved.json?.status, '00', 'legacy ajax_update succeeded');
  const now = await load('jenis-dokumen', row.id);
  assert.deepEqual(now.values, { code: `RB${RUN}`, name: 'SYNTH ROLLBACK LEGACY', remarks: 'diubah legacy' });
  await assert.rejects(nativeUpdate('jenis-dokumen', row, { remarks: 'native lama' }), { code: 'STALE' });
  const [stamp] = await sql('SELECT ud_usr FROM m_jenis_dokumen WHERE id = ?', [row.id]);
  assert.equal(stamp.ud_usr, 'SYNTH KFA KOSIPA OPERATOR', 'legacy stamps its own session user, as before');
});

test('B: the ref_menu fence closes exactly one controller — fenced master writes are refused, but m_anggota stays writable through another legacy controller', options, async () => {
  const before = (await sql("SELECT COUNT(*) AS n FROM m_lokasi"))[0].n;
  const { results } = await rt.session([{ method: 'POST', path: '/master/lokasi_c/ajax_add', form: { code_lokasi: `FX-${RUN}`, name_lokasi: 'SYNTH FENCED', status: '1' } }]);
  assert.equal(results[0].status, 302); assert.match(results[0].location, /error\/adm_error_c/, 'fenced controller refuses the legacy write');
  assert.equal((await sql("SELECT COUNT(*) AS n FROM m_lokasi"))[0].n, before);
  // Member screens fenced (master/anggota_c 9101, anggota/anggota_c 9108) — yet the mobile-user screen (9109, a different controller) rewrites m_anggota.
  await setMenu([9101, 9108], 0);
  try {
    const name = `SYNTH VIA MOBILE ${RUN}`;
    const { results: r } = await rt.session([{ method: 'POST', path: '/mobile/users_c/ajax_update', form: { id: '9101', nik_kar: 'SKFA0002', nama_kar: name, email: 'kfa2@example.invalid', no_telp: '000', is_email_verified: '1', is_phone_verified: '1', admin_verifikasi: '0', is_active: '1', limit_toko: '123', limit_ppob: '45' } }]);
    assert.equal(r[0].status, 200); assert.match(strip(r[0].body), /"status":"00"/, 'legacy reports success (the e-mail it then attempts cannot leave the internal network)');
    const [m] = await sql("SELECT nama_kar, limit_toko, limit_ppob FROM m_anggota WHERE nik_kar = 'SKFA0002'");
    assert.deepEqual([m.nama_kar, Number(m.limit_toko), Number(m.limit_ppob)], [name, 123, 45], 'the menu fence does NOT protect m_anggota: another legacy controller still writes member name and credit limits');
  } finally { await setMenu([9101, 9108], 1); }
});

test('B: the proposed ownership guard (FD-22) closes every route — legacy screens, other controllers and direct SQL — for owned objects only', options, async () => {
  const guard = (extra = []) => execFileSync(process.execPath, ['--experimental-strip-types', new URL('../scripts/kosipa-ownership-guard.mjs', import.meta.url).pathname, '--database', stack.DB, '--ledger', stack.LEDGER_DB, ...extra], { encoding: 'utf8' });
  const rootSql = (text) => { const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot'], { input: text, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const own = (object, owner) => sql(`INSERT INTO \`${stack.LEDGER_DB}\`.kosipa_write_owner (object, owner, native_account, changed_by, changed_at, reason) VALUES (?, ?, 'kosipa_master_w', 'synthetic-operator', UTC_TIMESTAMP(), 'FA-03A rehearsal')
    ON DUPLICATE KEY UPDATE owner = VALUES(owner), changed_at = VALUES(changed_at)`, [object, owner]);
  rootSql(guard());
  try {
    await own('m_lokasi', 'NATIVE'); await own('m_anggota.profile', 'NATIVE');
    // 1. legacy screen re-enabled (the adm_menu_c path): the DATABASE refuses the legacy write.
    const row = (await nativeCreate('lokasi', { code: `GD-${RUN}`, name: `SYNTH Guard ${RUN}` })).result;
    const [attempt] = await legacy(['lokasi_c'], [{ method: 'POST', path: '/master/lokasi_c/ajax_update', form: { id: String(row.id), code_lokasi: 'HIJACK', name_lokasi: 'HIJACK', status: '0' } }]);
    assert.match(strip(attempt.body), /KOSIPA_NATIVE_OWNED:m_lokasi/, 'legacy write refused by the guard');
    assert.deepEqual((await load('lokasi', row.id)).values, row.values, 'row unchanged');
    // 2. native writer still writes (its own login name).
    assert.equal((await nativeUpdate('lokasi', row, { code: `GD2-${RUN}` })).replayed, false);
    // 3. direct SQL by any other account (here: the legacy application account and root) is refused.
    await assert.rejects(rt.admin.query("UPDATE m_lokasi SET name_lokasi = 'ROOT EDIT' WHERE id = ?", [row.id]), /KOSIPA_NATIVE_OWNED:m_lokasi/);
    // 4. column group: m_anggota profile columns owned natively — the mobile-user screen's mixed UPDATE is refused as a whole.
    const { results } = await rt.session([{ method: 'POST', path: '/mobile/users_c/ajax_update', form: { id: '9101', nik_kar: 'SKFA0002', nama_kar: `GUARDED ${RUN}`, email: 'kfa2@example.invalid', no_telp: '000', is_email_verified: '1', is_phone_verified: '1', admin_verifikasi: '0', is_active: '1', limit_toko: '1', limit_ppob: '1' } }]);
    assert.match(strip(results[0].body), /KOSIPA_NATIVE_OWNED:m_anggota\.profile/);
    // ... while columns outside the group (TOKO POS's status/limits path) stay writable by other applications.
    await rt.admin.query("UPDATE m_anggota SET limit_toko = 7 WHERE nik_kar = 'SKFA0002'");
    assert.equal(Number((await sql("SELECT limit_toko FROM m_anggota WHERE nik_kar = 'SKFA0002'"))[0].limit_toko), 7);
    // 5. rollback = owner back to LEGACY: legacy writes again, nothing else to undo.
    await own('m_lokasi', 'LEGACY');
    const [back] = await legacy(['lokasi_c'], [{ method: 'POST', path: '/master/lokasi_c/ajax_update', form: { id: String(row.id), code_lokasi: `LG2-${RUN}`, name_lokasi: row.values.name, status: '1' } }]);
    assert.equal(back.json?.status, '00', 'legacy writes again after rollback');
  } finally {
    await own('m_lokasi', 'LEGACY'); await own('m_anggota.profile', 'LEGACY');
    rootSql(guard(['--drop']));
  }
});
