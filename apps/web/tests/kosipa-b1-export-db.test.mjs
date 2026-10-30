import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// B1 rehearsal (TASK-102, MIG-103; FA-01.5): apps/web/scripts/kosipa-b1-schema-export.sh against SYNTHETIC schema objects of every kind the
// production operator will meet (table with rows, view, procedure, function, trigger, event), in a scratch database of the isolated FA-01
// container, with an account holding only the documented read privileges. Proves: definitions exported, DEFINER/AUTO_INCREMENT stripped,
// no row value leaves the database, digests and checksums produced. Opt-in KOSIPA_FA01=1.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`', timeout: 120_000 };
const SCRATCH = 'kkisi_kfa_b1_rehearsal';
const SENTINEL = 'ROW-SENTINEL-NEVER-EXPORTED';

test('B1 export: every definition kind is captured, no row data leaves, credentials stay off the command line', options, async () => {
  const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
  const config = await stack.loadConfig();
  const pw = randomBytes(18).toString('hex');
  const root = (sql) => { const r = spawnSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${config.rootPassword}`, stack.CONTAINER, 'mariadb', '-uroot'], { input: sql, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const out = mkdtempSync(join(tmpdir(), 'kfa-b1-'));
  try {
    root(`DROP DATABASE IF EXISTS ${SCRATCH}; CREATE DATABASE ${SCRATCH}; USE ${SCRATCH};
      CREATE TABLE m_anggota (id INT PRIMARY KEY AUTO_INCREMENT, nik_kar VARCHAR(30), saldo DECIMAL(18,2), KEY ix_nik (nik_kar));
      INSERT INTO m_anggota (nik_kar, saldo) VALUES ('${SENTINEL}', 123456.78);
      CREATE VIEW v_saldo AS SELECT nik_kar, saldo * 2 AS saldo_dobel FROM m_anggota;
      DELIMITER //
      CREATE PROCEDURE x_proc_create_matrix(IN p VARCHAR(10)) BEGIN SELECT COUNT(*) FROM m_anggota WHERE nik_kar <> p; END//
      CREATE FUNCTION f_bulan(d DATE) RETURNS INT DETERMINISTIC RETURN MONTH(d)//
      CREATE TRIGGER trg_anggota_bi BEFORE INSERT ON m_anggota FOR EACH ROW SET NEW.saldo = COALESCE(NEW.saldo, 0)//
      DELIMITER ;
      CREATE EVENT ev_nightly ON SCHEDULE EVERY 1 DAY DISABLE DO DELETE FROM m_anggota WHERE 1 = 0;
      CREATE USER IF NOT EXISTS 'kfa_b1'@'localhost' IDENTIFIED BY '${pw}'; ALTER USER 'kfa_b1'@'localhost' IDENTIFIED BY '${pw}';
      REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kfa_b1'@'localhost';
      GRANT SELECT, SHOW VIEW, TRIGGER, SHOW CREATE ROUTINE ON ${SCRATCH}.* TO 'kfa_b1'@'localhost';`);
    // Option file inside the container (mode 600), as the operator keeps it on the server; never on the command line.
    const cnf = spawnSync('docker', ['exec', '-i', stack.CONTAINER, 'sh', '-c', 'umask 077; cat > /tmp/kfa-b1.cnf'], { input: `[client]\nuser=kfa_b1\npassword=${pw}\nhost=localhost\n`, encoding: 'utf8' });
    assert.equal(cnf.status, 0);
    const script = new URL('../scripts/kosipa-b1-schema-export.sh', import.meta.url).pathname;
    const env = { ...process.env, DUMP: `docker exec -i ${stack.CONTAINER} mariadb-dump`, CLIENT: `docker exec -i ${stack.CONTAINER} mariadb` };
    const dry = spawnSync(script, ['--database', SCRATCH, '--defaults-file', '/tmp/kfa-b1.cnf', '--out', out], { env, encoding: 'utf8' });
    assert.equal(dry.status, 0); assert.match(dry.stdout, /DRY RUN/); assert.ok(!dry.stdout.includes(pw));
    const run = spawnSync(script, ['--database', SCRATCH, '--defaults-file', '/tmp/kfa-b1.cnf', '--out', out, '--run'], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!(run.stdout + run.stderr).includes(pw), 'the password is never printed');
    const schema = readFileSync(join(out, 'schema.sql'), 'utf8');
    for (const definition of [/CREATE TABLE `m_anggota`/, /VIEW `v_saldo` AS select/i, /PROCEDURE `x_proc_create_matrix`/, /FUNCTION `f_bulan`/, /TRIGGER `?trg_anggota_bi`? BEFORE INSERT/]) assert.match(schema, definition);
    assert.ok(!schema.includes(SENTINEL) && !schema.includes('123456.78'), 'no row value is exported');
    assert.doesNotMatch(schema, /^\s*(INSERT|REPLACE)\s+INTO/im);
    assert.doesNotMatch(schema, / AUTO_INCREMENT=\d/); assert.doesNotMatch(schema, /DEFINER=`/);
    const objects = readFileSync(join(out, 'objects.tsv'), 'utf8');
    for (const kind of ['VIEW\tv_saldo', 'PROCEDURE\tx_proc_create_matrix', 'FUNCTION\tf_bulan', 'TRIGGER\ttrg_anggota_bi']) assert.ok(objects.includes(kind), kind);
    assert.ok(!objects.includes('EVENT\tev_nightly'), 'without the EVENT privilege events are not visible: the operator report must state this (B1 instructions)');
    assert.match(readFileSync(join(out, 'indexes.tsv'), 'utf8'), /m_anggota\tix_nik/);
    assert.match(readFileSync(join(out, 'SHA256SUMS'), 'utf8'), /[0-9a-f]{64}\s+schema\.sql/);
    assert.match(run.stdout, /done: 1 tables, 1 views, 2 routines, 1 triggers/);
  } finally {
    spawnSync('docker', ['exec', stack.CONTAINER, 'rm', '-f', '/tmp/kfa-b1.cnf']);
    root(`DROP DATABASE IF EXISTS ${SCRATCH}; DROP USER IF EXISTS 'kfa_b1'@'localhost';`);
    rmSync(out, { recursive: true, force: true });
  }
});
