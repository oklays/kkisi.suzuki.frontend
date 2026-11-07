import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CONSOLE_NAVIGATION, deployedNavigation } from '../src/features/console/navigation.ts';
import { isCashierRole } from '../src/infrastructure/auth/cashier-role.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('cashier lookup uses the repository and stays false for repositories without it', async () => {
  assert.equal(await isCashierRole({ has: async () => true }, 4), false);
  assert.equal(await isCashierRole({ has: async () => true, isCashierRole: async (id) => id === 4 }, 4), true);
  await assert.rejects(isCashierRole({ has: async () => true, isCashierRole: async () => { throw new Error('db'); } }, 4), /db/);
});

test('a cashier never sees the Dashboard: POS sidebar hides it, console redirects to POS and drops the entry', () => {
  assert.match(read('src/components/pos/PosShell.tsx'), /session\.dashboardHidden \? null :/);
  for (const page of ['src/app/pos/page.tsx', 'src/app/inventory/page.tsx', 'src/app/products/page.tsx', 'src/infrastructure/sales/page-session.ts']) {
    assert.match(read(page), /dashboardHidden: await isCashierRole\(services\.deps\.permissions, ctx\.roleId\)/, page);
  }
  assert.match(read('src/app/console/page.tsx'), /if \(auth\.cashier\) redirect\('\/pos'\);/);
  assert.match(read('src/app/console/layout.tsx'), /!\(auth\.cashier && e\.id === 'dashboard'\)/);
});

test('Master Data is listed read-only without the grants flag; grant administration still needs it', () => {
  const ids = (nav) => nav.map((e) => e.id);
  assert.ok(ids(deployedNavigation(false, false)).includes('kosipa-master'));
  assert.ok(!ids(deployedNavigation(false, false)).includes('settings-kosipa-access'));
  assert.ok(ids(deployedNavigation(false, true)).includes('settings-kosipa-access'));
  assert.equal(CONSOLE_NAVIGATION.find((e) => e.id === 'kosipa-master').anyOf.join(), 'kosipa.member.view');
});
