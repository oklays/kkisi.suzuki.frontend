import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Observed CI2 defects are assertions about legacy, NEVER native acceptance requirements.
// Opt-in only; unchanged read-only source, generated synthetic config, internal network, no external sends.
const ENABLED = process.env.KOSIPA_FA01 === '1';
// Coordinator's read-only 2026-11-06 capture; never change server/global/native SQL mode.
const LEGACY_SQL_MODE = 'NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1; synthetic stack and PHP56 image required', timeout: 600_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const runtime = ENABLED ? await import('../../../integration/kosipa-full-access/legacy-runtime/runtime.mjs') : null;
const privateRoot = new URL('../../../.local/kosipa-fa01/', import.meta.url);
let rt, container, originalPassword, menus;
const controllers = ['anggota/anggota_c', 'master/anggota_c'];
const sql = (text, values = []) => rt.admin.query(text, values).then(([rows]) => rows);
test.before(async () => {
  if (!ENABLED) return;
  await stack.applyMemberSideTables(); // additive, sentinel checked, incompatible shapes rejected
  const config = await stack.loadConfig();
  const db = await stack.rootConnection(config);
  try {
    [[{ password: originalPassword }]] = await db.query('SELECT password FROM ref_users WHERE id_ref_user=9102');
    [menus] = await db.query('SELECT id,status FROM ref_menu WHERE id IN (9101,9108)');
  } finally { await db.end(); }
  const before = await readdir(privateRoot);
  rt = await runtime.startLegacyRuntime();
  const created = (await readdir(privateRoot)).filter((x) => x.startsWith('legacy-') && !before.includes(x));
  assert.equal(created.length, 1);
  container = `kfa-${created[0]}`;
  // Only generated environment overrides in this test container: CI2 FALSE does not clear MariaDB's default strict mode.
  // A standard CI2 hook sets only this request's connection mode, never GLOBAL mode or application business behavior.
  const generated = {
    '/app/application/config/development/config.php': "<?php require '/app/application/config/config.php'; if (!isset($config['enable_hooks']) || $config['enable_hooks'] !== FALSE) { exit('KFA_EXPECTED_DISABLED_HOOKS'); } $config['enable_hooks'] = TRUE;",
    '/app/application/config/development/hooks.php': `<?php
function kfa_member_session_mode() {
  $CI =& get_instance();
  $mode = file_get_contents('/tmp/kfa-member-sql-mode');
  if ($mode !== '${LEGACY_SQL_MODE}' && $mode !== 'STRICT_ALL_TABLES') { exit('KFA_INVALID_SQL_MODE'); }
  $CI->db->query("SET SESSION sql_mode='" . $mode . "'");
}
$hook['post_controller_constructor'] = array('class' => '', 'function' => 'kfa_member_session_mode', 'filename' => 'hooks.php', 'filepath' => 'config/development', 'params' => array());`,
    '/tmp/kfa-member-sql-mode': LEGACY_SQL_MODE,
  };
  for (const [path, content] of Object.entries(generated)) execFileSync('docker', ['exec', container, 'php', '-r', `file_put_contents($argv[1], $argv[2]);`, path, content]);
  await sql('SET SESSION sql_mode=?', [LEGACY_SQL_MODE]); // legacy synthetic fixture setup only; no global SQL-mode changes
  await sql('UPDATE ref_menu SET status=1 WHERE id IN (9101,9108)');
});
test.after(async () => {
  if (originalPassword === undefined) return;
  const db = rt?.admin ?? await stack.rootConnection(await stack.loadConfig());
  try {
    await db.query('UPDATE ref_users SET password=? WHERE id_ref_user=9102', [originalPassword]);
    for (const m of menus) await db.query('UPDATE ref_menu SET status=? WHERE id=?', [m.status, m.id]);
  } finally { if (rt) await rt.close(); else await db.end(); }
});

const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const form = (nik, patch = {}) => ({
  nik_kar: nik, nama_kar: `SYNTH ${nik}`, id_card: '', ktp: nik, email: `${nik}@example.invalid`,
  no_telp: nik, no_telp1: '', jenis_kel: 'L', ibu_kandung: 'SYNTH', tempat_lahir: 'SYNTH',
  alamat: 'SYNTH ADDRESS', alamat_tinggal: 'SYNTH STREET', status_rumah: '', pendidikan: '',
  status_nikah: '', nama_istri: '', npwp: '', bagian: 'SYNTH Produksi', lokasi: 'SYNTH Tambun',
  status_karyawan: 'TETAP', kd_group: 'ANGGOTA', status_anggota: 'AKTIVE',
  tgl_daftar: '', tgl_lahir: '', tgl_karyawan: '', tgl_masuk: '', tgl_keluar: '',
  sim_pokok: '0', sim_wajib: '0', sim_sukarela: '0', gaji: '0', gaji_minus: '0',
  limit_toko: '0', limit_ppob: '0', no_rek: '', bank_rek: '', ...patch,
});
async function request(controller, action, values, { error = false } = {}) {
  const [{ last }] = await sql('SELECT COALESCE(MAX(id_histori),0) AS last FROM ref_hist_akses_users');
  try {
    const { login, results } = await rt.session([{ method: 'POST', path: `/${controller}/${action}`, form: values }]);
    assert.equal(login[1].status, 302); assert.match(login[1].location, /dashboard/);
    assert.equal(results[0].status, error ? 500 : 200, strip(results[0].body).slice(0, 1200));
    if (!error) assert.doesNotMatch(strip(results[0].body), /Database Error|A PHP Error|Fatal error|Error Number:/);
    return results[0];
  } finally {
    // Login records its prior history maximum as session id. Delete only this call's one exact synthetic login row.
    const rows = await sql("SELECT id_histori FROM ref_hist_akses_users WHERE id_histori>? AND id_user=9102 AND id_session=? AND ip_user='127.0.0.1'", [last,String(last || '')]);
    assert.ok(rows.length <= 1, 'ambiguous login ownership: preserve rows and fail');
    for (const r of rows) await sql('DELETE FROM ref_hist_akses_users WHERE id_histori=?', [r.id_histori]);
  }
}
async function scenario(run) {
  const cleanup = [];
  const owned = new Set();
  const own = async () => {
    for (;;) {
      const nik = `S${randomBytes(4).toString('hex').toUpperCase()}`;
      const [present] = await sql('SELECT EXISTS(SELECT 1 FROM m_anggota WHERE nik_kar=?) OR EXISTS(SELECT 1 FROM users WHERE nik=?) OR EXISTS(SELECT 1 FROM m_simpanan_aktif WHERE nik_kar=?) AS present', [nik,nik,nik]);
      if (!present.present && !owned.has(nik)) { owned.add(nik); return nik; }
    }
  };
  const member = async (patch = {}) => {
    const nik = await own();
    const result = await sql('INSERT INTO m_anggota (nik_kar,nama_kar,status_anggota,gaji,gaji_minus,surat_kuasa) VALUES (?, ?, ?, 0, 0, 0)', [nik, `SYNTH ${nik}`, 'AKTIVE']);
    return { nik, id: Number(result.insertId), form: form(nik, patch) };
  };
  const insert = async (table, values) => {
    assert.match(table, /^(users|oauth_access_tokens|m_simpanan_aktif|trans_pinjaman|trans_simpanan|trans_simpanan_dtl|trans_potongan_matrix|db_sales|orders)$/);
    const keys = Object.keys(values);
    const result = await sql(`INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, Object.values(values));
    const id = values.id ?? result.insertId;
    cleanup.push(() => sql(`DELETE FROM \`${table}\` WHERE id=?`, [id]));
    return id;
  };
  const user = async (m) => insert('users', { nik: m.nik, ktp: m.nik, name: `SYNTH OLD ${m.nik}`, phone: m.nik, image: '', email: `old-${m.nik}@example.invalid`, password: 'synthetic-unused', persetujuan: 1, wallet_balance: 9, wallet_balance_ppob: 8, is_active: 1, is_delete: 0, admin_verifikasi: 1, temporary_token: 'SYNTH', bagian: 'SYNTH OLD BAGIAN', lokasi: 'SYNTH OLD LOKASI', no_rek: 'SYNTH OLD REK', bank_rek: 'SYNTH OLD BANK', kd_group: 'SYNTH OLD GROUP' });
  const deduction = (m, patch = {}) => insert('m_simpanan_aktif', { nik_kar: m.nik, nama_kar: `SYNTH OLD ${m.nik}`, kd_group: 'SYNTH OLD', jenis_simpanan: 'SIMPANAN POKOK', potongan_old: 0, potongan_payroll: 77, is_mobile: 0, status: 1, ...patch });
  try { await run({ own, member, insert, user, deduction }); }
  finally {
    const errors=[];
    for (const f of cleanup.reverse()) { try { await f(); } catch (e) { errors.push(e); } }
    for (const nik of owned) {
      assert.match(nik, /^S[A-F0-9]{8}$/);
      try { await sql('DELETE FROM m_simpanan_aktif WHERE nik_kar=?', [nik]); await sql('DELETE FROM m_anggota WHERE nik_kar=?', [nik]); } catch (e) { errors.push(e); }
    }
    if (errors.length) throw new AggregateError(errors, 'KFA_MEMBER_CLEANUP_FAILED');
  }
}
const row = async (table, id) => (await sql(`SELECT * FROM \`${table}\` WHERE id=?`, [id]))[0];
const memberByNik = async (nik) => (await sql('SELECT * FROM m_anggota WHERE nik_kar=?', [nik]));
const configs = (nik) => sql('SELECT * FROM m_simpanan_aktif WHERE nik_kar=? ORDER BY jenis_simpanan,id', [nik]);
const update = (ctl, m, patch = {}) => request(ctl, 'ajax_update', { ...m.form, id: String(m.id), ...patch });
const strict = (enabled) => execFileSync('docker', ['exec', container, 'php', '-r', 'file_put_contents("/tmp/kfa-member-sql-mode", $argv[1]);', enabled ? 'STRICT_ALL_TABLES' : LEGACY_SQL_MODE], { encoding: 'utf8' });

for (const ctl of controllers) {
  test(`MC01 ${ctl}: create 100/200/300 produces exactly three six-field deduction configs, no mobile account or financial posting`, options, async () => scenario(async ({ own }) => {
    const nik = await own(); const values = form(nik, { sim_pokok: '100', sim_wajib: '200', sim_sukarela: '300', pot_fi: '999', pot_pbs: '999' });
    await request(ctl, 'ajax_add', values);
    const members = await memberByNik(nik); assert.equal(members.length, 1);
    assert.match(members[0].doc_no, /^REG\d+$/); assert.ok(members[0].no_anggota.endsWith(nik));
    assert.equal(members[0].cd_usr, '0', 'legacy session key nama is missing: login populates nama_lengkap instead');
    const rows = await configs(nik); assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => [r.jenis_simpanan, r.nik_kar, r.nama_kar, r.kd_group, Number(r.potongan_payroll), r.status]), [
      ['SIMPANAN POKOK', nik, values.nama_kar, 'ANGGOTA', 100, 1], ['SIMPANAN SUKARELA', nik, values.nama_kar, 'ANGGOTA', 300, 1], ['SIMPANAN WAJIB', nik, values.nama_kar, 'ANGGOTA', 200, 1],
    ]);
    for (const r of rows) { assert.equal(r.doc_no, null); assert.equal(r.cd, null); assert.equal(r.ud, null); assert.equal(Number(r.potongan_old), 0); assert.equal(r.is_mobile, 0); }
    assert.equal((await sql('SELECT id FROM users WHERE nik=?', [nik])).length, 0);
    assert.equal((await sql('SELECT id FROM trans_pinjaman WHERE nik=?', [nik])).length, 0);
    assert.equal((await sql('SELECT id FROM trans_simpanan_dtl WHERE nik_kar=?', [nik])).length, 0);
  }));
  test(`MC02 ${ctl}: blank/zero/negative amounts create no config; non-AKTIVE registration does not zero limits`, options, async () => scenario(async ({ own }) => {
    const nik = await own(); await request(ctl, 'ajax_add', form(nik, { sim_pokok: '', sim_wajib: '0', sim_sukarela: '-1', status_anggota: 'RESIGN', limit_toko: '12', limit_ppob: '3' }));
    const [m] = await memberByNik(nik); assert.deepEqual([Number(m.sim_pokok), Number(m.sim_wajib), Number(m.sim_sukarela)], [0, 0, -1]);
    assert.deepEqual([Number(m.gaji), Number(m.gaji_minus), m.surat_kuasa, Number(m.limit_toko), Number(m.limit_ppob)], [0, 0, 0, 12, 3]);
    assert.equal((await configs(nik)).length, 0); assert.equal(m.password, null); assert.equal(m.foto_profile, null); assert.equal(Number(m.limit_persen), 0);
  }));
  test(`MC03 ${ctl}: real strict-mode create fails on omitted surat_kuasa; native explicit defaults remain unimplemented`, options, async () => scenario(async ({ own }) => {
    const nik = await own();
    try { strict(true); const r = await request(ctl, 'ajax_add', { nik_kar: nik, nama_kar: `SYNTH ${nik}`, id_card: '' }, { error: true }); assert.match(strip(r.body), /Field 'surat_kuasa' doesn't have a default value/); assert.equal((await memberByNik(nik)).length, 0); }
    finally { strict(false); }
    // CI2 always supplies sanitized gaji/gaji_minus; direct strict SQL exposes their DDL constraint too.
    await sql("SET SESSION sql_mode='STRICT_ALL_TABLES'");
    try {
      await assert.rejects(sql('INSERT INTO m_anggota (nik_kar,surat_kuasa) VALUES (?,0)', [nik]), /Field 'gaji' doesn't have a default value/);
      await assert.rejects(sql('INSERT INTO m_anggota (nik_kar,gaji,surat_kuasa) VALUES (?,0,0)', [nik]), /Field 'gaji_minus' doesn't have a default value/);
    } finally { await sql('SET SESSION sql_mode=?', [LEGACY_SQL_MODE]); }
  }));
  test(`MC04 ${ctl}: create/edit copy tgl_masuk into tgl_karyawan; empty optional dates become NULL`, options, async () => scenario(async ({ own }) => {
    const nik = await own(); await request(ctl, 'ajax_add', form(nik, { tgl_karyawan: '2020-01-02', tgl_masuk: '2021-03-04' }));
    let [m] = await memberByNik(nik); assert.deepEqual([m.tgl_karyawan,m.tgl_masuk,m.tgl_daftar,m.tgl_lahir,m.tgl_keluar], ['2021-03-04','2021-03-04',null,null,null]);
    await update(ctl, { id: m.id, form: form(nik) }, { tgl_karyawan: '2022-05-06', tgl_masuk: '2023-07-08' });
    [m] = await memberByNik(nik); assert.deepEqual([m.tgl_karyawan,m.tgl_masuk], ['2023-07-08','2023-07-08']);
    await update(ctl, { id: m.id, form: form(nik) }); [m] = await memberByNik(nik); assert.deepEqual([m.tgl_karyawan,m.tgl_masuk], [null,null]);
  }));
  test(`MC05 ${ctl}: mismatched id/NIK corrupts another member's mobile profile and deductions`, options, async () => scenario(async ({ member,user,deduction }) => {
    const a = await member(), b = await member(); const ua = await user(a), ub = await user(b); await deduction(a); await deduction(b);
    const beforeA = await row('users',ua), beforeB = await row('m_anggota',b.id), configA = await configs(a.nik);
    await update(ctl, a, { nik_kar: b.nik, sim_pokok: '432', nama_kar: `SYNTH WRONG ${a.nik}`, ktp: `SYNTH${a.nik}` });
    assert.equal((await row('m_anggota',a.id)).nama_kar, `SYNTH WRONG ${a.nik}`);
    assert.deepEqual(await row('m_anggota',b.id), beforeB); assert.deepEqual(await row('users',ua),beforeA);
    assert.equal((await row('users',ub)).name, `SYNTH WRONG ${a.nik}`); assert.equal(Number((await configs(b.nik))[0].potongan_payroll),432); assert.deepEqual(await configs(a.nik),configA);
  }));
  test(`MC06 ${ctl}: exactly five profile fields mirror; wallet uses gaji_minus or limits; bank/group/location stay unchanged`, options, async () => scenario(async ({ member,user }) => {
    const m = await member(); const id = await user(m); const initial = await row('users',id);
    await update(ctl,m,{ limit_toko:'123',limit_ppob:'45' });
    let u = await row('users',id); assert.deepEqual([u.ktp,u.name,u.phone,u.email,u.street_address],[m.form.ktp,m.form.nama_kar,m.form.no_telp,m.form.email,m.form.alamat_tinggal]);
    assert.deepEqual([Number(u.wallet_balance),Number(u.wallet_balance_ppob)],[123,45]);
    for (const k of ['bagian','lokasi','no_rek','bank_rek','kd_group']) assert.equal(u[k],initial[k]);
    await update(ctl,m,{ gaji_minus:'67',limit_toko:'123',limit_ppob:'45' }); u=await row('users',id); assert.deepEqual([Number(u.wallet_balance),Number(u.wallet_balance_ppob)],[67,0]);
  }));
  for (const status of ['LUAR BIASA','KONTRAK','RESIGN','PENSIUN']) test(`MC07 ${ctl} AKTIVE→${status}: positive gaji_minus recredits disabled wallet (legacy defect)`, options, async () => scenario(async ({ member,user,deduction }) => {
    const m=await member(); const id=await user(m); await deduction(m); const configBefore=await configs(m.nik);
    await update(ctl,m,{ status_anggota:status,gaji:'1000',gaji_minus:'67',limit_toko:'123',limit_ppob:'45',tgl_keluar:'2026-01-01' });
    const saved=await row('m_anggota',m.id),u=await row('users',id);
    assert.deepEqual([saved.status_anggota,Number(saved.limit_toko),Number(saved.limit_ppob),Number(saved.gaji_minus),Number(saved.gaji)], [status,0,0,67,1000]);
    assert.deepEqual([u.is_active,u.admin_verifikasi,u.is_delete,u.temporary_token,Number(u.wallet_balance),Number(u.wallet_balance_ppob)],[0,0,1,'',67,0]);
    assert.deepEqual(await configs(m.nik),configBefore);
  }));
  test(`MC08 ${ctl}: differing token predicates with multiple owned tokens and unrelated id trap`, options, async () => scenario(async ({ member,user,insert }) => {
    const a=await member(),b=await member();const ua=await user(a),ub=await user(b);
    const ids=[`SYNTH-${a.nik}-1`,`SYNTH-${a.nik}-2`,String(ua),`SYNTH-${b.nik}-1`];
    assert.equal((await sql('SELECT id FROM oauth_access_tokens WHERE id=?',[String(ua)])).length,0,'trap id must be unused');
    for (const [i,id] of ids.entries()) await insert('oauth_access_tokens',{id,user_id:i<2?ua:ub,client_id:1,revoked:0});
    await update(ctl,a,{status_anggota:'RESIGN'});
    const remaining=(await sql('SELECT id FROM oauth_access_tokens WHERE user_id IN (?,?) ORDER BY id',[ua,ub])).map((r)=>r.id).sort();
    assert.deepEqual(remaining, (ctl.startsWith('master/') ? [ids[2],ids[3]] : [ids[0],ids[1],ids[3]]).sort());
  }));
  test(`MC09 ${ctl}: status transition without mobile user succeeds without phantom users/tokens`, options, async () => scenario(async ({ member }) => {
    const m=await member();await update(ctl,m,{status_anggota:'PENSIUN',gaji_minus:'12',limit_toko:'10',limit_ppob:'9'});
    const saved=await row('m_anggota',m.id);assert.deepEqual([saved.status_anggota,Number(saved.limit_toko),Number(saved.limit_ppob),Number(saved.gaji_minus)],['PENSIUN',0,0,12]);
    assert.equal((await sql('SELECT id FROM users WHERE nik=?',[m.nik])).length,0);
    assert.equal((await sql('SELECT t.id FROM oauth_access_tokens t JOIN users u ON t.user_id=u.id WHERE u.nik=?',[m.nik])).length,0);
  }));
  test(`MC10 ${ctl}: zero deduction leaves existing config; positive changes all duplicates without refreshing inactive status/name/group`, options, async () => scenario(async ({ member,deduction }) => {
    const m=await member();await deduction(m,{status:0});await deduction(m,{status:1,potongan_payroll:88});const before=await configs(m.nik);
    await update(ctl,m,{sim_pokok:'0'});assert.deepEqual(await configs(m.nik),before);assert.equal(Number((await row('m_anggota',m.id)).sim_pokok),0);
    await update(ctl,m,{sim_pokok:'222',nama_kar:`SYNTH NEW ${m.nik}`,kd_group:'SYNTH NEW'});
    const after=await configs(m.nik);assert.equal(after.length,2);for(let i=0;i<2;i++) { assert.equal(Number(after[i].potongan_payroll),222);assert.deepEqual(after[i],{...before[i],potongan_payroll:after[i].potongan_payroll}); }
  }));
  test(`MC11 ${ctl}: hard delete ignores loan/savings/matrix/sales/orders history and leaves mobile access alive`, options, async () => scenario(async ({ member,user,deduction,insert }) => {
    const m=await member(); const uid=await user(m);await deduction(m);
    const token=`SYNTH-${m.nik}`;await insert('oauth_access_tokens',{id:token,user_id:uid,client_id:1,revoked:0});
    const histories=[];
    histories.push(['trans_pinjaman',await insert('trans_pinjaman',{nik:m.nik,nama:`SYNTH ${m.nik}`,doc_no:`SYNTH-${m.nik}`})]);
    const doc=`SYNTH-${m.nik}`;histories.push(['trans_simpanan',await insert('trans_simpanan',{doc_no:doc})]);
    histories.push(['trans_simpanan_dtl',await insert('trans_simpanan_dtl',{doc_no:doc,nik_kar:m.nik})]);
    histories.push(['trans_potongan_matrix',await insert('trans_potongan_matrix',{nik_kar:m.nik,nama:`SYNTH ${m.nik}`,periode:doc,doc_no_dtl:doc,kd_group:'ANGGOTA'})]);
    histories.push(['db_sales',await insert('db_sales',{customer_id:m.id,nik_kar:m.nik,customer_name:`SYNTH ${m.nik}`,sales_code:doc,sales_date:'2026-01-01'})]);
    histories.push(['orders',await insert('orders',{id_anggota:m.id,nik_kar:m.nik,customer_id:String(uid),order_code:doc})]);
    const snapshots=await Promise.all(histories.map(([t,id])=>row(t,id))),userBefore=await row('users',uid);
    await request(ctl,`ajax_delete/${m.id}`,{});assert.equal(await row('m_anggota',m.id),undefined);
    assert.equal((await configs(m.nik))[0].status,0);
    assert.deepEqual(await Promise.all(histories.map(([t,id])=>row(t,id))),snapshots);
    assert.deepEqual(await row('users',uid),userBefore);assert.equal((await row('oauth_access_tokens',token)).user_id,uid);
  }));
}
