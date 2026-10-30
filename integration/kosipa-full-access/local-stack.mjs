/**
 * FA-01 isolated synthetic stack (kosipa-full-access). A disposable, loopback-only MariaDB 11.4 container that holds EVERYTHING the
 * native KOSIPA write foundation needs, so no test or browser run touches the real-data staging copy, DEV LOCAL or production:
 *   kkisi_kfa_synthetic     business database: legacy STRUCTURE only (db/e2e/*.sql + fixtures/legacy-structure.sql, no rows copied
 *                           from anywhere) + the command ledger (db/kosipa/001) + SYNTHETIC rows seeded here
 *   kkisi_kfa_ledger        the command ledger ONLY (db/kosipa/001), same server: one transaction spans both databases (FD-01b)
 *   kkisi_auth_staging      auth store schema (db/auth/001)            kkisi_console_staging   console store (db/console/001 + 004)
 * Accounts are the application's least-privilege set, created from the repository templates. Secrets are random, live only in
 * .local/kosipa-fa01/ (mode 600, gitignored) and apps/web/.env.kosipa-fa01 (mode 600, gitignored), and are never printed.
 * Never reads the repository .env files, never connects to port 3307, never runs DDL outside this container.
 *   node integration/kosipa-full-access/local-stack.mjs setup|status|reset|stop
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const web = resolve(root, 'apps/web');
const local = resolve(root, '.local/kosipa-fa01');
const configPath = resolve(local, 'config.json');
const envPath = resolve(web, '.env.kosipa-fa01');
const require = createRequire(resolve(web, 'package.json'));
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

export const CONTAINER = 'kkisi-kosipa-fa01';
export const PORT = 3322;
export const APP_PORT = 3230;
export const DB = 'kkisi_kfa_synthetic';
/** FD-01b: the command ledger in its own database on the same server. */
export const LEDGER_DB = 'kkisi_kfa_ledger';
export const AUTH_DB = 'kkisi_auth_staging';
export const CONSOLE_DB = 'kkisi_console_staging';
/** Synthetic ids (reserved ranges, never present in a legacy copy). */
export const USERS = { admin: 910001, operator: 910002, viewer: 910003, unlinked: 910004, second: 910005 };
/** Grant administrators (two, so a request by one can be approved by the other). */
export const GRANT_ADMINS = [USERS.admin, USERS.second];
export const KOSIPA_USERS = { admin: 9101, operator: 9102, viewer: 9103, second: 9105 };

const secret = () => randomBytes(24).toString('hex');
const quote = (v) => `'${String(v).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const fail = (message) => { throw new Error(message); };

export async function loadConfig() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (config.mode !== 'LOCAL_SYNTHETIC' || config.port !== PORT || !/^[a-f0-9]{32}$/.test(config.installationId)) fail('KFA_INVALID_LOCAL_CONFIG');
  return config;
}

/** DSNs for tests and the app; every one is loopback:3322 and names an FA-01 database. */
export function dsn(config, account, database, limit = 2) {
  const { user, password } = config.accounts[account];
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${PORT}/${database}?connection_limit=${limit}`;
}

async function adminSql(config, sql) {
  const child = spawn('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, CONTAINER, 'mariadb', '-uroot', '--default-character-set=utf8mb4'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let error = ''; child.stderr.on('data', (c) => { error += c; }); child.stdout.resume();
  child.stdin.end(sql);
  await new Promise((ok, ko) => { child.on('error', () => ko(new Error('KFA_DATABASE_COMMAND_FAILED'))); child.on('close', (code) => (code === 0 ? ok() : ko(new Error(`KFA_DATABASE_COMMAND_FAILED (${error.match(/ERROR [0-9]+[^\n]*/)?.[0] ?? 'SQL error'})`)))); });
}

export async function rootConnection(config, database = DB) {
  const db = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: config.rootPassword, database, multipleStatements: false, dateStrings: true });
  const [rows] = await db.query(`SELECT id, mode FROM \`${DB}\`._kfa_installation`).catch(() => [[]]);
  if (database === DB && (rows.length !== 1 || rows[0].id !== config.installationId || rows[0].mode !== 'LOCAL_SYNTHETIC')) { await db.end(); fail('KFA_SENTINEL_MISMATCH'); }
  return db;
}

const template = async (path, map) => { let sql = await readFile(resolve(root, path), 'utf8'); for (const [k, v] of Object.entries(map)) sql = sql.replaceAll(k, v); return sql; };

async function applySchema(config) {
  const structure = (await readFile(resolve(web, 'db/e2e/001_e2e_structure.sql'), 'utf8')) + (await readFile(resolve(web, 'db/e2e/003_e2e_kosipa_structure.sql'), 'utf8'));
  const business = structure.replaceAll('kkisi_e2e_legacy', DB);
  const pw = (a) => config.accounts[a].password;
  await adminSql(config, [
    `DROP DATABASE IF EXISTS \`${DB}\`; DROP DATABASE IF EXISTS \`${LEDGER_DB}\`; DROP DATABASE IF EXISTS \`${AUTH_DB}\`; DROP DATABASE IF EXISTS \`${CONSOLE_DB}\`;`,
    `CREATE DATABASE \`${DB}\` CHARACTER SET latin1;`,
    business,
    await template('integration/kosipa-full-access/fixtures/legacy-structure.sql', { __KOSIPA_DB__: DB }),
    await template('integration/kosipa-full-access/fixtures/legacy-runtime-structure.sql', { __KOSIPA_DB__: DB }),
    `CREATE TABLE \`${DB}\`._kfa_installation (id CHAR(32) PRIMARY KEY, mode VARCHAR(20) NOT NULL); INSERT INTO \`${DB}\`._kfa_installation VALUES (${quote(config.installationId)}, 'LOCAL_SYNTHETIC');`,
    await template('apps/web/db/kosipa/001_command_ledger.sql.tpl', { __LEDGER_DB__: LEDGER_DB }),
    await template('apps/web/db/kosipa/005_document_number_registry.sql.tpl', { __LEDGER_DB__: LEDGER_DB }),
    await readFile(resolve(web, 'db/auth/001_auth_schema.sql'), 'utf8'),
    await readFile(resolve(web, 'db/console/001_console_schema.sql'), 'utf8'),
    await readFile(resolve(web, 'db/console/004_kosipa_grants.sql'), 'utf8'),
    // Accounts (inside this disposable container only; '%' because the host reaches it through the docker bridge).
    `CREATE USER IF NOT EXISTS 'kfa_read'@'%' IDENTIFIED BY ${quote(pw('read'))}; ALTER USER 'kfa_read'@'%' IDENTIFIED BY ${quote(pw('read'))};
     REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kfa_read'@'%'; GRANT SELECT ON \`${DB}\`.* TO 'kfa_read'@'%';`,
    await template('apps/web/db/auth/002_auth_grants.sql.tpl', { __AUTH_HOST__: '%', __AUTH_PW__: pw('auth') }),
    await template('apps/web/db/console/002_console_grants.sql.tpl', { __AUTH_HOST__: '%', __AUTH_PW__: pw('console') }),
    await template('apps/web/db/console/005_kosipa_grants_grants.sql.tpl', { __CONSOLE_USER__: 'kkisi_console', __HOST__: '%' }),
    await template('apps/web/db/kosipa/002_master_writer_grants.sql.tpl', { __KOSIPA_DB__: DB, __LEDGER_DB__: LEDGER_DB, __HOST__: '%', __PW__: pw('masterWrite') }),
    await template('apps/web/db/kosipa/003_cpanel_model_writer.sql.tpl', { __KOSIPA_DB__: DB, __LEDGER_DB__: LEDGER_DB, __HOST__: '%', __PW__: pw('cpanelModel') }),
    // TASK-109 test writer: the privileges a future document writer needs for numbering (read the numbered column; claim in the ledger database).
    `CREATE USER IF NOT EXISTS 'kfa_numbering_w'@'%' IDENTIFIED BY ${quote(pw('numbering'))}; ALTER USER 'kfa_numbering_w'@'%' IDENTIFIED BY ${quote(pw('numbering'))} WITH MAX_USER_CONNECTIONS 4;
     REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kfa_numbering_w'@'%';
     GRANT SELECT (\`doc_no\`) ON \`${DB}\`.\`m_anggota\` TO 'kfa_numbering_w'@'%'; GRANT SELECT (\`doc_no\`) ON \`${DB}\`.\`trans_simpanan\` TO 'kfa_numbering_w'@'%';
     GRANT SELECT (\`doc_no\`) ON \`${DB}\`.\`trans_pinjaman\` TO 'kfa_numbering_w'@'%'; GRANT SELECT (\`doc_no\`) ON \`${DB}\`.\`trans_potongan_bulanan\` TO 'kfa_numbering_w'@'%';
     GRANT SELECT ON \`${DB}\`.\`ref_menu\` TO 'kfa_numbering_w'@'%'; GRANT SELECT, INSERT ON \`${LEDGER_DB}\`.* TO 'kfa_numbering_w'@'%';`,
  ].join('\n'));
}

/** Synthetic rows only. Passwords are random; hashes are bcrypt cost 4 with the legacy $2y$ prefix. */
async function seed(config) {
  const db = await rootConnection(config);
  try {
    const q = (sql, params = []) => db.query(sql, params);
    await q("SET SESSION sql_mode=''");
    await q("INSERT INTO db_company (id, company_name, status, sales_init) VALUES (9101,'SYNTH KFA BRANCH',1,'K1')");
    await q("INSERT INTO db_roles (id, role_name, description, status) VALUES (1,'Administrator','',1),(4,'Kasir Toko','',1)");
    await q("INSERT INTO db_permissions (role_id, permissions) VALUES (1,'users_edit')");
    for (const [name, id] of Object.entries(USERS)) {
      const role = name === 'admin' || name === 'second' ? 1 : 4;
      await q('INSERT INTO db_users (id, username, nik_account, role_id, company_id, akses_lokasi, fullname, password, status) VALUES (?,?,"0",?,9101,9101,?,?,1)',
        [id, `synth_kfa_${name}`, role, `SYNTH KFA ${name.toUpperCase()}`, '$2y$' + bcrypt.hashSync(config.passwords[name], 4).slice(4)]);
    }
    await q("INSERT INTO ref_group (id, nama_group, status) VALUES (9101,'SYNTH KFA STAF',1)");
    for (const [name, id] of Object.entries(KOSIPA_USERS)) {
      await q("INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (?,?,?,1,'x','',0,'')", [id, `synth_kfa_k_${name}`, `SYNTH KFA KOSIPA ${name.toUpperCase()}`]);
      await q('INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (?,?,9101,1)', [id, id]);
    }
    // The member directory grants kosipa.member.view. The five master controllers are granted to the group too (a legacy menu never yields a
    // write capability) and FENCED (status 0), as at cutover; admin/adm_menu_c stays enabled, like production (the FD-03 re-enable path).
    await q(`INSERT INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9101,'SYNTH Anggota','master/anggota_c',1,0,'WEB','PRIVATE'),
      (9102,'SYNTH Master Lokasi','master/lokasi_c',0,0,'WEB','PRIVATE'),(9103,'SYNTH Master Bagian','master/bagian_c',0,0,'WEB','PRIVATE'),
      (9104,'SYNTH Jenis Dokumen','master/jenis_dokumen_c',0,0,'WEB','PRIVATE'),(9105,'SYNTH Rekening Bank','master/rekening_bank_c',0,0,'WEB','PRIVATE'),
      (9106,'SYNTH Periode Angsuran','master/periode_angsuran_c',0,0,'WEB','PRIVATE'),(9107,'SYNTH Menu Admin','admin/adm_menu_c',1,0,'WEB','PRIVATE'),
      (9108,'SYNTH Anggota KOSIPA','anggota/anggota_c',1,0,'WEB','PRIVATE'),(9109,'SYNTH Pengguna Mobile','mobile/users_c',1,0,'WEB','PRIVATE')`);
    await q('INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9101,9101,9101,1,1,1,1,0,0),(9102,9102,9101,1,1,1,1,0,0),(9103,9103,9101,1,1,1,1,0,0),(9104,9104,9101,1,1,1,1,0,0),(9105,9105,9101,1,1,1,1,0,0),(9106,9106,9101,1,1,1,1,0,0),(9107,9107,9101,1,1,1,1,0,0),(9108,9108,9101,1,1,1,1,0,0),(9109,9109,9101,1,1,1,1,0,0)');
    await q("INSERT INTO m_lokasi (id, code_lokasi, name_lokasi, status) VALUES (1,'SYN-TMB','SYNTH Tambun',1),(2,'SYN-PLG','SYNTH Pulo Gadung',1),(3,'SYN-OLD','SYNTH Lokasi Lama',0)");
    // Legacy application settings the unchanged CI2 login reads (autentifikasi::load_info, view_helper): synthetic values only.
    await q("INSERT INTO db_currency (id, currency_name, currency, currency_code, symbol) VALUES (1,'SYNTH RUPIAH','IDR','IDR','Rp')");
    await q("INSERT INTO ref_site (id_ref_site, kodesite, nama, address, timezone, date_format, time_format, currency_id, currency_placement, logo) VALUES (1,'SYN','SYNTH KOPERASI KFA','SYNTH ADDRESS','Asia/Jakarta','dd-mm-yyyy','24',1,'Left','synth.png')");
    await q("INSERT INTO m_bagian (id, name_bagian, id_lokasi, status) VALUES (1,'SYNTH Produksi',NULL,1),(2,'SYNTH Gudang',NULL,1),(3,'SYNTH Keuangan',NULL,1),(4,'SYNTH Lama',NULL,0)");
    await q("INSERT INTO m_jenis_dokumen (id, jenis_dokumen_code, jenis_dokumen_name, jenis_dokumen_remarks, is_active, cd, cd_usr) VALUES (1,'SYN-KTP','SYNTH KTP','','1',NOW(),'SYNTH SEED'),(2,'SYN-KK','SYNTH KARTU KELUARGA','','1',NOW(),'SYNTH SEED')");
    await q("INSERT INTO m_rekening (id, rekening_code, rekening_name, rekening_remarks, is_active, cd, cd_usr) VALUES (1,'SYN BANK A','SYNTH BANK A','','1',NOW(),'SYNTH SEED'),(2,'SYN BANK B','SYNTH BANK B','','1',NOW(),'SYNTH SEED')");
    await q("INSERT INTO m_jangka_waktu (id, jangka_waktu_code, jangka_waktu_name, jangka_waktu_remarks, is_active, cd, cd_usr) VALUES (1,'12','12 X','1 TAHUN','1',NOW(),'SYNTH SEED'),(2,'24','24 X','2 TAHUN','1',NOW(),'SYNTH SEED')");
    await q("INSERT INTO m_anggota (id, nik_kar, nama_kar, lokasi, bagian, status_anggota, kd_group) VALUES (9101,'SKFA0001','SYNTH ANGGOTA KFA 1','SYNTH Tambun','SYNTH Produksi','AKTIVE','ANGGOTA'),(9102,'SKFA0002','SYNTH ANGGOTA KFA 2','SYNTH Tambun',NULL,'AKTIVE','ANGGOTA')");
    await q("INSERT INTO users (id, nik, ktp, name, phone, image, email, password, persetujuan, lokasi, bagian) VALUES (9101,'SKFA0003','SKFA0003','SYNTH MOBILE KFA','000','', 'kfa3@example.invalid','x',1,'SYNTH Pulo Gadung','SYNTH Gudang')");
    // Legacy-format document numbers of October 2026 (TASK-109 tests): the REG floor and a PIN number a native row id could clash with.
    await q("UPDATE m_anggota SET doc_no = 'REG2026100007', cd = '2026-10-03 09:00:00' WHERE id = 9101");
    await q("UPDATE m_anggota SET doc_no = 'REG2026100003', cd = '2026-10-02 09:00:00' WHERE id = 9102");
    // A synthetic bank loan that stores bank code 'SYN BANK A' (trans_pinjaman.bank_pembiaya), as the legacy bank-loan form does.
    await q("INSERT INTO trans_pinjaman (id, doc_no, doc_date, nik, nama, jenis_pinjaman, bank_pembiaya, plan_pinjaman, plan_jangka_waktu, plan_angsuran, doc_status, status_pencairan, status_bayar) VALUES (9101,'PIN20261000777','2026-08-10','SKFA0001','SYNTH ANGGOTA KFA 1','BANK','SYN BANK A',12000000,12,1120000,'APPROVED','APPROVED','BELUM LUNAS')");
  } finally { await db.end(); }
  const store = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: config.rootPassword, database: CONSOLE_DB });
  try {
    // Identity links (by value). Linked by a synthetic administrator id that is nobody's console account.
    for (const name of ['admin', 'operator', 'viewer', 'second']) {
      await store.query("INSERT INTO console_identity_link (console_user_id, system, external_user_id, status, linked_by, linked_at) VALUES (?, 'kosipa', ?, 'active', 4294967000, UTC_TIMESTAMP())", [USERS[name], KOSIPA_USERS[name]]);
    }
  } finally { await store.end(); }
}

async function writeAppEnv(config) {
  const lines = {
    APP_ORIGIN: `http://127.0.0.1:${APP_PORT}`,
    AUTH_SECRETS: `k1:${config.authSecret}`,
    DATABASE_URL: dsn(config, 'read', DB, 3),
    DATABASE_URL_AUTH: dsn(config, 'auth', AUTH_DB, 2),
    DATABASE_URL_CONSOLE: dsn(config, 'console', CONSOLE_DB, 1),
    DATABASE_URL_KOSIPA_MASTER_WRITE: dsn(config, 'masterWrite', DB, 2),
    CONSOLE_ENABLED: 'true', KOSIPA_READ_ENABLED: 'true',
    KOSIPA_WRITE_GRANTS_ENABLED: 'true', KOSIPA_GRANT_ADMIN_USER_IDS: GRANT_ADMINS.join(','),
    KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_LEDGER_DATABASE: LEDGER_DB,
    KOSIPA_WRITE_OWNERSHIP: 'master.lokasi,master.bagian,master.jenis_dokumen,master.rekening_bank,master.periode_angsuran',
  };
  await writeFile(envPath, Object.entries(lines).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n', { mode: 0o600 });
  await chmod(envPath, 0o600);
  await writeFile(resolve(local, 'accounts.json'), JSON.stringify(Object.fromEntries(Object.entries(USERS).map(([n, id]) => [n, { id, username: `synth_kfa_${n}`, password: config.passwords[n] }])), null, 2), { mode: 0o600 });
}

async function waitReady(config) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const c = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: config.rootPassword, connectTimeout: 1000 }); await c.end(); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  fail('KFA_DATABASE_NOT_READY');
}

export async function setup() {
  await mkdir(local, { recursive: true, mode: 0o700 }); await chmod(local, 0o700);
  let config;
  try { config = await loadConfig(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = {
      mode: 'LOCAL_SYNTHETIC', port: PORT, installationId: randomBytes(16).toString('hex'), rootPassword: secret(), authSecret: randomBytes(48).toString('base64'),
      accounts: { read: { user: 'kfa_read', password: secret() }, auth: { user: 'kkisi_auth', password: secret() }, console: { user: 'kkisi_console', password: secret() }, masterWrite: { user: 'kosipa_master_w', password: secret() }, cpanelModel: { user: 'kosipa_cpanel_w', password: secret() }, numbering: { user: 'kfa_numbering_w', password: secret() } },
      passwords: Object.fromEntries(Object.keys(USERS).map((n) => [n, randomBytes(12).toString('base64url')])),
    };
    await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  if (!config.accounts.cpanelModel || !config.accounts.numbering) { config.accounts.cpanelModel ??= { user: 'kosipa_cpanel_w', password: secret() }; config.accounts.numbering ??= { user: 'kfa_numbering_w', password: secret() }; await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); }
  await chmod(configPath, 0o600);
  let exists = false; try { await run('docker', ['inspect', CONTAINER]); exists = true; } catch { /* first run */ }
  if (!exists) {
    await run('docker', ['run', '--name', CONTAINER, '--label', 'kkisi.mode=LOCAL_SYNTHETIC', '--label', `kkisi.installation=${config.installationId}`,
      '-e', `MARIADB_ROOT_PASSWORD=${config.rootPassword}`, '-e', 'MARIADB_ROOT_HOST=%', '-p', `127.0.0.1:${PORT}:3306`, '-d', 'mariadb:11.4'], { timeout: 300000 });
  } else {
    const { stdout } = await run('docker', ['inspect', '--format', '{{ index .Config.Labels "kkisi.installation" }}', CONTAINER]);
    if (stdout.trim() !== config.installationId) fail('KFA_CONTAINER_SENTINEL_MISMATCH');
    await run('docker', ['start', CONTAINER]);
  }
  await waitReady(config);
  const probe = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: config.rootPassword });
  let installed = false;
  try { const [rows] = await probe.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [DB, '_kfa_installation']); installed = Number(rows[0].n) === 1; } finally { await probe.end(); }
  if (installed) (await rootConnection(config)).end();
  else { await applySchema(config); await seed(config); }
  await writeAppEnv(config);
  return { mode: config.mode, port: PORT, database: DB, installationId: config.installationId, appEnv: 'apps/web/.env.kosipa-fa01' };
}

export async function reset() {
  const config = await loadConfig();
  if (!config.accounts.cpanelModel || !config.accounts.numbering) { config.accounts.cpanelModel ??= { user: 'kosipa_cpanel_w', password: secret() }; config.accounts.numbering ??= { user: 'kfa_numbering_w', password: secret() }; await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); }
  (await rootConnection(config)).end();                  // refuses unless the sentinel matches this installation
  await applySchema(config); await seed(config); await writeAppEnv(config);
  return { reset: true };
}

export async function stop() {
  const config = await loadConfig();
  const { stdout } = await run('docker', ['inspect', '--format', '{{ index .Config.Labels "kkisi.installation" }}', CONTAINER]);
  if (stdout.trim() !== config.installationId) fail('KFA_CONTAINER_SENTINEL_MISMATCH');
  await run('docker', ['stop', CONTAINER]);
  return { stopped: true, dataPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2] ?? 'status';
    if (command === 'setup') console.log(JSON.stringify(await setup()));
    else if (command === 'reset') console.log(JSON.stringify(await reset()));
    else if (command === 'stop') console.log(JSON.stringify(await stop()));
    else if (command === 'status') { const config = await loadConfig(); const db = await rootConnection(config); try { const [[n]] = await db.query(`SELECT COUNT(*) AS ledger FROM \`${LEDGER_DB}\`.kosipa_command_ledger`); console.log(JSON.stringify({ mode: config.mode, port: PORT, ledgerRows: Number(n.ledger) })); } finally { await db.end(); } }
    else fail('KFA_UNKNOWN_COMMAND');
  } catch (error) {
    console.error(/^KFA_/.test(error.message) ? error.message : 'KFA_STACK_COMMAND_FAILED');
    process.exitCode = 1;
  }
}
