export const WAREHOUSE_ERROR_CODES = [
  // quantities
  'INVALID_QUANTITY', 'ZERO_QUANTITY', 'QUANTITY_OVERFLOW',
  // units / conversion
  'UNIT_MISSING', 'UNIT_MISMATCH', 'UNIT_CONVERSION_REQUIRED', 'UNIT_CONVERSION_INVALID', 'UNIT_CONVERSION_INEXACT',
  // item mapping
  'ITEM_NOT_FOUND', 'ITEM_INACTIVE', 'MAPPING_NOT_FOUND', 'MAPPING_NOT_CONFIRMED', 'MAPPING_RETIRED', 'MAPPING_INCONSISTENT',
  'DUPLICATE_MAPPING', 'AMBIGUOUS_MAPPING', 'MAPPING_INVALID_STATE', 'MAPPING_IN_USE', 'REASON_REQUIRED',
  // documents
  'INVALID_REFERENCE', 'INVALID_DOCUMENT', 'NO_LINES', 'DUPLICATE_LINE', 'INVALID_TRANSITION', 'TERMINAL_STATE', 'MAKER_CHECKER',
  'DUPLICATE_DOCUMENT', 'IDEMPOTENCY_CONFLICT', 'POLICY_REQUIRED',
  // receiving / reconciliation
  'WRONG_STATE', 'CROSS_BRANCH', 'DUPLICATE_RECEIPT', 'RECEIVE_EXCEEDS_OUTSTANDING', 'LINE_NOT_FOUND', 'REJECTION_REASON_REQUIRED',
  'RESOLUTION_EXCEEDS_UNRESOLVED', 'OUTSTANDING_QUANTITY', 'UNRESOLVED_REJECTED', 'INVARIANT_VIOLATION',
  // application boundary
  'FORBIDDEN', 'NOT_FOUND', 'CONCURRENT_MODIFICATION',
] as const;
export type WarehouseErrorCode = (typeof WAREHOUSE_ERROR_CODES)[number];

/** Domain rule violation of the Warehouse bounded context; `code` is stable and safe to return to clients. */
export class WarehouseError extends Error {
  readonly code: WarehouseErrorCode;
  constructor(code: WarehouseErrorCode) { super(code); this.name = 'WarehouseError'; this.code = code; }
}
