import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaOpsReportReader } from '../src/infrastructure/repositories/kosipa-ops-report.repository.ts';
import { readMembershipReport, readSavingsMovementReport } from '@koperasi/application/kosipa/reports-ops';

// Opt-in: the operational report adapter against the SYNTHETIC schema kkisi_e2e_legacy through the SELECT-only e2e account.
//   KOSIPA_OPS_REPORTS_DB_TEST=1 node --experimental-strip-types --env-file=.env.e2e --test tests/kosipa-ops-reports-db.test.mjs
const ON = process.env.KOSIPA_OPS_REPORTS_DB_TEST === '1';
const RP = (n) => Math.round(n * 10000);
const actor = { userId: 1, capabilities: new Set(['kosipa.member.view', 'kosipa.savings.view']), requestId: 'db-test' };

test('synthetic schema: membership and savings movement reports over the real SQL adapter', { skip: !ON }, async () => {
  const url = new URL(process.env.E2E_READ_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_e2e_legacy'); assert.equal(decodeURIComponent(url.username), 'kkisi_e2e_read');
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  const events = []; const deps = { reader: {}, ops: new PrismaKosipaOpsReportReader(db), audit: { async append(e) { events.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z') };
  try {
    const m = await readMembershipReport(deps, actor); assert.equal(m.state, 'ok');
    assert.equal(m.data.total, 3); assert.deepEqual(m.data.lines.map((l) => [l.status, l.employment, l.members, l.withExitDate, l.exitDateBeforeToday, l.withoutNik]), [['AKTIVE', 'TETAP', 2, 0, 0, 0], ['AKTIVE', 'KONTRAK', 1, 1, 1, 0]]);
    assert.deepEqual(m.data.groups, [{ group: 'ANGGOTA', members: 3, known: true }]); assert.deepEqual(m.data.unrecognised, { status: 0, employment: 0, group: 0 });
    assert.ok(!JSON.stringify(m).match(/S900|SYNTH|@example/), 'no NIK, name or contact in the result');

    const s = await readSavingsMovementReport(deps, actor, {}); assert.equal(s.state, 'ok'); const r = s.data;
    assert.deepEqual([r.year, r.years], [2026, [2026]]);
    const line = (b, t) => r.lines.find((l) => l.bucket === b && l.type === t);
    const suk = line('2026-05', 'SIMPANAN SUKARELA');
    assert.deepEqual([suk.rows, suk.posted4, suk.pending4, suk.voidRows], [61, { credit: RP(60250), debit: RP(500), interest: RP(12.5) }, { credit: 0, debit: RP(40000) }, 0], 'exact sums incl. cash credit and sub-unit interest; OPEN header = pending');
    const waj = line('2026-05', 'SIMPANAN WAJIB'); assert.deepEqual([waj.rows, waj.posted4.credit, waj.voidRows], [2, RP(100000), 1], 'POSTING is "other status"');
    assert.deepEqual(line('2026-09', 'SIMPANAN WAJIB').posted4, { credit: RP(500000), debit: 0, interest: RP(1000) });
    assert.deepEqual(line('2026-10', 'SIMPANAN SUKARELA').pending4, { credit: 0, debit: RP(100000) });
    assert.deepEqual(r.unplaced.map((u) => [u.kind, u.type, u.rows]), [['DATE_UNUSABLE', 'SIMPANAN POKOK', 1], ['HEADER_AMBIGUOUS', 'SIMPANAN WAJIB', 1], ['HEADER_MISSING', 'SIMPANAN WAJIB', 1]], 'zero date, duplicated header and missing header are counted apart');
    assert.equal((await readSavingsMovementReport(deps, actor, { tahun: '2024' })).data.lines.length, 0);
    assert.equal(events.length, 3);
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM m_anggota WHERE id = 9001'), /denied|command/i);
  } finally { await db.$disconnect(); }
});
