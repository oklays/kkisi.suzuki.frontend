/**
 * Runs the console against the FA-01 isolated synthetic stack ONLY: `next build` into apps/web/.next-kfa01 and `next start` on
 * http://127.0.0.1:3230. The process environment is built from scratch: apps/web/.env.kosipa-fa01 (written by local-stack.mjs) plus
 * every OTHER key named in apps/web/.env and apps/web/.env.local set to "" — @next/env never overrides a key that already exists, so
 * nothing from those files (staging DSNs, TOKO writer flags) can reach this server. Only key NAMES are read from them, never values.
 * It never touches `.next`, another server, or any port but 3230; `stop` kills only the process it recorded.
 *   node integration/kosipa-full-access/app-server.mjs build|start|stop|status [--profile devlocal]
 * Profile `devlocal` (FA-01.5 regression runtime): the same isolation for the existing synthetic DEV LOCAL profile (apps/web/.env.dev-local,
 * database kkisi_devlocal_staging) on :3203 from apps/web/.next-devlocal, so the existing DEV LOCAL browser suites run without touching
 * the owner's :3200/:3201 servers or anybody's `next dev`. FA-01 write features stay OFF in that profile (its env does not set them).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_PORT } from './local-stack.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const web = resolve(root, 'apps/web');
const PROFILE = process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'kfa01';
const PROFILES = {
  kfa01: { env: '.env.kosipa-fa01', dist: '.next-kfa01', port: APP_PORT, database: '@127.0.0.1:3322/kkisi_kfa_synthetic' },
  devlocal: { env: '.env.dev-local', dist: '.next-devlocal', port: 3203, database: '@127.0.0.1:3307/kkisi_devlocal_staging' },
  // Same reviewed build; a read-only view overlay supplies synthetic identities over the protected refreshed baseline.
  uatread: { env: '.env.kosipa-read-uat', dist: '.next-kfa01', port: 3231, database: '@127.0.0.1:3307/kkisi_kosipa_read_uat', originHost: 'localhost' },
};
if (!PROFILES[PROFILE]) throw new Error('KFA_UNKNOWN_PROFILE');
const { env: ENV_FILE, dist: DIST, port: PORT, database: DATABASE } = PROFILES[PROFILE];
const pidFile = resolve(root, `.local/kosipa-fa01/app-server-${PROFILE}.json`);
const log = resolve(root, `.local/kosipa-fa01/app-server-${PROFILE}.log`);

const keysOf = (file) => existsSync(file) ? readFileSync(file, 'utf8').split('\n').map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1]).filter(Boolean) : [];
function parse(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) { const m = /^([A-Z_][A-Z0-9_]*)=(?:"(.*)"|([^"#]*))$/.exec(line.trim()); if (m) out[m[1]] = m[2] ?? m[3].trim(); }
  return out;
}
function environment() {
  const own = parse(resolve(web, ENV_FILE));
  if (!own.DATABASE_URL?.includes(DATABASE)) throw new Error('KFA_APP_ENV_INVALID');
  own.APP_ORIGIN = `http://${PROFILES[PROFILE].originHost ?? '127.0.0.1'}:${PORT}`;
  if (PROFILE === 'uatread') {
    for (const [key, value] of Object.entries(own)) {
      if (key.startsWith('DATABASE_URL') && value) {
        const u = new URL(value);
        const targets = { DATABASE_URL: 'kkisi_kosipa_read_uat', DATABASE_URL_AUTH: 'kkisi_kosipa_read_auth', DATABASE_URL_CONSOLE: 'kkisi_kosipa_read_console' };
        if (u.protocol !== 'mysql:' || u.hostname !== '127.0.0.1' || u.port !== '3307' || u.pathname !== `/${targets[key]}`) throw new Error('KFA_READ_UAT_TARGET_REFUSED');
      }
      if ((key.endsWith('_WRITES_ENABLED') || key === 'PSS_INTAKE_ENABLED' || key === 'KOSIPA_WRITE_GRANTS_ENABLED') && value === 'true') throw new Error('KFA_READ_UAT_WRITES_REFUSED');
    }
  }
  const masked = Object.fromEntries([...keysOf(resolve(web, '.env')), ...keysOf(resolve(web, '.env.local')), ...keysOf(resolve(web, '.env.production')), ...keysOf(resolve(web, '.env.production.local'))].map((k) => [k, '']));
  return { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: DIST, ...masked, ...own };
}
const next = (args, options) => spawn(resolve(web, 'node_modules/.bin/next'), args, { cwd: web, env: environment(), ...options });

const command = process.argv[2] ?? 'status';
if (command === 'build' && Object.entries(PROFILES).some(([name, profile]) => profile.dist === DIST && existsSync(resolve(root, `.local/kosipa-fa01/app-server-${name}.json`)))) throw new Error('KFA_SERVER_RUNNING: stop every profile sharing this build directory before rebuilding');
if (command === 'build') {
  // `next build` rewrites next-env.d.ts to point at its distDir; the tracked file must keep pointing at `.next`.
  const typesFile = resolve(web, 'next-env.d.ts'); const tracked = readFileSync(typesFile, 'utf8');
  const r = spawnSync(resolve(web, 'node_modules/.bin/next'), ['build'], { cwd: web, env: environment(), stdio: 'inherit' });
  writeFileSync(typesFile, tracked);
  process.exitCode = r.status ?? 1;
} else if (command === 'start') {
  if (!existsSync(resolve(web, DIST, 'BUILD_ID'))) throw new Error('KFA_APP_NOT_BUILT: run `node integration/kosipa-full-access/app-server.mjs build` first');
  // Never start against an occupied port (an older server would keep serving stale build files).
  if (spawnSync('lsof', ['-nP', `-tiTCP:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()) throw new Error(`KFA_PORT_BUSY: ${PORT} is in use; stop that server first`);
  const out = openSync(log, 'a');
  const child = next(['start', '-H', '127.0.0.1', '-p', String(PORT)], { detached: true, stdio: ['ignore', out, out] });
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port: PORT, dist: DIST }), { mode: 0o600 });
  child.unref();
  console.log(JSON.stringify({ started: true, profile: PROFILE, url: `http://${PROFILES[PROFILE].originHost ?? '127.0.0.1'}:${PORT}` }));
} else if (command === 'stop') {
  if (!existsSync(pidFile)) { console.log(JSON.stringify({ stopped: false, reason: 'not started by this script' })); }
  else {
    const { pid } = JSON.parse(readFileSync(pidFile, 'utf8'));
    const cmd = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout.trim();
    if (/next/.test(cmd)) process.kill(-pid, 'SIGTERM');                  // the detached process group of `next start` only
    rmSync(pidFile);
    console.log(JSON.stringify({ stopped: true }));
  }
} else {
  console.log(JSON.stringify({ recorded: existsSync(pidFile) ? JSON.parse(readFileSync(pidFile, 'utf8')) : null }));
}
