import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capLockWait, LOCK_WAIT_SECONDS } from '../src/infrastructure/db/lock-wait.ts';

const REPOS = new URL('../src/infrastructure/repositories/', import.meta.url).pathname;
// Read-only snapshots on the reader: no row locks, so no cap needed.
const READ_ONLY = new Set(['prisma-master-product.repository.ts']);

test('lock cap sets a short session innodb_lock_wait_timeout', async () => {
  const sql = []; await capLockWait({ $executeRawUnsafe: async (s) => { sql.push(s); return 0; } });
  assert.deepEqual(sql, [`SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_SECONDS}`]);
  assert.ok(LOCK_WAIT_SECONDS > 0 && LOCK_WAIT_SECONDS < 15, 'must stay below the 15 s transaction timeout');
});

test('every legacy write transaction caps its lock wait as its first statement', () => {
  let seen = 0;
  for (const name of readdirSync(REPOS).filter((n) => n.endsWith('.ts') && !READ_ONLY.has(n))) {
    const source = readFileSync(join(REPOS, name), 'utf8');
    for (const m of source.matchAll(/\.\$transaction\(\s*async\s*\(?\s*(\w+)\s*\)?\s*=>\s*\{\s*([^\n]*)/g)) {
      seen++;
      assert.equal(m[2].trim(), `await capLockWait(${m[1]});`, `${name}: transaction must start with capLockWait`);
    }
    if (/private async (finalize|persist)\(tx/.test(source)) {
      seen++;
      assert.match(source, /private async (finalize|persist)\(tx[^\n]*\{\n\s*await capLockWait\(tx\);/, `${name}: ${'finalize/persist'} must start with capLockWait`);
    }
  }
  assert.ok(seen >= 6, `expected the six write transactions, found ${seen}`);
});

test('member reads map MariaDB zero dates to no exit date instead of failing to decode', () => {
  const source = readFileSync(join(REPOS, 'prisma-pos.repository.ts'), 'utf8');
  assert.match(source, /CASE WHEN m\.tgl_keluar IS NULL OR CAST\(m\.tgl_keluar AS CHAR\) LIKE '0000-00-00%' THEN NULL ELSE DATE_FORMAT\(m\.tgl_keluar,'%Y-%m-%d'\) END AS exit_on/);
  assert.doesNotMatch(source, /, m\.tgl_keluar AS/);
});

test('checkout cart cleanup never joins db_sales inside the DELETE (rescans 200k rows per cart row on production)', () => {
  const source = readFileSync(join(REPOS, 'prisma-pos.repository.ts'), 'utf8');
  const cleanup = source.match(/DELETE cart FROM db_cart cart[^`]*/)?.[0];
  assert.ok(cleanup, 'cart cleanup present');
  assert.doesNotMatch(cleanup, /JOIN|db_sales|EXISTS/);
});
