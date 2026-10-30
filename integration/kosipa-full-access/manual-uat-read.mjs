/** Local manual UAT: synthetic identities over SELECT-only views of the refreshed baseline. Never copies production credentials. */
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadConfig, rootConnection, DB, USERS, KOSIPA_USERS } from './local-stack.mjs';

const root = resolve(import.meta.dirname, '../..');
const mysql = createRequire(resolve(root, 'apps/web/package.json'))('mysql2/promise');
process.on('uncaughtException', (error) => { console.error(`UAT_SETUP_FAILED:${error.code ?? (String(error.message).startsWith('UAT_') ? error.message : 'LOCAL_OPERATION_FAILED')}`); process.exit(1); });
const BASE = 'kkisi_staging';
const OVERLAY = 'kkisi_kosipa_read_uat', AUTH = 'kkisi_kosipa_read_auth', CONSOLE = 'kkisi_kosipa_read_console';
const local = resolve(root, '.local/kosipa-manual-uat');
const q = (v) => `'${String(v).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const identifier = (v) => { if (!/^[a-zA-Z0-9_]+$/.test(v)) throw Error('UAT_IDENTIFIER_REFUSED'); return `\`${v}\``; };
const parse = (text) => Object.fromEntries(text.split('\n').flatMap((line) => { const m = /^([A-Z_]+)=["']?(.*?)["']?$/.exec(line.trim()); return m ? [[m[1], m[2]]] : []; }));
const file = (p) => readFile(resolve(root, p), 'utf8');
const SYNTHETIC_TABLES = ['db_company', 'db_roles', 'db_permissions', 'db_users', 'ref_users', 'ref_group', 'ref_group_akses', 'ref_menu', 'ref_menu_akses'];
const SECRET_COLUMN = /^(password|password_confirmation|pin|otp|token|remember_token|api_key|secret_key|fcm_token|device_token|session_id)$/i;
const cfg = await loadConfig();
const source = await rootConnection(cfg); // validates existing FA synthetic sentinel
const staging = parse(await file('apps/web/.env.staging'));
const admin = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: staging.MARIADB_ROOT_PASSWORD, multipleStatements: true });
try {
  const [[baseline]] = await admin.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\'', [BASE]);
  if (Number(baseline.n) !== 283) throw Error('UAT_BASELINE_NOT_VERIFIED');
  const [[exists]] = await admin.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?,?,?)', [OVERLAY, AUTH, CONSOLE]);
  if (Number(exists.n) && !process.argv.includes('--resume')) throw Error('UAT_OVERLAY_EXISTS_NO_RESET_PERFORMED');
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${identifier(OVERLAY)} CHARACTER SET latin1 COLLATE latin1_swedish_ci`);
  const [tables] = await admin.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [BASE]);
  const [columns] = await admin.query('SELECT TABLE_NAME,COLUMN_NAME,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION', [BASE]);
  const scrubbedColumns = columns.filter((c) => !SYNTHETIC_TABLES.includes(c.TABLE_NAME) && SECRET_COLUMN.test(c.COLUMN_NAME)).length;
  for (const { TABLE_NAME: name } of tables) {
    const [[present]] = await admin.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [OVERLAY, name]);
    if (Number(present.n)) continue; // explicit --resume only; retain prior successful setup work
    if (SYNTHETIC_TABLES.includes(name)) {
      const [[ddl]] = await admin.query(`SHOW CREATE TABLE ${identifier(BASE)}.${identifier(name)}`);
      await admin.query(ddl['Create Table'].replace(`CREATE TABLE ${identifier(name)}`, `CREATE TABLE ${identifier(OVERLAY)}.${identifier(name)}`));
      const [seed] = await source.query(`SELECT * FROM ${identifier(DB)}.${identifier(name)}`);
      const allowed = columns.filter((c) => c.TABLE_NAME === name && !/GENERATED/.test(c.EXTRA)).map((c) => c.COLUMN_NAME);
      for (const row of seed) {
        const keys = Object.keys(row).filter((k) => allowed.includes(k));
        await admin.query(`INSERT INTO ${identifier(OVERLAY)}.${identifier(name)} (${keys.map(identifier)}) VALUES (${keys.map(() => '?')})`, keys.map((k) => row[k]));
      }
    } else {
      const selected = columns.filter((c) => c.TABLE_NAME === name).map((c) => {
        if (SECRET_COLUMN.test(c.COLUMN_NAME)) return `NULL AS ${identifier(c.COLUMN_NAME)}`;
        return identifier(c.COLUMN_NAME);
      });
      await admin.query(`CREATE SQL SECURITY INVOKER VIEW ${identifier(OVERLAY)}.${identifier(name)} AS SELECT ${selected.join(',')} FROM ${identifier(BASE)}.${identifier(name)}`);
    }
  }
  // The write harness grants member/master reads only; this read-only console also exercises existing savings/loan/payroll views.
  for (const [i, url] of ['simpanan/simpanan_c', 'pinjaman/pinjaman_c', 'payroll/matrix_c', 'anggota/trans_toko_c'].entries()) {
    const id = 9200 + i;
    await admin.query(`INSERT IGNORE INTO ${identifier(OVERLAY)}.ref_menu (id,nama_menu,url,status,parent_id,jenis_menu,akses_menu) VALUES (?, ?, ?, 1, 0, 'WEB', 'PRIVATE')`, [id, `SYNTH READ UAT ${i + 1}`, url]);
    await admin.query(`INSERT IGNORE INTO ${identifier(OVERLAY)}.ref_menu_akses (id,id_menu,id_group,status,tambah,edit,hapus,posting,approved) VALUES (?,?,9101,1,0,0,0,0,0)`, [id, id]);
  }
  await admin.query((await file('apps/web/db/auth/001_auth_schema.sql')).replaceAll('kkisi_auth_staging', AUTH));
  const consoleSchema = (await file('apps/web/db/console/001_console_schema.sql')).replaceAll('kkisi_console_staging', CONSOLE);
  const applied = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${staging.MARIADB_ROOT_PASSWORD}`, 'kkisi-staging', 'mariadb', '-uroot'], { input: consoleSchema, encoding: 'utf8' });
  if (applied.status !== 0) throw Error('UAT_CONSOLE_SCHEMA_FAILED');
  for (const key of ['admin', 'second', 'operator', 'viewer']) await admin.query(`INSERT INTO ${identifier(CONSOLE)}.console_identity_link (console_user_id,system,external_user_id,status,linked_by,linked_at) VALUES (?,'kosipa',?,'active',4294967000,UTC_TIMESTAMP())`, [USERS[key], KOSIPA_USERS[key]]);
  const credentials = { reader: { user: 'kfa_uat_read', password: randomBytes(24).toString('hex') }, auth: { user: 'kfa_uat_auth', password: randomBytes(24).toString('hex') }, console: { user: 'kfa_uat_console', password: randomBytes(24).toString('hex') } };
  const reader = credentials.reader;
  await admin.query(`CREATE USER ${q(reader.user)}@'%' IDENTIFIED BY ${q(reader.password)} WITH MAX_USER_CONNECTIONS 4; GRANT SELECT ON ${identifier(OVERLAY)}.* TO ${q(reader.user)}@'%'; GRANT SELECT ON ${identifier(BASE)}.* TO ${q(reader.user)}@'%'`);
  await admin.query((await file('apps/web/db/auth/002_auth_grants.sql.tpl')).replaceAll('kkisi_auth_staging', AUTH).replaceAll('kkisi_auth', credentials.auth.user).replaceAll('__AUTH_HOST__', '%').replaceAll('__AUTH_PW__', credentials.auth.password));
  await admin.query((await file('apps/web/db/console/002_console_grants.sql.tpl')).replaceAll('kkisi_console_staging', CONSOLE).replaceAll('kkisi_console', credentials.console.user).replaceAll('__AUTH_HOST__', '%').replaceAll('__AUTH_PW__', credentials.console.password));
  const dsn = (account, db, limit) => `mysql://${account.user}:${account.password}@127.0.0.1:3307/${db}?connection_limit=${limit}`;
  const own = { APP_ORIGIN: 'http://localhost:3231', KOSIPA_UAT_READ_ONLY: 'true', AUTH_SECRETS: `k1:${randomBytes(48).toString('base64')}`, DATABASE_URL: dsn(reader, OVERLAY, 3), DATABASE_URL_AUTH: dsn(credentials.auth, AUTH, 2), DATABASE_URL_CONSOLE: dsn(credentials.console, CONSOLE, 1), CONSOLE_ENABLED: 'true', KOSIPA_READ_ENABLED: 'true', KOSIPA_EXPORT_ENABLED: 'false', KOSIPA_MASTER_WRITES_ENABLED: 'false', KOSIPA_WRITE_GRANTS_ENABLED: 'false', POS_WRITES_ENABLED: 'false', PRODUCTS_WRITES_ENABLED: 'false', INVENTORY_WRITES_ENABLED: 'false', SALES_RETURN_WRITES_ENABLED: 'false', PSS_INTAKE_ENABLED: 'false' };
  const envPath = resolve(root, 'apps/web/.env.kosipa-read-uat');
  await writeFile(envPath, Object.entries(own).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n', { mode: 0o600 }); await chmod(envPath, 0o600);
  await mkdir(local, { recursive: true, mode: 0o700 });
  await writeFile(resolve(local, 'read-credentials.json'), JSON.stringify(credentials, null, 2), { mode: 0o600 });
  const check = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: reader.user, password: reader.password, database: OVERLAY });
  try {
    for (const target of [BASE, OVERLAY]) {
      let refused = false;
      try { await check.query(`UPDATE ${identifier(target)}.m_lokasi SET status=status WHERE 1=0`); } catch (e) { if (e.errno === 1142 || e.errno === 1143) refused = true; else throw e; }
      if (!refused) throw Error('UAT_READER_CAN_WRITE');
    }
    const [[a]] = await check.query(`SELECT COUNT(*) AS n FROM ${identifier(OVERLAY)}.m_anggota`);
    const [[b]] = await check.query(`SELECT COUNT(*) AS n FROM ${identifier(BASE)}.m_anggota`);
    if (String(a.n) !== String(b.n)) throw Error('UAT_READ_COUNTS_DIFFER');
    const summary = { mode: 'PRODUCTION_DERIVED_READ_ONLY_WITH_SYNTHETIC_IDENTITIES', baseline: BASE, overlay: OVERLAY, objects: tables.length, syntheticIdentityTables: SYNTHETIC_TABLES.length, scrubbedCredentialColumns: scrubbedColumns, members: String(a.n), readerMutationRefused: true, financialPostingEnabled: false, externalIntegrationsConfigured: false, origin: own.APP_ORIGIN };
    await writeFile(resolve(local, 'read-setup-evidence.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(summary));
  } finally { await check.end(); }
} finally { await source.end(); await admin.end(); }
