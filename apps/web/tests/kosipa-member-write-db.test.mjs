import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { registerMember, updateMemberProfile } from '@koperasi/application/kosipa/commands/member';
import { PrismaKosipaMemberRepository, legacyMemberNumber } from '../src/infrastructure/repositories/kosipa-member-write.repository.ts';
import { validateKosipaMemberLedgerDatabase, validateKosipaMemberWriteConfig } from '../src/infrastructure/db/prisma-kosipa-member-write.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';
import { KOSIPA_WRITE_FEATURES, kosipaWriteOwnership } from '../src/infrastructure/console/kosipa-ownership.ts';
import { readFileSync } from 'node:fs';

// FA-03B T04: native member registration + profile repository against the ISOLATED synthetic stack only (opt-in KOSIPA_FA01=1, run files
// sequentially: the writer account allows 2 connections; the FA-01 app server must be stopped). Every row created here is SYNTH-marked and
// removed by exact id/NIK in test.after; the append-only ledger and numbering registry keep their rows. AUTO_INCREMENT is never reset.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup` and `node apps/web/scripts/setup-kosipa-member-write.mjs`', timeout: 180_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'memberWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const root = config ? await stack.rootConnection(config) : null;
const SECRET = 'synthetic-member-version-secret-0123456789abcdef';
const CONTROLLERS = ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c'];

const RUN = randomUUID().slice(0, 5).toUpperCase();
const created = { members: [], users: [], niks: [], bagian: [] };
let fenceBefore = [];
let seq = 0;
const nik = () => `K${RUN}${++seq}`;
const q = async (sql, params = []) => (await root.query(sql, params))[0];

if (ENABLED) {
  // The legacy member controllers are enabled in the synthetic stack (legacy runtime suites need them). The fence is the precondition of every
  // native member command: close it for this suite and restore the exact previous statuses afterwards.
  fenceBefore = await q('SELECT id, status FROM ref_menu WHERE UPPER(url) IN (?, ?, ?)', CONTROLLERS.map((c) => c.toUpperCase()));
  await q('UPDATE ref_menu SET status = 0 WHERE UPPER(url) IN (?, ?, ?)', CONTROLLERS.map((c) => c.toUpperCase()));
}
test.after(async () => {
  if (!ENABLED) return;
  try {
    for (const id of created.users) await q('DELETE FROM users WHERE id = ?', [id]);
    for (const n of created.niks) await q('DELETE FROM m_simpanan_aktif WHERE nik_kar = ?', [n]);
    for (const id of created.members) await q('DELETE FROM m_anggota WHERE id = ?', [id]);
    for (const id of created.bagian) await q('DELETE FROM m_bagian WHERE id = ?', [id]);
  } finally {
    for (const r of fenceBefore) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [r.status, r.id]);
    await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect()));
    await root.end();
  }
});

const actor = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.member.create', 'kosipa.member.update']), requestId: randomUUID() });
const repo = (hooks) => new PrismaKosipaMemberRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, versionSecret: SECRET, hooks });
const ports = (hooks, owns = true) => ({ ownership: { owns: () => owns }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), members: repo(hooks) });
let master = null;
const masters = async () => master ??= {
  bagian: (await q("SELECT name_bagian AS n FROM m_bagian WHERE status = 1 ORDER BY id LIMIT 1"))[0].n,
  lokasi: (await q("SELECT name_lokasi AS n FROM m_lokasi WHERE status = 1 ORDER BY id LIMIT 1"))[0].n,
};
const body = async (fields = {}, deductions = {}) => {
  const m = await masters(); const n = nik();
  return { idempotencyKey: randomUUID(), fields: { nik_kar: n, nama_kar: `SYNTH Anggota ${RUN} ${seq}`, bagian: m.bagian, lokasi: m.lokasi, kd_group: 'ANGGOTA', status_anggota: 'AKTIVE', ...fields },
    initialDeductions: { pokok: '0', wajib: '0', sukarela: '0', ...deductions } };
};
const register = async (b, p = ports()) => {
  const out = await registerMember(p, actor(), b);
  if (!out.replayed && !created.members.includes(out.result.id)) { created.members.push(out.result.id); created.niks.push(b.fields.nik_kar); }
  return out;
};
const memberRow = async (id) => (await q('SELECT * FROM m_anggota WHERE id = ?', [id]))[0];
const memberCount = async () => Number((await q('SELECT COUNT(*) AS n FROM m_anggota'))[0].n);
const configRows = (n) => q('SELECT * FROM m_simpanan_aktif WHERE nik_kar = ? ORDER BY id', [n]);
const detail = (id) => repo().detail(id);
const update = (id, fields, version, extra = {}) => updateMemberProfile(ports(), actor(), String(id), { idempotencyKey: randomUUID(), fields, expectedVersion: version, ...extra });
const ledgerRow = async (key) => (await q('SELECT * FROM kkisi_kfa_ledger.kosipa_command_ledger WHERE idempotency_key = ?', [key]))[0];
async function seedUser(memberNik, extra = {}) {
  const u = `SYNTH${RUN}${++seq}`;
  const row = { nik: memberNik, ktp: `OLD${u}`, phone: `0800${seq}`.slice(0, 25), image: 'x', email: `old.${u}@example.invalid`.toLowerCase(), password: 'x', persetujuan: 0, name: `OLD NAME ${u}`, street_address: 'OLD STREET',
    bagian: 'USER-BAGIAN', lokasi: 'USER-LOKASI', no_rek: 'USER-REK', bank_rek: 'USER-BANK', kd_group: 'USER-GROUP', wallet_balance: 123, ...extra };
  const [r] = await root.query('INSERT INTO users SET ?', [row]);
  created.users.push(r.insertId);
  return { id: r.insertId, ...row };
}
const errno = (e) => (/\b(1142|1143)\b/.exec(String(e?.message)) ?? [])[1];
const PII = (text, values) => values.every((v) => !String(text).includes(v));

test('review-only production grants equal the tested synthetic grants and offer nothing broader', () => {
  const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const grants = (sql) => sql.split('\n').filter((l) => /^GRANT /.test(l)).map((l) => l.replaceAll('__WRITER_USER__', 'WRITER').replaceAll("'kosipa_member_w'@'__HOST__'", 'WRITER').replace(/`?WRITER`?@'%'/, 'WRITER').replace(/`?WRITER`?@'__HOST__'/, 'WRITER'));
  const tpl = grants(file('db/kosipa/006_member_writer_grants.sql.tpl')), prod = grants(file('../../docs/migration/sql/kosipa-member-writer-production.sql'));
  assert.ok(tpl.length >= 10);
  assert.deepEqual(prod, tpl);
  for (const g of tpl) {
    assert.doesNotMatch(g, /\b(DELETE|DROP|ALTER|CREATE|ALL PRIVILEGES|GRANT OPTION|EXECUTE|TRIGGER|LOCK TABLES)\b/i, g.slice(0, 80));
    if (!/ON `__LEDGER_DB__`\.\*/.test(g)) assert.doesNotMatch(g, /ON `[^`]+`\.\*|\*\.\*/, 'only the ledger database is granted database-wide: ' + g.slice(0, 60));
  }
  assert.equal(tpl.filter((g) => /ON `__LEDGER_DB__`\.\*/.test(g) && /^GRANT SELECT, INSERT ON/.test(g)).length, 1);
  assert.ok(!tpl.some((g) => /`password`/.test(g) && /^GRANT (SELECT|UPDATE)/.test(g) && /m_anggota/.test(g)), 'the member credential column is never granted');
  for (const forbidden of ['sim_pokok', 'status_anggota', 'nik_kar', 'doc_no', 'limit_toko', 'gaji_minus']) assert.ok(!tpl.some((g) => /^GRANT UPDATE/.test(g) && /m_anggota/.test(g) && g.includes(`\`${forbidden}\``)), `no UPDATE on ${forbidden}`);
  const code = file('../../docs/migration/sql/kosipa-member-writer-production.sql').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.doesNotMatch(code, /\b(DROP|DELETE|ALTER|CREATE|TRUNCATE)\b/i);
});

test('legacy member number: 000n / 00n / 0n then NIK (n >= 100 is simply 0 + n, as get_no_anggota)', () => {
  assert.equal(legacyMemberNumber(1, '123'), '0001123');
  assert.equal(legacyMemberNumber(10, 'A9'), '0010A9');
  assert.equal(legacyMemberNumber(100, '7'), '01007');
  assert.equal(legacyMemberNumber(1000, '7'), '010007');
});

test('member is a native write feature fenced by exactly the three legacy member controllers; ownership needs flag AND listing', () => {
  assert.deepEqual([...KOSIPA_WRITE_FEATURES.member.legacyControllers], CONTROLLERS);
  assert.equal(KOSIPA_WRITE_FEATURES.member.flag, 'KOSIPA_MEMBER_WRITES_ENABLED');
  assert.equal(kosipaWriteOwnership({ KOSIPA_MEMBER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'member' }).owns('member'), true);
  assert.equal(kosipaWriteOwnership({ KOSIPA_MEMBER_WRITES_ENABLED: 'true' }).owns('member'), false);
  assert.equal(kosipaWriteOwnership({ KOSIPA_WRITE_OWNERSHIP: 'member' }).owns('member'), false);
});

test('registration: legacy-compatible member row + exactly one active config row per positive deduction; strict mode untouched', options, async () => {
  const before = await q('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM oauth_access_tokens) AS tokens, (SELECT COUNT(*) FROM trans_simpanan) AS savings');
  const b = await body({ email: `reg.${RUN}@example.invalid`, ktp: `KTP${RUN}`, no_telp: '08123', alamat: 'Jl. Uji 1\r\nBaris 2', tgl_lahir: '1990-02-03', gaji: '2500000.5', no_rek: '1234', jabatan: 'STAF' },
    { pokok: '100', wajib: '200.5', sukarela: '0' });
  const out = await register(b);
  assert.equal(out.replayed, false);
  assert.match(out.result.version, /^[0-9a-f]{64}$/);
  const row = await memberRow(out.result.id);
  assert.match(row.doc_no, /^REG\d{6}\d{4,}$/);
  const count = await memberCount();
  assert.equal(row.no_anggota, legacyMemberNumber(count, b.fields.nik_kar).replace(/^/, ''), 'count+1 at registration time (this member is the newest)');
  assert.equal(row.nik_kar, b.fields.nik_kar); assert.equal(row.nama_kar, b.fields.nama_kar); assert.equal(row.alamat, 'Jl. Uji 1\r\nBaris 2');
  assert.equal(row.tgl_lahir, '1990-02-03'); assert.equal(row.jabatan, 'STAF'); assert.equal(row.status_anggota, 'AKTIVE'); assert.equal(row.kd_group, 'ANGGOTA');
  assert.equal(Number(row.sim_pokok), 100); assert.equal(Number(row.sim_wajib), 200.5); assert.equal(Number(row.sim_sukarela), 0, 'initialDeductions "0" is stored as 0');
  assert.equal(Number(row.gaji), 2500000.5);
  for (const c of ['gaji_minus', 'limit_toko_old', 'limit_toko', 'limit_persen', 'surat_kuasa']) assert.equal(Number(row[c]), 0, `${c} explicit zero`);
  assert.equal(row.password, null); assert.equal(row.foto_profile, null);
  assert.equal(row.cd_usr, 'SYNTH KFA KOSIPA OPERATOR', 'authenticated actor, not the legacy "0" defect');
  assert.ok(Math.abs(new Date(row.cd.replace(' ', 'T') + 'Z') - (Date.now() + 7 * 3600_000)) < 120_000, 'cd = Jakarta wall clock');
  assert.equal(row.ud, null);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  assert.equal(row.tgl_daftar, today, 'omitted tgl_daftar = registration day (Jakarta)');
  const cfg = await configRows(b.fields.nik_kar);
  assert.deepEqual(cfg.map((c) => [c.jenis_simpanan, Number(c.potongan_payroll), Number(c.status), Number(c.potongan_old), Number(c.is_mobile), c.nama_kar, c.kd_group]),
    [['SIMPANAN POKOK', 100, 1, 0, 0, b.fields.nama_kar, 'ANGGOTA'], ['SIMPANAN WAJIB', 200.5, 1, 0, 0, b.fields.nama_kar, 'ANGGOTA']]);
  assert.ok(cfg.every((c) => c.doc_no === null && c.cd === null && c.ud === null), 'legacy leaves doc_no/cd/ud NULL');
  const after = await q('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM oauth_access_tokens) AS tokens, (SELECT COUNT(*) FROM trans_simpanan) AS savings');
  assert.deepEqual(after[0], before[0], 'no users row, no token, no savings posting');
  const [[mode]] = [await write.$queryRaw`SELECT @@session.sql_mode AS m`];
  assert.match(mode.m, /STRICT_TRANS_TABLES/, 'native strict mode stays ON');
  const ledger = await ledgerRow(b.idempotencyKey);
  assert.equal(ledger.command, 'member.register'); assert.equal(ledger.subject_ref, 'new'); assert.equal(ledger.to_state, 'REGISTERED');
  assert.ok(PII(JSON.stringify(ledger), [b.fields.nik_kar, b.fields.nama_kar, `reg.${RUN}`, 'Jl. Uji', '08123', '2500000', '1234']), 'ledger row is PII-free');
  const found = await detail(out.result.id);
  assert.equal(found.version, out.result.version); assert.equal(found.fields.nik_kar, b.fields.nik_kar); assert.equal(found.fields.tgl_lahir, '1990-02-03');
});

test('registration with all deductions 0 creates no config rows', options, async () => {
  const b = await body();
  const out = await register(b);
  assert.equal((await configRows(b.fields.nik_kar)).length, 0);
  const row = await memberRow(out.result.id);
  assert.deepEqual([row.sim_pokok, row.sim_wajib, row.sim_sukarela].map(Number), [0, 0, 0]);
});

test('replay returns the original result without a second effect; same key + different input is IDEMPOTENCY_CONFLICT', options, async () => {
  const b = await body({}, { pokok: '10' });
  const first = await register(b);
  const count = await memberCount();
  const again = await register(b);
  assert.equal(again.replayed, true); assert.deepEqual(again.result, first.result);
  assert.equal(await memberCount(), count); assert.equal((await configRows(b.fields.nik_kar)).length, 1);
  await assert.rejects(register({ ...b, initialDeductions: { pokok: '11', wajib: '0', sukarela: '0' } }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(register({ ...b, fields: { ...b.fields, nama_kar: 'SYNTH Lain' } }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('duplicate NIK is refused under lock: exact, numeric leading-zero alias, ASCII case alias; refusals leave no rows', options, async () => {
  const digits = `9${String(Date.now()).slice(-7)}`;
  const first = await register(await body({ nik_kar: digits }));
  assert.equal(first.replayed, false);
  const count = await memberCount();
  await assert.rejects(register(await body({ nik_kar: digits })), { code: 'MEMBER_NIK_DUPLICATE' });
  await assert.rejects(register(await body({ nik_kar: `00${digits}` })), { code: 'MEMBER_NIK_DUPLICATE' }, 'legacy CONVERT(nik, UNSIGNED) alias');
  const alpha = nik();
  await register(await body({ nik_kar: alpha }));
  await assert.rejects(register(await body({ nik_kar: alpha.toLowerCase() })), { code: 'MEMBER_NIK_DUPLICATE' });
  assert.equal(await memberCount(), count + 1);
});

test('two concurrent registrations of one NIK (different keys) create exactly one member', options, async () => {
  const shared = nik();
  const a = await body({ nik_kar: shared }); const b = await body({ nik_kar: shared });
  const results = await Promise.allSettled([register(a), register(b)]);
  const ok = results.filter((r) => r.status === 'fulfilled'), failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1); assert.equal(failed.length, 1);
  assert.ok(['MEMBER_NIK_DUPLICATE', 'BUSY_RETRY'].includes(failed[0].reason.code), failed[0].reason.code);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM m_anggota WHERE nik_kar = ?', [shared]))[0].n), 1);
});

test('two concurrent registrations of different NIKs both succeed with distinct doc_no and no_anggota', options, async () => {
  const [x, y] = await Promise.all([register(await body()), register(await body())]);
  const [rx, ry] = [await memberRow(x.result.id), await memberRow(y.result.id)];
  assert.notEqual(rx.doc_no, ry.doc_no); assert.notEqual(rx.no_anggota, ry.no_anggota);
  const registry = await q('SELECT doc_no FROM kkisi_kfa_ledger.kosipa_document_number WHERE doc_no IN (?, ?)', [rx.doc_no, ry.doc_no]);
  assert.equal(registry.length, 2, 'both numbers are claimed in the append-only registry');
});

test('unknown or inactive bagian/lokasi is refused; no member and no config rows remain', options, async () => {
  const m = await masters();
  const count = await memberCount();
  await assert.rejects(register(await body({ bagian: 'SYNTH TIDAK ADA' }, { pokok: '5' })), { code: 'MEMBER_MASTER_INVALID' });
  const [r] = await root.query("INSERT INTO m_bagian (name_bagian, status) VALUES (?, 0)", [`SYNTH Off ${RUN}`]);
  created.bagian.push(r.insertId);
  await assert.rejects(register(await body({ bagian: `SYNTH Off ${RUN}` })), { code: 'MEMBER_MASTER_INVALID' });
  await assert.rejects(register(await body({ lokasi: 'SYNTH TIDAK ADA' })), { code: 'MEMBER_MASTER_INVALID' });
  assert.equal(await memberCount(), count);
  const ok = await register(await body({ bagian: m.bagian.toUpperCase() }));
  assert.equal((await memberRow(ok.result.id)).bagian, m.bagian, 'stored spelling of the master is used');
});

test('failure after the member insert rolls everything back (member, config rows, document number claim)', options, async () => {
  const count = await memberCount();
  const registryBefore = Number((await q('SELECT COUNT(*) AS n FROM kkisi_kfa_ledger.kosipa_document_number WHERE scheme = ?', ['member-registration']))[0].n);
  const b = await body({}, { pokok: '5', wajib: '6', sukarela: '7' });
  await assert.rejects(registerMember(ports({ afterBusinessWrite: async () => { throw new Error('INJECTED'); } }), actor(), b), /INJECTED/);
  assert.equal(await memberCount(), count);
  assert.equal((await configRows(b.fields.nik_kar)).length, 0);
  assert.equal(await ledgerRow(b.idempotencyKey), undefined);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM kkisi_kfa_ledger.kosipa_document_number WHERE scheme = ?', ['member-registration']))[0].n), registryBefore, 'the claimed number rolled back too');
  const retry = await register(b);
  assert.equal(retry.replayed, false, 'the same key can be used again: nothing committed');
});

test('legacy fence: any enabled member controller menu refuses every command with LEGACY_ACTIVE', options, async () => {
  const count = await memberCount();
  for (const controller of CONTROLLERS) {
    await q('UPDATE ref_menu SET status = 1 WHERE UPPER(url) = UPPER(?)', [controller]);
    try {
      await assert.rejects(register(await body()), { code: 'LEGACY_ACTIVE' }, controller);
    } finally { await q('UPDATE ref_menu SET status = 0 WHERE UPPER(url) = UPPER(?)', [controller]); }
  }
  assert.equal(await memberCount(), count);
});

test('profile update: only changed allowlisted columns, five-field users mirror, nothing else touched', options, async () => {
  const b = await body({ email: `p.${RUN}@example.invalid`, ktp: `PK${RUN}`, no_telp: '0811', gaji: '1000' }, { pokok: '50' });
  const reg = await register(b);
  const user = await seedUser(b.fields.nik_kar);
  const cfgBefore = await configRows(b.fields.nik_kar);
  const before = await memberRow(reg.result.id);
  const v = (await detail(reg.result.id)).version;
  const out = await update(reg.result.id, { nama_kar: `SYNTH Baru ${RUN}`, ktp: `NEWKTP${RUN}`, no_telp: `0899${seq}`, email: `new.${RUN}@example.invalid`, alamat_tinggal: 'Jl. Baru\nLantai 2', alamat: 'Alamat KTP', jabatan: 'MANAJER' }, v);
  assert.equal(out.replayed, false); assert.notEqual(out.result.version, v);
  const row = await memberRow(reg.result.id);
  assert.equal(row.nama_kar, `SYNTH Baru ${RUN}`); assert.equal(row.jabatan, 'MANAJER'); assert.equal(row.alamat_tinggal, 'Jl. Baru\nLantai 2');
  assert.equal(row.ud_usr, 'SYNTH KFA KOSIPA OPERATOR'); assert.ok(row.ud);
  // Unchanged columns, identity, status, deductions, limits and the config rows are untouched.
  for (const c of ['id', 'doc_no', 'no_anggota', 'nik_kar', 'id_card', 'tgl_daftar', 'status_anggota', 'sim_pokok', 'sim_wajib', 'sim_sukarela', 'gaji', 'gaji_minus', 'limit_toko', 'limit_persen', 'kd_group', 'bagian', 'lokasi', 'cd', 'cd_usr', 'password'])
    assert.equal(row[c], before[c], c);
  assert.equal(row.ktp, `NEWKTP${RUN}`); assert.equal(row.email, `new.${RUN}@example.invalid`);
  assert.deepEqual(await configRows(b.fields.nik_kar), cfgBefore);
  const [u] = await q('SELECT * FROM users WHERE id = ?', [user.id]);
  assert.equal(u.ktp, `NEWKTP${RUN}`); assert.equal(u.name, `SYNTH Baru ${RUN}`); assert.equal(u.phone, `0899${seq}`); assert.equal(u.email, `new.${RUN}@example.invalid`); assert.equal(u.street_address, 'Jl. Baru\nLantai 2');
  for (const c of ['bagian', 'lokasi', 'no_rek', 'bank_rek', 'kd_group', 'nik']) assert.equal(u[c], user[c], `users.${c} never mirrored`);
  assert.equal(Number(u.wallet_balance), 123);
  assert.equal((await q('SELECT COUNT(*) AS n FROM users WHERE nik = ?', [b.fields.nik_kar]))[0].n, 1);
});

test('MC05: the users/config rows come from the LOCKED member, never from a client key; another member is untouched', options, async () => {
  const a = await register(await body({ email: `a.${RUN}@example.invalid` }, { pokok: '5' }));
  const other = await body({ email: `b.${RUN}@example.invalid` }, { pokok: '7' });
  const bReg = await register(other);
  const uA = await seedUser((await memberRow(a.result.id)).nik_kar), uB = await seedUser(other.fields.nik_kar);
  const bBefore = await memberRow(bReg.result.id), uBBefore = (await q('SELECT * FROM users WHERE id = ?', [uB.id]))[0], cfgB = await configRows(other.fields.nik_kar);
  const v = (await detail(a.result.id)).version;
  await assert.rejects(updateMemberProfile(ports(), actor(), String(a.result.id), { idempotencyKey: randomUUID(), expectedVersion: v, fields: { nik_kar: other.fields.nik_kar, nama_kar: 'SYNTH X' } }), { code: 'FIELD_NOT_ALLOWED' });
  await assert.rejects(updateMemberProfile(ports(), actor(), String(a.result.id), { idempotencyKey: randomUUID(), expectedVersion: v, nik: other.fields.nik_kar, fields: { nama_kar: 'SYNTH X' } }), { code: 'FIELD_NOT_ALLOWED' });
  await update(a.result.id, { nama_kar: `SYNTH A ${RUN}` }, v);
  assert.equal((await q('SELECT name FROM users WHERE id = ?', [uA.id]))[0].name, `SYNTH A ${RUN}`);
  assert.deepEqual((await q('SELECT * FROM users WHERE id = ?', [uB.id]))[0], uBBefore);
  assert.deepEqual(await memberRow(bReg.result.id), bBefore); assert.deepEqual(await configRows(other.fields.nik_kar), cfgB);
});

test('a member without a users row: profile saved, no mirror, no account created', options, async () => {
  const b = await body(); const reg = await register(b);
  const users = Number((await q('SELECT COUNT(*) AS n FROM users'))[0].n);
  const out = await update(reg.result.id, { nama_kar: `SYNTH Solo ${RUN}`, email: `solo.${RUN}@example.invalid` }, (await detail(reg.result.id)).version);
  assert.equal((await memberRow(out.result.id)).nama_kar, `SYNTH Solo ${RUN}`);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM users'))[0].n), users);
});

test('stale version (own earlier edit or a legacy writer) is refused; NO_CHANGE is refused; unknown member is MEMBER_NOT_FOUND', options, async () => {
  const reg = await register(await body());
  const v1 = (await detail(reg.result.id)).version;
  const done = await update(reg.result.id, { jabatan: 'A' }, v1);
  await assert.rejects(update(reg.result.id, { jabatan: 'B' }, v1), { code: 'STALE' });
  await assert.rejects(update(reg.result.id, { jabatan: 'A' }, done.result.version), { code: 'NO_CHANGE' });
  await q('UPDATE m_anggota SET rt = ? WHERE id = ?', ['9', reg.result.id]);
  await assert.rejects(update(reg.result.id, { jabatan: 'C' }, done.result.version), { code: 'STALE' }, 'any committed change to the row changes the version');
  assert.equal((await memberRow(reg.result.id)).jabatan, 'A');
  await assert.rejects(update(2_000_000_000, { jabatan: 'C' }, v1), { code: 'MEMBER_NOT_FOUND' });
  await assert.rejects(update(reg.result.id, { jabatan: 'C' }, 'f'.repeat(64)), { code: 'STALE' });
});

test('mirror conflicts with another account (unique email / (ktp, phone)) refuse the whole command', options, async () => {
  const b = await body({ email: `m.${RUN}@example.invalid` }); const reg = await register(b);
  await seedUser(b.fields.nik_kar);
  const rival = await seedUser(`R${RUN}${++seq}`);
  const v = (await detail(reg.result.id)).version;
  const before = await memberRow(reg.result.id);
  await assert.rejects(update(reg.result.id, { nama_kar: 'SYNTH Z', email: rival.email.toUpperCase() }, v), { code: 'MEMBER_MIRROR_CONFLICT' });
  await assert.rejects(update(reg.result.id, { nama_kar: 'SYNTH Z', ktp: rival.ktp, no_telp: rival.phone }, v), { code: 'MEMBER_MIRROR_CONFLICT' });
  assert.deepEqual(await memberRow(reg.result.id), before, 'member row rolled back with the refused mirror');
});

test('bank change needs a reason; the reason lives in the ledger only; ledger/result carry no PII', options, async () => {
  const b = await body({ no_rek: '111' }); const reg = await register(b);
  const v = (await detail(reg.result.id)).version;
  await assert.rejects(update(reg.result.id, { no_rek: '222222' }, v), (e) => e instanceof Error);
  assert.equal((await memberRow(reg.result.id)).no_rek, '111');
  const key = randomUUID();
  const out = await updateMemberProfile(ports(), actor(), String(reg.result.id), { idempotencyKey: key, expectedVersion: v, fields: { no_rek: '222222', gaji: '3000000' }, reason: 'Koreksi rekening sesuai buku tabungan' });
  const ledger = await ledgerRow(key);
  assert.equal(ledger.reason, 'Koreksi rekening sesuai buku tabungan');
  const after = typeof ledger.after_json === 'string' ? JSON.parse(ledger.after_json) : ledger.after_json;
  assert.equal(after.bankChanged, true); assert.equal(after.salaryChanged, true); assert.deepEqual(after.fields.split(',').sort(), ['gaji', 'no_rek']);
  assert.ok(PII(JSON.stringify({ ...ledger, reason: '' }), ['222222', '3000000', b.fields.nik_kar, b.fields.nama_kar]));
  assert.equal(JSON.stringify(out.result).includes('222222'), false);
  assert.deepEqual(Object.keys(out.result).sort(), ['id', 'version']);
});

test('least privilege: the member writer cannot change identity/status/deductions/limits/credentials, delete, create accounts or read the credential column', options, async () => {
  const denied = async (sql) => { try { await write.$executeRawUnsafe(sql); } catch (e) { return errno(e); } return 'allowed'; };
  for (const sql of [
    'UPDATE m_anggota SET nik_kar = nik_kar WHERE id = 0', 'UPDATE m_anggota SET status_anggota = status_anggota WHERE id = 0', 'UPDATE m_anggota SET sim_pokok = sim_pokok WHERE id = 0',
    'UPDATE m_anggota SET limit_toko = limit_toko WHERE id = 0', 'UPDATE m_anggota SET password = password WHERE id = 0', 'UPDATE m_anggota SET doc_no = doc_no WHERE id = 0',
    'UPDATE users SET bagian = bagian WHERE id = 0', 'UPDATE users SET wallet_balance = wallet_balance WHERE id = 0', 'UPDATE users SET password = password WHERE id = 0',
    'UPDATE m_simpanan_aktif SET potongan_payroll = 1 WHERE id = 0',
  ]) assert.ok(['1142', '1143'].includes(await denied(sql)), sql);
  for (const sql of ['DELETE FROM m_anggota WHERE id = 0', 'DELETE FROM users WHERE id = 0', 'DELETE FROM m_simpanan_aktif WHERE id = 0', "INSERT INTO users (nik) VALUES ('x')", 'UPDATE oauth_access_tokens SET user_id = 0 WHERE id = 0', 'DELETE FROM oauth_access_tokens WHERE id = 0', 'DROP TABLE m_anggota'])
    assert.equal(await denied(sql), '1142', sql);
  await assert.rejects(write.$queryRawUnsafe('SELECT password FROM m_anggota LIMIT 1'), (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(write.$queryRawUnsafe('SELECT * FROM m_simpanan_aktif LIMIT 1'), (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(write.$executeRawUnsafe('UPDATE kkisi_kfa_ledger.kosipa_command_ledger SET reason = reason WHERE id = 0'), (e) => ['1142', '1143'].includes(errno(e)));
});

test('writer configuration refuses production, other databases/ports, shared logins, root and pools above 2', options, () => {
  const member = stack.dsn(config, 'memberWrite', stack.DB, 2), masterDsn = stack.dsn(config, 'masterWrite', stack.DB, 2);
  const base = { KOSIPA_MEMBER_WRITES_ENABLED: 'true', DATABASE_URL_KOSIPA_MEMBER_WRITE: member, DATABASE_URL_KOSIPA_MASTER_WRITE: masterDsn, DATABASE_URL: stack.dsn(config, 'read', stack.DB, 3), KOSIPA_LEDGER_DATABASE: stack.LEDGER_DB };
  assert.equal(validateKosipaMemberWriteConfig(base), new URL(member).href);
  assert.equal(validateKosipaMemberLedgerDatabase(base), stack.LEDGER_DB);
  const mutate = (fn) => { const u = new URL(member); fn(u); return u.href; };
  const refused = [
    ['flag off', { KOSIPA_MEMBER_WRITES_ENABLED: 'false' }], ['flag missing', { KOSIPA_MEMBER_WRITES_ENABLED: undefined }], ['production', { APP_ENV: 'production' }],
    ['dsn missing', { DATABASE_URL_KOSIPA_MEMBER_WRITE: undefined }], ['master login reused', { DATABASE_URL_KOSIPA_MEMBER_WRITE: masterDsn }],
    ['staging port', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.port = '3307'; }) }], ['other database', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.pathname = '/kkisi_kfa_ledger'; }) }],
    ['remote host', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.hostname = 'db.example.com'; }) }], ['root login', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.username = 'root'; }) }],
    ['pool 3', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.searchParams.set('connection_limit', '3'); }) }], ['no password', { DATABASE_URL_KOSIPA_MEMBER_WRITE: mutate((u) => { u.password = ''; }) }],
  ];
  for (const [label, change] of refused) assert.throws(() => validateKosipaMemberWriteConfig({ ...base, ...change }), { code: 'WRITE_NOT_CONFIGURED' }, label);
  assert.throws(() => validateKosipaMemberLedgerDatabase({ ...base, KOSIPA_LEDGER_DATABASE: stack.DB }), { code: 'WRITE_NOT_CONFIGURED' });
  assert.throws(() => validateKosipaMemberLedgerDatabase({ ...base, KOSIPA_LEDGER_DATABASE: 'kkisi_other' }), { code: 'WRITE_NOT_CONFIGURED' });
});

test('ownership off or missing repository configuration writes nothing', options, async () => {
  const count = await memberCount();
  await assert.rejects(registerMember(ports(undefined, false), actor(), await body()), { code: 'WRITE_DISABLED' });
  const unconfigured = { ...ports(), members: new PrismaKosipaMemberRepository(read) };
  await assert.rejects(registerMember(unconfigured, actor(), await body()), { code: 'WRITE_NOT_CONFIGURED' });
  assert.equal(await memberCount(), count);
});
