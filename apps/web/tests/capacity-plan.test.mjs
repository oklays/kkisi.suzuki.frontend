import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluate, POOLS } from '../src/infrastructure/db/capacity-plan.ts';
import { MAX_CONNECTION_BUDGET, MAX_POOL_PER_CLIENT } from '../src/infrastructure/db/deployment-guard.ts';

const ENV = readFileSync(new URL('../../../deploy/genesis/env.production.example', import.meta.url), 'utf8');
const startup = readFileSync(new URL('../src/infrastructure/db/startup-check.ts', import.meta.url), 'utf8');

test('the registry matches the documented production DSNs (connection_limit of every DATABASE_URL* line, commented or not)', () => {
  const lines = Object.fromEntries([...ENV.matchAll(/^#?\s*(DATABASE_URL[A-Z_]*)=mysql:\/\/([^:]+):[^@]*@[^?]*\?connection_limit=(\d)/gm)].map((m) => [m[1], { account: m[2], limit: Number(m[3]) }]));
  const expect = { DATABASE_URL: 'reader', DATABASE_URL_AUTH: 'auth', DATABASE_URL_CONSOLE: 'console', DATABASE_URL_WRITE: 'pos', DATABASE_URL_REGISTER_WRITE: 'register', DATABASE_URL_RETURN_WRITE: 'returns' };
  for (const [name, id] of Object.entries(expect)) { const pool = POOLS.find((p) => p.id === id); assert.ok(lines[name], `${name} is documented`); assert.equal(lines[name].limit, pool.limit, `${id} limit`); assert.equal(lines[name].account, pool.account, `${id} account`); }
  assert.equal(POOLS.filter((p) => p.existing).reduce((n, p) => n + p.limit, 0), MAX_CONNECTION_BUDGET, 'all existing pools together are exactly the ceiling: 12/12');
  assert.equal(MAX_POOL_PER_CLIENT, 4);
});

test('the startup guard counts only ENABLED writers (so the budget is a function of the activation plan), and the console pool only when configured', () => {
  for (const flag of ['POS_WRITES_ENABLED', 'INVENTORY_WRITES_ENABLED', 'PRODUCTS_WRITES_ENABLED', 'SALES_RETURN_WRITES_ENABLED']) assert.match(startup, new RegExp(`env\\.${flag} === '1'`), flag);
  assert.match(startup, /assertConnectionBudget\(\[legacy, auth, \.\.\.writers\.map\(\(w\) => w\.dsn\), \.\.\.\(consoleDsn \? \[consoleDsn\] : \[\]\)\], env\)/);
});

test('scenarios used by the capacity analysis (numbers quoted in connection-capacity-analysis.md)', () => {
  const W = ['warehouseStore', 'stockApply'], WRITERS = ['pos', 'register', 'inventory', 'products', 'returns'];
  const reads = ['reader', 'auth', 'console'];
  const s = (active, o) => evaluate(active, o);
  assert.deepEqual([s(reads).used, s(reads).legacyPhpLeft], [6, 14], 'read-only console today');
  assert.deepEqual([s([...reads, ...W]).used, s([...reads, ...W]).withinBudget], [8, true], 'read-only console + both Warehouse pools');
  assert.deepEqual([s([...reads, ...WRITERS]).used, s([...reads, ...WRITERS]).headroom], [12, 0], 'every existing writer active: 12/12, no headroom');
  const all = s([...reads, ...WRITERS, ...W]); assert.deepEqual([all.used, all.withinBudget, all.legacyPhpLeft], [14, false, 6], 'everything at once is refused by the guard');
  assert.deepEqual([s([...reads, 'pos', 'register', ...W]).used, s([...reads, 'pos', 'register', ...W]).withinBudget], [11, true], 'POS cut over, Warehouse live, other writers still legacy');
  assert.deepEqual([s([...reads, ...WRITERS, ...W], { moveWarehouseTo: 'warehouse' }).used], [13], 'option C removes only the Warehouse store: 13 > 12 still refused');
  assert.equal(s([...reads, ...WRITERS, ...W], { moveWarehouseTo: 'warehouse', limitOverrides: { reader: 2 } }).withinBudget, true, 'option C + a verified reader reduction fits');
  assert.equal(s([...reads, ...WRITERS, ...W], { limitOverrides: { reader: 2, auth: 1 } }).used, 12, 'option A alone needs two verified reductions (reader 3->2, auth 2->1)');
  assert.throws(() => s(['reader'], { limitOverrides: { reader: 0 } }), /out of range/); assert.throws(() => s(['reader'], { limitOverrides: { reader: 5 } }), /out of range/); assert.throws(() => s(['nope']), /unknown pool/);
});
