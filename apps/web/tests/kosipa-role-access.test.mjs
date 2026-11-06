import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaPermissionRepository } from '../src/infrastructure/auth/prisma-legacy-repositories.ts';

test('role policy reads a parameterized active role and excludes cashiers and inactive/missing roles', async () => {
  let rows = [{ role_name: 'Admin Koperasi', status: 1 }];
  let query;
  const db = { async $queryRaw(strings, ...values) { query = { sql: strings.join('?'), values }; return rows; } };
  const source = new PrismaPermissionRepository(db, () => {}, { kosipaReadAccessMode: 'non-cashier' });
  assert.equal(await source.kosipaRoleAccess?.(2), 'allowed');
  assert.match(query.sql, /FROM db_roles WHERE id = \?/);
  assert.deepEqual(query.values, [2]);
  for (rows of [[{ role_name: 'Kasir Toko', status: 1 }], [{ role_name: 'Kepala Toko', status: 0 }], []]) assert.equal(await source.kosipaRoleAccess(4), 'denied');
});

test('unset policy preserves linked authorization; malformed policy denies without querying', async () => {
  const db = { async $queryRaw() { throw new Error('must not query'); } };
  const linked = new PrismaPermissionRepository(db, () => {});
  assert.equal(await linked.kosipaRoleAccess?.(1), null);
  const malformed = new PrismaPermissionRepository(db, () => {}, { kosipaReadAccessMode: 'non-cashier-typo' });
  assert.equal(await malformed.kosipaRoleAccess?.(1), 'denied');
});
