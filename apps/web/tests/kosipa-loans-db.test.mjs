import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaLoanReader } from '../src/infrastructure/repositories/kosipa-loan.repository.ts';
import { listLoans, readLoan } from '@koperasi/application/kosipa/loans';
import { KosipaError } from '@koperasi/domain/kosipa';

// Opt-in: the real SQL adapter against the SYNTHETIC schema kkisi_e2e_legacy (scripts/e2e-seed.mjs) through the SELECT-only e2e account.
//   KOSIPA_LOANS_DB_TEST=1 node --experimental-strip-types --env-file=.env.e2e --test tests/kosipa-loans-db.test.mjs
const ON = process.env.KOSIPA_LOANS_DB_TEST === '1';
const RP = (n) => n * 10000;
const actor = { userId: 1, capabilities: new Set(['kosipa.loan.view']), requestId: 'db-test' };

test('synthetic schema: loan list and detail over the real SQL adapter', { skip: !ON }, async () => {
  const url = new URL(process.env.E2E_READ_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_e2e_legacy'); assert.equal(decodeURIComponent(url.username), 'kkisi_e2e_read');
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  const events = []; const deps = { reader: new PrismaKosipaLoanReader(db), audit: { async append(e) { events.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z') };
  try {
    const all = await listLoans(deps, actor, {});
    assert.deepEqual(all.items.map((i) => i.header.id), [9007, 9006, 9005, 9004, 9003, 9002, 9001], 'newest first');
    const byId = Object.fromEntries(all.items.map((i) => [i.header.id, i]));
    assert.deepEqual(byId[9004].statusFlags, ['REJECTED_BUT_SETTLED']); assert.equal(byId[9004].docDate.kind, 'zero'); assert.equal(byId[9004].disbursedDate.kind, 'zero');
    assert.equal(byId[9002].planPrincipal4, RP(1200000)); assert.equal(byId[9002].header.name, 'SYNTH ANGGOTA TIGA');
    assert.ok(!JSON.stringify(all).includes('77000000') && !JSON.stringify(all).includes('9900770077'), 'salary and bank account are never selected');
    assert.deepEqual((await listLoans(deps, actor, { status: 'REJECTED', bayar: 'LUNAS' })).items.map((i) => i.header.docNo), ['PINSYN9004']);
    assert.deepEqual((await listLoans(deps, actor, { q: 'S9003', cair: 'OPEN' })).items.map((i) => i.header.docNo), ['PINSYN9005', 'PINSYN9004'], 'NIK + disbursement filter (newest first)');
    assert.deepEqual((await listLoans(deps, actor, { q: 'PINSYN900' })).items.length, 7, 'document prefix');
    assert.deepEqual((await listLoans(deps, actor, { q: 'tiga' })).items.length, 6, 'name fragment');
    assert.equal((await listLoans(deps, actor, { q: '%%' })).items.length, 0, 'typed wildcards are literal');
    const p1 = await listLoans(deps, actor, { after: '9004' }); assert.deepEqual(p1.items.map((i) => i.header.id), [9003, 9002, 9001]); assert.equal(p1.nextCursor, null);

    const clean = await readLoan(deps, actor, { docNo: 'PINSYN9002' });
    assert.deepEqual([clean.headerCount, clean.schedule.state, clean.schedule.integrity.issues], [1, 'ok', []]);
    assert.equal(clean.schedule.integrity.recorded.principal4, RP(1200000)); assert.equal(clean.schedule.integrity.recorded.unpaidPrincipal4, RP(1000000)); assert.equal(clean.schedule.integrity.paidRowsWithoutPaidDate, 2);
    assert.equal(clean.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED');
    const big1 = await readLoan(deps, actor, { docNo: 'PINSYN9003' });
    assert.equal(big1.schedule.rows.length, 60); assert.ok(big1.schedule.nextCursor);
    const big2 = await readLoan(deps, actor, { docNo: 'PINSYN9003', after: big1.schedule.nextCursor });
    assert.equal(big2.schedule.rows.length, 10); assert.equal(big2.schedule.nextCursor, null);
    assert.deepEqual([...big1.schedule.rows, ...big2.schedule.rows].map((r) => r.installmentNo), Array.from({ length: 70 }, (_, i) => i + 1), 'every installment exactly once, in order');
    const messy = await readLoan(deps, actor, { docNo: 'PINSYN9001' });
    for (const i of ['PRINCIPAL_SUM_DIFFERS_FROM_PLAN', 'ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS', 'DUE_DATES_UNUSABLE']) assert.ok(messy.schedule.integrity.issues.includes(i), i);
    assert.deepEqual(messy.schedule.integrity.dueDates, { zero: 1, missing: 0, implausible: 1 });
    assert.deepEqual(messy.schedule.rows.map((r) => r.due.kind).sort(), ['date', 'date', 'invalid', 'zero']);
    const dup = await readLoan(deps, actor, { docNo: 'PINSYN9005' });
    assert.equal(dup.headerCount, 2); assert.equal(dup.otherHeaders.length, 1); assert.ok(dup.schedule.integrity.issues.includes('DUPLICATE_HEADER'));
    assert.deepEqual((await readLoan(deps, actor, { docNo: 'PINSYN9007' })).schedule.integrity.issues, ['SCHEDULE_ABSENT']);
    assert.deepEqual((await readLoan(deps, actor, { docNo: 'PINSYN9004' })).schedule.integrity.issues, [], 'rejected loan without schedule is normal');
    assert.equal(await readLoan(deps, actor, { docNo: 'PINSYN9999' }), null);
    assert.ok(events.length >= 10); assert.ok(!JSON.stringify(events).includes('S9003'));
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM trans_pinjaman_dtl WHERE id = 9010'), /denied|command/i);
    await assert.rejects(listLoans(deps, actor, { status: "APPROVED' OR 1=1 --" }), (e) => e instanceof KosipaError);
  } finally { await db.$disconnect(); }
});
