/**
 * FA-03A legacy runtime harness: the UNCHANGED local KOSIPA source (CodeIgniter 2.1.4, real framework, real controllers, models and views)
 * served by PHP 5.6 against the ISOLATED synthetic FA-01 database, so legacy screens can be exercised on rows written by Next.js.
 *   - the container joins only an --internal Docker network (no internet: legacy PPOB/SMTP/SMS code can never reach out) together with
 *     the FA-01 database container; no port is published; the test client runs inside the container;
 *   - the source is mounted read-only and copied into a tmpfs; the generated DB settings go to CodeIgniter's environment override folder
 *     (application/config/development/database.php), so the copy's own database.php is never read or used;
 *   - the legacy DB account mirrors production's broad DML grant, on the synthetic database only, and is dropped on close.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINER, DB, loadConfig, rootConnection } from '../local-stack.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const source = resolve(root, 'kosipa');
const IMAGE = 'kkisi-kfa-php56-ci2';
const docker = async (args, timeout = 180000) => (await exec('docker', args, { maxBuffer: 64 * 1024 * 1024, timeout })).stdout;
/** Synthetic legacy operator (ref_users 9102 = the KOSIPA account linked to synth_kfa_operator). */
export const LEGACY_LOGIN = { id: 9102, username: 'synth_kfa_k_operator' };

export async function startLegacyRuntime() {
  if (process.env.KOSIPA_FA01 !== '1') throw new Error('KFA_LEGACY_RUNTIME_DISABLED');
  const config = await loadConfig();
  const suffix = randomBytes(5).toString('hex');
  const network = `kfa-legacy-${suffix}`, name = `kfa-legacy-${suffix}`, user = `kfa_legacy_${suffix}`, password = randomBytes(18).toString('hex');
  const loginPassword = randomBytes(12).toString('base64url');
  const privateDir = resolve(root, '.local/kosipa-fa01', `legacy-${suffix}`);
  const admin = await rootConnection(config);
  let attached = false;
  async function close() {
    await docker(['rm', '-f', name]).catch(() => undefined);
    if (attached) await docker(['network', 'disconnect', network, CONTAINER]).catch(() => undefined);
    await docker(['network', 'rm', network]).catch(() => undefined);
    await admin.query(`DROP USER IF EXISTS '${user}'@'%'`).catch(() => undefined);
    await admin.end().catch(() => undefined);
    await rm(privateDir, { recursive: true, force: true });
  }
  try {
    // Production's legacy account holds broad DML on its database; here: the synthetic database only.
    await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB}\`.* TO '${user}'@'%'`);
    await admin.query(`UPDATE ref_users SET password = MD5(MD5(?)) WHERE id_ref_user = ?`, [loginPassword, LEGACY_LOGIN.id]);
    await mkdir(privateDir, { recursive: true, mode: 0o700 });
    await writeFile(resolve(privateDir, 'database.php'), `<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');
$active_group = 'default'; $active_record = TRUE;
$db['default'] = array('hostname' => 'kfa-db', 'username' => '${user}', 'password' => '${password}', 'database' => '${DB}', 'dbdriver' => 'mysqli',
  'dbprefix' => '', 'pconnect' => FALSE, 'db_debug' => TRUE, 'cache_on' => FALSE, 'cachedir' => '', 'char_set' => 'utf8', 'dbcollat' => 'utf8_general_ci',
  'swap_pre' => '', 'autoinit' => TRUE, 'stricton' => FALSE);
`, { mode: 0o600 });
    await docker(['network', 'create', '--internal', '--label', 'kkisi.kfa=legacy-runtime', network]);
    if (!JSON.parse(await docker(['network', 'inspect', network]))[0].Internal) throw new Error('KFA_EXTERNAL_NETWORK_FORBIDDEN');
    await docker(['network', 'connect', '--alias', 'kfa-db', network, CONTAINER]); attached = true;
    await docker(['run', '-d', '--name', name, '--platform', 'linux/amd64', '--network', network, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--read-only', '--tmpfs', '/tmp:rw,size=64m', '--tmpfs', '/app:rw,exec,size=700m',
      '--mount', `type=bind,src=${source},dst=/legacy-src,readonly`, '--mount', `type=bind,src=${here},dst=/harness,readonly`, '--mount', `type=bind,src=${privateDir},dst=/private,readonly`,
      IMAGE, 'sh', '-c', 'cp -a /legacy-src/application /legacy-src/system /legacy-src/vendor /legacy-src/index.php /app/ && mkdir -p /app/application/config/development && cp /private/database.php /app/application/config/development/database.php && exec php -d display_errors=1 -d error_reporting=E_ALL^E_NOTICE^E_DEPRECATED^E_STRICT -S 127.0.0.1:8080 -t /app /harness/router.php']);
    for (let i = 0; ; i++) {
      const ready = await docker(['exec', name, 'php', '-r', 'echo @file_get_contents("http://127.0.0.1:8080/") === false ? "no" : "yes";']).catch(() => 'no');
      if (ready === 'yes') break;
      if (i > 120) throw new Error('KFA_LEGACY_NOT_READY');
      await new Promise((r) => setTimeout(r, 500));
    }
    return {
      loginPassword,
      /** Runs browser-like steps inside the container; returns one result per step. */
      async steps(list) { return JSON.parse(await docker(['exec', name, 'php', '/harness/client.php', JSON.stringify(list)])); },
      /** Logs in through the real legacy login (admin/login/validate) and runs `list` in the same browser session; returns the steps after login. */
      async session(list) {
        const all = await this.steps([{ path: '/' }, { method: 'POST', path: '/admin/login/validate', form: { username: LEGACY_LOGIN.username, password: loginPassword } }, ...list]);
        return { login: all.slice(0, 2), results: all.slice(2) };
      },
      async logs() { return docker(['logs', '--tail', '200', name]); },
      admin,
      close,
    };
  } catch (error) { await close(); throw error; }
}
