import type { PermissionRepository } from '@koperasi/application/auth/ports';

/** KASIR/CASHIER roles work only in POS / Kasir: no Dashboard link and no console dashboard. A store error propagates like any permission read. */
export function isCashierRole(permissions: PermissionRepository | undefined, roleId: number): Promise<boolean> {
  return permissions?.isCashierRole ? permissions.isCashierRole(roleId) : Promise.resolve(false);
}
