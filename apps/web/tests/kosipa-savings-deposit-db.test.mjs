import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSavingsDeposit, approveSavingsDeposit, rejectSavingsDeposit, listSavingsDeposits, lookupDepositMember } from '@koperasi/application/kosipa/commands/savings-deposit';
import { PrismaKosipaSavingsDepositRepository } from '../src/infrastructure/repositories/kosipa-savings-deposit.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';
import { validateKosipaSavingsWriteConfig } from '../src/infrastructure/db/prisma-kosipa-savings-write.ts';

// FA-03C T07: voluntary-savings deposits against the ISOLATED synthetic stack only (KOSIPA_FA01=1; sequential; FA app server stopped).
// Created headers/lines are removed by exact doc_no afterwards; ledger and numbering registry rows stay (append-only); AUTO_INCREMENT never reset.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `local-stack.mjs setup` (or `savings-writer` on an existing stack)', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'savingsWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const root = config ? await stack.rootConnection(config) : null;
const q = async (sql, params = []) => (await root.query(sql, params))[0];
const created = [];
let menuBefore = null;
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

if (ENABLED) { [menuBefore] = await q("SELECT id, status FROM ref_menu WHERE url = 'simpanan/sim_setor_c'"); await q("UPDATE ref_menu SET status = 0 WHERE url = 'simpanan/sim_setor_c'"); }
test.after(async () => {
  if (!ENABLED) return;
  try { for (const d of created) { await q('DELETE FROM trans_simpanan_dtl WHERE doc_no = ?', [d]); await q('DELETE FROM trans_simpanan WHERE doc_no = ?', [d]); } }
  finally { if (menuBefore) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [menuBefore.status, menuBefore.id]); await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); await root.end(); }
});

const caps = (...c) => new Set(['kosipa.member.view', 'kosipa.savings.view', ...c]);
const maker = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: caps('kosipa.savings.prepare', 'kosipa.savings.approve'), requestId: randomUUID() });
const checker = () => ({ userId: stack.USERS.admin, kosipaUserId: 9101, capabilities: caps('kosipa.savings.approve'), requestId: randomUUID() });
const ports = (hooks) => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), deposits: new PrismaKosipaSavingsDepositRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, hooks }) });
const body = (extra = {}) => ({ idempotencyKey: randomUUID(), memberId: '9101', docDate: today, paymentType: 'TRANSFER', amount: '125000.50', bankName: 'SYNTH BANK', bankAccount: '0099', remarks: 'Uji setoran', ...extra });
const create = async (extra, hooks) => { const r = await createSavingsDeposit(ports(hooks), maker(), body(extra)); if (!r.replayed) created.push(r.result.docNo); return r; };
const header = async (id) => (await q('SELECT * FROM trans_simpanan WHERE id = ?', [id]))[0];
const lines = async (docNo) => q('SELECT * FROM trans_simpanan_dtl WHERE doc_no = ? ORDER BY id', [docNo]);
const ledger = async (command) => (await q(`SELECT * FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE command = ? ORDER BY id DESC LIMIT 1`, [command]))[0];
const view = ENABLED ? JSON.parse(readFileSync(new URL('../../../.local/kosipa-full-access-completion-20261106/view-contracts.json', import.meta.url), 'utf8')) : null;
const viewSelect = (name) => { const v = view.views?.[name] ?? view[name]; const sql = (v['Create View'] ?? v).replace(/`/g, ''); return sql.slice(sql.indexOf(' AS select ') + 4); };
const kartu = async (nik) => q(`SELECT * FROM (${viewSelect('v_kartu_simpanan')}) k WHERE k.nik_kar = ? AND k.jenis_simpanan = 'SIMPANAN SUKARELA'`, [nik]);

test('create: legacy-shaped POSTING header + one kredit_cash line, TFCSH number from the registry, explicit NOT NULL values, maker in the ledger', options, async () => {
  const r = await create();
  assert.match(r.result.docNo, /^TFCSH\d{6}\d{5,}$/); assert.equal(r.result.status, 'POSTING'); assert.match(r.result.version, /^[0-9a-f]{64}$/);
  assert.ok(r.result.docNo.endsWith(String(r.result.id).padStart(5, '0')), 'n = the header id (row-id scheme)');
  const h = await header(r.result.id);
  assert.deepEqual([h.doc_status, h.doc_type, h.jenis_transaksi, h.jenis_simpanan, h.payment_type, h.remarks, h.periode_th, h.periode_bl, h.is_mobile, Number(h.saldo_awal_penarikan)],
    ['POSTING', 'KREDIT', 'CASH/TRANSFER', 'SIMPANAN SUKARELA', 'TRANSFER', 'Uji setoran', today.slice(0, 4), today.slice(5, 7), 0, 0]);
  assert.equal(h.cd_usr, 'SYNTH KFA KOSIPA OPERATOR');
  const [l] = await lines(r.result.docNo);
  assert.deepEqual([l.nik_kar, l.nama, l.kd_group, l.kredit_cash, l.kredit, l.debit, l.saldo, l.doc_status, l.doc_no_dtl, l.rek_bank, l.rek_no, l.tgl_cair],
    ['SKFA0001', 'SYNTH ANGGOTA KFA 1', 'ANGGOTA', '125000.50', '0.00', '0.00', '0.00', 'POSTING', `${r.result.docNo}SKFA0001`, 'SYNTH BANK', '0099', null]);
  assert.equal((await q(`SELECT COUNT(*) AS n FROM \`${stack.LEDGER_DB}\`.kosipa_document_number WHERE doc_no = ?`, [r.result.docNo]))[0].n.toString(), '1');
  const l2 = await ledger('savings.deposit.create');
  assert.equal(Number(l2.maker_console_user_id), stack.USERS.operator);
  assert.ok(!JSON.stringify(l2).includes('SKFA0001') && !JSON.stringify(l2).includes('SYNTH ANGGOTA'), 'ledger carries no member identity');
  assert.equal((await kartu('SKFA0001')).filter((k) => Number(k.kredit_cash) === 125000.5).length, 0, 'pending deposits are invisible to the legacy savings card');
});

test('approve: a DIFFERENT approver (FD-35); header + line APPROVED, tgl_cair set; the legacy savings card and total views count it; replay and stale', options, async () => {
  const before = await kartu('SKFA0001');
  const sum = (rows, col) => rows.reduce((t, k) => t + Number(k[col] ?? 0), 0);
  const r = await create({ amount: '200000' });
  await assert.rejects(approveSavingsDeposit(ports(), maker(), String(r.result.id), { idempotencyKey: randomUUID(), expectedVersion: r.result.version }), { code: 'SAVINGS_MAKER_CHECKER' });
  const key = randomUUID();
  const a = await approveSavingsDeposit(ports(), checker(), String(r.result.id), { idempotencyKey: key, expectedVersion: r.result.version });
  assert.equal(a.result.status, 'APPROVED');
  assert.equal((await approveSavingsDeposit(ports(), checker(), String(r.result.id), { idempotencyKey: key, expectedVersion: r.result.version })).replayed, true);
  const h = await header(r.result.id); const [l] = await lines(r.result.docNo);
  assert.equal(h.doc_status, 'APPROVED'); assert.equal(l.doc_status, 'APPROVED'); assert.equal(l.tgl_cair, today); assert.equal(h.ud_usr, 'SYNTH KFA KOSIPA ADMIN');
  const after = await kartu('SKFA0001');
  assert.equal(sum(after, 'kredit_cash') - sum(before, 'kredit_cash'), 200000, 'v_kartu_simpanan (production definition) counts exactly the approved deposit');
  const total = await q(`SELECT * FROM (${viewSelect('v_trans_simpanan_total')}) t WHERE t.nik_kar = 'SKFA0001' AND t.jenis_simpanan = 'SIMPANAN SUKARELA'`);
  assert.ok(sum(total, 'saldo_pokok') >= 200000);
  const l2 = await ledger('savings.deposit.approve');
  assert.deepEqual([Number(l2.maker_console_user_id), Number(l2.checker_console_user_id), l2.from_state, l2.to_state], [stack.USERS.operator, stack.USERS.admin, 'POSTING', 'APPROVED']);
  await assert.rejects(approveSavingsDeposit(ports(), checker(), String(r.result.id), { idempotencyKey: randomUUID(), expectedVersion: a.result.version }), { code: 'SAVINGS_STATUS_INVALID' }, 'approved documents are immutable');
  const m = await lookupDepositMember(ports(), maker(), 'SKFA0001');
  assert.ok(Number(m.balance) >= 200000);
});

test('reject (FD-37): reason mandatory, rows kept as REJECTED and never counted; stale version after a legacy edit', options, async () => {
  const r = await create({ amount: '7500', paymentType: 'CASH', bankName: '', bankAccount: '' });
  await assert.rejects(rejectSavingsDeposit(ports(), checker(), String(r.result.id), { idempotencyKey: randomUUID(), expectedVersion: r.result.version }), { code: 'REASON_INVALID' });
  await q('UPDATE trans_simpanan SET remarks = ? WHERE id = ?', ['diubah legacy', r.result.id]);
  await assert.rejects(rejectSavingsDeposit(ports(), checker(), String(r.result.id), { idempotencyKey: randomUUID(), expectedVersion: r.result.version, reason: 'Nominal salah' }), { code: 'STALE' });
  const fresh = (await listSavingsDeposits(ports(), checker(), { status: 'POSTING' })).rows.find((x) => x.id === r.result.id);
  assert.ok(fresh && fresh.native && fresh.makerConsoleUserId === stack.USERS.operator);
  const rej = await rejectSavingsDeposit(ports(), maker(), String(r.result.id), { idempotencyKey: randomUUID(), expectedVersion: fresh.version, reason: 'Nominal salah ketik' });
  assert.equal(rej.result.status, 'REJECTED');
  const [l] = await lines(r.result.docNo);
  assert.equal(l.doc_status, 'REJECTED'); assert.equal(l.tgl_cair, null); assert.equal((await header(r.result.id)).doc_status, 'REJECTED');
  assert.equal((await ledger('savings.deposit.reject')).reason, 'Nominal salah ketik');
  assert.ok(!(await kartu('SKFA0001')).some((k) => Number(k.kredit_cash) === 7500));
});

test('validation and safety: future/previous-month dates, unknown or left member, bank details on cash, rollback, LEGACY_ACTIVE, no DELETE privilege', options, async () => {
  const count = async () => Number((await q('SELECT COUNT(*) AS n FROM trans_simpanan'))[0].n);
  const n = await count();
  const prev = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 28)).toISOString().slice(0, 10);
  await assert.rejects(create({ docDate: prev }), { code: 'SAVINGS_DATE_INVALID' });
  await assert.rejects(create({ memberId: '2000000000' }), { code: 'MEMBER_NOT_FOUND' });
  await assert.rejects(create({ paymentType: 'CASH' }), { code: 'SAVINGS_FIELD_INVALID' });
  await assert.rejects(create({}, { afterBusinessWrite: async () => { throw new Error('INJECTED'); } }), /INJECTED/);
  assert.equal(await count(), n, 'nothing half-written');
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'simpanan/sim_setor_c'");
  try { await assert.rejects(create(), { code: 'LEGACY_ACTIVE' }); const l = await listSavingsDeposits(ports(), checker(), {}); assert.deepEqual([l.writable, l.legacy], [false, 'legacy-active'], 'the page turns read-only while the legacy screen is open'); }
  finally { await q("UPDATE ref_menu SET status = 0 WHERE url = 'simpanan/sim_setor_c'"); }
  for (const sql of ['DELETE FROM trans_simpanan WHERE id = 0', 'DELETE FROM trans_simpanan_dtl WHERE id = 0', 'UPDATE trans_simpanan_dtl SET kredit_cash = 1 WHERE id = 0', 'UPDATE trans_simpanan SET doc_date = doc_date WHERE id = 0', 'UPDATE m_anggota SET nama_kar = nama_kar WHERE id = 0']) {
    await assert.rejects(write.$executeRawUnsafe(sql), (e) => /\b(1142|1143)\b/.test(String(e.message)), sql);
  }
  const base = { KOSIPA_SAVINGS_WRITES_ENABLED: 'true', DATABASE_URL_KOSIPA_SAVINGS_WRITE: stack.dsn(config, 'savingsWrite', stack.DB, 2) };
  assert.ok(validateKosipaSavingsWriteConfig(base));
  for (const change of [{ APP_ENV: 'production' }, { KOSIPA_SAVINGS_WRITES_ENABLED: 'false' }, { DATABASE_URL_KOSIPA_MASTER_WRITE: base.DATABASE_URL_KOSIPA_SAVINGS_WRITE }])
    assert.throws(() => validateKosipaSavingsWriteConfig({ ...base, ...change }), { code: 'WRITE_NOT_CONFIGURED' });
});
