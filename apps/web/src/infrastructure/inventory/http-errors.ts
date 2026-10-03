import { InventoryError, type InventoryErrorCode } from '@koperasi/domain/inventory';
import { json, type AuthServices } from '../auth/http.ts';

const statuses: Record<InventoryErrorCode, number> = { INVALID_INPUT: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, CSRF: 403, NOT_FOUND: 404, STOCK_LOCKED: 409, STOCK_CHANGED: 409, DOCUMENT_IMMUTABLE: 409, EMPTY_DOCUMENT: 409, NAME_EXISTS: 409, REQUEST_CONFLICT: 409, WRITE_NOT_CONFIGURED: 503, INVENTORY_UNAVAILABLE: 503 };
export function inventoryErrorResponse(services: AuthServices, error: unknown): Response {
  const databaseError = error as { code?: unknown; meta?: { code?: unknown } } | null;
  // Legacy latin1 columns reject unsupported Unicode; expose a validation code without the SQL/error text.
  const code = error instanceof InventoryError ? error.code
    : databaseError?.code === 'P2010' && String(databaseError.meta?.code) === '1366' ? 'INVALID_INPUT' : 'INVENTORY_UNAVAILABLE';
  services.deps.log('inventory_failed', { code });
  return json(statuses[code], { error: code });
}
