import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

// Block stack access: these filesystem tests must never load credentials or use a database/Docker.
const stackUrl = new URL('../../../integration/kosipa-full-access/local-stack.mjs', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url !== stackUrl) return nextLoad(url, context);
    return { format: 'module', shortCircuit: true, source: `
      export const CONTAINER = 'unused', DB = 'unused';
      export function loadConfig() { throw new Error('KFA_TEST_STACK_CONFIGURATION_REACHED'); }
      export function rootConnection() { throw new Error('KFA_TEST_DATABASE_REACHED'); }
    ` };
  },
});
const runtime = await import('../../../integration/kosipa-full-access/legacy-runtime/runtime.mjs');
test.after(() => hooks.deregister());

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'kosipa-legacy-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function sourceTree(path) {
  await Promise.all(['application', 'system', 'vendor'].map((name) => mkdir(resolve(path, name), { recursive: true })));
  await writeFile(resolve(path, 'index.php'), '<?php // synthetic source fixture only');
  return realpath(path);
}

function resolveSource(root, env = {}) {
  assert.equal(typeof runtime.resolveLegacySource, 'function', 'runtime must export a filesystem source resolver');
  return runtime.resolveLegacySource(root, env);
}

test('resolves relocated legacy source to a real path', async (t) => {
  const root = await fixture(t);
  const expected = await sourceTree(resolve(root, 'legacy/kosipa'));
  assert.equal(await resolveSource(root), expected);
});

test('prefers relocated source over historical source', async (t) => {
  const root = await fixture(t);
  const expected = await sourceTree(resolve(root, 'legacy/kosipa'));
  await sourceTree(resolve(root, 'kosipa'));
  assert.equal(await resolveSource(root), expected);
});

test('falls back to historical root/kosipa layout', async (t) => {
  const root = await fixture(t);
  const expected = await sourceTree(resolve(root, 'kosipa'));
  assert.equal(await resolveSource(root), expected);
});

test('skips an incomplete default candidate for a complete historical source', async (t) => {
  const root = await fixture(t);
  await mkdir(resolve(root, 'legacy/kosipa'), { recursive: true });
  const expected = await sourceTree(resolve(root, 'kosipa'));
  assert.equal(await resolveSource(root), expected);
});

test('explicit source override takes precedence over both defaults', async (t) => {
  const root = await fixture(t);
  await sourceTree(resolve(root, 'legacy/kosipa'));
  await sourceTree(resolve(root, 'kosipa'));
  const expected = await sourceTree(resolve(root, 'explicit'));
  assert.equal(await resolveSource(root, { KOSIPA_LEGACY_SOURCE_DIR: resolve(root, 'explicit') }), expected);
});

test('missing default sources fail with a stable KFA error', async (t) => {
  const root = await fixture(t);
  await assert.rejects(() => resolveSource(root), { message: 'KFA_LEGACY_SOURCE_NOT_FOUND' });
});

for (const entry of ['application', 'system', 'vendor', 'index.php']) {
  test(`rejects incomplete default source without ${entry}`, async (t) => {
    const root = await fixture(t);
    const path = resolve(root, 'legacy/kosipa');
    await sourceTree(path);
    await rm(resolve(path, entry), { recursive: true, force: true });
    await assert.rejects(() => resolveSource(root), { message: 'KFA_LEGACY_SOURCE_NOT_FOUND' });
  });

  test(`rejects wrong entry type for ${entry}`, async (t) => {
    const root = await fixture(t);
    const path = resolve(root, 'legacy/kosipa');
    await sourceTree(path);
    await rm(resolve(path, entry), { recursive: true, force: true });
    if (entry === 'index.php') await mkdir(resolve(path, entry));
    else await writeFile(resolve(path, entry), 'not a directory');
    await assert.rejects(() => resolveSource(root), { message: 'KFA_LEGACY_SOURCE_NOT_FOUND' });
  });
}

for (const invalid of ['missing', 'incomplete', '']) {
  test(`explicit ${invalid || 'empty'} override fails closed despite valid defaults`, async (t) => {
    const root = await fixture(t);
    await sourceTree(resolve(root, 'legacy/kosipa'));
    await sourceTree(resolve(root, 'kosipa'));
    await mkdir(resolve(root, 'incomplete'));
    const override = invalid ? resolve(root, invalid) : '';
    await assert.rejects(() => resolveSource(root, { KOSIPA_LEGACY_SOURCE_DIR: override }), { message: 'KFA_INVALID_LEGACY_SOURCE' });
  });
}

test('invalid source is rejected before stack configuration or resource use', async (t) => {
  const root = await fixture(t);
  const saved = { enabled: process.env.KOSIPA_FA01, source: process.env.KOSIPA_LEGACY_SOURCE_DIR };
  t.after(() => {
    for (const [key, value] of [['KOSIPA_FA01', saved.enabled], ['KOSIPA_LEGACY_SOURCE_DIR', saved.source]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.KOSIPA_LEGACY_SOURCE_DIR = resolve(root, 'missing');
  process.env.KOSIPA_FA01 = '0';
  await assert.rejects(() => runtime.startLegacyRuntime(), { message: 'KFA_LEGACY_RUNTIME_DISABLED' });
  process.env.KOSIPA_FA01 = '1';
  await assert.rejects(() => runtime.startLegacyRuntime(), { message: 'KFA_INVALID_LEGACY_SOURCE' });
});
