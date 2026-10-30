import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// FA-01 migration rehearsal (TASK-105, TASK-110; MIG-101): forward -> rollback -> forward for the command ledger and the console grant
// table, in a SCRATCH database inside the isolated FA-01 container only (opt-in KOSIPA_FA01=1). Rollback retires (renames) and keeps rows.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`' };
const SCRATCH = 'kkisi_kfa_rollback_rehearsal';
const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('ledger and grant migrations: forward, rollback keeps evidence, forward again', options, async () => {
  const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
  const config = await stack.loadConfig();
  const sql = (text) => {
    const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot', '-N', '-B'], { input: text, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const ledger = (name) => file(name).replaceAll('__LEDGER_DB__', SCRATCH);
  const grants = (name) => file(name).replaceAll('kkisi_console_staging', SCRATCH);
  const tables = () => sql(`SELECT GROUP_CONCAT(TABLE_NAME ORDER BY TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SCRATCH}'`);
  try {
    sql(`DROP DATABASE IF EXISTS ${SCRATCH};`);   // the ledger migration creates its own database (FD-01b)
    sql(ledger('db/kosipa/001_command_ledger.sql.tpl')); sql(grants('db/console/004_kosipa_grants.sql'));
    assert.equal(tables(), 'console_kosipa_grant,kosipa_command_ledger');
    sql(`INSERT INTO ${SCRATCH}.kosipa_command_ledger (command, capability, idempotency_key, request_hash, request_id, actor_console_user_id, actor_kosipa_user_id, subject_type, subject_ref, result_json, created_at)
      VALUES ('master.lokasi.create','kosipa.master.manage','6f1c2a4e-1b7d-4c55-9a0e-2a3f4b5c6d7e','${'a'.repeat(64)}','r',1,1,'master.lokasi','new','{}',UTC_TIMESTAMP(3));
      INSERT INTO ${SCRATCH}.console_kosipa_grant (console_user_id, capability, requested_by, requested_at, grant_reason, expires_at) VALUES (2,'kosipa.master.manage',1,UTC_TIMESTAMP(),'rehearsal',UTC_TIMESTAMP() + INTERVAL 1 DAY);`);
    assert.match(spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot'], { input: `DELETE FROM ${SCRATCH}.console_kosipa_grant;`, encoding: 'utf8' }).stderr, /never deleted/, 'trigger guard active after forward');

    sql(ledger('db/kosipa/001_command_ledger.rollback.sql.tpl')); sql(grants('db/console/004_kosipa_grants.rollback.sql'));
    assert.equal(tables(), 'console_kosipa_grant_retired,kosipa_command_ledger_retired');
    assert.equal(sql(`SELECT (SELECT COUNT(*) FROM ${SCRATCH}.kosipa_command_ledger_retired) + (SELECT COUNT(*) FROM ${SCRATCH}.console_kosipa_grant_retired)`), '2', 'evidence kept');

    sql(ledger('db/kosipa/001_command_ledger.sql.tpl')); sql(grants('db/console/004_kosipa_grants.sql'));
    assert.equal(tables(), 'console_kosipa_grant,console_kosipa_grant_retired,kosipa_command_ledger,kosipa_command_ledger_retired');
    assert.equal(sql(`SELECT COUNT(*) FROM ${SCRATCH}.kosipa_command_ledger`), '0', 'forward again starts empty');
  } finally { sql(`DROP DATABASE IF EXISTS ${SCRATCH};`); }
});

test('document-number registry (TASK-109): forward, rollback retires and keeps issued numbers, forward again', options, async () => {
  const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
  const config = await stack.loadConfig();
  const sql = (text) => {
    const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot', '-N', '-B'], { input: text, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const registry = (name) => file(name).replaceAll('__LEDGER_DB__', SCRATCH);
  const tables = () => sql(`SELECT GROUP_CONCAT(TABLE_NAME ORDER BY TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SCRATCH}'`);
  const insert = (seq, docNo) => `INSERT INTO ${SCRATCH}.kosipa_document_number (scheme, period, seq, doc_no, subject_table, request_id, created_at) VALUES ('member-registration','202611',${seq},'${docNo}','m_anggota','r',UTC_TIMESTAMP(3));`;
  try {
    sql(`DROP DATABASE IF EXISTS ${SCRATCH}; CREATE DATABASE ${SCRATCH};`);   // in production the registry joins the existing ledger database
    sql(registry('db/kosipa/005_document_number_registry.sql.tpl'));
    sql(registry('db/kosipa/005_document_number_registry.sql.tpl'));         // idempotent
    assert.equal(tables(), 'kosipa_document_number');
    sql(insert(8, 'REG2026110008'));
    for (const bad of [insert(8, 'REG2026110099'), insert(9, 'REG2026110008'), insert(10, 'reg2026110010'),
      `INSERT INTO ${SCRATCH}.kosipa_document_number (scheme, period, seq, doc_no, subject_table, request_id, created_at) VALUES ('member-registration','202613',1,'REG2026130001','m_anggota','r',UTC_TIMESTAMP(3));`]) {
      const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot'], { input: bad, encoding: 'utf8' });
      assert.notEqual(r.status, 0, `refused: ${bad.slice(-80)}`); assert.match(r.stderr, /Duplicate entry|CONSTRAINT/);
    }
    sql(registry('db/kosipa/005_document_number_registry.rollback.sql.tpl'));
    assert.equal(tables(), 'kosipa_document_number_retired');
    assert.equal(sql(`SELECT doc_no FROM ${SCRATCH}.kosipa_document_number_retired`), 'REG2026110008', 'issued numbers kept as evidence');
    sql(registry('db/kosipa/005_document_number_registry.sql.tpl'));
    assert.equal(tables(), 'kosipa_document_number,kosipa_document_number_retired');
  } finally { sql(`DROP DATABASE IF EXISTS ${SCRATCH};`); }
});
