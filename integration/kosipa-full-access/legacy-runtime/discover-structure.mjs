/**
 * Maintenance tool (FA-03A): finds the legacy tables the UNCHANGED KOSIPA app needs for the harness screens. It runs the screens; for every
 * "Table … doesn't exist" (1146) it reads SHOW CREATE TABLE of that table from the LOCAL staging copy with the read-only account (structure
 * only, never rows), applies it to the synthetic database and appends it to fixtures/legacy-runtime-structure.sql. Re-run until clean.
 *   KOSIPA_FA01=1 node integration/kosipa-full-access/legacy-runtime/discover-structure.mjs [extra_table ...]
 * Extra table names (e.g. tables a WRITE path needs, which the read-only screen list cannot reach) are added directly.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DB } from '../local-stack.mjs';
import { startLegacyRuntime } from './runtime.mjs';
import { HARNESS_SCREENS } from './screens.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'integration/kosipa-full-access/fixtures/legacy-runtime-structure.sql');

async function stagingDdl(table) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(table)) throw new Error('KFA_BAD_TABLE');
  const env = Object.fromEntries((await readFile(resolve(root, 'apps/web/.env.staging'), 'utf8')).split('\n').map((l) => /^([A-Z_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
  const { stdout } = await exec('docker', ['exec', '-e', `MYSQL_PWD=${env.MARIADB_READ_PASSWORD}`, 'kkisi-staging', 'mariadb', '-ukkisi_read', 'kkisi_staging', '-N', '-r', '-e', `SHOW CREATE TABLE \`${table}\``]);
  const ddl = stdout.slice(stdout.indexOf('\t') + 1).trim().replace(/ AUTO_INCREMENT=\d+/, '');
  if (!/^CREATE TABLE `/.test(ddl) || / VIEW /i.test(ddl)) throw new Error(`KFA_NOT_A_BASE_TABLE:${table}`);
  return ddl.replace(/^CREATE TABLE `([^`]+)`/, 'CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`$1`');
}

const rt = await startLegacyRuntime();
try {
  for (const table of process.argv.slice(2)) {
    const ddl = await stagingDdl(table);
    await rt.admin.query(ddl.replaceAll('__KOSIPA_DB__', DB));
    await appendFile(fixture, `\n${ddl};\n`);
    console.log(`added ${table} (requested)`);
  }
  await rt.admin.query("UPDATE ref_menu SET status = 1 WHERE id BETWEEN 9101 AND 9109");    // discovery only: every harness screen reachable
  for (let round = 0; round < 40; round++) {
    const { login, results } = await rt.session(HARNESS_SCREENS);
    const missing = new Set();
    for (const r of [...login, ...results]) {
      const text = String(r.body ?? '');
      for (const m of text.matchAll(/Table '[^.]+\.([A-Za-z0-9_]+)' doesn't exist/g)) missing.add(m[1]);
      const unknown = /Unknown column '([^']+)'/.exec(text);
      if (unknown) console.log(`UNKNOWN COLUMN ${unknown[1]} on ${r.path} (fix by hand: a subset table in the e2e structure)`);
    }
    if (!missing.size) { console.log(`clean after ${round} round(s)`); break; }
    for (const table of missing) {
      const ddl = await stagingDdl(table);
      await rt.admin.query(ddl.replaceAll('__KOSIPA_DB__', DB));
      await appendFile(fixture, `\n${ddl};\n`);
      console.log(`added ${table}`);
    }
  }
} finally { await rt.admin.query("UPDATE ref_menu SET status = 0 WHERE id BETWEEN 9102 AND 9106").catch(() => undefined); await rt.close(); }
