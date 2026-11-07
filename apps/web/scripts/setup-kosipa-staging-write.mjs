// Local activation of the native KOSIPA writers (masters + members) on the LOCAL COPY of production: container kkisi-staging, 127.0.0.1:3307, database kkisi_staging.
// Owner-approved on 6 Nov 2026 (DDL on the local replica). NEVER production: refuses any other container/port/database and APP_ENV=production.
// Usage: node --experimental-strip-types scripts/setup-kosipa-staging-write.mjs [--apply] [--grant-admins=1,20] [--seed-grants=<console user id>] [--status] [--unfence]
//   (no flag)   dry run: prints what would be done
//   --apply     creates ledger DB + registry, console grant table (if missing), the two least-privilege writer accounts, fences the legacy menus
//               (pre-state saved under .local/kosipa-staging-write/) and writes the flags/DSNs to the ignored apps/web/.env.local (backup kept)
//   --seed-grants=ID  LOCAL TEST SHORTCUT: inserts ACTIVE write grants (master.manage, member.create/update/status) for console user ID, recorded as requested/approved by
//               two synthetic admin ids, instead of the two-administrator UI ceremony (the beneficiary can never be one of the two admins). Local copy only.
//   --unfence   restores the exact ref_menu statuses recorded before --apply (use before running the legacy PHP app against this copy)
// Idempotent. Secrets are random, live only in the ignored .env.local, and are never printed. Production uses reviewed SQL only (docs/migration/sql/*-production.sql).
import { readFile, writeFile, rename, chmod, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KOSIPA_WRITE_FEATURES } from '../src/infrastructure/console/kosipa-ownership.ts';

const dir = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
process.loadEnvFile(`${dir}.env.staging`); process.loadEnvFile(`${dir}.env.local`);
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const grantAdmins = (args.find((a) => a.startsWith('--grant-admins='))?.split('=')[1] ?? '1,20');
if (!/^[1-9]\d{0,9}(,[1-9]\d{0,9})+$/.test(grantAdmins)) throw new Error('--grant-admins needs at least two console user ids, e.g. 1,20');

const BUSINESS_DB = 'kkisi_staging', LEDGER_DB = 'kkisi_staging_ledger', CONSOLE_DB = 'kkisi_console_staging', HOST = '%', CONSOLE_HOST = '172.17.0.1';
const MASTER_USER = 'kosipa_master_w', MEMBER_USER = 'kosipa_member_w', SAVINGS_USER = 'kosipa_savings_w';

function docker(argv, input) {
  const r = spawnSync('docker', argv, { input, encoding: 'utf8', env: { ...process.env, MYSQL_PWD: process.env.MARIADB_ROOT_PASSWORD } });
  if (r.status !== 0) throw new Error(`Local Docker/SQL operation failed: ${(r.stderr.match(/ERROR [0-9]+[^\n]*/) ?? ['no detail'])[0]}`);
  return r.stdout.trim();
}
const sql = (text) => docker(['exec', '-i', '-e', 'MYSQL_PWD', 'kkisi-staging', 'mariadb', '-uroot', '--default-character-set=utf8mb4', '-N', '-B'], text);

// ---- preconditions: only the local replica container is ever touched
if (docker(['port', 'kkisi-staging', '3306/tcp']) !== '127.0.0.1:3307') throw new Error('Only kkisi-staging on 127.0.0.1:3307 is authorized');
if (!process.env.MARIADB_ROOT_PASSWORD) throw new Error('Local staging root credential missing');
const read = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(read.hostname) || read.port !== '3307' || read.pathname !== `/${BUSINESS_DB}`) throw new Error('Reader must target the replicated local staging database');
if (process.env.APP_ENV && process.env.APP_ENV !== 'local') throw new Error('APP_ENV must be unset or local');

const stateDir = `${repo}.local/kosipa-staging-write`;
const fenceUrls = [...new Set(Object.values(KOSIPA_WRITE_FEATURES).flatMap((f) => f.legacyControllers))];
const urlList = fenceUrls.map((u) => `UPPER('${u}')`).join(', ');
const fencePrestateFile = () => `${stateDir}/fence-prestate.json`;

const seedGrantUser = args.find((a) => a.startsWith('--seed-grants='))?.split('=')[1];
if (seedGrantUser !== undefined) {
  if (!/^[1-9]\d{0,9}$/.test(seedGrantUser)) throw new Error('--seed-grants needs one console user id');
  if (sql(`SELECT COUNT(*) FROM ${BUSINESS_DB}.db_users WHERE id = ${seedGrantUser}`) !== '1') throw new Error('That console user does not exist in the local copy');
  const caps = ['kosipa.master.manage', 'kosipa.member.create', 'kosipa.member.update', 'kosipa.member.status', 'kosipa.savings.prepare', 'kosipa.savings.approve'];
  sql(caps.map((c) => `INSERT INTO ${CONSOLE_DB}.console_kosipa_grant (console_user_id, capability, status, requested_by, requested_at, grant_reason, expires_at, decided_by, decided_at, decision_note)
    SELECT ${seedGrantUser}, '${c}', 'active', 4294967001, UTC_TIMESTAMP(), 'LOCAL COPY TEST GRANT (setup script)', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 YEAR), 4294967002, UTC_TIMESTAMP(), 'seeded for local replica testing'
    FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ${CONSOLE_DB}.console_kosipa_grant WHERE console_user_id = ${seedGrantUser} AND capability = '${c}' AND status IN ('pending','active'));`).join('\n'));
  console.log(sql(`SELECT console_user_id, capability, status FROM ${CONSOLE_DB}.console_kosipa_grant WHERE console_user_id = ${seedGrantUser} AND status = 'active' ORDER BY capability`));
  process.exit(0);
}
if (args.includes('--unfence')) {
  const prestate = JSON.parse(await readFile(fencePrestateFile(), 'utf8'));
  sql(prestate.rows.map((r) => `UPDATE ${BUSINESS_DB}.ref_menu SET status = ${Number(r.status)} WHERE id = ${Number(r.id)};`).join('\n'));
  console.log(`Restored ${prestate.rows.length} ref_menu rows to their pre-fence status. Turn KOSIPA_*_WRITES_ENABLED off before using the legacy app on this copy.`);
  process.exit(0);
}
if (args.includes('--status')) {
  console.log(sql(`SELECT 'ledger_db', COUNT(*) FROM information_schema.schemata WHERE schema_name='${LEDGER_DB}';
    SELECT 'grant_table', COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}' AND table_name='console_kosipa_grant';
    SELECT 'writers', GROUP_CONCAT(user) FROM mysql.user WHERE user IN ('${MASTER_USER}','${MEMBER_USER}','${SAVINGS_USER}');
    SELECT 'fence', id, url, status FROM ${BUSINESS_DB}.ref_menu WHERE UPPER(url) IN (${urlList}) ORDER BY id;`));
  process.exit(0);
}

// ---- credentials: reuse the managed ones from .env.local, else generate (stable across re-runs)
function account(variable, user) {
  const existing = process.env[variable];
  if (existing) {
    const u = new URL(existing);
    if (decodeURIComponent(u.username) !== user) throw new Error(`${variable} names a different account; inspect configuration first`);
    const pw = decodeURIComponent(u.password);
    if (!/^[a-f0-9]{48}$/.test(pw)) throw new Error(`${variable} password does not match the managed format`);
    return pw;
  }
  return randomBytes(24).toString('hex');
}
const masterPw = account('DATABASE_URL_KOSIPA_MASTER_WRITE', MASTER_USER);
const memberPw = account('DATABASE_URL_KOSIPA_MEMBER_WRITE', MEMBER_USER);
const savingsPw = account('DATABASE_URL_KOSIPA_SAVINGS_WRITE', SAVINGS_USER);
const versionSecret = process.env.KOSIPA_MEMBER_VERSION_SECRET && process.env.KOSIPA_MEMBER_VERSION_SECRET.length >= 32 ? process.env.KOSIPA_MEMBER_VERSION_SECRET : randomBytes(32).toString('hex');
const dsn = (user, pw) => { const u = new URL(read); u.username = user; u.password = pw; u.search = '?connection_limit=2'; return u.href; };

const tpl = async (name, map) => { let text = await readFile(`${dir}db/${name}`, 'utf8'); for (const [k, v] of Object.entries(map)) text = text.replaceAll(k, v); return text; };
const ownership = Object.keys(KOSIPA_WRITE_FEATURES).join(',');
const envValues = {
  KOSIPA_LOCAL_STAGING_WRITES: 'true',
  DATABASE_URL_KOSIPA_MASTER_WRITE: dsn(MASTER_USER, masterPw),
  DATABASE_URL_KOSIPA_MEMBER_WRITE: dsn(MEMBER_USER, memberPw),
  DATABASE_URL_KOSIPA_SAVINGS_WRITE: dsn(SAVINGS_USER, savingsPw),
  KOSIPA_MASTER_WRITES_ENABLED: 'true',
  KOSIPA_MEMBER_WRITES_ENABLED: 'true',
  KOSIPA_SAVINGS_WRITES_ENABLED: 'true',
  KOSIPA_LEDGER_DATABASE: LEDGER_DB,
  KOSIPA_MEMBER_VERSION_SECRET: versionSecret,
  KOSIPA_WRITE_GRANTS_ENABLED: 'true',
  KOSIPA_GRANT_ADMIN_USER_IDS: grantAdmins,
  KOSIPA_WRITE_OWNERSHIP: ownership,
};

if (!apply) {
  console.log(`DRY RUN (local copy only: kkisi-staging 127.0.0.1:3307/${BUSINESS_DB}). Would:
 1. create database ${LEDGER_DB} with kosipa_command_ledger + kosipa_document_number (db/kosipa/001, 005)
 2. create ${CONSOLE_DB}.console_kosipa_grant if missing (db/console/004) and grant the console account its append/decision columns (005)
 3. create writer accounts ${MASTER_USER} (db/kosipa/002), ${MEMBER_USER} (db/kosipa/006) and ${SAVINGS_USER} (db/kosipa/007): column-level, no DELETE on business tables, no DDL, 2 connections each
 4. fence legacy ref_menu rows ${fenceUrls.join(', ')} (pre-state saved) so native commands are accepted
 5. write the ignored apps/web/.env.local keys: ${Object.keys(envValues).join(', ')} (backup kept)
 grant administrators: ${grantAdmins}. Use --apply to execute.`);
  process.exit(0);
}

// 1-3: DDL and accounts. Every statement is idempotent (IF NOT EXISTS / strip-then-grant).
sql(await tpl('kosipa/001_command_ledger.sql.tpl', { __LEDGER_DB__: LEDGER_DB }));
sql(await tpl('kosipa/005_document_number_registry.sql.tpl', { __LEDGER_DB__: LEDGER_DB }));
if (sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}' AND table_name='console_kosipa_grant'`) === '0') sql(await readFile(`${dir}db/console/004_kosipa_grants.sql`, 'utf8'));
sql(await tpl('console/005_kosipa_grants_grants.sql.tpl', { __CONSOLE_USER__: 'kkisi_console', __HOST__: CONSOLE_HOST }));
sql(await tpl('kosipa/002_master_writer_grants.sql.tpl', { __KOSIPA_DB__: BUSINESS_DB, __LEDGER_DB__: LEDGER_DB, __HOST__: HOST, __PW__: masterPw }));
sql(await tpl('kosipa/006_member_writer_grants.sql.tpl', { __KOSIPA_DB__: BUSINESS_DB, __LEDGER_DB__: LEDGER_DB, __HOST__: HOST, __PW__: memberPw }));
sql(await tpl('kosipa/007_savings_writer_grants.sql.tpl', { __KOSIPA_DB__: BUSINESS_DB, __LEDGER_DB__: LEDGER_DB, __HOST__: HOST, __PW__: savingsPw }));

// 4: fence, keeping the first recorded pre-state (a re-run must not overwrite the true original statuses)
await mkdir(stateDir, { recursive: true, mode: 0o700 });
let recorded = null; try { recorded = JSON.parse(await readFile(fencePrestateFile(), 'utf8')); } catch { /* first run */ }
// Record the pre-state of every controller not recorded yet. New native features (e.g. the product masters) add controllers after the first run;
// their original statuses must be captured BEFORE this run fences them, while rows recorded earlier keep their true original status.
const missing = recorded ? fenceUrls.filter((u) => !recorded.urls.includes(u)) : fenceUrls;
if (missing.length) {
  const list = missing.map((u) => `UPPER('${u}')`).join(', ');
  const rows = sql(`SELECT id, status FROM ${BUSINESS_DB}.ref_menu WHERE UPPER(url) IN (${list}) ORDER BY id`).split('\n').filter(Boolean).map((l) => { const [id, status] = l.split('\t'); return { id: Number(id), status: Number(status) }; });
  const known = new Set((recorded?.rows ?? []).map((r) => r.id));
  const merged = { recordedAt: recorded?.recordedAt ?? new Date().toISOString(), database: BUSINESS_DB, urls: [...(recorded?.urls ?? []), ...missing], rows: [...(recorded?.rows ?? []), ...rows.filter((r) => !known.has(r.id))] };
  await writeFile(fencePrestateFile(), JSON.stringify(merged, null, 2), { mode: 0o600 });
}
sql(`UPDATE ${BUSINESS_DB}.ref_menu SET status = 0 WHERE UPPER(url) IN (${urlList}) AND status = 1;`);

// 5: env (atomic replace, backup kept)
const path = `${dir}.env.local`, original = await readFile(path, 'utf8');
let content = original;
for (const [key, value] of Object.entries(envValues)) content = content.split('\n').filter((line) => !line.startsWith(`${key}=`)).join('\n').replace(/\n*$/, '') + `\n${key}=${JSON.stringify(value)}\n`;
await writeFile(`${path}.kosipa-staging-backup`, original, { mode: 0o600 }); await chmod(`${path}.kosipa-staging-backup`, 0o600);
await writeFile(`${path}.kosipa-staging-tmp`, content, { mode: 0o600 }); await rename(`${path}.kosipa-staging-tmp`, path); await chmod(path, 0o600);
console.log(`Done. Local copy ${BUSINESS_DB} now has ledger ${LEDGER_DB}, writers ${MASTER_USER}/${MEMBER_USER}/${SAVINGS_USER}, fenced legacy menus (${fenceUrls.length} urls) and the flags in apps/web/.env.local. Restart the dev server to load them.`);
