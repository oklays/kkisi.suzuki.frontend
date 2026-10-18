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
function run(profile, local = envLocal) {
  const dir = mkdtempSync(join(tmpdir(), 'devlocal-')); writeFileSync(join(dir, '.env.local'), fmt(local)); writeFileSync(join(dir, '.env.dev-local'), fmt(profile));
  const r = spawnSync(process.execPath, [PREFLIGHT], { cwd: dir, encoding: 'utf8' }); rmSync(dir, { recursive: true, force: true }); return { code: r.status, out: r.stdout + r.stderr };
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
