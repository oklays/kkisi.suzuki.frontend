import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

// FD-03 rehearsal on the ISOLATED synthetic stack (opt-in KOSIPA_FA01=1): the exact SQL of legacy user_m::cekstatushakakses
// (kosipa/application/models/user_m.php:379-390, values bound here) answers "allowed" before the fence, "refused" after it for every
// user, and "allowed" again after the rollback. The fence SQL is the generator's output, executed as written.
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`' };

const LEGACY_GATE = `select count(*) as jlh from ref_menu a,ref_menu_akses b,ref_group_akses c
  where a.id=b.id_menu and b.id_group=c.id_group and (c.id_user=lower(?) or c.id_user=lower(?)) and upper(a.url)=upper(?) and a.status=1 and c.status=1`;

test('ref_menu.status fences master/Lokasi_c for every user and the rollback restores it (FD-03, TASK-113)', options, async () => {
  const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
  const config = await stack.loadConfig();
  const db = await stack.rootConnection(config);
  const allowed = async (user) => Number((await db.query(LEGACY_GATE, [user, -1, 'master/Lokasi_c']))[0][0].jlh) > 0;   // get_class() -> 'Lokasi_c'
  try {
    const users = Object.values(stack.KOSIPA_USERS);
    await db.query("UPDATE ref_menu SET status = 1 WHERE id = 9102");                          // the stack starts fenced (as at cutover): reopen for the rehearsal
    for (const u of users) assert.equal(await allowed(u), true, `before fence: ${u}`);
    const sql = execFileSync(process.execPath, ['--experimental-strip-types', new URL('../scripts/kosipa-legacy-fence.mjs', import.meta.url).pathname, 'master.lokasi', '--database', stack.DB], { encoding: 'utf8' });
    const fence = sql.slice(sql.indexOf('START TRANSACTION;'), sql.indexOf('COMMIT;') + 'COMMIT;'.length).split('\n').filter((l) => /^(START|UPDATE|COMMIT)/.test(l));
    const [[pre]] = await db.query(`SELECT GROUP_CONCAT(id) AS ids FROM ref_menu WHERE UPPER(url) = UPPER('master/lokasi_c') AND status = 1`);
    for (const statement of fence) await db.query(statement);
    for (const u of users) assert.equal(await allowed(u), false, `after fence: ${u}`);
    assert.equal(await allowed(9102), false, 'an already logged-in user is refused on the next request (the gate re-reads the DB every request)');
    const [[verify]] = await db.query(sql.match(/-- 2\. VERIFY[^\n]*\n(SELECT[^\n]*;)/)[1]);
    assert.equal(Number(verify.rows_open), 0);
    await db.query(`UPDATE ref_menu SET status = 1 WHERE id IN (${pre.ids.split(',').map(Number).join(',')})`);
    for (const u of users) assert.equal(await allowed(u), true, `after rollback: ${u}`);
    assert.equal(await allowed(9101) && (await db.query(LEGACY_GATE, [9101, -1, 'master/anggota_c']))[0][0].jlh > 0, true, 'other controllers are never touched');
  } finally { await db.query("UPDATE ref_menu SET status = 0 WHERE id = 9102"); await db.end(); }
});
