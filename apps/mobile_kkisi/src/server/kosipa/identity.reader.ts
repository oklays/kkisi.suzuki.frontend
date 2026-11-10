import type { AccountRow, IdentityQuery, MemberIdentityReader, MemberRow } from '../auth/types.ts';
import { query, type Db } from './sql.ts';

// smartkkisi `users` (member login account) + KOSIPA `m_anggota` (member record), linked by NIK. Only the columns needed to
// authenticate are selected; `password_hit`, wallet balances, documents and tokens are never read.
const COLUMN: Record<IdentityQuery['kind'], string> = { nik: 'nik', email: 'email', phone: 'phone' };

export class MysqlMemberIdentityReader implements MemberIdentityReader {
  private readonly db: Db;
  constructor(db: Db) { this.db = db; }

  async findAccounts(q: IdentityQuery, limit: number): Promise<AccountRow[]> {
    const r = await query<{ id: string; nik: string; password: string; is_active: number | null; is_delete: number | null }>(this.db,
      `SELECT id, nik, password, is_active, is_delete FROM users WHERE ${COLUMN[q.kind]} IN (?) ORDER BY id LIMIT ?`, [q.keys, limit]);
    return r.map((x) => ({ userId: Number(x.id), nik: x.nik ?? '', passwordHash: x.password ?? '', active: Number(x.is_active) === 1, deleted: Number(x.is_delete) === 1 }));
  }

  async storedPin(userId: number): Promise<string | null> {
    const r = await query<{ pin: string | null }>(this.db, 'SELECT pin FROM users WHERE id = ? LIMIT 1', [userId]);
    return r[0]?.pin ?? null;
  }

  async accountState(userId: number) {
    const r = await query<{ is_active: number | null; is_delete: number | null }>(this.db, 'SELECT is_active, is_delete FROM users WHERE id = ? LIMIT 1', [userId]);
    return r[0] ? { active: Number(r[0].is_active) === 1, deleted: Number(r[0].is_delete) === 1 } : null;
  }

  async memberByNik(nikKeys: string[]): Promise<MemberRow[]> {
    const r = await query<{ id: string; nik: string; name: string | null; status: string | null }>(this.db,
      'SELECT id, nik_kar AS nik, nama_kar AS name, status_anggota AS status FROM m_anggota WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 5', [nikKeys]);
    return r.map((x) => ({ memberId: Number(x.id), nik: x.nik, name: x.name ?? '', status: x.status }));
  }
}
