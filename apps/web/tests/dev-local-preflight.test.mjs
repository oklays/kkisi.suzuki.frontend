import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Checkpoint 14: the DEV LOCAL launcher refuses to start unless EVERY effective database target is an approved isolated local target.
const PREFLIGHT = new URL('../scripts/lib/dev-local-preflight.mjs', import.meta.url).pathname;
const L = (user, db) => `mysql://${user}:x@127.0.0.1:3307/${db}`;
const goodProfile = { DATABASE_URL: L('devlocal_read', 'kkisi_devlocal_staging'), DATABASE_URL_AUTH: L('kkisi_auth', 'kkisi_auth_staging'), DATABASE_URL_CONSOLE: L('kkisi_console', 'kkisi_console_staging'), DATABASE_URL_WRITE: L('devlocal_pos', 'kkisi_devlocal_staging'), DATABASE_URL_REGISTER_WRITE: L('devlocal_register', 'kkisi_devlocal_staging'), DATABASE_URL_RETURN_WRITE: L('devlocal_return', 'kkisi_devlocal_staging'), DATABASE_URL_PRODUCT_WRITE: L('devlocal_product', 'kkisi_devlocal_staging'), DATABASE_URL_INVENTORY_WRITE: L('devlocal_inventory', 'kkisi_devlocal_staging'), POS_WRITE_DATABASE: 'kkisi_devlocal_staging', CONSOLE_ENABLED: 'true' };
const envLocal = { DATABASE_URL: L('kkisi_read', 'kkisi_staging'), DATABASE_URL_PRODUCT_WRITE: L('kkisi_product_write', 'kkisi_staging'), DATABASE_URL_AUTH: L('kkisi_auth', 'kkisi_auth_staging') };
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n';
function run(profile, local = envLocal, args = [], env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'devlocal-')); writeFileSync(join(dir, '.env.local'), fmt(local)); writeFileSync(join(dir, '.env.dev-local'), fmt(profile));
  const r = spawnSync(process.execPath, [PREFLIGHT, ...args], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }); rmSync(dir, { recursive: true, force: true }); return { code: r.status, out: r.stdout + r.stderr };
}

test('a complete DEV LOCAL profile passes and prints targets without secrets', () => {
  const r = run(goodProfile); assert.equal(r.code, 0, r.out); assert.match(r.out, /every database target is an approved isolated local target/); assert.doesNotMatch(r.out, /:x@/);
});

test('unsafe targets are refused: a writer leaking in from .env.local, a remote host, a forbidden account, a non-approved database, R1 landing set, APP_ENV production', () => {
  const { DATABASE_URL_PRODUCT_WRITE, ...missing } = goodProfile; void DATABASE_URL_PRODUCT_WRITE;
  for (const [profile, re] of [
    [missing, /DATABASE_URL_PRODUCT_WRITE: database kkisi_staging is not an approved DEV LOCAL target/],
    [{ ...goodProfile, DATABASE_URL: 'mysql://devlocal_read:x@10.0.0.5:3306/kkisi_devlocal_staging' }, /not the local container/],
    [{ ...goodProfile, DATABASE_URL_WRITE: L('root', 'kkisi_devlocal_staging') }, /forbidden account/],
    [{ ...goodProfile, DATABASE_URL: L('devlocal_read', 'n1608204_smart_kopkar') }, /not an approved DEV LOCAL target/],
    [{ ...goodProfile, CONSOLE_LANDING_ROLES: '4:pos' }, /R1 not approved/],
    [{ ...goodProfile, APP_ENV: 'production' }, /APP_ENV/],
  ]) { const r = run(profile); assert.equal(r.code, 1, JSON.stringify(profile).slice(0, 80)); assert.match(r.out, re); }
});

// Checkpoint 15: the reset path itself cannot be pointed at anything but the DEV LOCAL database on the local container.
import { readFileSync } from 'node:fs';
const SH = (f) => readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
test('reset script: local container asserted before the first root statement, fixed target name, drop only after the marker check, dry run by default', () => {
  const s = SH('setup-dev-local.sh'); const main = s.indexOf('main() {');
  assert.match(s, /DL_DB="kkisi_devlocal_staging"/); assert.match(s, /\[\[ "\$DL_DB" =~ \^kkisi_devlocal_staging\$ \]\]/);
  const guard = s.indexOf('assert_local_container; assert_app_path_is_loopback', main), firstRoot = s.indexOf('root_sql', main);
  assert.ok(guard > 0 && guard < firstRoot, 'container guard precedes the first root statement');
  const marker = s.indexOf('_devlocal_marker', main), drop = s.indexOf('DROP DATABASE', main);
  assert.ok(marker > 0 && drop > marker, 'DROP DATABASE only after the marker check'); assert.match(s, /exists WITHOUT the DEV LOCAL marker: refusing to touch it/);
  assert.match(s, /DRY RUN: nothing changed/); assert.equal((s.match(/DROP DATABASE/g) ?? []).length, 1, 'exactly one DROP, of the target');
  assert.doesNotMatch(s.replace(/#.*$/gm, ''), /DROP (USER|TABLE)|TRUNCATE|DELETE FROM `?kkisi_(staging|auth|console)/i);
});
test('launcher: starts only after the preflight, binds loopback, never kills by name, only by its own two ports', () => {
  const s = SH('dev-local.sh');
  assert.ok(s.indexOf('dev-local-preflight.mjs') < s.indexOf('nohup pnpm exec next'), 'preflight before the server starts');
  assert.match(s, /-H 127\.0\.0\.1/); assert.doesNotMatch(s, /pkill|killall|0\.0\.0\.0/); assert.match(s, /PROD_PORT=3200; DEV_PORT=3201/);
});

test('checkpoint 15: only the explicit r1-trial mode accepts a landing mapping, and only the exact trial mapping; the normal start never does', () => {
  assert.equal(run(goodProfile, envLocal, ['--r1-trial'], { CONSOLE_LANDING_ROLES: '4:pos,1:console' }).code, 0);
  for (const bad of ['', '4:pos', '4:pos,1:console,2:console', '3:pos']) { const r = run(goodProfile, envLocal, ['--r1-trial'], { CONSOLE_LANDING_ROLES: bad }); assert.equal(r.code, 1, bad); assert.match(r.out, /r1-trial accepts only/); }
  const normal = run(goodProfile, envLocal, [], { CONSOLE_LANDING_ROLES: '4:pos,1:console' });   // a value in the caller's environment is not part of a normal start's effective profile...
  assert.equal(normal.code, 0, normal.out);
  const inProfile = run({ ...goodProfile, CONSOLE_LANDING_ROLES: '4:pos,1:console' });   // ...but a mapping in the profile itself is refused
  assert.equal(inProfile.code, 1); assert.match(inProfile.out, /R1 not approved/);
});
