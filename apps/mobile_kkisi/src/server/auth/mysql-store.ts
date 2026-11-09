import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { rows, StoreUnavailableError } from '../db/mysql.ts';
import type { MemberSessionStore, RevokeReason, SessionRow, ThrottleState } from './types.ts';

type Row = {
  id_hash: string; kid: string; user_id: string | number; member_id: string | number; nik: string; stage: 'pin' | 'active'; pin_failures: number;
  created_at: string; last_seen_at: string; idle_expires_at: string; abs_expires_at: string; revoked_at: string | null; revoke_reason: string | null;
};
// DATETIME(3) values are written and read as UTC text, so the server time zone never shifts a deadline.
const toSql = (d: Date) => d.toISOString().slice(0, 23).replace('T', ' ');
const fromSql = (s: string) => new Date(`${s.replace(' ', 'T')}Z`);
const map = (r: Row): SessionRow => ({
  idHash: r.id_hash, kid: r.kid, userId: Number(r.user_id), memberId: Number(r.member_id), nik: r.nik, stage: r.stage, pinFailures: Number(r.pin_failures),
  createdAt: fromSql(r.created_at), lastSeenAt: fromSql(r.last_seen_at), idleExpiresAt: fromSql(r.idle_expires_at), absExpiresAt: fromSql(r.abs_expires_at),
  revokedAt: r.revoked_at ? fromSql(r.revoked_at) : null, revokeReason: (r.revoke_reason as RevokeReason | null) ?? null,
});
const COLS: Record<string, string> = { stage: 'stage', pinFailures: 'pin_failures', lastSeenAt: 'last_seen_at', idleExpiresAt: 'idle_expires_at', revokedAt: 'revoked_at', revokeReason: 'revoke_reason' };

export class MysqlMemberSessionStore implements MemberSessionStore {
  private readonly db: Pool;
  constructor(db: Pool) { this.db = db; }

  async insert(r: SessionRow) {
    await rows(this.db, `INSERT INTO member_sessions (id_hash, kid, user_id, member_id, nik, stage, pin_failures, created_at, last_seen_at, idle_expires_at, abs_expires_at, revoked_at, revoke_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [r.idHash, r.kid, r.userId, r.memberId, r.nik, r.stage, r.pinFailures, toSql(r.createdAt), toSql(r.lastSeenAt), toSql(r.idleExpiresAt), toSql(r.absExpiresAt)]);
  }

  async find(idHashes: string[]) {
    if (idHashes.length === 0) return null;
    const found = await rows<Row>(this.db, 'SELECT * FROM member_sessions WHERE id_hash IN (?) LIMIT 1', [idHashes]);
    return found[0] ? map(found[0]) : null;
  }

  async update(idHash: string, patch: Partial<SessionRow>) {
    const sets: string[] = [], values: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = COLS[k];
      if (!col) continue;                                   // closed column list: nothing else can be written
      sets.push(`${col} = ?`);
      values.push(v instanceof Date ? toSql(v) : v);
    }
    if (sets.length) await rows(this.db, `UPDATE member_sessions SET ${sets.join(', ')} WHERE id_hash = ?`, [...values, idHash]);
  }

  async rotate(oldHash: string, r: SessionRow) {
    const conn = await this.db.getConnection().catch(() => { throw new StoreUnavailableError(); });
    try {
      await conn.beginTransaction();
      const [res] = await conn.query<ResultSetHeader>("UPDATE member_sessions SET revoked_at = ?, revoke_reason = 'rotated' WHERE id_hash = ? AND revoked_at IS NULL", [toSql(r.createdAt), oldHash]);
      if (res.affectedRows !== 1) throw new Error('SESSION_GONE');   // a concurrent PIN submit already used this session
      await conn.query(`INSERT INTO member_sessions (id_hash, kid, user_id, member_id, nik, stage, pin_failures, created_at, last_seen_at, idle_expires_at, abs_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`, [r.idHash, r.kid, r.userId, r.memberId, r.nik, r.stage, toSql(r.createdAt), toSql(r.lastSeenAt), toSql(r.idleExpiresAt), toSql(r.absExpiresAt)]);
      await conn.commit();
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      throw e instanceof Error && e.message === 'SESSION_GONE' ? e : new StoreUnavailableError();
    } finally { conn.release(); }
  }

  async revokeUser(userId: number, reason: RevokeReason, now: Date) {
    const res = await rows<ResultSetHeader>(this.db, 'UPDATE member_sessions SET revoked_at = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL', [toSql(now), reason, userId]);
    return (res as unknown as ResultSetHeader).affectedRows ?? 0;
  }

  async throttleGet(key: string): Promise<ThrottleState | null> {
    const r = await rows<{ failures: number; window_start: string; locked_until: string | null }>(this.db, 'SELECT failures, window_start, locked_until FROM member_auth_throttle WHERE key_hash = ?', [key]);
    return r[0] ? { failures: Number(r[0].failures), windowStart: fromSql(r[0].window_start), lockedUntil: r[0].locked_until ? fromSql(r[0].locked_until) : null } : null;
  }
  async throttleSet(key: string, s: ThrottleState) {
    await rows(this.db, `INSERT INTO member_auth_throttle (key_hash, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE failures = VALUES(failures), window_start = VALUES(window_start), locked_until = VALUES(locked_until)`,
    [key, s.failures, toSql(s.windowStart), s.lockedUntil ? toSql(s.lockedUntil) : null]);
  }
  async throttleClear(key: string) { await rows(this.db, 'DELETE FROM member_auth_throttle WHERE key_hash = ?', [key]); }

  async purge(now: Date) {
    const day = toSql(new Date(now.getTime() - 86_400_000));
    await rows(this.db, 'DELETE FROM member_sessions WHERE abs_expires_at < ? LIMIT 200', [day]);
    await rows(this.db, 'DELETE FROM member_auth_throttle WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?) LIMIT 200', [day, toSql(now)]);
  }
}
