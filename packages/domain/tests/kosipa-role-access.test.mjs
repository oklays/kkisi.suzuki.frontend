import assert from 'node:assert/strict';
import test from 'node:test';
import * as capabilities from '../src/console/capabilities.ts';
test('role monitoring accepts active non-cashiers and refuses cashier, missing and inactive roles', () => {
  for (const name of ['Administrator', 'Admin Koperasi', 'Kepala Toko', 'Future Supervisor']) assert.equal(capabilities.kosipaRoleReadAllowed?.(name, 1), true, name);
  for (const name of ['KASIR', 'Kasir Toko', 'cashier supervisor', 'ＫＡＳＩＲ', '', '  ', null]) assert.equal(capabilities.kosipaRoleReadAllowed?.(name, 1), false, String(name));
  assert.equal(capabilities.kosipaRoleReadAllowed?.('Administrator', 0), false);
});
