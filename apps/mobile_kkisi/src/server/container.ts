import type { Pool } from 'mysql2/promise';
import { loadAuthSettings, loadReaderSettings, type AuthSettings, type ReaderSettings } from '../lib/config/env.ts';
import type { AuthDeps } from './auth/auth-service.ts';
import { MemoryMemberSessionStore } from './auth/memory-store.ts';
import { MysqlMemberSessionStore } from './auth/mysql-store.ts';
import { WorkerPasswordVerifier } from './auth/password-verifier.ts';
import type { MemberSessionStore } from './auth/types.ts';
import { pool } from './db/mysql.ts';
import { MysqlMemberIdentityReader } from './kosipa/identity.reader.ts';

// Composition root. Built lazily on first use and cached per process; a configuration error is thrown (fail closed) and is
// rendered by the app as "layanan belum tersedia", never as a fallback to defaults.
type Cache = { memoryStore?: MemoryMemberSessionStore; verifier?: WorkerPasswordVerifier };
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
    now: () => new Date(),
    log,
  };
}
