// Isolated synthetic stack for the PWA tests: its OWN MariaDB container (never kkisi-staging or the KOSIPA FA stack), the legacy
// DDL subset (db/fixtures/legacy-schema.sql, no real rows), the PWA auth schema, least-privilege accounts and fictitious members.
// Usage: node integration/stack.mjs up|seed|status|down
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { seed } from './seed.mjs';

const CONTAINER = 'kkisi-mobile-test';
const PORT = 3324;
const IMAGE = 'mariadb:11.4';
const app = new URL('../', import.meta.url);
const configFile = new URL('.local/stack.json', app);
const LEGACY_DB = 'kkisi_mobile_legacy';
const AUTH_DB = 'kkisi_member_auth';
const VIEW_DB = 'kkisi_member_view';   // the reader's only schema: views over LEGACY_DB (db/reader/001_member_read_views.sql)

const docker = (args, input) => execFileSync('docker', args, { input, stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
const running = () => spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { encoding: 'utf8' }).stdout.trim() === 'true';
const secret = () => randomBytes(18).toString('base64url');
export const loadConfig = () => (existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null);

function sql(rootPassword, statements, database = '') {
  docker(['exec', '-i', '-e', `MYSQL_PWD=${rootPassword}`, CONTAINER, 'mariadb', '-uroot', ...(database ? [database] : [])], statements);
}

async function waitReady(rootPassword) {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('docker', ['exec', '-e', `MYSQL_PWD=${rootPassword}`, CONTAINER, 'mariadb', '-uroot', '-e', 'SELECT 1'], { encoding: 'utf8' });
    if (r.status === 0) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('MariaDB did not become ready');
}

async function up() {
  let cfg = loadConfig();
  if (!cfg || !cfg.writerPassword) {
    cfg = {
      port: PORT,
      rootPassword: cfg?.rootPassword ?? secret(),
      readerPassword: cfg?.readerPassword ?? secret(),
      authPassword: cfg?.authPassword ?? secret(),
      writerPassword: cfg?.writerPassword ?? secret(),
      authSecret: cfg?.authSecret ?? `k1:${randomBytes(32).toString('base64')}`,
    };
    mkdirSync(new URL('.local/', app), { recursive: true });
    writeFileSync(configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  }
  if (!running()) {
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
    docker(['run', '-d', '--name', CONTAINER, '-p', `127.0.0.1:${PORT}:3306`, '-e', `MARIADB_ROOT_PASSWORD=${cfg.rootPassword}`,
      '--label', 'purpose=kkisi-mobile-pwa-synthetic-tests', IMAGE, '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--sql-mode=']);
  }
  await waitReady(cfg.rootPassword);
  const schema = readFileSync(new URL('db/fixtures/legacy-schema.sql', app), 'utf8');
  const auth = readFileSync(new URL('db/auth/001_member_auth.sql', app), 'utf8');
  const views = readFileSync(new URL('db/reader/001_member_read_views.sql', app), 'utf8').replaceAll('{{LEGACY_DB}}', LEGACY_DB);
  sql(cfg.rootPassword, `DROP DATABASE IF EXISTS ${LEGACY_DB}; CREATE DATABASE ${LEGACY_DB}; DROP DATABASE IF EXISTS ${AUTH_DB}; CREATE DATABASE ${AUTH_DB} CHARACTER SET utf8mb4; DROP DATABASE IF EXISTS ${VIEW_DB}; CREATE DATABASE ${VIEW_DB} CHARACTER SET utf8mb4;`);
  sql(cfg.rootPassword, schema, LEGACY_DB);
  sql(cfg.rootPassword, auth, AUTH_DB);
  sql(cfg.rootPassword, views, VIEW_DB);
  // Least privilege, as required in production: the reader can only SELECT the read views (never the legacy schema itself); the auth account only touches its store;
  // the optional writer account only manages wishlists (loan / deduction requests are written by apps/web, P1).
  sql(cfg.rootPassword, `
    DROP USER IF EXISTS 'mobile_reader'@'%'; DROP USER IF EXISTS 'mobile_auth'@'%'; DROP USER IF EXISTS 'mobile_writer'@'%';
    CREATE USER 'mobile_reader'@'%' IDENTIFIED BY '${cfg.readerPassword}';
    CREATE USER 'mobile_auth'@'%' IDENTIFIED BY '${cfg.authPassword}';
    CREATE USER 'mobile_writer'@'%' IDENTIFIED BY '${cfg.writerPassword}';
    GRANT SELECT ON ${VIEW_DB}.* TO 'mobile_reader'@'%';
    GRANT SELECT, INSERT, UPDATE, DELETE ON ${AUTH_DB}.* TO 'mobile_auth'@'%';
    GRANT SELECT, INSERT, DELETE ON ${LEGACY_DB}.wishlists TO 'mobile_writer'@'%';
    FLUSH PRIVILEGES;`);
  await seed(env(cfg), cfg.rootPassword, PORT, LEGACY_DB);
  console.log(`stack up on 127.0.0.1:${PORT} (synthetic data only)`);
}

export function env(cfg = loadConfig()) {
  if (!cfg) throw new Error('stack not created: run `pnpm --filter @koperasi/mobile-kkisi stack:up`');
  return {
    APP_ENV: 'development',
    APP_ORIGIN: 'http://127.0.0.1:3240',
    TRUSTED_PROXY_HOPS: '0',
    MEMBER_AUTH_SECRETS: cfg.authSecret,
    DATABASE_URL_MEMBER_READ: `mysql://mobile_reader:${encodeURIComponent(cfg.readerPassword)}@127.0.0.1:${cfg.port}/${VIEW_DB}`,
    DATABASE_URL_MEMBER_AUTH: `mysql://mobile_auth:${encodeURIComponent(cfg.authPassword)}@127.0.0.1:${cfg.port}/${AUTH_DB}`,
    MEMBER_CATALOG_COMPANY_ID: '1',
    MEMBER_DB_POOL_LIMIT: '2',
  };
}

export function writerUrl(cfg = loadConfig()) {
  if (!cfg?.writerPassword) throw new Error('stack writer not created: run `pnpm --filter @koperasi/mobile-kkisi stack:up`');
  return `mysql://mobile_writer:${encodeURIComponent(cfg.writerPassword)}@127.0.0.1:${cfg.port}/${LEGACY_DB}`;
}

const command = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (command === 'up') await up();
  else if (command === 'seed') { const cfg = loadConfig(); await seed(env(cfg), cfg.rootPassword, PORT, LEGACY_DB); console.log('seeded'); }
  else if (command === 'status') console.log(running() ? `running on 127.0.0.1:${PORT}` : 'not running');
  else if (command === 'down') { spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'inherit' }); rmSync(configFile, { force: true }); }
  else { console.error('usage: stack.mjs up|seed|status|down'); process.exitCode = 2; }
}
