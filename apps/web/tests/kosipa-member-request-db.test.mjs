import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { decideMemberRequest, listMemberRequests, submitMemberIntake } from '@koperasi/application/kosipa/commands/member-request';
import { PrismaKosipaMemberRequestRepository } from '../src/infrastructure/repositories/kosipa-member-request.repository.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';

// P1 member requests against the ISOLATED synthetic stack only (KOSIPA_FA01=1; sequential; FA app server stopped).
// Members 9165-9169 (NIK SREQ…) and their requests / active deductions are removed afterwards. Ledger rows stay (append-only).
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `local-stack.mjs setup` (or `request-writer` on an existing stack)', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'requestWrite', stack.DB, 2) }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const root = config ? await stack.rootConnection(config) : null;
const q = async (sql, params = []) => (await root.query(sql, params))[0];
// Client keys are unique per run: ledger rows are append-only, so a key reused across runs would replay a request this test deleted.
const RUN = randomUUID().slice(0, 8);
const k = (name) => `idem-p1-${name}-${RUN}`;
const NIKS = ['SREQ0001', 'SREQ0002', 'SREQ0003', 'SREQ0004', 'SREQ0005'];
let ledgerFloor = 0;
let menusBefore = [];

const cleanup = async () => {
  await q(`DELETE FROM trans_pinjaman WHERE nik IN (${NIKS.map(() => '?').join(',')})`, NIKS);
  await q(`DELETE FROM trans_pinjaman_pengajuan WHERE nik_kar IN (${NIKS.map(() => '?').join(',')})`, NIKS);
  await q(`DELETE FROM trans_simpanan_pengajuan WHERE nik_kar IN (${NIKS.map(() => '?').join(',')})`, NIKS);
  await q(`DELETE FROM m_simpanan_aktif WHERE nik_kar IN (${NIKS.map(() => '?').join(',')})`, NIKS);
  await q('DELETE FROM m_anggota WHERE id BETWEEN 9165 AND 9169');
};
if (ENABLED) {
  await q("SET SESSION sql_mode=''");
  ledgerFloor = Number((await q(`SELECT COALESCE(MAX(id), 0) AS m FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger`))[0].m);
  menusBefore = await q("SELECT id, status FROM ref_menu WHERE url IN ('mobile/pengajuan_mobile_c', 'simpanan/pengajuan_mobile_c')");
  await q("UPDATE ref_menu SET status = 0 WHERE url IN ('mobile/pengajuan_mobile_c', 'simpanan/pengajuan_mobile_c')");
  await cleanup();
  await q(`INSERT INTO m_anggota (id, nik_kar, nama_kar, status_anggota, kd_group, bagian, lokasi, no_telp, sim_wajib, sim_sukarela) VALUES
    (9165,'SREQ0001','SYNTH REQ SATU','AKTIVE','ANGGOTA','SYNTH Produksi','SYNTH Tambun','0812',100000,0),
    (9166,'SREQ0002','SYNTH REQ DUA','AKTIVE','ANGGOTA',NULL,NULL,NULL,50000,0),
    (9167,'SREQ0003','SYNTH REQ RESIGN','RESIGN','ANGGOTA',NULL,NULL,NULL,0,0),
    (9168,'SREQ0004','SYNTH REQ GANDA A','AKTIVE','ANGGOTA',NULL,NULL,NULL,0,0),
    (9169,'SREQ0004','SYNTH REQ GANDA B','AKTIVE','ANGGOTA',NULL,NULL,NULL,0,0)`);
  await q(`INSERT INTO m_simpanan_aktif (doc_no, jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_old, potongan_payroll, status, periode_start, periode_end, is_mobile) VALUES
    ('OLD-1','SIMPANAN WAJIB','SREQ0001','SYNTH REQ SATU','ANGGOTA',0,100000,1,'2026-01-01','2026-12-31',0),
    ('OLD-2','SIMPANAN WAJIB','SREQ0001','SYNTH REQ SATU','ANGGOTA',0,80000,0,'2025-01-01','2025-12-31',0),
    ('OLD-3','SIMPANAN SUKARELA','SREQ0002','SYNTH REQ DUA','ANGGOTA',0,0,1,'2026-01-01','2026-12-31',0)`);
}
test.after(async () => {
  if (!ENABLED) return;
  try { await cleanup(); }
  finally {
    for (const m of menusBefore) await q('UPDATE ref_menu SET status = ? WHERE id = ?', [m.status, m.id]);
    await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); await root.end();
  }
});

const repo = (extra = {}) => new PrismaKosipaMemberRequestRepository(read, write, { ledgerDatabase: stack.LEDGER_DB, ...extra });
const channel = (extra) => ({ ownership: { owns: () => true }, now: () => new Date(), requests: repo(extra) });
const consolePorts = (extra) => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), requests: repo(extra) });
const decider = () => ({ userId: stack.USERS.admin, kosipaUserId: 9101, capabilities: new Set(['kosipa.loan.view', 'kosipa.savings.view', 'kosipa.member.view', 'kosipa.request.decide']), requestId: randomUUID() });
const M1 = { memberId: 9165, userId: 501, nik: 'SREQ0001' };
const loanBody = (key, extra = {}) => ({ kind: 'loan', clientKey: key, member: M1, productId: 9160, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah', ...extra });
const ledger = async (command, ref) => (await q(`SELECT * FROM \`${stack.LEDGER_DB}\`.kosipa_command_ledger WHERE command = ? AND subject_ref = ? AND id > ? ORDER BY id DESC LIMIT 1`, [command, ref, ledgerFloor]))[0];
const jsonOf = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const month = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
async function versionOf(type, docNo) {
  const list = await listMemberRequests(consolePorts(), decider(), { type, status: 'ALL', month: month() });
  return list.rows.find((r) => r.docNo === docNo)?.version;
}

test('loan intake: one OPEN row with the legacy columns; replay returns it; another payload under the same key conflicts', options, async () => {
  const first = await submitMemberIntake(channel(), 'req-a', loanBody(k('loan1')));
  assert.equal(first.replayed, false);
  assert.match(first.result.docNo, /^PGJ-MBL-\d{8}-[0-9A-F]{6}$/);
  const [row] = await q('SELECT * FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [first.result.docNo]);
  assert.deepEqual([row.doc_status, row.status_pencairan, row.nik_kar, row.nama, row.bagian, row.jenis_pinjaman_id, row.jenis_pinjaman, Number(row.total_pinjaman), row.lama_angsuran, row.is_online, row.is_payroll, row.doc_remarks],
    ['OPEN', 'OPEN', 'SREQ0001', 'SYNTH REQ SATU', 'SYNTH Produksi', 9160, 'SYNTH Pinjaman Reguler', 5_000_000, 12, 1, 1, 'Biaya sekolah']);
  const again = await submitMemberIntake(channel(), 'req-b', loanBody(k('loan1')));
  assert.deepEqual([again.replayed, again.result.docNo], [true, first.result.docNo]);
  await assert.rejects(submitMemberIntake(channel(), 'req-c', loanBody(k('loan1'), { amountRp: 6_000_000 })), { code: 'IDEMPOTENCY_CONFLICT' });
  const [n] = await q('SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [first.result.docNo]);
  assert.equal(Number(n.n), 1);
  const led = await ledger('member.request.loan.submit', 'member:9165');
  assert.deepEqual([led.capability, Number(led.actor_console_user_id), led.to_state, jsonOf(led.after_json).status], ['member.intake', 0, 'OPEN', 'OPEN']);
  assert.ok(!JSON.stringify(led).includes('SREQ0001'), 'the ledger never carries the NIK');
});

test('loan intake under parallel load: identical submits commit once; different keys never exceed 3 OPEN requests', options, async () => {
  const same = await Promise.all([1, 2, 3].map(() => submitMemberIntake(channel(), randomUUID(), loanBody(k('loanpar0001')))));
  assert.equal(same.filter((r) => !r.replayed).length, 1);
  assert.equal(new Set(same.map((r) => r.result.docNo)).size, 1);
  const burst = await Promise.allSettled([2, 3, 4, 5].map((i) => submitMemberIntake(channel(), randomUUID(), loanBody(k(`burst${i}`)))));
  const [open] = await q("SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE nik_kar = 'SREQ0001' AND doc_status = 'OPEN'");
  assert.equal(Number(open.n), 3, 'the per-member lock makes the open-request count exact');
  assert.ok(burst.some((r) => r.status === 'rejected' && r.reason.code === 'REQUEST_OPEN_LIMIT'));
});

test('intake refuses a wrong or inactive member, an ambiguous product rule and invalid amounts before writing', options, async () => {
  await assert.rejects(submitMemberIntake(channel(), 'r', loanBody(k('bad1'), { member: { ...M1, nik: 'SREQ0002' } })), { code: 'REQUEST_MEMBER_INVALID' });
  await assert.rejects(submitMemberIntake(channel(), 'r', loanBody(k('bad2'), { member: { memberId: 9167, userId: 1, nik: 'SREQ0003' } })), { code: 'REQUEST_MEMBER_INVALID' });
  await assert.rejects(submitMemberIntake(channel(), 'r', loanBody(k('bad3'), { member: { memberId: 9166, userId: 2, nik: 'SREQ0002' }, productId: 9161, amountRp: 1_000_000, months: 2 })), { code: 'REQUEST_FIELD_INVALID', field: 'productId' });
  await assert.rejects(submitMemberIntake(channel(), 'r', loanBody(k('bad4'), { member: { memberId: 9166, userId: 2, nik: 'SREQ0002' }, amountRp: 90_000_000 })), { code: 'REQUEST_FIELD_INVALID', field: 'amountRp' });
  const [n] = await q("SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE nik_kar IN ('SREQ0002','SREQ0003')");
  assert.equal(Number(n.n), 0);
});

test('deduction intake: potongan_old = current active deduction, effective next month, PWA markers', options, async () => {
  const r = await submitMemberIntake(channel(), 'r', { kind: 'deduction', clientKey: k('ded1'), member: M1, savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000 });
  const [row] = await q('SELECT * FROM trans_simpanan_pengajuan WHERE doc_no = ?', [r.result.docNo]);
  assert.match(r.result.docNo, /^PPS-MBL-/);
  assert.deepEqual([row.doc_status, row.jenis_simpanan, Number(row.potongan_old), Number(row.potongan), row.remarks, row.is_mobile, row.status_notif, row.phone, row.lokasi],
    ['OPEN', 'SIMPANAN WAJIB', 100_000, 150_000, 'PWA_ANGGOTA', 1, 0, '0812', 'SYNTH Tambun']);
  assert.equal(`${row.awal_potong_tahun}-${row.awal_potong_bulan}`, r.result.summary.effectiveMonth);
  await assert.rejects(submitMemberIntake(channel(), 'r', { kind: 'deduction', clientKey: k('ded2'), member: M1, savingsType: 'SIMPANAN WAJIB', requestedRp: 90_000 }), { code: 'REQUEST_FIELD_INVALID', field: 'requestedRp' });
});

test('reject loan request: OPEN -> REJECTED with reason and stamp; never once legacy converted it; stale versions refused', options, async () => {
  const { result } = await submitMemberIntake(channel(), 'r', loanBody(k('rej1'), { member: { memberId: 9166, userId: 2, nik: 'SREQ0002' } }));
  const version = await versionOf('loan', result.docNo);
  await q('UPDATE trans_pinjaman_pengajuan SET doc_remarks = ? WHERE doc_no = ?', ['diubah legacy', result.docNo]);
  await assert.rejects(decideMemberRequest(consolePorts(), decider(), 'loan', result.docNo, 'reject', { expectedVersion: version, idempotencyKey: randomUUID(), reason: 'Data tidak lengkap' }), { code: 'STALE' });
  const out = await decideMemberRequest(consolePorts(), decider(), 'loan', result.docNo, 'reject', { expectedVersion: await versionOf('loan', result.docNo), idempotencyKey: randomUUID(), reason: 'Data tidak lengkap' });
  assert.equal(out.result.status, 'REJECTED');
  const [row] = await q('SELECT doc_status, keterangan_riject, ud_usr FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [result.docNo]);
  assert.deepEqual([row.doc_status, row.keterangan_riject], ['REJECTED', 'Data tidak lengkap']);
  assert.ok(row.ud_usr);
  const led = await ledger('request.loan.reject', result.docNo);
  assert.deepEqual([led.from_state, led.to_state, led.reason, Number(led.actor_console_user_id)], ['OPEN', 'REJECTED', 'Data tidak lengkap', stack.USERS.admin]);

  const conv = await submitMemberIntake(channel(), 'r', loanBody(k('rej2'), { member: { memberId: 9166, userId: 2, nik: 'SREQ0002' } }));
  await q("INSERT INTO trans_pinjaman (doc_no, nik, nama, doc_status, pengajuan_mobile) VALUES (?, 'SREQ0002', 'SYNTH REQ DUA', 'OPEN', 1)", [conv.result.docNo]);
  await assert.rejects(decideMemberRequest(consolePorts(), decider(), 'loan', conv.result.docNo, 'reject', { expectedVersion: await versionOf('loan', conv.result.docNo), idempotencyKey: randomUUID(), reason: 'Data tidak lengkap' }), { code: 'REQUEST_ALREADY_CONVERTED' });
});

test('approve deduction (F45): every NIK+jenis row updated, member amount set, header APPROVED, all in one transaction', options, async () => {
  const { result } = await submitMemberIntake(channel(), 'r', { kind: 'deduction', clientKey: k('app1'), member: M1, savingsType: 'SIMPANAN WAJIB', requestedRp: 175_000 });
  const out = await decideMemberRequest(consolePorts(), decider(), 'deduction', result.docNo, 'approve', { expectedVersion: await versionOf('deduction', result.docNo), idempotencyKey: randomUUID() });
  assert.equal(out.result.status, 'APPROVED');
  const active = await q("SELECT doc_no, potongan_payroll, status FROM m_simpanan_aktif WHERE nik_kar = 'SREQ0001' AND jenis_simpanan = 'SIMPANAN WAJIB' ORDER BY id");
  assert.deepEqual(active.map((a) => [a.doc_no, Number(a.potongan_payroll), a.status]), [[result.docNo, 175_000, 1], [result.docNo, 175_000, 1]], 'legacy updates every matching row');
  const [m] = await q('SELECT sim_wajib, sim_sukarela FROM m_anggota WHERE id = 9165');
  assert.deepEqual([Number(m.sim_wajib), Number(m.sim_sukarela)], [175_000, 0]);
  const [h] = await q('SELECT doc_status, posting_date, ud_usr FROM trans_simpanan_pengajuan WHERE doc_no = ?', [result.docNo]);
  assert.equal(h.doc_status, 'APPROVED');
  assert.ok(h.posting_date && h.ud_usr);
  const led = await ledger('request.deduction.approve', result.docNo);
  assert.deepEqual([led.to_state, Number(led.checker_console_user_id), jsonOf(led.after_json).activeRows], ['APPROVED', stack.USERS.admin, 2]);
  await assert.rejects(decideMemberRequest(consolePorts(), decider(), 'deduction', result.docNo, 'approve', { expectedVersion: await versionOf('deduction', result.docNo), idempotencyKey: randomUUID() }), { code: 'REQUEST_STATUS_INVALID' });
});

test('approve deduction without an active row inserts one with explicit potongan_old and is_mobile; reject changes only the header', options, async () => {
  await q("DELETE FROM m_simpanan_aktif WHERE nik_kar = 'SREQ0002'");
  await q("INSERT INTO trans_simpanan_pengajuan (doc_no, doc_date, doc_status, jenis_simpanan, nik_kar, nama, potongan_old, potongan, status_notif) VALUES ('SREQ-LEG-1', ?, 'OPEN', 'SIMPANAN SUKARELA', 'SREQ0002', 'SYNTH REQ DUA', 0, 25000, 0)", [`${month()}-05`]);
  await decideMemberRequest(consolePorts(), decider(), 'deduction', 'SREQ-LEG-1', 'approve', { expectedVersion: await versionOf('deduction', 'SREQ-LEG-1'), idempotencyKey: randomUUID() });
  const [a] = await q("SELECT doc_no, potongan_old, potongan_payroll, status, is_mobile, periode_start, periode_end FROM m_simpanan_aktif WHERE nik_kar = 'SREQ0002'");
  assert.deepEqual([a.doc_no, Number(a.potongan_old), Number(a.potongan_payroll), a.status, a.is_mobile], ['SREQ-LEG-1', 0, 25_000, 1, 1]);
  assert.equal(new Date(a.periode_start).getDate(), 1);
  const [m] = await q('SELECT sim_sukarela FROM m_anggota WHERE id = 9166');
  assert.equal(Number(m.sim_sukarela), 25_000);

  await q("INSERT INTO trans_simpanan_pengajuan (doc_no, doc_date, doc_status, jenis_simpanan, nik_kar, nama, potongan_old, potongan, status_notif) VALUES ('SREQ-LEG-2', ?, 'OPEN', 'SIMPANAN SUKARELA', 'SREQ0002', 'SYNTH REQ DUA', 25000, 30000, 0)", [`${month()}-06`]);
  await decideMemberRequest(consolePorts(), decider(), 'deduction', 'SREQ-LEG-2', 'reject', { expectedVersion: await versionOf('deduction', 'SREQ-LEG-2'), idempotencyKey: randomUUID(), reason: 'Nominal tidak wajar' });
  const [after] = await q("SELECT potongan_payroll FROM m_simpanan_aktif WHERE nik_kar = 'SREQ0002'");
  assert.equal(Number(after.potongan_payroll), 25_000, 'a rejection never touches the active deduction');
  assert.equal((await ledger('request.deduction.reject', 'SREQ-LEG-2')).reason, 'Nominal tidak wajar');
});

test('legacy fence: deduction decisions fail closed while a legacy request screen is open, unless coexistence is configured', options, async () => {
  await q("INSERT INTO trans_simpanan_pengajuan (doc_no, doc_date, doc_status, jenis_simpanan, nik_kar, nama, potongan_old, potongan, status_notif) VALUES ('SREQ-LEG-3', ?, 'OPEN', 'SIMPANAN SUKARELA', 'SREQ0002', 'SYNTH REQ DUA', 25000, 40000, 0)", [`${month()}-07`]);
  await q("UPDATE ref_menu SET status = 1 WHERE url = 'simpanan/pengajuan_mobile_c'");
  try {
    const v = await versionOf('deduction', 'SREQ-LEG-3');
    await assert.rejects(decideMemberRequest(consolePorts(), decider(), 'deduction', 'SREQ-LEG-3', 'reject', { expectedVersion: v, idempotencyKey: randomUUID(), reason: 'alasan valid' }), { code: 'LEGACY_ACTIVE' });
    const list = await listMemberRequests(consolePorts(), decider(), { type: 'deduction', status: 'OPEN', month: month() });
    assert.deepEqual([list.legacy, list.writable, list.rows.every((r) => !r.canApprove)], ['legacy-active', false, true]);
    const shared = await decideMemberRequest(consolePorts({ deductionShared: true }), decider(), 'deduction', 'SREQ-LEG-3', 'reject', { expectedVersion: v, idempotencyKey: randomUUID(), reason: 'alasan valid' });
    assert.equal(shared.result.status, 'REJECTED');
  } finally { await q("UPDATE ref_menu SET status = 0 WHERE url = 'simpanan/pengajuan_mobile_c'"); }
});

test('approval refuses ambiguous members and NIKs longer than m_simpanan_aktif.nik_kar', options, async () => {
  await q("INSERT INTO trans_simpanan_pengajuan (doc_no, doc_date, doc_status, jenis_simpanan, nik_kar, nama, potongan_old, potongan, status_notif) VALUES ('SREQ-LEG-4', ?, 'OPEN', 'SIMPANAN SUKARELA', 'SREQ0004', 'GANDA', 0, 10000, 0)", [`${month()}-08`]);
  await assert.rejects(decideMemberRequest(consolePorts(), decider(), 'deduction', 'SREQ-LEG-4', 'approve', { expectedVersion: await versionOf('deduction', 'SREQ-LEG-4'), idempotencyKey: randomUUID() }), { code: 'REQUEST_MEMBER_INVALID' });
  const [h] = await q("SELECT doc_status FROM trans_simpanan_pengajuan WHERE doc_no = 'SREQ-LEG-4'");
  assert.equal(h.doc_status, 'OPEN', 'nothing changed');
});

test('least privilege: the request writer cannot touch loans, member identity or the login table', options, async () => {
  await assert.rejects(write.$executeRawUnsafe("UPDATE trans_pinjaman SET doc_status = 'APPROVED' WHERE id = 1"));
  await assert.rejects(write.$executeRawUnsafe("UPDATE m_anggota SET nama_kar = 'X' WHERE id = 9165"));
  await assert.rejects(write.$queryRawUnsafe('SELECT password FROM users LIMIT 1'));
  await assert.rejects(write.$executeRawUnsafe("DELETE FROM trans_simpanan_pengajuan WHERE doc_no = 'SREQ-LEG-4'"));
});
