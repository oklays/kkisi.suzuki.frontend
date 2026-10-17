import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { revokeSyntheticConsoleLinks } from '../scripts/e2e-guards.mjs';

// Checkpoint 12 — root cause of the checkpoint-11 identity-link UAT failure: the per-phase reset did not touch the console store, so a test process that ended
// before its own cleanup left a synthetic identity link ACTIVE and the next run's first link creation was refused (CONSOLE_USER_ALREADY_LINKED, audit 12:05:31 UTC).
const ROOT = new URL('..', import.meta.url).pathname;
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '');

test('the per-phase reset revokes synthetic console links, and no browser suite can skip its own cleanup with process.exit()', () => {
  const cleanup = strip(readFileSync(join(ROOT, 'scripts/e2e-cleanup.mjs'), 'utf8'));
  assert.match(cleanup, /revokeSyntheticConsoleLinks\(consoleStore\)/);
  for (const f of readdirSync(join(ROOT, 'tests')).filter((n) => /browser\.mjs$|^e2e-local\.mjs$/.test(n))) {
    assert.doesNotMatch(strip(readFileSync(join(ROOT, 'tests', f), 'utf8')), /process\.exit\(/, `${f}: process.exit() would skip the finally cleanup`);
  }
});

const URL_ = process.env.CONSOLE_STORE_TEST_URL;
test('opt-in (local console store): a link left ACTIVE by an aborted run is revoked by the reset, so the next creation succeeds; any other database is refused', { skip: !(process.env.E2E_ISOLATION_DB_TEST === '1' && URL_) }, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(URL_).hostname));
  const db = new PrismaClient({ datasourceUrl: URL_ });
  try {
    await revokeSyntheticConsoleLinks(db);   // start clean
    await db.$executeRaw`INSERT INTO console_identity_link (console_user_id, system, external_user_id, status, linked_by, linked_at) VALUES (900002, 'kosipa', 9001, 'active', 900001, UTC_TIMESTAMP())`;   // what an aborted run leaves behind
    const active = async () => Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM console_identity_link WHERE status = 'active' AND console_user_id BETWEEN 900001 AND 900007`)[0].n);
    assert.equal(await active(), 1);
    assert.equal(await revokeSyntheticConsoleLinks(db), 1); assert.equal(await active(), 0);
    await db.$executeRaw`INSERT INTO console_identity_link (console_user_id, system, external_user_id, status, linked_by, linked_at) VALUES (900002, 'kosipa', 9001, 'active', 900001, UTC_TIMESTAMP())`;   // the next run can link again
    assert.equal(await revokeSyntheticConsoleLinks(db), 1);
    await assert.rejects(revokeSyntheticConsoleLinks(db, 'kkisi_console_production'), /refusing/);
  } finally { await db.$disconnect(); }
});
