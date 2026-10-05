import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { assertConnectionBudget, assertProductionDsn, assertProductionReadAndAuth, expectedServer, isProduction } from '../src/infrastructure/db/deployment-guard.ts';
import { loadAuthConfig, parseAppOrigin } from '../src/infrastructure/auth/config.ts';
import { validatePosWriteConfig } from '../src/infrastructure/db/prisma-pos-write.ts';
import { validateRegisterWriteConfig } from '../src/infrastructure/db/prisma-register-write.ts';
import { validateInventoryWriteConfig } from '../src/infrastructure/db/prisma-inventory-write.ts';
import { validateProductWriteConfig } from '../src/infrastructure/db/prisma-product-write.ts';

// Synthetic values only: no real host, account or password.
const Q = '?connection_limit=3&max_idle_connection_lifetime=10';
const dsn = (user, host = 'db.prod.invalid', port = 3306, db = 'n0000000_shop') => `mysql://${user}:pw@${host}:${port}/${db}${Q}`;
const PROD = {
  APP_ENV: 'production',
  APP_ORIGIN: 'https://pos.prod.invalid',
  AUTH_SECRETS: `k1:${randomBytes(48).toString('base64')}`,
  LEGACY_DB_TRANSPORT: 'direct', LEGACY_DB_HOST: 'db.prod.invalid', LEGACY_DB_PORT: '3306', LEGACY_DB_NAME: 'n0000000_shop', LEGACY_DB_TLS: 'disabled-acknowledged', ALLOW_REMOTE_LEGACY_DB: 'true',
  LEGACY_DB_SERVER_HOSTNAME: 'db.prod.invalid', LEGACY_DB_SERVER_PORT: '3306',
  AUTH_DB_TRANSPORT: 'direct', AUTH_DB_HOST: 'db.prod.invalid', AUTH_DB_PORT: '3306', AUTH_DB_NAME: 'n0000000_auth', AUTH_DB_TLS: 'disabled-acknowledged', ALLOW_REMOTE_AUTH_DB: 'true',
  AUTH_DB_SERVER_HOSTNAME: 'db.prod.invalid', AUTH_DB_SERVER_PORT: '3306',
  LEGACY_DB_CONNECTION_BUDGET: '12',
  DATABASE_URL: dsn('n0000000_read'),
  DATABASE_URL_AUTH: dsn('n0000000_auth', 'db.prod.invalid', 3306, 'n0000000_auth'),
};
const WRITES = {
  ALLOW_PRODUCTION_DB_WRITE: 'true', POS_WRITES_ENABLED: '1', POS_WRITE_DATABASE: 'n0000000_shop',
  DATABASE_URL_WRITE: dsn('n0000000_pos'), DATABASE_URL_REGISTER_WRITE: dsn('n0000000_reg'),
};

test('APP_ENV: unset/local keeps local mode, production is explicit, anything else fails closed', () => {
  assert.equal(isProduction({}), false);
  assert.equal(isProduction({ APP_ENV: 'local' }), false);
  assert.equal(isProduction({ APP_ENV: 'production' }), true);
  for (const v of ['prod', 'Production', 'staging', 'development']) assert.throws(() => isProduction({ APP_ENV: v }));
});

test('local mode is unchanged: a production-shaped configuration without APP_ENV is still refused', () => {
  const { APP_ENV, ...local } = PROD;
  void APP_ENV;
  assert.throws(() => loadAuthConfig(local), (e) => e.code === 'NOT_CONFIGURED');
  assert.throws(() => validatePosWriteConfig({ ...local, ...WRITES }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
});

test('production origin must be HTTPS on a non-loopback host; the cookie becomes __Host- + Secure', () => {
  assert.deepEqual(parseAppOrigin('https://pos.prod.invalid', true), { origin: 'https://pos.prod.invalid', secure: true });
  for (const bad of ['http://pos.prod.invalid', 'https://127.0.0.1', 'https://localhost:3000', 'https://0.0.0.0', 'https://pos.prod.invalid/x'])
    assert.throws(() => parseAppOrigin(bad, true));
  const config = loadAuthConfig(PROD);
  assert.equal(config.cookieName, '__Host-kkisi_sid');
  assert.equal(config.secure, true);
});

test('production read/auth DSNs must match the explicit allowlist exactly', () => {
  assert.equal(assertProductionReadAndAuth(PROD).legacy.database, 'n0000000_shop');
  const bad = (patch, reason) => assert.throws(() => assertProductionReadAndAuth({ ...PROD, ...patch }), (e) => e.reason === reason || e.reason?.startsWith(reason));
  bad({ DATABASE_URL: dsn('n0000000_read', '127.0.0.1') }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: dsn('n0000000_read', 'other.invalid') }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: dsn('n0000000_read', 'db.prod.invalid', 3307) }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: dsn('n0000000_read', 'db.prod.invalid', 3306, 'kkisi_staging') }, 'LEGACY_DSN_TARGET');
  bad({ LEGACY_DB_HOST: 'localhost' }, 'LEGACY_DB_HOST');
  bad({ LEGACY_DB_HOST: '127.0.0.1' }, 'LEGACY_DB_HOST');
  bad({ LEGACY_DB_NAME: 'kkisi_staging' }, 'LEGACY_DB_NAME');
  bad({ LEGACY_DB_PORT: '' }, 'LEGACY_DB_PORT');
  bad({ ALLOW_REMOTE_LEGACY_DB: '1' }, 'ALLOW_REMOTE_LEGACY_DB');
  bad({ ALLOW_REMOTE_AUTH_DB: undefined }, 'ALLOW_REMOTE_AUTH_DB');
  bad({ LEGACY_DB_TLS: undefined }, 'LEGACY_DB_TLS');
  for (const user of ['root', 'admin', 'kkisi_read', 'kkisi_pos_runtime', 'shop_staging', 'e2e_reader', '%72oot'])
    bad({ DATABASE_URL: dsn(user) }, 'LEGACY_DSN_USER');
  bad({ DATABASE_URL: 'mysql://n0000000_read@db.prod.invalid:3306/n0000000_shop' + Q }, 'LEGACY_DSN_USER');
  bad({ DATABASE_URL: 'postgres://n0000000_read:pw@db.prod.invalid:3306/n0000000_shop' + Q }, 'LEGACY_DSN_PROTOCOL');
  bad({ DATABASE_URL_AUTH: dsn('n0000000_read', 'db.prod.invalid', 3306, 'n0000000_auth') }, 'AUTH_SHARES_LEGACY');
  bad({ AUTH_DB_NAME: 'n0000000_shop', DATABASE_URL_AUTH: dsn('n0000000_auth') }, 'AUTH_SHARES_LEGACY');
});

test('production pools are small and recycled before the server wait_timeout', () => {
  const base = 'mysql://n0000000_read:pw@db.prod.invalid:3306/n0000000_shop';
  assert.equal(assertProductionDsn('legacy', `${base}?connection_limit=4&max_idle_connection_lifetime=15`, PROD).connectionLimit, 4);
  for (const q of ['', '?max_idle_connection_lifetime=10', '?connection_limit=5&max_idle_connection_lifetime=10', '?connection_limit=0&max_idle_connection_lifetime=10',
    '?connection_limit=3', '?connection_limit=3&max_idle_connection_lifetime=20', '?connection_limit=3&max_idle_connection_lifetime=0'])
    assert.throws(() => assertProductionDsn('legacy', base + q, PROD));
});

test('TLS: certificate validation is never disabled, and required TLS needs sslaccept=strict', () => {
  const base = `mysql://n0000000_read:pw@db.prod.invalid:3306/n0000000_shop${Q}`;
  assert.throws(() => assertProductionDsn('legacy', `${base}&sslaccept=accept_invalid_certs`, PROD));
  assert.throws(() => assertProductionDsn('legacy', base, { ...PROD, LEGACY_DB_TLS: 'required' }));
  assert.ok(assertProductionDsn('legacy', `${base}&sslaccept=strict`, { ...PROD, LEGACY_DB_TLS: 'required' }));
});

test('connection budget: sum of pools on the legacy host must stay within LEGACY_DB_CONNECTION_BUDGET (max 12)', () => {
  const { legacy, auth } = assertProductionReadAndAuth(PROD);
  assert.deepEqual(assertConnectionBudget([legacy, auth], PROD), { used: 6, budget: 12 });
  assert.throws(() => assertConnectionBudget([legacy, auth], { ...PROD, LEGACY_DB_CONNECTION_BUDGET: '5' }), (e) => e.reason === 'CONNECTION_BUDGET_EXCEEDED');
  for (const b of [undefined, '0', '13', '20', 'x']) assert.throws(() => assertConnectionBudget([legacy], { ...PROD, LEGACY_DB_CONNECTION_BUDGET: b }));
  const otherServerAuth = { ...auth, host: 'auth-db', server: 'auth-db:3306' };
  assert.equal(assertConnectionBudget([legacy, otherServerAuth], PROD).used, 3);
});

test('production writes need ALLOW_PRODUCTION_DB_WRITE, the module flag, the production database and separate accounts', () => {
  const env = { ...PROD, ...WRITES };
  assert.equal(validatePosWriteConfig(env), new URL(WRITES.DATABASE_URL_WRITE).href);
  assert.equal(validateRegisterWriteConfig(env), new URL(WRITES.DATABASE_URL_REGISTER_WRITE).href);
  const refused = (patch) => assert.throws(() => validatePosWriteConfig({ ...env, ...patch }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
  refused({ ALLOW_PRODUCTION_DB_WRITE: undefined });
  refused({ ALLOW_PRODUCTION_DB_WRITE: '1' });
  refused({ POS_WRITES_ENABLED: '0' });
  refused({ POS_WRITE_DATABASE: 'kkisi_staging' });
  refused({ DATABASE_URL_WRITE: dsn('n0000000_read') });
  refused({ DATABASE_URL_WRITE: dsn('root') });
  refused({ DATABASE_URL_WRITE: dsn('n0000000_pos', '127.0.0.1', 3307, 'kkisi_staging') });
  refused({ APP_ENV: 'prod' });
  assert.throws(() => validateRegisterWriteConfig({ ...env, DATABASE_URL_REGISTER_WRITE: WRITES.DATABASE_URL_WRITE }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
});

test('inventory and product writers use the same production allowlist (no staging port/database pin in production)', () => {
  const env = { ...PROD, ...WRITES, INVENTORY_WRITES_ENABLED: '1', DATABASE_URL_INVENTORY_WRITE: dsn('n0000000_inv'), PRODUCTS_WRITES_ENABLED: '1', DATABASE_URL_PRODUCT_WRITE: dsn('n0000000_prd') };
  assert.equal(validateInventoryWriteConfig(env), new URL(env.DATABASE_URL_INVENTORY_WRITE).href);
  assert.equal(validateProductWriteConfig(env), new URL(env.DATABASE_URL_PRODUCT_WRITE).href);
  assert.throws(() => validateProductWriteConfig({ ...env, ALLOW_PRODUCTION_DB_WRITE: undefined }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
  assert.throws(() => validateProductWriteConfig({ ...env, DATABASE_URL_PRODUCT_WRITE: dsn('n0000000_pos') }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
  assert.throws(() => validateInventoryWriteConfig({ ...env, DATABASE_URL_INVENTORY_WRITE: dsn('n0000000_reg') }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
});

// SSH tunnel: the local end of the tunnel is 127.0.0.1, accepted ONLY with an explicit ssh-tunnel transport.
const TQ = '?connection_limit=3&max_idle_connection_lifetime=10';
const TUNNEL = {
  ...PROD,
  LEGACY_DB_TRANSPORT: 'ssh-tunnel', LEGACY_DB_HOST: '127.0.0.1', LEGACY_DB_PORT: '3307', LEGACY_DB_TLS: undefined, ALLOW_REMOTE_LEGACY_DB: undefined,
  AUTH_DB_TRANSPORT: 'ssh-tunnel', AUTH_DB_HOST: '127.0.0.1', AUTH_DB_PORT: '3307', AUTH_DB_TLS: undefined, ALLOW_REMOTE_AUTH_DB: undefined,
  DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3307/n0000000_shop${TQ}`,
  DATABASE_URL_AUTH: `mysql://n0000000_auth:pw@127.0.0.1:3307/n0000000_auth${TQ}`,
};

test('transport must be declared explicitly; loopback without ssh-tunnel is still refused', () => {
  for (const t of [undefined, '', 'tunnel', 'ssh', 'DIRECT']) assert.throws(() => assertProductionReadAndAuth({ ...PROD, LEGACY_DB_TRANSPORT: t }), (e) => e.reason === 'LEGACY_DB_TRANSPORT');
  // A direct target pointed at the tunnel port is refused: production + localhost is never automatic.
  assert.throws(() => assertProductionReadAndAuth({ ...TUNNEL, LEGACY_DB_TRANSPORT: 'direct', ALLOW_REMOTE_LEGACY_DB: 'true', LEGACY_DB_TLS: 'disabled-acknowledged' }), (e) => e.reason === 'LEGACY_DB_HOST');
});

test('ssh-tunnel accepts exactly 127.0.0.1, pins the remote server identity, and keeps every DSN rule', () => {
  const { legacy, auth } = assertProductionReadAndAuth(TUNNEL);
  assert.equal(legacy.host, '127.0.0.1');
  assert.equal(legacy.server, 'db.prod.invalid:3306');
  assert.equal(auth.server, legacy.server);
  assert.deepEqual(expectedServer('legacy', TUNNEL), { hostname: 'db.prod.invalid', port: '3306', transport: 'ssh-tunnel' });
  assert.equal(loadAuthConfig(TUNNEL).cookieName, '__Host-kkisi_sid');
  const bad = (patch, reason) => assert.throws(() => assertProductionReadAndAuth({ ...TUNNEL, ...patch }), (e) => e.reason === reason);
  for (const host of ['localhost', '::1', '0.0.0.0', 'db.prod.invalid', 'kkisi-db-tunnel']) bad({ LEGACY_DB_HOST: host }, 'LEGACY_DB_HOST');
  bad({ LEGACY_DB_SERVER_HOSTNAME: undefined }, 'LEGACY_DB_SERVER_HOSTNAME');
  bad({ LEGACY_DB_SERVER_HOSTNAME: 'localhost' }, 'LEGACY_DB_SERVER_HOSTNAME');
  bad({ LEGACY_DB_SERVER_HOSTNAME: '127.0.0.1' }, 'LEGACY_DB_SERVER_HOSTNAME');
  bad({ LEGACY_DB_SERVER_PORT: '' }, 'LEGACY_DB_SERVER_PORT');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3306/n0000000_shop${TQ}` }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@localhost:3307/n0000000_shop${TQ}` }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3307/kkisi_staging${TQ}` }, 'LEGACY_DSN_TARGET');
  bad({ DATABASE_URL: `mysql://kkisi_read:pw@127.0.0.1:3307/n0000000_shop${TQ}` }, 'LEGACY_DSN_USER');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3307/n0000000_shop?connection_limit=3` }, 'LEGACY_DSN_IDLE_LIFETIME');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3307/n0000000_shop?connection_limit=8&max_idle_connection_lifetime=10` }, 'LEGACY_DSN_CONNECTION_LIMIT');
  bad({ DATABASE_URL_AUTH: `mysql://n0000000_auth:pw@127.0.0.1:3307/n0000000_shop${TQ}`, AUTH_DB_NAME: 'n0000000_shop' }, 'AUTH_SHARES_LEGACY');
  bad({ DATABASE_URL: `mysql://n0000000_read:pw@127.0.0.1:3307/n0000000_shop${TQ}&sslaccept=accept_invalid_certs` }, 'LEGACY_DSN_TLS');
});

test('connection budget counts every client on the same pinned server, whatever the path', () => {
  const { legacy, auth } = assertProductionReadAndAuth(TUNNEL);
  assert.deepEqual(assertConnectionBudget([legacy, auth], TUNNEL), { used: 6, budget: 12 });
  const directAuth = assertProductionDsn('auth', dsn('n0000000_auth', 'db.prod.invalid', 3306, 'n0000000_auth'), PROD);
  assert.equal(assertConnectionBudget([legacy, directAuth], TUNNEL).used, 6);
});

test('production writes through the tunnel keep every write gate', () => {
  const W = { ...WRITES, DATABASE_URL_WRITE: `mysql://n0000000_pos:pw@127.0.0.1:3307/n0000000_shop${TQ}`, DATABASE_URL_REGISTER_WRITE: `mysql://n0000000_reg:pw@127.0.0.1:3307/n0000000_shop${TQ}` };
  assert.equal(validatePosWriteConfig({ ...TUNNEL, ...W }), new URL(W.DATABASE_URL_WRITE).href);
  for (const patch of [{ ALLOW_PRODUCTION_DB_WRITE: 'false' }, { POS_WRITES_ENABLED: '0' }, { LEGACY_DB_TRANSPORT: 'direct' }, { DATABASE_URL_WRITE: `mysql://n0000000_read:pw@127.0.0.1:3307/n0000000_shop${TQ}` }])
    assert.throws(() => validatePosWriteConfig({ ...TUNNEL, ...W, ...patch }), (e) => e.code === 'WRITE_NOT_CONFIGURED');
});
