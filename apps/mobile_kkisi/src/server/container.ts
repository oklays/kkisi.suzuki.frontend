import type { Pool } from 'mysql2/promise';
import {
  loadAuthSettings, loadFeatureFlags, loadIntakeSettings, loadQrSigningKey, loadReaderSettings, loadWriterSettings,
  type AuthSettings, type FeatureFlags, type ReaderSettings,
} from '../lib/config/env.ts';
import type { AuthDeps } from './auth/auth-service.ts';
import { MemoryMemberSessionStore } from './auth/memory-store.ts';
import { MysqlMemberSessionStore } from './auth/mysql-store.ts';
import { WorkerPasswordVerifier } from './auth/password-verifier.ts';
import type { MemberSessionStore } from './auth/types.ts';
import { pool } from './db/mysql.ts';
import { currentRequestId } from './observability/metrics.ts';
import { MysqlMemberIdentityReader } from './kosipa/identity.reader.ts';
import { withCachedAccountState } from './cache/cached-reads.ts';
import {
  MemberMutationService, MemoryCommandLedgerStore, MysqlCommandLedgerStore, type CommandLedgerStore,
} from './writers/member-mutations.ts';
import { HttpMemberIntakeClient } from './writers/intake-client.ts';

// Composition root. Built lazily on first use and cached per process; a configuration error is thrown (fail closed) and is
// rendered by the app as "layanan belum tersedia", never as a fallback to defaults.
type Cache = { memoryStore?: MemoryMemberSessionStore; memoryLedger?: MemoryCommandLedgerStore; verifier?: WorkerPasswordVerifier };
const g = globalThis as typeof globalThis & { __kkisiMobile?: Cache };
const cache = (g.__kkisiMobile ??= {});

export function log(event: string, detail: Record<string, string | number | boolean | null> = {}): void {
  // One JSON line per event. Callers never pass identities, NIKs, IPs, PINs or secrets.
  const requestId = currentRequestId();
  console.info(JSON.stringify({ at: new Date().toISOString(), app: 'mobile_kkisi', event, ...(requestId ? { requestId } : {}), ...detail }));
}

export function readerSettings(env = process.env): ReaderSettings { return loadReaderSettings(env); }
export function readerDb(env = process.env): Pool {
  const s = loadReaderSettings(env);
  return pool('reader', s.dsn.url, s.poolLimit);
}

export function authDb(env = process.env): Pool | null {
  const s = loadAuthSettings(env);
  return s.store.kind === 'mysql' ? pool('auth', s.store.dsn.url, 2) : null;
}

export function writerDb(env = process.env): Pool | null {
  const w = loadWriterSettings(env);
  return w ? pool('writer', w.dsn.url, w.poolLimit) : null;
}

/**
 * Effective server-side feature capabilities (WS-03 §5.7).
 * A writer flag is only active when BOTH the flag is true AND its backend is configured: loan application and deduction change need the
 * apps/web intake channel (P1); favourites and checkout need the PWA's own writer account.
 */
export function featureFlags(env = process.env): FeatureFlags {
  try {
    const raw = loadFeatureFlags(env);
    const hasWriter = loadWriterSettings(env) !== null;
    const hasIntake = loadIntakeSettings(env) !== null;
    return {
      enableLoanApplication: raw.enableLoanApplication && hasIntake,
      enableDeductionChange: raw.enableDeductionChange && hasIntake,
      enableStoreCheckout: raw.enableStoreCheckout && hasWriter,
      enablePpob: false, // External IAK provider contract is not member-facing; always fail-closed on server
      enableMemberFavouritesWrite: raw.enableMemberFavouritesWrite && hasWriter,
    };
  } catch {
    return {
      enableLoanApplication: false,
      enableDeductionChange: false,
      enableStoreCheckout: false,
      enablePpob: false,
      enableMemberFavouritesWrite: false,
    };
  }
}

function sessionStore(settings: AuthSettings): MemberSessionStore {
  if (settings.store.kind === 'memory') return (cache.memoryStore ??= new MemoryMemberSessionStore());
  return new MysqlMemberSessionStore(pool('auth', settings.store.dsn.url, 2));
}

export function authDeps(env = process.env): AuthDeps & { settings: AuthSettings } {
  const settings = loadAuthSettings(env);
  return {
    settings,
    identity: withCachedAccountState(new MysqlMemberIdentityReader(readerDb(env)), accountStateCacheMs(env)),
    store: sessionStore(settings),
    verifier: (cache.verifier ??= new WorkerPasswordVerifier()),
    secrets: settings.secrets,
    pinPeppers: settings.pinPeppers,
    now: () => new Date(),
    log,
  };
}

function commandLedger(settings: AuthSettings): CommandLedgerStore {
  if (settings.store.kind === 'memory') return (cache.memoryLedger ??= new MemoryCommandLedgerStore());
  return new MysqlCommandLedgerStore(pool('auth', settings.store.dsn.url, 2));
}

export function mutationService(env = process.env): MemberMutationService {
  const settings = loadAuthSettings(env);
  const reader = loadReaderSettings(env);
  return new MemberMutationService({
    flags: featureFlags(env),
    secrets: settings.secrets,
    store: sessionStore(settings),
    ledger: commandLedger(settings),
    readerDb: readerDb(env),
    writerDb: writerDb(env),
    intake: intakeClient(env),
    companyId: reader.catalogCompanyId,
    now: () => new Date(),
  });
}

function intakeClient(env = process.env): HttpMemberIntakeClient | null {
  try {
    const s = loadIntakeSettings(env);
    return s ? new HttpMemberIntakeClient(s) : null;
  } catch { return null; }   // misconfigured: the flags above are already off (fail closed)
}

/** Signing key of the dynamic member QR, or null when not configured (or malformed: fail closed, the screen says QR is unavailable). */
export function qrSigningKey(env = process.env) {
  try { return loadQrSigningKey(env); } catch { return null; }
}

/** MEMBER_ACCOUNT_STATE_CACHE_MS: 0..120000, default 30000 (P2). Out of range = default. */
function accountStateCacheMs(env = process.env): number {
  const raw = env.MEMBER_ACCOUNT_STATE_CACHE_MS;
  const n = raw === undefined || raw === '' ? 30_000 : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 120_000 ? n : 30_000;
}
