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

test('natively owned member controllers keep granting VIEW by group access although the cutover fence set their menu status to 0; nothing else is relaxed', async () => {
  let query;
  const directory = new PrismaKosipaDirectory({
    async $queryRaw(sql) { query = { sql: sql.sql ?? String(sql), values: sql.values ?? [] }; return [{ url: 'master/anggota_c' }]; },
  }, { fencedViewUrls: ['Anggota/anggota_c ', 'master/anggota_c'] });
  assert.deepEqual(await directory.allowedMenuUrls(9102), ['master/anggota_c']);
  assert.match(query.sql, /ga\.status = 1 AND ma\.status = 1 AND \(m\.status = 1 OR LOWER\(TRIM\(m\.url\)\) IN \(\?,\?\)\)/);
  assert.match(query.sql, /JOIN ref_group g ON g\.id = ga\.id_group AND g\.status = 1/, 'the granting group must still be active');
  assert.deepEqual(query.values, [9102, 'anggota/anggota_c', 'master/anggota_c'], 'every value stays parameterized and normalised');
});
