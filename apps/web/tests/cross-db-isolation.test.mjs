import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Always-on static guards for the cross-database harness (checkpoint 11): the TOKO posting TEST store and its applier can never become part of the application,
// production stock posting stays disabled, and the provisioning script can only ever act on the local staging container. The behavioural proof is the opt-in
// cross-db-outbox.test.mjs; these tests keep it from leaking into production wiring.
const ROOT = new URL('..', import.meta.url).pathname;
const REPO = join(ROOT, '..', '..');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p));

test('no application source mentions the TOKO posting test store, its DSN, its applier or the test support code', () => {
  const offenders = SRC.filter((f) => /TOKO_POSTING_TEST_URL|kkisi_toko_posting_test|kkisi_toko_post_test|toko_test_stock|TokoTestApplier|tests\/support|cross-db-worker|fault-proxy|TOKO_WRITER_CONTRACT_URL|kkisi_toko_writer_contract|kkisi_toko_writer_ct|nx_stock_posting|TokoStockWriterContract/.test(strip(readFileSync(f, 'utf8')))).map((f) => relative(ROOT, f));
  assert.deepEqual(offenders, []);
});

test('production stock posting stays disabled: no application code constructs a stock applier, a Warehouse pool or reads a posting flag; the startup guard knows no Warehouse pool', () => {
  const offenders = [];
  for (const f of SRC) {
    const t = strip(readFileSync(f, 'utf8')); const r = relative(ROOT, f);
    if (/drainStockOutbox|PrismaStockOutbox|PrismaSimulatedStockApplier|WAREHOUSE_STOCK_APPLY|WAREHOUSE_PERSISTENCE_ENABLED/.test(t) && r !== 'src/infrastructure/warehouse/warehouse-store.repository.ts') offenders.push(r);
  }
  assert.deepEqual(offenders, []);
  const startup = strip(readFileSync(join(ROOT, 'src/infrastructure/db/startup-check.ts'), 'utf8'));
  assert.doesNotMatch(startup, /warehouse|stockApply/i, 'the production startup check has no Warehouse pool');
  const envExample = readFileSync(join(REPO, 'deploy/genesis/env.production.example'), 'utf8');
  assert.doesNotMatch(envExample, /WAREHOUSE_(PERSISTENCE|STOCK_APPLY)|TOKO_POSTING_TEST/, 'the production template offers no way to switch posting on');
});

test('the test store schema and grants are self-contained, give no DELETE/DDL and no wildcard host', () => {
  const sql = readFileSync(join(ROOT, 'db/toko-posting-test/001_schema.sql'), 'utf8');
  assert.doesNotMatch(strip(sql).replace(/--.*$/gm, ''), /kkisi_staging|kkisi_auth|kkisi_console|kkisi_warehouse|n1608204|REFERENCES/i, 'no object outside the test store');
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `kkisi_toko_posting_test`\.`([a-z_]+)`/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ['toko_test_marker', 'toko_test_stock', 'toko_test_stock_posting']);
  assert.ok(tables.every((t) => t.startsWith('toko_test_')), 'every object is named as a test object');
  const grants = readFileSync(join(ROOT, 'db/toko-posting-test/002_grants.sql.tpl'), 'utf8').replace(/--.*$/gm, '');
  assert.doesNotMatch(grants, /\bDELETE\b|\bDROP\b|\bALTER\s+(?!USER)|\bCREATE\s+(?!USER)|\bALL PRIVILEGES\b(?! *,? *GRANT OPTION FROM)|GRANT OPTION(?! FROM)/i);
  assert.doesNotMatch(grants, /'%'/, 'never a wildcard host');
  assert.match(grants, /UPDATE \(`quantity`\)/, 'column-level UPDATE only on the stock quantity');
});

test('the provisioning script is local-only: it asserts the local container and a loopback app path before any root statement, and defaults to a dry run', () => {
  const sh = readFileSync(join(ROOT, 'scripts/setup-toko-posting-test.sh'), 'utf8');
  assert.match(sh, /DEFAULT IS A DRY RUN/); assert.match(sh, /assert_local_container; assert_app_path_is_loopback/);
  const firstRoot = sh.indexOf('root_sql', sh.indexOf('main()')); const guard = sh.indexOf('assert_local_container', sh.indexOf('main()'));
  assert.ok(guard > 0 && guard < firstRoot, 'the container guard precedes the first root statement in main()');
  assert.match(sh, /\[ "\$mode" = "apply" \] \|\| \{ info "DRY RUN/);
  for (const other of ['legacy_object_count', 'AUTH_DB', 'CONSOLE_DB', 'WH_DB']) assert.match(sh, new RegExp(other), `${other} is checked for collateral change`);
});

test('the harness cannot be pointed at anything but the two local stores: DSN, database and account names are asserted before any connection is used', () => {
  const t = readFileSync(join(ROOT, 'tests/cross-db-outbox.test.mjs'), 'utf8');
  for (const must of ["['127.0.0.1', 'localhost']", "'kkisi_warehouse_rehearsal'", "'kkisi_toko_posting_test'", "'kkisi_wh_rehearsal'", "'kkisi_toko_post_test'"]) assert.ok(t.includes(must), must);
  const w = readFileSync(join(ROOT, 'tests/support/cross-db-worker.mjs'), 'utf8');
  assert.match(w, /xdb:\[a-z0-9\]\+/, 'the worker only drains a test namespace');
});
