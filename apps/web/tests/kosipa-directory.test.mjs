import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaKosipaDirectory } from '../src/infrastructure/console/kosipa-directory.ts';

test('menu permission query requires the specific granting group to remain active', async () => {
  let query;
  const directory = new PrismaKosipaDirectory({
    async $queryRaw(strings, ...values) {
      query = { sql: strings.join('?'), values };
      return [{ url: 'master/anggota_c' }];
    },
  });
  assert.deepEqual(await directory.allowedMenuUrls(9102), ['master/anggota_c']);
  // An unrelated active group must not let an inactive group's menu permissions survive.
  assert.match(query.sql, /JOIN ref_group g ON g\.id = ga\.id_group AND g\.status = 1/);
  assert.match(query.sql, /ga\.status = 1 AND ma\.status = 1 AND m\.status = 1/);
  assert.deepEqual(query.values, [9102], 'account id stays parameterized');
});
