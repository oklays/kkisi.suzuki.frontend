import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createProductMaster, updateProductMaster, setProductMasterStatus, listProductMaster } from '@koperasi/application/kosipa/commands/product-master';
import { PRODUCT_MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/product-master';
import { PrismaKosipaProductMasterRepository } from '../src/infrastructure/repositories/kosipa-product-master.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';
import { KOSIPA_WRITE_FEATURES } from '../src/infrastructure/console/kosipa-ownership.ts';

// FA-03B T06: product masters against the ISOLATED synthetic stack only (opt-in KOSIPA_FA01=1; run files sequentially: writer pool 2).
// Every touched row is snapshotted first and restored/removed by exact id afterwards; AUTO_INCREMENT is never reset; ledger rows stay (append-only).
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `local-stack.mjs setup` (or `product-masters` + `master-writer` on an existing stack)', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'masterWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const root = config ? await stack.rootConnection(config) : null;
const q = async (sql, params = []) => (await root.query(sql, params))[0];
const TABLES = ['m_jenis_simpanan', 'm_jenis_pinjaman', 'm_jenis_pembiayaan', 'm_suku_bunga'];
const CONTROLLERS = Object.values(PRODUCT_MASTER_DEFINITIONS).map((d) => d.legacyController);
const snapshot = {};
let loanBefore = null;
const RUN = randomUUID().slice(0, 5).toUpperCase();

if (ENABLED) {
  for (const t of TABLES) snapshot[t] = await q(`SELECT * FROM \`${t}\``);
  [loanBefore] = await q('SELECT id, jenis_pinjaman FROM trans_pinjaman ORDER BY id LIMIT 1');
  snapshot.menus = await q(`SELECT id, status FROM ref_menu WHERE url IN (${CONTROLLERS.map(() => '?').join(',')})`, CONTROLLERS);
}
test.after(async () => {
  if (!ENABLED) return;
  try {
    for (const t of TABLES) {
      const ids = snapshot[t].map((r) => r.id);
      await q(`DELETE FROM \`${t}\`${ids.length ? ` WHERE id NOT IN (${ids.join(',')})` : ''}`);
      for (const r of snapshot[t]) { const { id, ...cols } = r; await q(`UPDATE \`${t}\` SET ? WHERE id = ?`, [cols, id]); }
    }
    if (loanBefore) await q('UPDATE trans_pinjaman SET jenis_pinjaman = ? WHERE id = ?', [loanBefore.jenis_pinjaman, loanBefore.id]);
    for (const m of snapshot.menus) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [m.status, m.id]);
  } finally { await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); await root.end(); }
});

const actor = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: randomUUID() });
const repo = (hooks) => new PrismaKosipaProductMasterRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, hooks });
const ports = (hooks) => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), products: repo(hooks) });
const create = (type, values, hooks) => createProductMaster(ports(hooks), actor(), type, { idempotencyKey: randomUUID(), values });
const update = (type, row, values, reason) => updateProductMaster(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), values: { ...pick(type, row.values), ...values }, expectedVersion: row.version, ...(reason ? { reason } : {}) });
const status = (type, row, active, reason = 'uji sintetis T06') => setProductMasterStatus(ports(), actor(), type, String(row.id), { idempotencyKey: randomUUID(), expectedVersion: row.version, reason }, active);
const pick = (type, values) => Object.fromEntries(PRODUCT_MASTER_DEFINITIONS[type].fields.map((f) => [f.key, values[f.key] ?? '']));
const load = async (type, id) => (await listProductMaster(ports(), actor(), type)).rows.find((r) => r.id === id);
const ledger = async (requestHashFree = true) => (await q(`SELECT * FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger ORDER BY id DESC LIMIT 1`))[0];
const errno = (e) => (/\b(1142|1143)\b/.exec(String(e?.message)) ?? [])[1];
const pembiayaan = (code) => ({ pembiayaan_code: code, pembiayaan_name: `SYNTH PB ${RUN}`, pembiayaan_remarks: '', jenis_bunga: 'Flat', biaya_asuransi: '0.5', biaya_jasa: '1.2345', biaya_admin: '10000', biaya_bunga: '1', biaya_pinalty: '0', tgl_tempo: '25', akun_code: '1-1300', lock_1angsuran: '0' });

if (ENABLED) await q(`UPDATE ref_menu SET status = 0 WHERE url IN (${CONTROLLERS.map(() => '?').join(',')})`, CONTROLLERS);

test('product masters are master.<key> features fenced by exactly their own legacy controller', () => {
  for (const def of Object.values(PRODUCT_MASTER_DEFINITIONS)) assert.deepEqual(KOSIPA_WRITE_FEATURES[`master.${def.key}`], { flag: 'KOSIPA_MASTER_WRITES_ENABLED', legacyControllers: [def.legacyController] });
});

test('review-only production grants equal the generated synthetic block; nothing broader', () => {
  const text = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const grants = (sql) => sql.split('\n').filter((l) => /^GRANT /.test(l)).map((l) => l.replace(/TO .*;$/, 'TO W;'));
  const between = (sql) => sql.slice(sql.indexOf('-- BEGIN product masters'), sql.indexOf('-- END product masters'));
  const tpl = grants(between(text('db/kosipa/002_master_writer_grants.sql.tpl')));
  const block = (p) => grants(text(p));
  const prod = block('../../docs/migration/sql/kosipa-product-master-writer-production.sql');
  assert.deepEqual(prod, tpl); assert.ok(prod.length >= 17);
  for (const g of prod) assert.doesNotMatch(g, /\b(DELETE|DROP|ALTER|CREATE|ALL PRIVILEGES|GRANT OPTION)\b|\.\*/, g.slice(0, 60));
  assert.ok(!prod.some((g) => /^GRANT UPDATE/.test(g) && /`(jenis_simpanan_code|field)`/.test(g)), 'codes/keys fixed at creation are not updatable');
  assert.ok(!prod.some((g) => /^GRANT (INSERT|UPDATE)/.test(g) && /`(dd|dd_usr|is_payroll|doc_no|doc_date|status_perorangan)`/.test(g)), 'legacy-only columns are never written');
  assert.ok(!prod.some((g) => /m_acc_coa|trans_|m_simpanan_aktif/.test(g) && !/^GRANT SELECT/.test(g)), 'chart of accounts and reference tables are read only');
});

test('Jenis Pembiayaan: create with exact decimals and DERIVED COA description; FD-32 reason for financial edits; referenced code frozen; deactivate as legacy text', options, async () => {
  const c = await create('jenis-pembiayaan', pembiayaan(`SYN-PB-${RUN}`));
  const [row] = await q('SELECT * FROM m_jenis_pembiayaan WHERE id = ?', [c.result.id]);
  assert.equal(row.biaya_jasa, '1.2345'); assert.equal(row.biaya_admin, '10000.00'); assert.equal(row.akun_desc, 'SYNTH Piutang Pinjaman Anggota');
  assert.equal(row.is_active, '1'); assert.equal(row.cd_usr, 'SYNTH KFA KOSIPA OPERATOR'); assert.ok(row.cd); assert.equal(row.doc_no, null, 'never written');
  await assert.rejects(create('jenis-pembiayaan', pembiayaan(`syn-pb-${RUN.toLowerCase()}`)), { code: 'MASTER_CODE_DUPLICATE' });
  await assert.rejects(create('jenis-pembiayaan', { ...pembiayaan(`SYN-X-${RUN}`), akun_code: '7-7777' }), (e) => e.code === 'PRODUCT_COA_INVALID' && e.field === 'akun_code');
  await assert.rejects(create('jenis-pembiayaan', { ...pembiayaan(`SYN-X-${RUN}`), akun_code: '9-9999' }), (e) => e.code === 'PRODUCT_COA_DESC_TOO_LONG');
  const label = await update('jenis-pembiayaan', c.result, { pembiayaan_name: `SYNTH PB ${RUN} B` });
  assert.equal((await ledger()).reason, null, 'label edits need no reason');
  await assert.rejects(update('jenis-pembiayaan', label.result, { lock_1angsuran: '1' }), { code: 'REASON_INVALID' });
  const fin = await update('jenis-pembiayaan', label.result, { lock_1angsuran: '1', biaya_jasa: '2.5', akun_code: '2-1100' }, 'Penyesuaian per rapat pengurus');
  const l = await ledger();
  assert.equal(l.reason, 'Penyesuaian per rapat pengurus'); assert.equal(l.command, 'master.jenis_pembiayaan.update');
  const after = typeof l.after_json === 'string' ? JSON.parse(l.after_json) : l.after_json;
  assert.equal(after.lock_1angsuran, '1'); assert.equal(after.akun_desc, 'SYNTH Simpanan Pokok Anggota'); assert.equal(after.biaya_jasa, '2.5');
  const renamed = await update('jenis-pembiayaan', fin.result, { pembiayaan_code: `SYN-PB-${RUN}-B` });
  assert.equal(renamed.result.values.pembiayaan_code, `SYN-PB-${RUN}-B`, 'an unreferenced code may still be corrected');
  const seeded = await load('jenis-pembiayaan', 1);
  await assert.rejects(update('jenis-pembiayaan', seeded, { pembiayaan_code: 'SYN-PB-NEW' }), { code: 'MASTER_REFERENCED' }, 'm_jenis_pinjaman.jenis_pembiayaan stores it');
  const off = await status('jenis-pembiayaan', renamed.result, false);
  assert.equal((await q('SELECT is_active FROM m_jenis_pembiayaan WHERE id = ?', [off.result.id]))[0].is_active, '0');
  assert.ok(!(await q("SELECT pembiayaan_code FROM m_jenis_pembiayaan WHERE is_active='1'")).some((r) => r.pembiayaan_code === `SYN-PB-${RUN}-B`), 'legacy pick-lists that filter active no longer offer it');
});

test('Jenis Pinjaman: NOT NULL limits, one-level hierarchy with fixed legacy roots, active financing only, 50/200-wide COA descriptions, referenced code frozen', options, async () => {
  const base = { jenis_pinjaman_code: `SYN-PJ-${RUN}`, jenis_pinjaman_name: `SYNTH PJ ${RUN}`, jenis_pinjaman_remarks: '', parent_id: '1', jenis_pembiayaan: 'SYN-PB-REG', jenis_bunga: 'Anuitas',
    biaya_asuransi: '0', biaya_jasa: '1', biaya_admin: '5000', biaya_bunga: '1.25', biaya_pinalty: '0', tgl_tempo: '25', lock_1angsuran: '1', max_angsuran: '36', max_pinjaman: '25000000',
    akun_code: '1-1300', akun_code_pembiayaan: '', akun_code_pendapatan: '9-9999' };
  const c = await create('jenis-pinjaman', base);
  const [row] = await q('SELECT * FROM m_jenis_pinjaman WHERE id = ?', [c.result.id]);
  assert.equal(row.max_angsuran, 36); assert.equal(row.max_pinjaman, '25000000.00'); assert.equal(row.biaya_bunga, '1.25'); assert.equal(row.parent_id, 1);
  assert.equal(row.akun_desc_pendapatan, (await q("SELECT coa_desc FROM m_acc_coa WHERE coa_no = '9-9999'"))[0].coa_desc, '200-wide description keeps the full COA text'); assert.ok(row.akun_desc_pendapatan.length > 50); assert.equal(row.dd_usr, null); assert.equal(row.is_payroll, null);
  await assert.rejects(create('jenis-pinjaman', { ...base, jenis_pinjaman_code: `SYN-PJ2-${RUN}`, jenis_pembiayaan: 'SYN-PB-OFF' }), (e) => e.code === 'PRODUCT_FINANCING_INVALID');
  await assert.rejects(create('jenis-pinjaman', { ...base, jenis_pinjaman_code: `SYN-PJ2-${RUN}`, parent_id: '29' }), (e) => e.code === 'PRODUCT_PARENT_INVALID', 'a child cannot be a parent');
  await assert.rejects(create('jenis-pinjaman', { ...base, jenis_pinjaman_code: `SYN-PJ2-${RUN}`, akun_code: '9-9999' }), (e) => e.code === 'PRODUCT_COA_DESC_TOO_LONG');
  await assert.rejects(update('jenis-pinjaman', await load('jenis-pinjaman', 2), { parent_id: '1' }, 'pindah induk'), (e) => e.code === 'PRODUCT_PARENT_INVALID', 'legacy root 2 (bank) stays a root');
  await assert.rejects(update('jenis-pinjaman', await load('jenis-pinjaman', 1), { parent_id: '4' }, 'pindah'), (e) => e.code === 'PRODUCT_PARENT_INVALID');
  await q('UPDATE trans_pinjaman SET jenis_pinjaman = ? WHERE id = ?', [`SYN-PJ-${RUN}`, loanBefore.id]);
  const current = await load('jenis-pinjaman', c.result.id);
  await assert.rejects(update('jenis-pinjaman', current, { jenis_pinjaman_code: `SYN-PJ-${RUN}-B` }), { code: 'MASTER_REFERENCED' });
  await assert.rejects(update('jenis-pinjaman', current, { parent_id: '4' }), (e) => e.code === 'MASTER_REFERENCED' && e.field === 'parent_id');
  const moved = await update('jenis-pinjaman', current, { max_pinjaman: '30000000' }, 'Plafon naik per SK');
  assert.equal(moved.result.values.max_pinjaman, '30000000.00');
});

test('Jenis Simpanan: the code is fixed at creation (literals in legacy code); rate edits need a reason; legacy savings rows untouched', options, async () => {
  const seeded = await load('jenis-simpanan', 3);
  await assert.rejects(update('jenis-simpanan', seeded, { jenis_simpanan_code: 'SUKARELA' }, 'rename'), (e) => e.code === 'MASTER_FIELD_IMMUTABLE');
  await assert.rejects(update('jenis-simpanan', seeded, { bunga_simpanan: '3' }), { code: 'REASON_INVALID' });
  const r = await update('jenis-simpanan', seeded, { bunga_simpanan: '3' }, 'Bunga sukarela naik');
  assert.equal((await q('SELECT bunga_simpanan FROM m_jenis_simpanan WHERE id = 3'))[0].bunga_simpanan, '3.00');
  assert.equal(r.result.values.jenis_simpanan_code, 'SIMPANAN SUKARELA');
  const c = await create('jenis-simpanan', { jenis_simpanan_code: `SYN SIM ${RUN}`, jenis_simpanan_name: 'SYNTH Simpanan', jenis_simpanan_remarks: '', bunga_simpanan: '0', akun_code: '2-1200', is_active_tarik_deposito: '1' });
  const [row] = await q('SELECT is_active, akun_desc, status_perorangan FROM m_jenis_simpanan WHERE id = ?', [c.result.id]);
  assert.deepEqual([row.is_active, row.akun_desc, row.status_perorangan], [1, 'SYNTH Simpanan Wajib Anggota', null]);
});

test('Suku Bunga (FD-34): one row per consumed field; the legacy reader takes the first tgl_tempo row and ignores is_active', options, async () => {
  const values = { code_suku_bunga: `TT${RUN}`, desc_suku_bunga: 'Tanggal jatuh tempo', field: 'tgl_tempo', nilai_persen: '25', remarks_suku_bunga: '' };
  const c = await create('suku-bunga', values);
  await assert.rejects(create('suku-bunga', { ...values, code_suku_bunga: `TX${RUN}` }), (e) => e.code === 'PRODUCT_FIELD_DUPLICATE' && e.field === 'field');
  const legacyRead = async () => (await q("SELECT nilai_persen FROM m_suku_bunga WHERE field='tgl_tempo'"))[0]?.nilai_persen ?? '';
  assert.equal(await legacyRead(), '25');
  const off = await status('suku-bunga', c.result, false);
  assert.equal(await legacyRead(), '25', 'deactivation has no effect on the reader, as the UI states');
  await assert.rejects(update('suku-bunga', off.result, { field: 'biaya_admin' }), (e) => e.code === 'PRODUCT_FIELD_INVALID');
});

test('STALE after a legacy write (even to a legacy-only column), replay/conflict, rollback, LEGACY_ACTIVE, NO_CHANGE', options, async () => {
  const c = await create('jenis-pembiayaan', pembiayaan(`SYN-S-${RUN}`));
  await q('UPDATE m_jenis_pembiayaan SET doc_date = ? WHERE id = ?', ['2026-11-06', c.result.id]);
  await assert.rejects(update('jenis-pembiayaan', c.result, { pembiayaan_name: 'SYNTH Bentrok' }), { code: 'STALE' });
  const fresh = await load('jenis-pembiayaan', c.result.id);
  await assert.rejects(update('jenis-pembiayaan', fresh, {}), { code: 'NO_CHANGE' });
  const key = randomUUID(); const body = { idempotencyKey: key, values: pembiayaan(`SYN-R-${RUN}`) };
  const first = await createProductMaster(ports(), actor(), 'jenis-pembiayaan', body);
  const again = await createProductMaster(ports(), actor(), 'jenis-pembiayaan', body);
  assert.equal(again.replayed, true); assert.deepEqual(again.result, first.result);
  await assert.rejects(createProductMaster(ports(), actor(), 'jenis-pembiayaan', { ...body, values: { ...body.values, biaya_admin: '1' } }), { code: 'IDEMPOTENCY_CONFLICT' });
  const count = async () => Number((await q('SELECT COUNT(*) AS n FROM m_jenis_pembiayaan'))[0].n);
  const n = await count();
  await assert.rejects(create('jenis-pembiayaan', pembiayaan(`SYN-F-${RUN}`), { afterBusinessWrite: async () => { throw new Error('INJECTED'); } }), /INJECTED/);
  assert.equal(await count(), n);
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'master/jenis_pembiayaan_c'");
  try { await assert.rejects(create('jenis-pembiayaan', pembiayaan(`SYN-L-${RUN}`)), { code: 'LEGACY_ACTIVE' }); assert.equal((await listProductMaster(ports(), actor(), 'jenis-pembiayaan')).writable, false); }
  finally { await q("UPDATE ref_menu SET status = 0 WHERE url = 'master/jenis_pembiayaan_c'"); }
});

test('least privilege: no update of fixed codes, no delete, chart of accounts and transactions read only', options, async () => {
  const denied = async (sql) => { try { await write.$executeRawUnsafe(sql); return 'allowed'; } catch (e) { return errno(e); } };
  for (const sql of ['UPDATE m_jenis_simpanan SET jenis_simpanan_code = jenis_simpanan_code WHERE id = 0', 'UPDATE m_suku_bunga SET field = field WHERE id = 0',
    'UPDATE m_jenis_pinjaman SET dd_usr = dd_usr WHERE id = 0', 'UPDATE m_jenis_pembiayaan SET doc_no = doc_no WHERE id = 0', 'UPDATE m_acc_coa SET coa_desc = coa_desc WHERE id = 0',
    'UPDATE trans_pinjaman SET jenis_pinjaman = jenis_pinjaman WHERE id = 0']) assert.ok(['1142', '1143'].includes(await denied(sql)), sql);
  for (const sql of ['DELETE FROM m_jenis_simpanan WHERE id = 0', 'DELETE FROM m_jenis_pinjaman WHERE id = 0', 'DELETE FROM m_jenis_pembiayaan WHERE id = 0', 'DELETE FROM m_suku_bunga WHERE id = 0'])
    assert.equal(await denied(sql), '1142', sql);
});
