import type { RevokeReason, StoredSession } from '../../domain/auth/session.ts';
import type { ThrottleKey, ThrottleKind } from '../../domain/auth/throttle-policy.ts';

/** Legacy `db_users` joined with its role and branch. The hash is used only for verification and the fingerprint. */
export type UserRecord = {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  companyId: number;
  status: number;
  roleStatus: number | null;      // null = role row missing
  companyStatus: number | null;   // null = branch row missing
  passwordHash: string;
};

export type Company = { id: number; name: string };
export type OpenRegister = { id: number; noref: string; idKasir: number; noKasir: string | null; openedOn: string; stale: boolean };

/** Reads legacy tables through the SELECT-only account. Never writes. */
export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>;
  findById(id: number): Promise<UserRecord | null>;
}
export interface PermissionRepository { has(roleId: number, slug: string): Promise<boolean>; }
export interface CompanyRepository {
  findActive(id: number): Promise<Company | null>;
  listActive(): Promise<Company[]>;
}
export interface RegisterRepository {
  /** Most recent open register of this user in this branch, plus how many are open (a data anomaly when > 1). */
  findOpen(userId: number, companyId: number, now: Date): Promise<{ register: OpenRegister | null; openCount: number }>;
  hasOpenOutside(userId: number, companyId: number): Promise<boolean>;
  listKasir(companyId: number): Promise<{ id: number; noKasir: string }[]>;
}

export type NewSession = {
  sidHash: Buffer; userId: number; companyId: number; pwf: string; now: Date;
  idleExpiresAt: Date; absExpiresAt: Date; purgeAfter: Date;
};

/** Auth store (schema kkisi_auth_staging), written only through the `kkisi_auth` account. */
export interface SessionStore {
  /** One atomic step: serialise per user, insert, keep the 5 most recently ACTIVE valid sessions, trim only dead rows to 50. */
  create(session: NewSession): Promise<void>;
  find(sidHash: Buffer): Promise<StoredSession | null>;
  /** Slide last_seen/idle only if the session is still un-revoked and last_seen is not newer than `olderThan`. */
  touch(sidHash: Buffer, now: Date, idleExpiresAt: Date, olderThan: Date): Promise<boolean>;
  revoke(sidHash: Buffer, reason: RevokeReason, now: Date): Promise<boolean>;
  revokeAllForUser(userId: number, reason: RevokeReason, now: Date): Promise<number>;
  setCompany(sidHash: Buffer, companyId: number): Promise<boolean>;
  purge(now: Date, limit: number): Promise<number>;
}

export type FailureRecord = { key: ThrottleKey; limit: number; now: Date; windowMs: number; lockMs: number; purgeAfter: Date };
export interface ThrottleStore {
  /** Locks that are active AND within the sane bound; impossible ones (clock jump) are ignored. */
  activeLocks(keys: ThrottleKey[], now: Date): Promise<{ kind: ThrottleKind; lockedUntil: Date }[]>;
  recordFailure(record: FailureRecord): Promise<void>;
  clear(keys: ThrottleKey[]): Promise<void>;
  purge(now: Date, limit: number): Promise<number>;
}

export interface PasswordVerifier { verify(password: string, hash: string): Promise<boolean>; }
export interface Clock { now(): Date; }
export interface Random { bytes(size: number): Buffer; }
export type Logger = (event: string, fields?: Record<string, string | number | boolean>) => void;

export type AuthDeps = {
  clock: Clock;
  random: Random;
  log: Logger;
  users: UserRepository;
  permissions: PermissionRepository;
  companies: CompanyRepository;
  registers: RegisterRepository;
  sessions: SessionStore;
  throttle: ThrottleStore;
  verifier: PasswordVerifier;
  /** Keys derived with HMAC so the store never holds a readable username or IP. */
  throttleKeys(username: string, ip: string | null): ThrottleKey[];
};
