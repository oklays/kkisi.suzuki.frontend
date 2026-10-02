import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { StoreUnavailableError } from '@koperasi/domain/auth/errors';
import { dbErrorNumber, isRetryable, withStoreRetry } from '../src/infrastructure/auth/store-errors.ts';
import { PrismaSessionStore } from '../src/infrastructure/auth/prisma-session-store.ts';
import { PrismaThrottleStore } from '../src/infrastructure/auth/prisma-throttle-store.ts';
import { PrismaUserRepository } from '../src/infrastructure/auth/prisma-legacy-repositories.ts';

const rawError = (n, extra = '') => new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`${n}\`. Message: \`secret detail mysql://user:pw@host ${extra}\``, { code: 'P2010', clientVersion: 'x', meta: { code: String(n), message: 'secret detail' } });
const logs = []; const log = (e, f) => logs.push({ e, ...f });

test('deadlock (1213) and lock-wait (1205) are retried at most twice, then 503', async () => {
  for (const n of [1213, 1205]) {
    let attempts = 0; logs.length = 0;
    await assert.rejects(withStoreRetry(log, 't', async () => { attempts++; throw rawError(n); }, 1), StoreUnavailableError);
    assert.equal(attempts, 3, `1 try + 2 retries for ${n}`);
  }
  let calls = 0;
  assert.equal(await withStoreRetry(log, 't', async () => { calls++; if (calls < 3) throw rawError(1213); return 'ok'; }, 1), 'ok');
  assert.equal(calls, 3);
  let p2034 = 0; assert.equal(await withStoreRetry(log, 't', async () => { if (p2034++ < 1) throw new Prisma.PrismaClientKnownRequestError('x', { code: 'P2034', clientVersion: 'x' }); return 1; }, 1), 1);
});

test('lost connection, pool cap, auth/permission errors and unknown errors fail immediately (no retry) as 503', async () => {
  const cases = [new Prisma.PrismaClientInitializationError('Can\'t reach database server at 127.0.0.1:3307 secret', 'x', 'P1001'),
    new Prisma.PrismaClientKnownRequestError('Server has closed the connection secret', { code: 'P1017', clientVersion: 'x' }),
    rawError(1226), rawError(1040), rawError(2013), rawError(1142), new Error('anything else')];
  for (const error of cases) {
    let attempts = 0;
    await assert.rejects(withStoreRetry(log, 't', async () => { attempts++; throw error; }, 1), (e) => e instanceof StoreUnavailableError && !String(e.message).includes('secret'));
    assert.equal(attempts, 1, error.message.slice(0, 30));
  }
  assert.equal(isRetryable(rawError(1213)), true); assert.equal(isRetryable(rawError(1226)), false);
  assert.equal(dbErrorNumber(rawError(1213)), 1213); assert.equal(dbErrorNumber(new Error('nothing')), null);
});

test('store errors are logged with codes only: never SQL, host, credentials or driver text', async () => {
  logs.length = 0;
  await assert.rejects(withStoreRetry(log, 'session_find', async () => { throw rawError(2013, 'mysql://u:pw@h'); }, 1));
  const text = JSON.stringify(logs); assert.match(text, /store_error/); assert.doesNotMatch(text, /secret|mysql:|pw@|host/);
});

test('real adapters against a DEAD database: every call is StoreUnavailableError quickly (connection lost / retries exhausted)', async () => {
  // Nothing listens on this loopback port; the driver fails to connect.
  const db = new PrismaClient({ datasourceUrl: 'mysql://kkisi_auth:pw@127.0.0.1:1/kkisi_auth_staging?connect_timeout=2&pool_timeout=2&connection_limit=1' });
  const sessions = new PrismaSessionStore(db, log), throttle = new PrismaThrottleStore(db, log), users = new PrismaUserRepository(db, log);
  const now = new Date('2026-10-01T00:00:00Z'); const key = { kind: 'user', keyHash: Buffer.alloc(32, 1) };
  try {
    const started = Date.now();
    const results = await Promise.allSettled([
      sessions.find(Buffer.alloc(32, 2)), sessions.create({ sidHash: Buffer.alloc(32, 3), userId: 1, companyId: 1, pwf: 'aa'.repeat(8), now, idleExpiresAt: now, absExpiresAt: now, purgeAfter: now }),
      sessions.revoke(Buffer.alloc(32, 2), 'logout', now), throttle.activeLocks([key], now), throttle.clear([key]), users.findByUsername('x'),
    ]);
    for (const r of results) { assert.equal(r.status, 'rejected'); assert.ok(r.reason instanceof StoreUnavailableError, String(r.reason?.message).slice(0, 60)); }
    assert.ok(Date.now() - started < 20000, 'fails promptly, no hang');
  } finally { await db.$disconnect(); }
});
