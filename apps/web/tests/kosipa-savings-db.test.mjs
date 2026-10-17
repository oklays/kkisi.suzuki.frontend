import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaSavingsReader } from '../src/infrastructure/repositories/kosipa-savings.repository.ts';
import { PrismaKosipaMemberReader } from '../src/infrastructure/repositories/kosipa-member.repository.ts';
import { readMemberSavings } from '@koperasi/application/kosipa/savings';

// Opt-in: the real SQL adapters against the SYNTHETIC schema kkisi_e2e_legacy (scripts/e2e-seed.mjs) through the SELECT-only e2e account.
//   KOSIPA_SAVINGS_DB_TEST=1 node --experimental-strip-types --env-file=.env.e2e --test tests/kosipa-savings-db.test.mjs
const ON = process.env.KOSIPA_SAVINGS_DB_TEST === '1';
const RP = (n) => Math.round(n * 10000);
const actor = { userId: 1, capabilities: new Set(['kosipa.savings.view', 'kosipa.member.view']), requestId: 'db-test' };

test('synthetic schema: member savings ledger over the real SQL adapters', { skip: !ON }, async () => {
  const url = new URL(process.env.E2E_READ_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_e2e_legacy'); assert.equal(decodeURIComponent(url.username), 'kkisi_e2e_read');
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  const events = []; const deps = { savings: new PrismaKosipaSavingsReader(db), members: new PrismaKosipaMemberReader(db), audit: { async append(e) { events.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z') };
  try {
    const first = await readMemberSavings(deps, actor, { memberId: '9003' });
    assert.deepEqual([first.member.nik, first.officialBalance.reason], ['S9003', 'OFFICIAL_BALANCE_UNVERIFIED']);
    const by = Object.fromEntries(first.summary.data.map((t) => [t.type, t]));
    assert.deepEqual([by['SIMPANAN SUKARELA'].rows, by['SIMPANAN SUKARELA'].posted4, by['SIMPANAN SUKARELA'].pendingDebit4], [61, RP(59762.5), RP(40000)], 'exact sums incl. cash credit, interest and sub-unit interest');
    assert.deepEqual([by['SIMPANAN WAJIB'].rows, by['SIMPANAN WAJIB'].posted4, by['SIMPANAN WAJIB'].voidRows, by['SIMPANAN WAJIB'].unverifiedRows], [4, RP(100000), 1, 2], 'POSTING is "other status"; duplicate and missing headers are unverified, never posted');
    assert.deepEqual([by['SIMPANAN POKOK'].rows, by['SIMPANAN POKOK'].posted4], [1, RP(250000)]);
    const page1 = first.ledger.data; assert.equal(page1.items.length, 50); assert.equal(page1.items[0].id, 9079); assert.ok(page1.nextCursor);
    const page2 = (await readMemberSavings(deps, actor, { memberId: '9003', params: { after: String(page1.nextCursor) } })).ledger.data;
    assert.equal(page2.items.length, 16); assert.equal(page2.nextCursor, null);
    const ids = [...page1.items, ...page2.items].map((i) => i.id);
    assert.equal(new Set(ids).size, 66, 'no overlap, no gap'); assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    const by9 = Object.fromEntries(page2.items.map((i) => [i.id, i]));
    assert.deepEqual([by9[9015].state, by9[9015].flags], ['POSTED', ['DETAIL_STATUS_DIFFERS']], 'header APPROVED wins over detail OPEN');
    assert.deepEqual([by9[9014].state, by9[9014].flags], ['UNVERIFIED', ['HEADER_MISSING']]); assert.deepEqual([by9[9013].state, by9[9013].flags], ['UNVERIFIED', ['HEADER_AMBIGUOUS']]);
    assert.deepEqual([by9[9012].state, by9[9012].opening, by9[9012].date.kind, by9[9012].flags], ['POSTED', true, 'zero', ['DATE_UNUSABLE']]);
    assert.deepEqual([by9[9011].state, by9[9010].state], ['VOID', 'PENDING']);
    const typed = (await readMemberSavings(deps, actor, { memberId: '9003', params: { jenis: 'SIMPANAN POKOK' } })).ledger.data;
    assert.deepEqual(typed.items.map((i) => i.id), [9012]);
    assert.equal((await readMemberSavings(deps, actor, { memberId: '9001' })).ledger.data.items.every((i) => ['SYNSIM9001', 'SYNSIM9002'].includes(i.docNo)), true, 'member isolation');
    assert.equal(await readMemberSavings(deps, actor, { memberId: '99999' }), null);
    assert.ok(!JSON.stringify(first).includes('9900119003') && !JSON.stringify(events).includes('S9003'));
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM trans_simpanan_dtl WHERE id = 9010'), /denied|command/i);
  } finally { await db.$disconnect(); }
});
