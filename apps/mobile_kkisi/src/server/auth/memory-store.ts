import type { MemberSessionStore, PinCredentialRow, RevokeReason, SessionRow, ThrottlePolicy, ThrottleState } from './types.ts';

/**
 * In-process store for local development and tests only (loadAuthSettings refuses it when APP_ENV=production): sessions vanish
 * on restart and are not shared between processes, so revocation would not reach another instance.
 */
export class MemoryMemberSessionStore implements MemberSessionStore {
  private readonly sessions = new Map<string, SessionRow>();
  private readonly throttles = new Map<string, ThrottleState>();
  private readonly pinCredentials = new Map<number, PinCredentialRow>();

  async insert(row: SessionRow) { this.sessions.set(row.idHash, { ...row }); }
  async find(idHashes: string[]) {
    for (const h of idHashes) { const s = this.sessions.get(h); if (s) return { ...s }; }
    return null;
  }
  async update(idHash: string, patch: Partial<SessionRow>) {
    const s = this.sessions.get(idHash);
    if (s) this.sessions.set(idHash, { ...s, ...patch });
  }
  async rotate(oldHash: string, row: SessionRow) {
    const old = this.sessions.get(oldHash);
    if (!old || old.revokedAt) throw new Error('SESSION_GONE');
    this.sessions.set(oldHash, { ...old, revokedAt: row.createdAt, revokeReason: 'rotated' });
    this.sessions.set(row.idHash, { ...row });
  }
  async revokeUser(userId: number, reason: RevokeReason, now: Date) {
    let n = 0;
    for (const [k, s] of this.sessions) if (s.userId === userId && !s.revokedAt) { this.sessions.set(k, { ...s, revokedAt: now, revokeReason: reason }); n++; }
    return n;
  }
  async revokePinSessions(userId: number, reason: RevokeReason, now: Date) {
    let n = 0;
    for (const [k, s] of this.sessions) if (s.userId === userId && s.stage === 'pin' && !s.revokedAt) { this.sessions.set(k, { ...s, revokedAt: now, revokeReason: reason }); n++; }
    return n;
  }
  async pinCredentialGet(userId: number) {
    const c = this.pinCredentials.get(userId);
    return c ? { ...c } : null;
  }
  async pinCredentialSet(row: PinCredentialRow) {
    this.pinCredentials.set(row.userId, { ...row });
  }
  async throttleGet(key: string) { const t = this.throttles.get(key); return t ? { ...t } : null; }
  async throttleSet(key: string, state: ThrottleState) { this.throttles.set(key, { ...state }); }
  async throttleHit(key: string, p: ThrottlePolicy) {
    // Synchronous read-modify-write: atomic within this single process (the only place the memory store is allowed).
    const s = this.throttles.get(key);
    const fresh = !s || p.now.getTime() - s.windowStart.getTime() > p.windowMs;
    const failures = fresh ? 1 : s.failures + 1;
    const next = { failures, windowStart: fresh ? p.now : s.windowStart, lockedUntil: failures >= p.limit ? new Date(p.now.getTime() + p.lockMs) : null };
    this.throttles.set(key, next);
    return { ...next };
  }
  async throttleClear(key: string) { this.throttles.delete(key); }
  async purge(now: Date) {
    for (const [k, s] of this.sessions) if (s.absExpiresAt.getTime() + 86_400_000 < now.getTime()) this.sessions.delete(k);
  }
}
