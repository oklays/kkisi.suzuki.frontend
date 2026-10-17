import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (p) => relative(ROOT, p);
const SRC = walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p));

test('the Warehouse rehearsal store is not part of the application: no src file reads its DSN or constructs its adapters (no new pool, no production wiring)', () => {
  const adapter = 'src/infrastructure/warehouse/warehouse-store.repository.ts';
  const offenders = [];
  for (const file of SRC) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); const r = rel(file);   // comments may mention the names
    if (r !== adapter && /WAREHOUSE_REHEARSAL_URL|kkisi_warehouse_rehearsal|kkisi_wh_rehearsal/.test(text)) offenders.push(`${r}: references the rehearsal database or DSN`);
    if (r !== adapter && /warehouse-store\.repository/.test(text)) offenders.push(`${r}: imports the rehearsal adapter`);
    if (/new PrismaClient\(/.test(text) && r.includes('infrastructure/warehouse/')) offenders.push(`${r}: constructs a Prisma client (a new pool)`);
  }
  assert.deepEqual(offenders, []);
});

test('the Warehouse schema keeps Console identity/audit data out and stays self-contained (no cross-database objects)', () => {
  const sql = readFileSync(join(ROOT, 'db/warehouse/001_warehouse_schema.sql'), 'utf8');
  assert.doesNotMatch(sql, /console_identity_link|console_audit_event|kkisi_console|kkisi_staging|kkisi_auth|REFERENCES\s+`(?!warehouse_)/i, 'no foreign key outside the Warehouse schema');
  assert.ok(!/\bUSE\b/i.test(sql.replace(/--.*$/gm, '')), 'no USE statement');
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`\.`([a-z_]+)`/g)].map((m) => m[1]);
  assert.ok(tables.length === 11 && tables.every((t) => t.startsWith('warehouse_')), tables.join(','));
  const grants = readFileSync(join(ROOT, 'db/warehouse/002_warehouse_grants.sql.tpl'), 'utf8').replace(/--.*$/gm, '');
  assert.doesNotMatch(grants, /\bDELETE\b|\bDROP\b|\bALTER\s+(?!USER)|\bCREATE\s+(?!USER)|\bALL PRIVILEGES\b(?! *,? *GRANT OPTION FROM)|GRANT OPTION(?! FROM)/i, 'the account gets no DELETE or DDL');
  assert.doesNotMatch(grants, /'%'/, 'never a wildcard host');
});

test('the production proposal stays one connection: the rehearsal-only limit of 4 is documented as rehearsal-only', () => {
  const tpl = readFileSync(join(ROOT, 'db/warehouse/002_warehouse_grants.sql.tpl'), 'utf8');
  assert.match(tpl, /ONLY so the rehearsal can test concurrent consumers; the production PROPOSAL is 1/);
});
