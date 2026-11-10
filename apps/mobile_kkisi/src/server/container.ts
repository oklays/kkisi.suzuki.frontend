import type { Pool } from 'mysql2/promise';
import {
  loadAuthSettings, loadFeatureFlags, loadReaderSettings, loadWriterSettings,
  type AuthSettings, type FeatureFlags, type ReaderSettings,
} from '../lib/config/env.ts';
import type { AuthDeps } from './auth/auth-service.ts';
import { MemoryMemberSessionStore } from './auth/memory-store.ts';
import { MysqlMemberSessionStore } from './auth/mysql-store.ts';
import { WorkerPasswordVerifier } from './auth/password-verifier.ts';
import type { MemberSessionStore } from './auth/types.ts';
import { pool } from './db/mysql.ts';
import { MysqlMemberIdentityReader } from './kosipa/identity.reader.ts';
import {
  MemberMutationService, MemoryCommandLedgerStore, MysqlCommandLedgerStore, type CommandLedgerStore,
} from './writers/member-mutations.ts';

// Composition root. Built lazily on first use and cached per process; a configuration error is thrown (fail closed) and is
// rendered by the app as "layanan belum tersedia", never as a fallback to defaults.
type Cache = { memoryStore?: MemoryMemberSessionStore; memoryLedger?: MemoryCommandLedgerStore; verifier?: WorkerPasswordVerifier };
const g = globalThis as typeof globalThis & { __kkisiMobile?: Cache };
const cache = (g.__kkisiMobile ??= {});

export function log(event: string, detail: Record<string, string | number | boolean | null> = {}): void {
  // One JSON line per event. Callers never pass identities, NIKs, IPs, PINs or secrets.
  console.info(JSON.stringify({ at: new Date().toISOString(), app: 'mobile_kkisi', event, ...detail }));
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
 * A writer flag is only active when BOTH the flag is true AND its required writer backend is configured.
 */
export function featureFlags(env = process.env): FeatureFlags {
  try {
    const raw = loadFeatureFlags(env);
    const hasWriter = loadWriterSettings(env) !== null;
    return {
      enableLoanApplication: raw.enableLoanApplication && hasWriter,
      enableDeductionChange: raw.enableDeductionChange && hasWriter,
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
    identity: new MysqlMemberIdentityReader(readerDb(env)),
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
    companyId: reader.catalogCompanyId,
    now: () => new Date(),
  });
}
