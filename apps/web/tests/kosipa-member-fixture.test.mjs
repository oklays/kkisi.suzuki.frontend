import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as stack from '../../../integration/kosipa-full-access/local-stack.mjs';
const fixture = new URL('../../../integration/kosipa-full-access/fixtures/member-side-tables.sql', import.meta.url);
test('membership fixture is exact CREATE-only shape, with no copied rows or instance counters', async () => {
  const sql = await readFile(fixture, 'utf8');
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`\./g) ?? []).length, 2);
  assert.equal((sql.match(/^  `\w+` /gm) ?? []).length, 29);
  assert.doesNotMatch(sql, /\b(?:DROP|ALTER|INSERT|TRUNCATE|DELETE|UPDATE)\b|AUTO_INCREMENT\s*=/i);
  assert.match(sql, /`nik_kar` varchar\(10\) DEFAULT NULL/);
  assert.match(sql, /`potongan_old` double\(18,2\) NOT NULL/);
  assert.match(sql, /KEY `oauth_access_tokens_user_id_index` \(`user_id`\) USING BTREE/);
});
test('additive installer is exported and rejects incompatible preexisting shape', async () => {
  assert.equal(typeof stack.applyMemberSideTables, 'function');
  assert.equal(typeof stack.assertMemberTableShape, 'function');
  assert.throws(() => stack.assertMemberTableShape('CREATE TABLE `x` (`id` int)', 'CREATE TABLE `x` (`id` varchar(20))'), /KFA_MEMBER_TABLE_SHAPE_MISMATCH/);
  assert.doesNotThrow(() => stack.assertMemberTableShape('CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`x` (`id` int AUTO_INCREMENT) ENGINE=InnoDB', 'CREATE TABLE `x` (`id` int AUTO_INCREMENT) ENGINE=InnoDB AUTO_INCREMENT=99'));
});
test('shape checker refuses changes to nullability, defaults, index, engine and charset', () => {
  const ddl = 'CREATE TABLE `x` (`id` int NOT NULL, `value` varchar(10) DEFAULT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=latin1';
  for (const changed of [ddl.replace('NOT NULL', 'NULL'), ddl.replace('DEFAULT NULL', "DEFAULT 'x'"), ddl.replace('varchar(10)', 'varchar(11)'), ddl.replace(', PRIMARY KEY (`id`)', ''), ddl.replace('InnoDB','MyISAM'), ddl.replace('latin1','utf8mb4')]) assert.throws(() => stack.assertMemberTableShape(ddl,changed), /KFA_MEMBER_TABLE_SHAPE_MISMATCH/);
});
test('real additive installer is idempotent and a mismatched installation sentinel refuses connection', { skip: process.env.KOSIPA_FA01 === '1' ? false : 'set KOSIPA_FA01=1' }, async () => {
  const config = await stack.loadConfig();
  await assert.rejects(stack.rootConnection({ ...config, installationId: '0'.repeat(32) }), /KFA_SENTINEL_MISMATCH/);
  await stack.applyMemberSideTables();
  assert.equal((await stack.applyMemberSideTables()).created, 0);
});
