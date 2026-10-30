import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { DocumentNumberingService } from '@koperasi/application/kosipa/document-numbering';
import { PrismaDocumentNumberRepository } from '../src/infrastructure/repositories/kosipa-document-number.ts';
import { runCommandTransaction } from '../src/infrastructure/db/kosipa-unit-of-work.ts';

// TASK-109 document numbering against the ISOLATED synthetic stack only (integration/kosipa-full-access/local-stack.mjs setup).
// Opt-in: KOSIPA_FA01=1. The numbering writer `kfa_numbering_w` holds exactly what a future document writer needs for numbering:
// SELECT(doc_no) on the numbered tables, SELECT on ref_menu (fence), SELECT, INSERT on the ledger database. No business row is written:
// row-id allocations use synthetic ids. Each run uses its own far-future periods, so reruns on one stack never see each other's numbers.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const db = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'numbering', stack.DB, 4) }) : null;
test.after(async () => { await db?.$disconnect(); });

const service = stack ? new DocumentNumberingService(new PrismaDocumentNumberRepository(stack.LEDGER_DB)) : null;
const REGISTRY = () => `\`${stack.LEDGER_DB}\`.kosipa_document_number`;
const errno = (e) => (/\b(1142|1143|1062|4025)\b/.exec(String(e?.message)) ?? [])[1];
// A Jakarta-month instant in a run-private period (2100..2899), mid-month so no boundary is involved.
const RUN_YEAR = 2100 + Math.floor(Math.random() * 800);
const month = (m) => new Date(Date.UTC(RUN_YEAR, m - 1, 15, 3));
const periodOf = (m) => `${RUN_YEAR}${String(m).padStart(2, '0')}`;
const registryRows = (scheme, period) => db.$queryRawUnsafe(`SELECT seq, doc_no, request_id FROM ${REGISTRY()} WHERE scheme = ? AND period = ? ORDER BY seq`, scheme, period);

const tx = (fn) => db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
const reg = (now, requestId = randomUUID()) => ({ scheme: 'member-registration', table: 'm_anggota', now, requestId });
const command = (key, requestHash = 'a'.repeat(64)) => ({
  command: 'test.numbering.allocate', capability: 'kosipa.master.manage', idempotencyKey: key, requestHash, requestId: randomUUID(),
  actorConsoleUserId: stack.USERS.operator, actorKosipaUserId: 9102, subjectType: 'document-number', subjectRef: 'new',
});
const allocateCommand = (key, now) => runCommandTransaction(db, command(key), {
  lock: async () => null,
  run: async (t) => { const result = await service.allocate(t, reg(now)); return { result, ledger: { toState: 'ISSUED' } }; },
}, { ledgerDatabase: stack.LEDGER_DB, legacyControllers: ['master/lokasi_c'] });

test('registry is append-only for the writer; it cannot read any other column of the numbered tables', options, async () => {
  await assert.rejects(db.$executeRawUnsafe(`UPDATE ${REGISTRY()} SET doc_no = doc_no WHERE id = 1`), (e) => errno(e) === '1142');
  await assert.rejects(db.$executeRawUnsafe(`DELETE FROM ${REGISTRY()} WHERE id = 1`), (e) => errno(e) === '1142', 'a committed number can never be released');
  await assert.rejects(db.$queryRaw`SELECT nik FROM m_anggota LIMIT 1`, (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(db.$queryRaw`SELECT plan_pinjaman FROM trans_pinjaman LIMIT 1`, (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(db.$executeRaw`UPDATE m_anggota SET doc_no = doc_no WHERE id = 9101`, (e) => errno(e) === '1142');
});

test('legacy floor: the first native REG number of a month is above every legacy-written REG number of that month', options, async () => {
  // Seed (local-stack): m_anggota holds legacy numbers REG2026100007 and REG2026100003 for October 2026.
  const now = new Date('2026-10-20T03:00:00Z');
  const before = await registryRows('member-registration', '202610');
  const registryMax = before.length ? Number(before.at(-1).seq) : 0;
  const issued = await tx((t) => service.allocate(t, reg(now)));
  assert.equal(issued.period, '202610');
  assert.equal(issued.sequence, Math.max(7, registryMax) + 1);
  assert.match(issued.docNo, /^REG202610\d{4,}$/);
  assert.equal(issued.docNo, `REG202610${String(issued.sequence).padStart(4, '0')}`, 'legacy 4-digit pattern');
});

test('20 simultaneous allocations in one period -> 20 distinct, consecutive numbers, all committed in the registry', options, async () => {
  const now = month(1);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => allocateCommand(randomUUID(), now)));
  const failed = results.filter((r) => r.status === 'rejected');
  assert.deepEqual(failed.map((r) => r.reason?.code ?? String(r.reason)), [], 'every allocation commits (deadlocks are retried by the unit of work)');
  const numbers = results.map((r) => r.value.result.sequence).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 20 }, (_, i) => i + 1));
  const rows = await registryRows('member-registration', periodOf(1));
  assert.deepEqual(rows.map((r) => r.doc_no), numbers.map((n) => `REG${periodOf(1)}${String(n).padStart(4, '0')}`));
});

test('rollback releases an uncommitted number; a committed number is never issued again', options, async () => {
  const now = month(2);
  await assert.rejects(tx(async (t) => { const n = await service.allocate(t, reg(now)); assert.equal(n.sequence, 1); throw new Error('document write failed'); }), /document write failed/);
  assert.deepEqual(await registryRows('member-registration', periodOf(2)), [], 'nothing of the rolled-back transaction remains');
  const first = await tx((t) => service.allocate(t, reg(now)));
  assert.equal(first.sequence, 1, 'the number was never committed, so it may be issued now');
  const second = await tx((t) => service.allocate(t, reg(now)));
  assert.equal(second.sequence, 2);
  // Even a writer that tries to claim a committed number directly is refused by the unique keys.
  await assert.rejects(db.$executeRawUnsafe(`INSERT INTO ${REGISTRY()} (scheme, period, seq, doc_no, subject_table, request_id, created_at) VALUES ('member-registration', ?, 1, ?, 'm_anggota', 'x', UTC_TIMESTAMP(3))`, periodOf(2), first.docNo), (e) => errno(e) === '1062');
  await assert.rejects(db.$executeRawUnsafe(`INSERT INTO ${REGISTRY()} (scheme, period, seq, doc_no, subject_table, request_id, created_at) VALUES ('savings-withdrawal', ?, 99, ?, 'trans_simpanan', 'x', UTC_TIMESTAMP(3))`, periodOf(2), first.docNo), (e) => errno(e) === '1062', 'doc_no is unique across schemes');
  // Gaps are allowed and keep their place: after a cancelled document (status change, no delete) numbering continues above it.
  const third = await tx((t) => service.allocate(t, reg(now)));
  assert.equal(third.sequence, 3);
});

test('idempotent retry: the same command replays the stored number and allocates nothing', options, async () => {
  const now = month(3); const key = randomUUID();
  const first = await allocateCommand(key, now);
  const again = await allocateCommand(key, now);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.result, first.result);
  assert.equal((await registryRows('member-registration', periodOf(3))).length, 1);
  const next = await allocateCommand(randomUUID(), now);
  assert.equal(next.result.sequence, first.result.sequence + 1);
});

test('row-id schemes: number = the new row id; clashes with legacy or native numbers are refused, never renumbered', options, async () => {
  const id = 600000 + Math.floor(Math.random() * 300000);
  const loan = (rowId, now = month(4)) => ({ scheme: 'loan', table: 'trans_pinjaman', now, rowId, requestId: randomUUID() });
  const issued = await tx((t) => service.allocate(t, loan(id)));
  assert.deepEqual(issued, { docNo: `PIN${periodOf(4)}${id}`, scheme: 'loan', period: periodOf(4), sequence: id });
  await assert.rejects(tx((t) => service.allocate(t, loan(id))), { code: 'DOCUMENT_NUMBER_CONFLICT' }, 'already issued natively');
  // Seed: trans_pinjaman 9101 carries the legacy-format number PIN20261000777.
  await assert.rejects(tx((t) => service.allocate(t, loan(777, new Date('2026-10-20T03:00:00Z')))), { code: 'DOCUMENT_NUMBER_CONFLICT' }, 'already in the legacy table');
  const pot = await tx((t) => service.allocate(t, { scheme: 'payroll-batch', table: 'trans_potongan_bulanan', now: month(5), documentPeriod: periodOf(4), rowId: id, requestId: randomUUID() }));
  assert.equal(pot.docNo, `POT${periodOf(4)}${id}`, 'payroll batches take the payroll period, not the clock');
});

test('explicit scope: wrong table, missing or forbidden row id and period are refused before any database access', options, async () => {
  const now = month(6);
  await assert.rejects(tx((t) => service.allocate(t, { ...reg(now), table: 'trans_simpanan' })), { code: 'NUMBERING_SCOPE_MISMATCH' });
  await assert.rejects(tx((t) => service.allocate(t, { scheme: 'loan', table: 'trans_pinjaman', now, requestId: 'x' })), { code: 'NUMBERING_ROW_ID_REQUIRED' });
  await assert.rejects(tx((t) => service.allocate(t, { ...reg(now), rowId: 5 })), { code: 'NUMBERING_ROW_ID_NOT_ALLOWED' });
  await assert.rejects(tx((t) => service.allocate(t, { ...reg(now), documentPeriod: periodOf(6) })), { code: 'NUMBERING_PERIOD_NOT_ALLOWED' });
  await assert.rejects(tx((t) => service.allocate(t, { scheme: 'shu', table: 'x', now, requestId: 'x' })), { code: 'NUMBERING_SCHEME_UNKNOWN' });
  assert.deepEqual(await registryRows('member-registration', periodOf(6)), []);
});
