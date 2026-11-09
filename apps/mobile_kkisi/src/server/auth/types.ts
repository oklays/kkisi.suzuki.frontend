// Ports of member authentication. The identity source is the EXISTING smartkkisi member account (`users`, Laravel bcrypt
// password + member PIN) linked to the KOSIPA member record (`m_anggota`) by NIK. Nothing here creates a new identity.

export type IdentityKind = 'nik' | 'email' | 'phone';
/** `keys`: every stored spelling to try; `canonical`: one stable spelling (throttle key). */
export type IdentityQuery = { kind: IdentityKind; keys: string[]; canonical: string };

/** One smartkkisi `users` row, only the columns authentication needs (never `password_hit`, wallets or documents). */
export type AccountRow = { userId: number; nik: string; passwordHash: string; active: boolean; deleted: boolean };

/** The KOSIPA member a session acts for. */
export type MemberRow = { memberId: number; nik: string; name: string; status: string | null };

export interface MemberIdentityReader {
  findAccounts(query: IdentityQuery, limit: number): Promise<AccountRow[]>;
  /** Raw stored PIN (legacy: 4 plain digits; a bcrypt hash is also accepted). Read only to compare, never returned to a client. */
  storedPin(userId: number): Promise<string | null>;
  /** Re-read on every request so a deactivated or deleted account loses access immediately. */
  accountState(userId: number): Promise<{ active: boolean; deleted: boolean } | null>;
  memberByNik(nikKeys: string[]): Promise<MemberRow[]>;
}

export interface PasswordVerifier { verify(password: string, hash: string): Promise<boolean> }

export type SessionStage = 'pin' | 'active';
export type RevokeReason = 'logout' | 'pin_locked' | 'rotated' | 'account_disabled' | 'expired';

export type SessionRow = {
  idHash: string;             // HMAC of the session id; the raw id exists only in the member's cookie
  kid: string;
  userId: number;
  memberId: number;
  nik: string;
  stage: SessionStage;
  pinFailures: number;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absExpiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
};

export type ThrottleState = { failures: number; windowStart: Date; lockedUntil: Date | null };

export interface MemberSessionStore {
  insert(row: SessionRow): Promise<void>;
  find(idHashes: string[]): Promise<SessionRow | null>;
  update(idHash: string, patch: Partial<Pick<SessionRow, 'stage' | 'pinFailures' | 'lastSeenAt' | 'idleExpiresAt' | 'revokedAt' | 'revokeReason'>>): Promise<void>;
  /** Atomically revoke `oldHash` (reason rotated) and insert `row` (session-id rotation after the PIN step). */
  rotate(oldHash: string, row: SessionRow): Promise<void>;
  revokeUser(userId: number, reason: RevokeReason, now: Date): Promise<number>;
  throttleGet(keyHash: string): Promise<ThrottleState | null>;
  throttleSet(keyHash: string, state: ThrottleState): Promise<void>;
  throttleClear(keyHash: string): Promise<void>;
  purge(now: Date): Promise<void>;
}

export type AuthLogger = (event: string, detail?: Record<string, string | number | boolean | null>) => void;
