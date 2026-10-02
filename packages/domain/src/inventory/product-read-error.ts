export type ProductReadErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'DB_UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNEXPECTED';

export class ProductReadError extends Error {
  readonly code: ProductReadErrorCode;

  constructor(code: ProductReadErrorCode) {
    super({
      INVALID_INPUT: 'Invalid product query.',
      NOT_FOUND: 'Product not found.',
      DB_UNAVAILABLE: 'Database unavailable.',
      NOT_CONFIGURED: 'POS branch is not configured.',
      UNEXPECTED: 'Product query failed.',
    }[code]);
    this.code = code;
  }
}
