import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createMaster, setMasterStatus, updateMaster } from '@koperasi/application/kosipa/commands/master';
import { MASTER_DEFINITIONS, masterVersion } from '@koperasi/domain/kosipa/master';
import { PrismaKosipaMasterRepository } from '../src/infrastructure/repositories/kosipa-master-write.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';

// FA-02: Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran against the ISOLATED synthetic stack only (opt-in KOSIPA_FA01=1, FA-01
// app server stopped: the writer account allows 2 connections). Legacy compatibility is checked with the legacy readers' own queries.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'masterWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
test.after(async () => { await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); });

const RUN = randomUUID().slice(0, 5).toUpperCase();
const actor = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: randomUUID() });
const ports = () => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), masters: new PrismaKosipaMasterRepository(read, write, { ledgerDatabase: stack.LEDGER_DB }) });
const create = (type, values) => createMaster(ports(), actor(), type, { idempotencyKey: randomUUID(), ...values });
const update = (type, row, values) => updateMaster(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), ...row.values, ...values, expectedVersion: row.version });
const status = (type, row, active, reason = 'uji sintetis FA-02') => setMasterStatus(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), expectedVersion: row.version, reason }, active);
/** Current state of a seeded row (tests are re-runnable: earlier runs may have relabelled it). */
const load = async (type, id) => { const def = MASTER_DEFINITIONS[type]; const r = (await ports().masters.list(def)).find((x) => x.id === id); return { ...r, version: masterVersion(def, r) }; };
const errno = (e) => (/\b(1142|1143)\b/.exec(String(e?.message)) ?? [])[1];
const loansChecksum = async () => (await read.$queryRaw`SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|', id, doc_no, bank_pembiaya, plan_pinjaman, plan_jangka_waktu, doc_status, status_bayar))),0) AS crc FROM trans_pinjaman`)[0];

test('Bagian: create / rename-unreferenced / deactivate / reactivate; names stored by members or member accounts are protected; legacy readers agree', options, async () => {
  const created = await create('bagian', { name: `SYNTH Bagian ${RUN}` });
  assert.deepEqual(created.result.values, { name: `SYNTH Bagian ${RUN}` });
  const renamed = await update('bagian', created.result, { name: `SYNTH Bagian ${RUN} B` });
  assert.equal(renamed.result.values.name, `SYNTH Bagian ${RUN} B`);
  await assert.rejects(create('bagian', { name: `synth bagian ${RUN} b` }), { code: 'MASTER_NAME_DUPLICATE' });
  const produksi = await load('bagian', 1);
  await assert.rejects(update('bagian', produksi, { name: 'SYNTH Produksi Baru' }), { code: 'MASTER_REFERENCED' }, 'm_anggota.bagian stores it');
  const gudang = await load('bagian', 2);
  await assert.rejects(update('bagian', gudang, { name: 'SYNTH Gudang Baru' }), { code: 'MASTER_REFERENCED' }, 'smartkkisi users.bagian stores it');
  const off = await status('bagian', renamed.result, false);
  // Legacy reader: member form and mobile users_c list `SELECT * FROM m_bagian WHERE status='1'`.
  const legacyList = (await read.$queryRaw`SELECT name_bagian FROM m_bagian WHERE status='1'`).map((r) => r.name_bagian);
  assert.ok(!legacyList.includes(`SYNTH Bagian ${RUN} B`) && legacyList.includes('SYNTH Produksi'));
  const on = await status('bagian', off.result, true);
  assert.ok((await read.$queryRaw`SELECT name_bagian FROM m_bagian WHERE status='1'`).some((r) => r.name_bagian === `SYNTH Bagian ${RUN} B`));
  const [row] = await read.$queryRaw`SELECT id_lokasi, status FROM m_bagian WHERE id = ${on.result.id}`;
  assert.equal(row.id_lokasi, null, 'the unused id_lokasi column is never touched'); assert.equal(Number(row.status), 1);
});

test('Jenis Dokumen: CRUD with legacy audit columns (cd/cd_usr, ud/ud_usr = KOSIPA display name) and is_active as legacy text', options, async () => {
  const c = `J${RUN}`;
  const created = await create('jenis-dokumen', { code: c, name: 'SYNTH DOKUMEN', remarks: 'uji' });
  const [row] = await read.$queryRaw`SELECT is_active, cd, cd_usr, ud, ud_usr FROM m_jenis_dokumen WHERE id = ${created.result.id}`;
  assert.equal(row.is_active, '1'); assert.ok(row.cd); assert.equal(row.cd_usr, 'SYNTH KFA KOSIPA OPERATOR'); assert.equal(row.ud, null);
  const edited = await update('jenis-dokumen', created.result, { code: `${c}X`, remarks: '' });
  const [after] = await read.$queryRaw`SELECT jenis_dokumen_code, jenis_dokumen_remarks, ud_usr FROM m_jenis_dokumen WHERE id = ${created.result.id}`;
  assert.equal(after.jenis_dokumen_code, `${c}X`); assert.equal(after.jenis_dokumen_remarks, ''); assert.equal(after.ud_usr, 'SYNTH KFA KOSIPA OPERATOR');
  await assert.rejects(create('jenis-dokumen', { code: 'syn-ktp', name: 'Lain' }), { code: 'MASTER_CODE_DUPLICATE' });
  const off = await status('jenis-dokumen', edited.result, false);
  assert.equal((await read.$queryRaw`SELECT is_active FROM m_jenis_dokumen WHERE id = ${off.result.id}`)[0].is_active, '0');
});

test('Rekening Bank: a bank code stored by loans never changes; labels do; deactivation hides it from the legacy bank-loan form; loans untouched', options, async () => {
  const before = await loansChecksum();
  let a = await load('rekening-bank', 1);
  if (!a.active) a = (await status('rekening-bank', a, true)).result;
  await assert.rejects(update('rekening-bank', a, { code: 'SYN BANK A2' }), { code: 'MASTER_REFERENCED' }, 'trans_pinjaman.bank_pembiaya stores it');
  const relabelled = await update('rekening-bank', a, { name: `SYNTH BANK A ${RUN}`, remarks: 'label saja' });
  assert.equal(relabelled.result.values.code, 'SYN BANK A');
  const b = await load('rekening-bank', 2);
  const recoded = await update('rekening-bank', b, { code: `SYN BANK ${RUN}` });
  assert.equal(recoded.result.values.code, `SYN BANK ${RUN}`, 'an unused bank code may still be corrected');
  const created = await create('rekening-bank', { code: `SYN NEW ${RUN}`, name: 'SYNTH BANK BARU', remarks: '' });
  const off = await status('rekening-bank', relabelled.result, false);
  // Legacy reader: pinjaman_add_bank_v lists `SELECT * FROM m_rekening WHERE is_active='1'` and stores rekening_code.
  const legacyOptions = (await read.$queryRaw`SELECT rekening_code FROM m_rekening WHERE is_active='1'`).map((r) => r.rekening_code);
  assert.ok(!legacyOptions.includes('SYN BANK A') && legacyOptions.includes(`SYN NEW ${RUN}`));
  assert.equal((await read.$queryRaw`SELECT COUNT(*) AS n FROM trans_pinjaman WHERE bank_pembiaya = 'SYN BANK A'`)[0].n, 1n, 'the existing loan still names its bank');
  await status('rekening-bank', off.result, true);
  await status('rekening-bank', created.result, false);
  assert.deepEqual(await loansChecksum(), before, 'no loan row changed');
});

test('Periode Angsuran: the month count is fixed by the domain AND by the database privilege; labels and status change; loans untouched', options, async () => {
  const before = await loansChecksum();
  const twelve = await load('periode-angsuran', 1);
  await assert.rejects(update('periode-angsuran', twelve, { code: '18' }), { code: 'MASTER_FIELD_IMMUTABLE' });
  await assert.rejects(write.$executeRaw`UPDATE m_jangka_waktu SET jangka_waktu_code = '18' WHERE id = 1`, (e) => errno(e) === '1143', 'the writer has no UPDATE privilege on the month count');
  const relabelled = await update('periode-angsuran', twelve, { remarks: `SATU TAHUN ${RUN}` });
  assert.equal(relabelled.result.values.code, '12');
  await assert.rejects(create('periode-angsuran', { code: '12', name: 'dup' }), { code: 'MASTER_CODE_DUPLICATE' });
  await assert.rejects(create('periode-angsuran', { code: '400', name: 'too long' }), { code: 'MASTER_CODE_INVALID' });
  const months = String(100 + Math.floor(Math.random() * 250));
  const created = await create('periode-angsuran', { code: months, name: `${months} X`, remarks: '' }).catch((e) => (e.code === 'MASTER_CODE_DUPLICATE' ? null : Promise.reject(e)));
  if (created) await status('periode-angsuran', created.result, false);
  await update('periode-angsuran', relabelled.result, { remarks: '1 TAHUN' });
  assert.deepEqual(await loansChecksum(), before);
});

test('every FA-02 master: 10 concurrent submissions with one key create one row and one ledger entry; failures leave nothing', options, async () => {
  for (const [type, values] of [['bagian', { name: `SYNTH K ${RUN}` }], ['jenis-dokumen', { code: `K${RUN}`, name: 'SYNTH K' }], ['rekening-bank', { code: `K ${RUN}`, name: 'SYNTH K' }]]) {
    const body = { idempotencyKey: randomUUID(), ...values };
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => createMaster(ports(), actor(), type, body)));
    const done = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.ok(results.every((r) => r.status === 'fulfilled' || r.reason.code === 'BUSY_RETRY'), type);
    assert.equal(done.filter((r) => !r.replayed).length, 1, type);
    const ledger = await write.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE idempotency_key = ?`, body.idempotencyKey);
    assert.equal(Number(ledger[0].n), 1, type);
  }
});

test('every FA-02 master answers LEGACY_ACTIVE while its own legacy controller is enabled, and only that one', options, async () => {
  const root = await stack.rootConnection(config);
  try {
    await root.query("UPDATE ref_menu SET status = 1 WHERE url = 'master/rekening_bank_c'");
    await assert.rejects(create('rekening-bank', { code: `L ${RUN}`, name: 'SYNTH L' }), { code: 'LEGACY_ACTIVE' });
    assert.equal((await create('jenis-dokumen', { code: `L${RUN}`, name: 'SYNTH L' })).replayed, false, 'other masters keep working');
  } finally { await root.query("UPDATE ref_menu SET status = 0 WHERE url = 'master/rekening_bank_c'"); await root.end(); }
});
