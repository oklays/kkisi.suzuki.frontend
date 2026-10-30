import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// FA-03A static validation of the REVIEW-ONLY production scripts (docs/migration/sql) that the KOSIPA write foundation depends on.
// Nothing here touches production: each script is applied, with its placeholders replaced, to SCRATCH databases inside the isolated FA-01
// container (opt-in KOSIPA_FA01=1), and the structure it creates must equal what the tested templates (apps/web/db) create.
// Also asserts the scripts are DDL-only on their own new databases: no data statements, no DROP, no USE, no broad grants.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`', timeout: 120_000 };
const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PROD = { ledger: '../../docs/migration/sql/kosipa-command-ledger-production.sql', console: '../../docs/migration/sql/console-store-production.sql', grants: '../../docs/migration/sql/kosipa-grants-production.sql' };
const S = { prodLedger: 'kkisi_kfa_static_prod_ledger', tplLedger: 'kkisi_kfa_static_tpl_ledger', prodConsole: 'kkisi_kfa_static_prod_console', tplConsole: 'kkisi_kfa_static_tpl_console' };
// Statements outside comments.
const code = (sql) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

// Top-level statements (DELIMITER-aware): trigger bodies stay inside their CREATE TRIGGER statement.
function statements(sql) {
  const out = []; let delimiter = ';'; let current = '';
  for (const line of code(sql).split('\n')) {
    const d = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (d) { delimiter = d[1]; continue; }
    current += `${line}\n`;
    if (current.trimEnd().endsWith(delimiter)) { out.push(current.trim().slice(0, -delimiter.length).trim()); current = ''; }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

test('production scripts are DDL-only on their own databases (no data statements, DROP, USE or broad grants)', () => {
  for (const [name, path] of Object.entries(PROD)) {
    const list = statements(file(path));
    assert.ok(list.length >= 2, `${name}: statements found`);
    for (const st of list) {
      assert.match(st, /^(CREATE TABLE IF NOT EXISTS|CREATE TRIGGER IF NOT EXISTS|SELECT|SHOW GRANTS FOR CURRENT_USER\(\))(?![A-Za-z0-9_])/i, `${name}: only CREATE TABLE/TRIGGER and read-only checks, found: ${st.slice(0, 60)}`);
      if (/^SELECT/i.test(st)) assert.match(st, /information_schema/i, `${name}: verification reads metadata only`);
      const target = /^CREATE (?:TABLE|TRIGGER) IF NOT EXISTS `([^`]+)`\./i.exec(st);
      if (target) assert.match(target[1], /^__(LEDGER|CONSOLE)_DB__$/, `${name}: objects only in the placeholder database, found ${target?.[1]}`);
      if (/^CREATE TRIGGER/i.test(st)) assert.match(st, /\bON `__(LEDGER|CONSOLE)_DB__`\./, `${name}: trigger on its own database`);
    }
  }
});

test('production scripts apply cleanly and create exactly the structure of the tested templates', options, async () => {
  const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
  const config = await stack.loadConfig();
  const sql = (text) => {
    const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot', '-N', '-B'], { input: text, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const drop = () => sql(Object.values(S).map((d) => `DROP DATABASE IF EXISTS \`${d}\`;`).join('\n'));
  // Structure without comments and counters: what the server actually enforces.
  const structure = (db) => {
    const tables = sql(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${db}' ORDER BY TABLE_NAME`).split('\n').filter(Boolean);
    const ddl = tables.map((t) => sql(`SHOW CREATE TABLE \`${db}\`.\`${t}\``).split('\t').slice(1).join('\t')
      .replace(/\\n/g, '\n').replace(/ COMMENT '(?:[^'\\]|\\.|'')*'/g, '').replace(/ AUTO_INCREMENT=\d+/, ''));
    const triggers = sql(`SELECT CONCAT(TRIGGER_NAME, ' ', ACTION_TIMING, ' ', EVENT_MANIPULATION, ' ', EVENT_OBJECT_TABLE, ' ', MD5(ACTION_STATEMENT)) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${db}' ORDER BY TRIGGER_NAME`);
    return { tables, ddl, triggers };
  };
  try {
    drop();
    sql(`CREATE DATABASE \`${S.prodLedger}\`; CREATE DATABASE \`${S.prodConsole}\`; CREATE DATABASE \`${S.tplConsole}\`;`);
    // Ledger: production script vs template 001.
    sql(file(PROD.ledger).replaceAll('__LEDGER_DB__', S.prodLedger).replaceAll('__WRITER_USER__', 'kfa_static_nobody'));
    sql(file('db/kosipa/001_command_ledger.sql.tpl').replaceAll('__LEDGER_DB__', S.tplLedger));
    const [pl, tl] = [structure(S.prodLedger), structure(S.tplLedger)];
    assert.deepEqual(pl.tables, ['kosipa_command_ledger']);
    assert.deepEqual(pl.ddl, tl.ddl, 'ledger: production DDL == template DDL');
    // Console store: production v1 + grant table vs templates 001 + 004; the production verification queries must all return ok = 1.
    const consoleOut = sql(file(PROD.console).replaceAll('__CONSOLE_DB__', S.prodConsole).replaceAll('__CONSOLE_USER__', 'kfa_static_nobody'));
    const grantsOut = sql(file(PROD.grants).replaceAll('__CONSOLE_DB__', S.prodConsole).replaceAll('__CONSOLE_USER__', 'kfa_static_nobody'));
    for (const [name, out, rows] of [['console-store', consoleOut, 5], ['kosipa-grants', grantsOut, 6]]) {
      const checks = out.split('\n').filter(Boolean).map((l) => l.split('\t'));
      assert.equal(checks.length, rows, `${name}: verification rows`);
      assert.deepEqual(checks.filter((c) => c.at(-1) !== '1').map((c) => c[0]), [], `${name}: every verification check ok = 1`);
    }
    sql(file('db/console/001_console_schema.sql').replaceAll('kkisi_console_staging', S.tplConsole));
    sql(file('db/console/004_kosipa_grants.sql').replaceAll('kkisi_console_staging', S.tplConsole));
    const [pc, tc] = [structure(S.prodConsole), structure(S.tplConsole)];
    assert.deepEqual(pc.tables, ['console_audit_event', 'console_identity_link', 'console_kosipa_grant']);
    assert.deepEqual(pc.ddl, tc.ddl, 'console store: production DDL == template DDL');
    assert.equal(pc.triggers, tc.triggers, 'console store: same triggers with identical bodies');
    assert.equal(pc.triggers.split('\n').length, 6);
    // The production grant table enforces what the tests prove on the template: the trigger refuses DELETE.
    sql(`INSERT INTO \`${S.prodConsole}\`.console_kosipa_grant (console_user_id, capability, requested_by, requested_at, grant_reason, expires_at) VALUES (2,'kosipa.master.manage',1,UTC_TIMESTAMP(),'static',UTC_TIMESTAMP() + INTERVAL 1 DAY);`);
    const del = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot'], { input: `DELETE FROM \`${S.prodConsole}\`.console_kosipa_grant;`, encoding: 'utf8' });
    assert.match(del.stderr, /never deleted/);
  } finally { drop(); }
});
