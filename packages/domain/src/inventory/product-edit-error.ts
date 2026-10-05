export type ProductEditErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'STOCK_LOCKED' | 'PRODUCT_CHANGED' | 'IDENTIFIER_EXISTS' | 'WRITE_NOT_CONFIGURED';
export class ProductEditError extends Error {
  readonly code: ProductEditErrorCode;
  constructor(code: ProductEditErrorCode) { super(code); this.name = 'ProductEditError'; this.code = code; }
}
