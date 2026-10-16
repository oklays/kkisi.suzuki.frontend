import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { assertConnectionBudget, assertProductionConsole, assertProductionReadAndAuth, expectedServer } from '../src/infrastructure/db/deployment-guard.ts';
import { consoleStoreUsable, kosipaReadEnabled } from '../src/infrastructure/console/config.ts';

// Synthetic values only.
const dsn = (user, db, limit = 1) => `mysql://${user}:pw@db.prod.invalid:3306/${db}?connection_limit=${limit}&max_idle_connection_lifetime=10`;
const PROD = {
  APP_ENV: 'production', APP_ORIGIN: 'https://pos.prod.invalid', AUTH_SECRETS: `k1:${randomBytes(48).toString('base64')}`,
  LEGACY_DB_TRANSPORT: 'direct', LEGACY_DB_HOST: 'db.prod.invalid', LEGACY_DB_PORT: '3306', LEGACY_DB_NAME: 'n0000000_shop', LEGACY_DB_TLS: 'disabled-acknowledged', ALLOW_REMOTE_LEGACY_DB: 'true', LEGACY_DB_SERVER_HOSTNAME: 'db.prod.invalid', LEGACY_DB_SERVER_PORT: '3306',
  AUTH_DB_TRANSPORT: 'direct', AUTH_DB_HOST: 'db.prod.invalid', AUTH_DB_PORT: '3306', AUTH_DB_NAME: 'n0000000_auth', AUTH_DB_TLS: 'disabled-acknowledged', ALLOW_REMOTE_AUTH_DB: 'true', AUTH_DB_SERVER_HOSTNAME: 'db.prod.invalid', AUTH_DB_SERVER_PORT: '3306',
  CONSOLE_DB_TRANSPORT: 'direct', CONSOLE_DB_HOST: 'db.prod.invalid', CONSOLE_DB_PORT: '3306', CONSOLE_DB_NAME: 'n0000000_console', CONSOLE_DB_TLS: 'disabled-acknowledged', ALLOW_REMOTE_CONSOLE_DB: 'true', CONSOLE_DB_SERVER_HOSTNAME: 'db.prod.invalid', CONSOLE_DB_SERVER_PORT: '3306',
  LEGACY_DB_CONNECTION_BUDGET: '12',
  DATABASE_URL: dsn('n0000000_read', 'n0000000_shop', 4), DATABASE_URL_AUTH: dsn('n0000000_auth', 'n0000000_auth', 1),
  DATABASE_URL_CONSOLE: dsn('n0000000_nxcon', 'n0000000_console', 1),
};

test('console store is optional: absent -> null; present -> full production allowlist', () => {
  const others = assertProductionReadAndAuth(PROD);
  assert.equal(assertProductionConsole({ ...PROD, DATABASE_URL_CONSOLE: undefined }, others), null);
  const c = assertProductionConsole(PROD, others);
  assert.equal(c.database, 'n0000000_console');
  assert.deepEqual(expectedServer('console', PROD), { hostname: 'db.prod.invalid', port: '3306', transport: 'direct' });
  const bad = (patch, reason) => assert.throws(() => assertProductionConsole({ ...PROD, ...patch }, others), (e) => e.reason === reason);
  bad({ ALLOW_REMOTE_CONSOLE_DB: undefined }, 'ALLOW_REMOTE_CONSOLE_DB');
  bad({ CONSOLE_DB_NAME: 'kkisi_console_staging' }, 'CONSOLE_DB_NAME');
  bad({ DATABASE_URL_CONSOLE: dsn('kkisi_console', 'n0000000_console') }, 'CONSOLE_DSN_USER');
  bad({ DATABASE_URL_CONSOLE: dsn('root', 'n0000000_console') }, 'CONSOLE_DSN_USER');
  bad({ DATABASE_URL_CONSOLE: dsn('n0000000_nxcon', 'n0000000_shop') }, 'CONSOLE_DSN_TARGET');
  bad({ DATABASE_URL_CONSOLE: dsn('n0000000_nxcon', 'n0000000_console', 5) }, 'CONSOLE_DSN_CONNECTION_LIMIT');
});

test('console store must be a third account AND database, never the reader or the auth store', () => {
  const others = assertProductionReadAndAuth(PROD);
  assert.throws(() => assertProductionConsole({ ...PROD, DATABASE_URL_CONSOLE: dsn('n0000000_read', 'n0000000_console') }, others), (e) => e.reason === 'CONSOLE_SHARES_STORE');
  assert.throws(() => assertProductionConsole({ ...PROD, CONSOLE_DB_NAME: 'n0000000_auth', DATABASE_URL_CONSOLE: dsn('n0000000_nxcon', 'n0000000_auth') }, others), (e) => e.reason === 'CONSOLE_SHARES_STORE');
});

test('budget: the console pool counts against the same server budget; 11 existing + 1 = 12 fits, one more does not', () => {
  const { legacy, auth } = assertProductionReadAndAuth(PROD);
  const consoleDsn = assertProductionConsole(PROD, { legacy, auth });
  // Documented allocation (deploy/genesis/env.production.example, 13 Oct 2026 = 11/11): reader 3, auth 2, POS 2, register 1,
  // returns 1, inventory 1, products 1. The 11 + console 1 = 12 is exactly the guard's ceiling.
  const pool = (user, connectionLimit) => ({ ...legacy, user, connectionLimit });
  const eleven = [pool('read', 3), { ...auth, connectionLimit: 2 }, pool('pos', 2), pool('reg', 1), pool('ret', 1), pool('inv', 1), pool('prd', 1)];
  assert.equal(assertConnectionBudget(eleven, PROD).used, 11);
  assert.deepEqual(assertConnectionBudget([...eleven, consoleDsn], PROD), { used: 12, budget: 12 });
  assert.throws(() => assertConnectionBudget([...eleven, { ...consoleDsn, connectionLimit: 2 }], PROD), (e) => e.reason === 'CONNECTION_BUDGET_EXCEEDED');
  assert.throws(() => assertConnectionBudget([...eleven, consoleDsn], { ...PROD, LEGACY_DB_CONNECTION_BUDGET: '11' }), (e) => e.reason === 'CONNECTION_BUDGET_EXCEEDED', 'the budget must be raised explicitly, never silently');
});

test('local console store: loopback, separate account and database; anything else is unusable (fail closed)', () => {
  const LOCAL = { DATABASE_URL: 'mysql://kkisi_read:x@127.0.0.1:3307/kkisi_staging', DATABASE_URL_AUTH: 'mysql://kkisi_auth:x@127.0.0.1:3307/kkisi_auth_staging' };
  assert.equal(consoleStoreUsable(LOCAL), false, 'not configured');
  assert.equal(consoleStoreUsable({ ...LOCAL, DATABASE_URL_CONSOLE: 'mysql://kkisi_console:x@127.0.0.1:3307/kkisi_console_staging' }), true);
  for (const url of ['mysql://kkisi_console:x@10.0.0.5:3307/kkisi_console_staging', 'mysql://root:x@127.0.0.1:3307/kkisi_console_staging', 'mysql://kkisi_read:x@127.0.0.1:3307/kkisi_console_staging', 'mysql://kkisi_console:x@127.0.0.1:3307/kkisi_auth_staging', 'not a url']) {
    assert.equal(consoleStoreUsable({ ...LOCAL, DATABASE_URL_CONSOLE: url }), false, url);
  }
  assert.equal(kosipaReadEnabled({}), false); assert.equal(kosipaReadEnabled({ KOSIPA_READ_ENABLED: '1' }), false); assert.equal(kosipaReadEnabled({ KOSIPA_READ_ENABLED: 'true' }), true);
});
