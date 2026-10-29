import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { publicSavingsStagingEnabled, publicSavingsConsoleEnabled } from '../src/features/public-savings/flags.ts';
import { deployedNavigation, CONSOLE_NAVIGATION } from '../src/features/console/navigation.ts';
import { validateStagingConfig } from '../src/infrastructure/public-savings/security.ts';

// Merge gate: the unfinished feature must be inert in any deployment that does not set the explicit local flags.
const SRC = new URL('../src/', import.meta.url).pathname;
const OPERATIONS = [['validate'], ['challenge'], ['verify'], ['submit'], ['receipt'], ['pdf'], ['members'], ['links-list'], ['links-create'], ['links-revoke', 'a'.repeat(32)], ['applications'], ['application-pdf', 'PSS' + 'a'.repeat(32) + '00000']];
const PSS_ENV = ['PSS_LOCAL_STAGING', 'PSS_OPERATOR_AUTH', 'PSS_OPERATOR_POLICY_FILE', 'PSS_INTAKE_ENABLED', 'PSS_LOCAL_DIRECTORY'];
async function withEnv(values, fn) {
  const saved = Object.fromEntries(PSS_ENV.map((k) => [k, process.env[k]]));
  for (const k of PSS_ENV) delete process.env[k];
  Object.assign(process.env, values);
  try { return await fn(); } finally { for (const k of PSS_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const request = (host = '127.0.0.1:3200') => new Request(`http://${host}/api/x`, { method: 'POST', headers: { host, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'isolation check' }) });

test('flags are off unless explicitly set to the exact value; console management also needs staging', () => {
  assert.equal(publicSavingsStagingEnabled({}), false);
  assert.equal(publicSavingsStagingEnabled({ PSS_LOCAL_STAGING: 'true' }), false);
  assert.equal(publicSavingsConsoleEnabled({ PSS_OPERATOR_AUTH: 'CONSOLE' }), false);
  assert.equal(publicSavingsConsoleEnabled({ PSS_LOCAL_STAGING: '1', PSS_OPERATOR_AUTH: 'console' }), false);
  assert.equal(publicSavingsConsoleEnabled({ PSS_LOCAL_STAGING: '1', PSS_OPERATOR_AUTH: 'CONSOLE' }), true);
});

test('console navigation hides the public savings entry while the flag is off', () => {
  assert.equal(deployedNavigation(false).some((e) => e.id === 'kosipa-public-savings'), false);
  assert.equal(deployedNavigation(false).length, CONSOLE_NAVIGATION.length - 1);
  assert.equal(deployedNavigation(true), CONSOLE_NAVIGATION);
});

test('every public and staff operation refuses before configuration or database access when flags are off', async () => {
  const { handlePublicSavingsRequest } = await import('../src/infrastructure/public-savings/http.ts');
  for (const env of [{}, { PSS_OPERATOR_AUTH: 'CONSOLE' }]) {
    await withEnv(env, async () => {
      for (const [operation, id] of OPERATIONS) {
        const response = await handlePublicSavingsRequest(request(), operation, id);
        assert.ok(response.status === 503, `${operation} ${JSON.stringify(env)} answered ${response.status}`);
        assert.match((await response.json()).error.code, /^(ACTIVATION_BLOCKED|OPERATOR_AUTHORIZATION_UNCONFIGURED)$/u);
      }
    });
  }
  // A deployed public host never reaches the service even if someone sets the local flag.
  await withEnv({ PSS_LOCAL_STAGING: '1' }, async () => {
    for (const [operation, id] of OPERATIONS) assert.equal((await handlePublicSavingsRequest(request('tokonew.kkisitb2.id'), operation, id)).status, 503);
  });
});

test('the service can only target the loopback synthetic database', () => {
  const base = { mode: 'LOCAL_SYNTHETIC', host: '127.0.0.1', port: 3318, database: 'kkisi_public_savings', installationId: 'a'.repeat(32), app: { user: 'pss_public', password: 'x'.repeat(32) }, legacy: { user: 'pss_legacy', password: 'x'.repeat(32) }, encryptionKeyHex: 'a'.repeat(64), hashKey: 'b'.repeat(64), operatorKey: 'c'.repeat(64) };
  assert.ok(validateStagingConfig(base));
  for (const patch of [{ host: '10.0.0.5' }, { port: 3306 }, { database: 'n1608204_smart_kopkar' }, { mode: 'PRODUCTION' }]) assert.throws(() => validateStagingConfig({ ...base, ...patch }), /STAGING_CONFIGURATION_INVALID/u);
});

test('no application code mutates legacy financial tables; public intake only inserts an OPEN header', async () => {
  const files = [];
  async function walk(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) await walk(p); else if (/\.(ts|tsx)$/u.test(e.name)) files.push(p); } }
  await walk(SRC);
  const writers = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (/UPDATE\s+`?(m_anggota|m_simpanan_aktif|trans_simpanan_pengajuan)\b/iu.test(text) || /INSERT\s+INTO\s+`?(m_anggota|m_simpanan_aktif)\b/iu.test(text)) writers.push(relative(SRC, file));
    if (/trans_simpanan_pengajuan/u.test(text) && /INSERT\s+INTO/iu.test(text)) assert.equal(relative(SRC, file), 'infrastructure/public-savings/service.ts');
    assert.doesNotMatch(text, /001_public_savings|CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu, `${relative(SRC, file)} must not apply schema`);
  }
  assert.deepEqual(writers, []);
});
