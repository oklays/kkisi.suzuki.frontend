import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { decideLoan, readLoanDecision } from '@koperasi/application/kosipa/commands/loan-decision';
import { PrismaKosipaLoanDecisionRepository } from '../src/infrastructure/repositories/kosipa-loan-decision.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';

// FA-04 loan decision against the ISOLATED synthetic stack only (KOSIPA_FA01=1; sequential; FA app server stopped).
// Loans of this test use ids 9130-9159 and doc numbers starting DECTEST; they are removed afterwards. Ledger rows stay (append-only).
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `local-stack.mjs setup` (or `loan-writer` on an existing stack)', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'loanWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const root = config ? await stack.rootConnection(config) : null;
const q = async (sql, params = []) => (await root.query(sql, params))[0];
const FENCE = ['pinjaman/pinjaman_c', 'pinjaman/pinjaman_reguler_c', 'pinjaman/pinjaman_bank_c', 'pinjaman/kasbon_c', 'pinjaman/pembiayaan_c', 'pinjaman/gaji_minus_c', 'pinjaman/kpr_btn_c', 'mobile/pinjaman_mobile_c'];
let menusBefore = [];
let ledgerFloor = 0;

const cleanup = async () => {
  await q("DELETE FROM trans_pinjaman_dtl WHERE doc_no LIKE 'DECTEST%'");
  await q("DELETE FROM trans_pinjaman_rollover WHERE doc_no LIKE 'DECTEST%'");
  await q("DELETE FROM trans_pinjaman_pengajuan WHERE doc_no LIKE 'DECTEST%'");
  await q("DELETE FROM orders WHERE order_code LIKE 'DECTEST%'");
  await q("DELETE FROM trans_pinjaman WHERE doc_no LIKE 'DECTEST%'");
  await q("DELETE FROM m_anggota WHERE id BETWEEN 9130 AND 9139");
};
if (ENABLED) {
  await q("SET SESSION sql_mode=''");
  ledgerFloor = Number((await q(`SELECT COALESCE(MAX(id), 0) AS m FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger`))[0].m);   // legacy rows are written under non-strict mode (NOT NULL columns without defaults), as the stack seed does
  menusBefore = await q(`SELECT id, status FROM ref_menu WHERE url IN (${FENCE.map(() => '?').join(',')})`, FENCE);
  await q(`UPDATE ref_menu SET status = 0 WHERE url IN (${FENCE.map(() => '?').join(',')})`, FENCE);
  await cleanup();
  await q("INSERT INTO m_anggota (id, nik_kar, nama_kar, status_anggota, kd_group) VALUES (9130,'SDEC0001','SYNTH DEC AKTIF','AKTIVE','ANGGOTA'),(9131,'SDEC0002','SYNTH DEC RESIGN','RESIGN','ANGGOTA'),(9132,'SDEC0003','SYNTH DEC GANDA A','AKTIVE','ANGGOTA'),(9133,'SDEC0003','SYNTH DEC GANDA B','AKTIVE','ANGGOTA')");
}
test.after(async () => {
  if (!ENABLED) return;
  try { await cleanup(); }
  finally {
    for (const m of menusBefore) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [m.status, m.id]);
    await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); await root.end();
  }
});

let seq = 0;
async function loan(extra = {}) {
  const id = 9140 + seq++;
  const row = { id, doc_no: `DECTEST${id}`, doc_date: '2026-11-05', nik: 'SDEC0001', nama: 'SYNTH DEC AKTIF', jenis_pinjaman: 'PINJAMAN REGULAR', bank_pembiaya: 'KOPERASI', jenis_suku_bunga: 'Flat', biaya_suku_bunga: '1',
    plan_pinjaman: 5000000, plan_jangka_waktu: 10, plan_angsuran: 550000, gaji_pokok: 0, jasa_angsuran: 0, kasbon_pinjaman: 0, jasa_kasbon_pinjaman: 0, remark_pelunasan: '', metode_pelunasan: '',
    pengajuan_mobile: 0, publish: 0, doc_status: 'POSTING', status_pencairan: 'OPEN', status_bayar: 'BELUM LUNAS', status_roll_over: 'NO', cd: '2026-11-05 08:00:00', cd_usr: 'SYNTH LEGACY MAKER', ...extra };
  const cols = Object.keys(row);
  await q(`INSERT INTO trans_pinjaman (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
  return row;
}
const header = async (id) => (await q('SELECT * FROM trans_pinjaman WHERE id = ?', [id]))[0];
const request = async (docNo) => (await q('SELECT * FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [docNo]))[0];
// Ledger rows are append-only and doc numbers of this test repeat across runs: only rows written by THIS run count.
const ledger = async (command, ref) => (await q(`SELECT * FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE command = ? AND subject_ref = ? AND id > ? ORDER BY id DESC LIMIT 1`, [command, ref, ledgerFloor]))[0];

const caps = (...c) => new Set(['kosipa.loan.view', ...c]);
const staff = () => ({ userId: stack.USERS.operator, kosipaUserId: 9102, capabilities: caps('kosipa.loan.prepare', 'kosipa.loan.approve'), requestId: randomUUID() });
const checker = () => ({ userId: stack.USERS.admin, kosipaUserId: 9101, capabilities: caps('kosipa.loan.approve'), requestId: randomUUID() });
const repo = (hooks) => new PrismaKosipaLoanDecisionRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, hooks });
const ports = (hooks) => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), loanDecisions: repo(hooks) });
const state = async (docNo, actor = checker()) => readLoanDecision(ports(), actor, docNo);
const decide = async (actor, docNo, action, extra = {}, hooks) => decideLoan(ports(hooks), actor, docNo, action, { idempotencyKey: randomUUID(), expectedVersion: (await state(docNo, actor)).version, ...extra });

test('post: OPEN -> POSTING with posting_doc stamps; cd_usr (the maker) unchanged; poster recorded as maker in the ledger', options, async () => {
  const l = await loan({ doc_status: 'OPEN' });
  const r = await decide(staff(), l.doc_no, 'post');
  assert.equal(r.result.status, 'POSTING');
  const h = await header(l.id);
  assert.deepEqual([h.doc_status, h.posting_doc_usr, h.ud_usr, h.cd_usr, h.approved_doc, h.status_pencairan], ['POSTING', 'SYNTH KFA KOSIPA OPERATOR', 'SYNTH KFA KOSIPA OPERATOR', 'SYNTH LEGACY MAKER', null, 'OPEN']);
  assert.match(h.posting_doc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const led = await ledger('loan.post', l.doc_no);
  assert.deepEqual([led.from_state, led.to_state, Number(led.maker_console_user_id), led.checker_console_user_id], ['OPEN', 'POSTING', stack.USERS.operator, null]);
  assert.ok(!JSON.stringify(led).includes('SDEC0001') && !JSON.stringify(led).includes('SYNTH DEC'), 'ledger carries no member identity');
});

test('maker != checker: the native poster cannot approve; another officer approves; stamps, ledger identities, replay, stale version', options, async () => {
  const l = await loan({ doc_status: 'OPEN' });
  await decide(staff(), l.doc_no, 'post');
  await assert.rejects(decide(staff(), l.doc_no, 'approve'), { code: 'LOAN_MAKER_CHECKER' });
  assert.deepEqual((await state(l.doc_no, staff())).options.map((o) => o.blocker), ['LOAN_STATUS_INVALID', 'LOAN_MAKER_CHECKER', 'LOAN_MAKER_CHECKER']);
  const s = await state(l.doc_no);
  const key = randomUUID();
  const a = await decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: key, expectedVersion: s.version });
  assert.equal(a.result.status, 'APPROVED');
  assert.equal((await decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: key, expectedVersion: s.version })).replayed, true);
  const h = await header(l.id);
  assert.deepEqual([h.doc_status, h.approved_doc_usr, h.cd_usr, h.posting_doc_usr, h.status_pencairan, h.status_bayar, h.keterangan_riject], ['APPROVED', 'SYNTH KFA KOSIPA ADMIN', 'SYNTH LEGACY MAKER', 'SYNTH KFA KOSIPA OPERATOR', 'OPEN', 'BELUM LUNAS', null]);
  const led = await ledger('loan.approve', l.doc_no);
  assert.deepEqual([led.from_state, led.to_state, Number(led.maker_console_user_id), Number(led.checker_console_user_id)], ['POSTING', 'APPROVED', stack.USERS.operator, stack.USERS.admin]);
  // Decided: nothing more is possible, and a stale version is refused first.
  await assert.rejects(decideLoan(ports(), checker(), l.doc_no, 'reject', { idempotencyKey: randomUUID(), expectedVersion: s.version, reason: 'Terlambat ditolak' }), { code: 'STALE' });
  await assert.rejects(decide(checker(), l.doc_no, 'reject', { reason: 'Terlambat ditolak' }), { code: 'LOAN_STATUS_INVALID' });
});

test('a legacy change after the page was read makes the decision STALE; nothing is written', options, async () => {
  const l = await loan();
  const s = await state(l.doc_no);
  await q("UPDATE trans_pinjaman SET plan_pinjaman = 5100000 WHERE id = ?", [l.id]);
  await assert.rejects(decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: s.version }), { code: 'STALE' });
  assert.equal((await header(l.id)).doc_status, 'POSTING');
});

test('reject: reason stored on the loan AND the one mobile request; approve of a mobile loan synchronises the request status', options, async () => {
  const m = await loan({ pengajuan_mobile: 1, jenis_pinjaman: 'KASBON' });
  await q("INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_status, nik_kar, is_payroll) VALUES (?, 'POSTING', 'SDEC0001', 1)", [m.doc_no]);
  await assert.rejects(decide(checker(), m.doc_no, 'reject', { reason: 'abc' }), { code: 'REASON_INVALID' });
  await decide(checker(), m.doc_no, 'reject', { reason: 'Slip gaji tidak terbaca' });
  const h = await header(m.id); const p = await request(m.doc_no);
  assert.deepEqual([h.doc_status, h.keterangan_riject, h.rejected_doc_usr, h.cd_usr], ['REJECTED', 'Slip gaji tidak terbaca', 'SYNTH KFA KOSIPA ADMIN', 'SYNTH LEGACY MAKER']);
  assert.deepEqual([p.doc_status, p.keterangan_riject], ['REJECTED', 'Slip gaji tidak terbaca']);
  assert.equal((await ledger('loan.reject', m.doc_no)).reason, 'Slip gaji tidak terbaca');

  const n = await loan({ pengajuan_mobile: 1, jenis_pinjaman: 'KASBON' });
  await q("INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_status, nik_kar, is_payroll) VALUES (?, 'POSTING', 'SDEC0001', 1)", [n.doc_no]);
  await decide(checker(), n.doc_no, 'approve');
  assert.equal((await request(n.doc_no)).doc_status, 'APPROVED');
  // The stored flag decides, not the request: a non-mobile loan never touches a stray request with the same number.
  const o = await loan();
  await q("INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_status, nik_kar, is_payroll) VALUES (?, 'OPEN', 'SDEC0001', 1)", [o.doc_no]);
  await decide(checker(), o.doc_no, 'approve');
  assert.equal((await request(o.doc_no)).doc_status, 'OPEN');
});

test('approval never settles roll-over loans: old loan and its instalments stay as they are (legacy settled them early)', options, async () => {
  const old = await loan({ doc_status: 'APPROVED', status_pencairan: 'APPROVED' });
  for (let i = 1; i <= 3; i++) await q("INSERT INTO trans_pinjaman_dtl (doc_no, ke_cicilan, status_cicilan, rool_over) VALUES (?, ?, 'Belum Bayar', 0)", [old.doc_no, i]);
  const fresh = await loan({ status_roll_over: 'YES', total_roll_over: 1500000 });
  await q("INSERT INTO trans_pinjaman_rollover (nik, doc_no, doc_no_roll_over, sisa_pinjaman, sisa_cicilan) VALUES ('SDEC0001', ?, ?, 1500000, 3)", [fresh.doc_no, old.doc_no]);
  await decide(checker(), fresh.doc_no, 'approve');
  const o = await header(old.id);
  assert.deepEqual([o.status_bayar, o.pelunasan], ['BELUM LUNAS', null]);
  assert.deepEqual((await q('SELECT status_cicilan FROM trans_pinjaman_dtl WHERE doc_no = ? ORDER BY ke_cicilan', [old.doc_no])).map((r) => r.status_cicilan), ['Belum Bayar', 'Belum Bayar', 'Belum Bayar']);
  assert.equal((await header(fresh.id)).status_pencairan, 'OPEN', 'disbursement is a separate step');
});

test('fail closed: PPOB order, duplicate doc_no, disbursed-before-approval, exited / unknown / ambiguous member, zero principal; nothing changes', options, async () => {
  const cases = [
    [{}, async (l) => q("INSERT INTO orders (order_code, id_anggota, nik_kar, ppob, import_local, admin, jw, in_proses, tr_id) VALUES (?, 9130, 'SDEC0001', 1, 0, 0, 1, 0, 0)", [l.doc_no]), 'LOAN_PPOB_ORDER'],
    [{}, async (l) => loan({ id: 9199, doc_no: l.doc_no }), 'LOAN_DUPLICATE_HEADER'],
    [{ status_pencairan: 'APPROVED' }, null, 'LOAN_STATE_INCONSISTENT'],
    [{ status_bayar: 'LUNAS' }, null, 'LOAN_STATE_INCONSISTENT'],
    [{ nik: 'SDEC0002' }, null, 'LOAN_MEMBER_INACTIVE'],
    [{ nik: 'SDEC9999' }, null, 'LOAN_MEMBER_NOT_FOUND'],
    [{ nik: 'SDEC0003' }, null, 'LOAN_MEMBER_AMBIGUOUS'],
    [{ plan_pinjaman: 0 }, null, 'LOAN_AMOUNT_INVALID'],
  ];
  for (const [extra, setup, code] of cases) {
    const l = await loan(extra);
    if (setup) await setup(l);
    await assert.rejects(decide(checker(), l.doc_no, 'approve'), { code }, code);
    assert.equal((await header(l.id)).doc_status, 'POSTING', code);
    assert.equal((await state(l.doc_no)).options.find((o) => o.action === 'approve').blocker, code, `${code} shown on the page`);
  }
  // An exited member's application can still be rejected (cleanup), with a reason.
  const exited = await loan({ nik: 'SDEC0002' });
  await decide(checker(), exited.doc_no, 'reject', { reason: 'Anggota sudah resign' });
  assert.equal((await header(exited.id)).doc_status, 'REJECTED');
});

test('legacy fence: any loan controller re-enabled -> LEGACY_ACTIVE, state says so, nothing written', options, async () => {
  const l = await loan();
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'pinjaman/kasbon_c'");
  try {
    const s = await state(l.doc_no);
    assert.equal(s.legacy, 'legacy-active'); assert.equal(s.writable, false);
    await assert.rejects(decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: s.version }), { code: 'LEGACY_ACTIVE' });
    assert.equal((await header(l.id)).doc_status, 'POSTING');
  } finally { await q("UPDATE ref_menu SET status = 0 WHERE url = 'pinjaman/kasbon_c'"); }
});

test('atomicity: a failure after the business write rolls back loan, mobile request and ledger together', options, async () => {
  const l = await loan({ pengajuan_mobile: 1 });
  await q("INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_status, nik_kar, is_payroll) VALUES (?, 'POSTING', 'SDEC0001', 1)", [l.doc_no]);
  const boom = { afterBusinessWrite: async () => { throw new Error('injected'); } };
  await assert.rejects(decide(checker(), l.doc_no, 'approve', {}, boom));
  assert.equal((await header(l.id)).doc_status, 'POSTING');
  assert.equal((await header(l.id)).approved_doc, null);
  assert.equal((await request(l.doc_no)).doc_status, 'POSTING');
  assert.equal(await ledger('loan.approve', l.doc_no), undefined);
});

test('concurrency: approve and reject of the same loan at once -> exactly one decision wins', options, async () => {
  const l = await loan();
  const s = await state(l.doc_no);
  const results = await Promise.allSettled([
    decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: s.version }),
    decideLoan(ports(), { ...checker(), userId: stack.USERS.second, kosipaUserId: 9105 }, l.doc_no, 'reject', { idempotencyKey: randomUUID(), expectedVersion: s.version, reason: 'Ditolak bersamaan' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = results.find((r) => r.status === 'rejected');
  assert.ok(['STALE', 'LOAN_STATUS_INVALID', 'BUSY_RETRY'].includes(loser.reason.code), loser.reason.code);
  const h = await header(l.id);
  assert.ok(h.doc_status === 'APPROVED' || h.doc_status === 'REJECTED');
  assert.equal(h.doc_status === 'REJECTED' ? h.keterangan_riject : null, h.doc_status === 'REJECTED' ? 'Ditolak bersamaan' : null);
});

test('least privilege: the loan writer cannot change the maker, amounts, disbursement, schedule, or delete', options, async () => {
  const l = await loan();
  for (const sql of [
    `UPDATE trans_pinjaman SET cd_usr = 'x' WHERE id = ${l.id}`, `UPDATE trans_pinjaman SET plan_pinjaman = 1 WHERE id = ${l.id}`, `UPDATE trans_pinjaman SET status_pencairan = 'APPROVED' WHERE id = ${l.id}`,
    `UPDATE trans_pinjaman SET status_bayar = 'LUNAS' WHERE id = ${l.id}`, `DELETE FROM trans_pinjaman WHERE id = ${l.id}`, `INSERT INTO trans_pinjaman (doc_no) VALUES ('DECTESTX')`,
    `UPDATE trans_pinjaman_dtl SET status_cicilan = 'Bayar' WHERE doc_no = '${l.doc_no}'`, `DELETE FROM trans_pinjaman_rollover WHERE doc_no = '${l.doc_no}'`, `UPDATE m_anggota SET status_anggota = 'AKTIVE' WHERE id = 9131`,
  ]) await assert.rejects(write.$executeRawUnsafe(sql), (e) => /denied|1142|1143/i.test(String(e?.message ?? e)), sql);
});

test('reused document number: a native poster of a DELETED loan with the same number is not the poster of the new loan', options, async () => {
  const first = await loan({ doc_status: 'OPEN' });
  await decide(staff(), first.doc_no, 'post');
  await q('DELETE FROM trans_pinjaman WHERE id = ?', [first.id]);            // legacy ajax_delete, then get_no_save hands out the same number
  const again = await loan({ doc_no: first.doc_no });
  assert.equal((await state(again.doc_no, staff())).postedByViewer, false);
  const r = await decide(staff(), again.doc_no, 'approve');
  assert.equal(r.result.status, 'APPROVED');
});

test('coexistence mode (UAT): every legacy loan screen OPEN, shared repository decides; the strict one still refuses', options, async () => {
  const l = await loan();
  await q(`UPDATE ref_menu SET status = 1 WHERE url IN (${FENCE.map(() => '?').join(',')})`, FENCE);
  try {
    const strict = await state(l.doc_no);
    await assert.rejects(decideLoan(ports(), checker(), l.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: strict.version }), { code: 'LEGACY_ACTIVE' });
    const sharedPorts = { ...ports(), loanDecisions: new PrismaKosipaLoanDecisionRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, sharedWithLegacy: true }) };
    const s = await readLoanDecision(sharedPorts, checker(), l.doc_no);
    assert.deepEqual([s.shared, s.legacy, s.writable], [true, 'legacy-active', true]);
    const r = await decideLoan(sharedPorts, checker(), l.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: s.version });
    assert.equal(r.result.status, 'APPROVED');
    const h = await header(l.id);
    assert.deepEqual([h.doc_status, h.cd_usr, h.approved_doc_usr], ['APPROVED', 'SYNTH LEGACY MAKER', 'SYNTH KFA KOSIPA ADMIN']);
    // A legacy write that lands between reading the page and deciding still makes the decision STALE.
    const other = await loan();
    const before = await readLoanDecision(sharedPorts, checker(), other.doc_no);
    await q("UPDATE trans_pinjaman SET doc_status = 'REJECTED', cd_usr = 'LEGACY APPROVER' WHERE id = ?", [other.id]);
    await assert.rejects(decideLoan(sharedPorts, checker(), other.doc_no, 'approve', { idempotencyKey: randomUUID(), expectedVersion: before.version }), { code: 'STALE' });
  } finally { await q(`UPDATE ref_menu SET status = 0 WHERE url IN (${FENCE.map(() => '?').join(',')})`, FENCE); }
});
