// The SAME behavioural contract is run against the in-memory fake and (opt-in, on a disposable DB) the real MariaDB store.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newDeadlines, MAX_ACTIVE_SESSIONS, MAX_ROWS_PER_USER } from '@koperasi/domain/auth/session-policy';

const H = (s) => createHash('sha256').update(s).digest();
const T0 = new Date('2026-10-01T05:00:00Z'); const at = (ms) => new Date(T0.getTime() + ms); const HOUR = 3600e3, MIN = 60e3;
const mk = (uid, sid, now, o = {}) => ({ sidHash: H(`${uid}:${sid}`), userId: uid, companyId: o.companyId ?? 1, pwf: 'aa'.repeat(8), now, ...newDeadlines(now) });

export const sessionContract = {
  async createAndFind(t, { make }) {
    const s = await make(); const now = T0; await s.create(mk(1, 'a', now));
    const row = await s.find(H('1:a')); assert.equal(row.userId, 1); assert.equal(row.companyId, 1); assert.equal(row.pwf, 'aa'.repeat(8));
    assert.equal(row.revokedAt, null); assert.equal(row.absExpiresAt.getTime() - now.getTime(), 12 * HOUR); assert.equal(row.idleExpiresAt.getTime() - now.getTime(), 2 * HOUR);
    assert.equal(await s.find(H('1:missing')), null);
  },
  async touchRevokeAndSetCompany(t, { make }) {
    const s = await make(); await s.create(mk(2, 'a', T0));
    assert.equal(await s.touch(H('2:a'), at(10 * MIN), at(10 * MIN + 2 * HOUR), at(10 * MIN - 5 * MIN)), true);
    assert.equal(await s.touch(H('2:a'), at(11 * MIN), at(11 * MIN + 2 * HOUR), at(11 * MIN - 5 * MIN)), false, 'touch is skipped when last_seen is newer than the interval');
    assert.equal((await s.find(H('2:a'))).lastSeenAt.getTime(), at(10 * MIN).getTime());
    assert.equal(await s.setCompany(H('2:a'), 3), true); assert.equal((await s.find(H('2:a'))).companyId, 3);
    assert.equal(await s.setCompany(H('2:a'), 3), true, 'setting the same branch again is still a success');
    assert.equal(await s.revoke(H('2:a'), 'logout', at(20 * MIN)), true);
    assert.equal(await s.revoke(H('2:a'), 'logout', at(21 * MIN)), false, 'idempotent');
    const r = await s.find(H('2:a')); assert.equal(r.revokedReason, 'logout'); assert.equal(r.revokedAt.getTime(), at(20 * MIN).getTime());
    assert.equal(await s.touch(H('2:a'), at(40 * MIN), at(40 * MIN + 2 * HOUR), at(0)), false, 'a revoked session can never be touched back to life');
    assert.equal(await s.setCompany(H('2:a'), 1), false);
  },
  async keepsFiveMostRecentlyActive(t, { make }) {
    const s = await make();
    for (let i = 1; i <= 5; i++) { await s.create(mk(3, `s${i}`, at(-(6 - i) * HOUR))); assert.equal(await s.touch(H(`3:s${i}`), at(-(i === 1 ? 5 : 60 + i * 10) * MIN), at(HOUR), at(99 * HOUR)), true); }
    // s1 is the OLDEST created but the MOST recently active (-5 min); s5 is the least recently active (-110 min)
    await s.create(mk(3, 'new', T0));
    const rows = {}; for (const n of ['s1', 's2', 's3', 's4', 's5', 'new']) rows[n] = await s.find(H(`3:${n}`));
    assert.equal(rows.s1.revokedAt, null, 'oldest-created but most recently active survives');
    assert.equal(rows.s5.revokedReason, 'superseded', 'the least recently active one is superseded');
    for (const n of ['s2', 's3', 's4', 'new']) assert.equal(rows[n].revokedAt, null, n);
    assert.equal(Object.values(rows).filter((r) => r && !r.revokedAt).length, MAX_ACTIVE_SESSIONS);
  },
  async rowCapNeverDeletesAValidSession(t, { make }) {
    const s = await make();
    await s.create(mk(4, 'old-but-active', at(-10 * HOUR)));
    assert.equal(await s.touch(H('4:old-but-active'), at(-1 * MIN), at(2 * HOUR), at(99 * HOUR)), true);
    for (let i = 0; i < MAX_ROWS_PER_USER + 10; i++) { await s.create(mk(4, `dead${i}`, at(-(30 + i) * HOUR))); }   // already absolute-expired when created: dead rows
    await s.create(mk(4, 'fresh', T0));
    const active = await s.find(H('4:old-but-active')); assert.equal(active.revokedAt, null, 'still valid, never revoked');
    assert.ok(active, 'and never trimmed');
    assert.ok(await s.find(H('4:fresh')));
    if (s.countForUser) assert.ok((await s.countForUser(4)) <= MAX_ROWS_PER_USER, 'rows per user capped');
  },
  async otherUsersAreUntouched(t, { make }) {
    const s = await make();
    for (let i = 0; i < 7; i++) await s.create(mk(5, `x${i}`, at(-i * MIN)));
    await s.create(mk(6, 'keep', T0));
    assert.equal((await s.find(H('6:keep'))).revokedAt, null);
    assert.equal(await s.revokeAllForUser(5, 'forced', at(MIN)) >= 5, true);
    assert.equal((await s.find(H('6:keep'))).revokedAt, null);
  },
  async purgeIsBoundedAndSparesLiveSessions(t, { make }) {
    const s = await make();
    await s.create(mk(7, 'live', T0));
    for (let i = 0; i < 12; i++) await s.create({ ...mk(8 + i, 'dead', at(-80 * HOUR)) });
    const far = at(200 * HOUR);
    const first = await s.purge(at(20 * HOUR), 5); assert.equal(first, 5, 'at most `limit` rows per call');
    assert.ok(await s.find(H('7:live')), 'a live session is never purged');
    let total = first; for (let i = 0; i < 5; i++) total += await s.purge(at(20 * HOUR), 5);
    assert.equal(total, 12); assert.ok(await s.find(H('7:live')));
    assert.equal(await s.purge(far, 100) >= 1, true, 'far in the future even the live one is purgeable');
  },
};
