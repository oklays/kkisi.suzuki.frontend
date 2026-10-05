import { ProductEditError } from './product-edit-error.ts';
// Shared strict input helpers for product edit/create parsers. Not re-exported from the package index.
export function fail(): never { throw new ProductEditError('INVALID_INPUT'); }
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !keys.includes(key))) return fail();
  return raw;
}
export function productId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647) return fail();
  return value;
}
export function integer(value: unknown, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return fail();
  return value;
}
export function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string') return fail();
  const out = value.trim();
  if (out.length > max || (required && !out) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(out)) return fail();
  return out;
}
export function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return fail();
  const [whole, fraction = ''] = value.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}
