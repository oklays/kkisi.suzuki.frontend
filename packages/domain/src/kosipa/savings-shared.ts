/** Internal helpers shared by the Public Simpanan Sukarela (T01B) domain modules. Pure; no I/O, no clock, no framework. */
export type PssFailure<C extends string> = { readonly ok: false; readonly error: { readonly code: C; readonly field?: string } };
export type PssResult<T, C extends string> = { readonly ok: true; readonly value: T } | PssFailure<C>;

export function fail<C extends string>(code: C, field?: string): PssFailure<C> {
  return { ok: false, error: { code, ...(field === undefined ? {} : { field }) } };
}

/** Own enumerable data properties of a plain object (no accessors/inherited keys). `required` keys must all be present. */
export function plain(input: unknown, allowed: readonly string[], required: readonly string[] = allowed): Record<string, unknown> | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  try {
    if (Array.isArray(input)) return undefined;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== null && prototype !== Object.prototype) return undefined;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !allowed.includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d?.enumerable || !('value' in d)) return undefined;
      out[key] = d.value;
    }
    return required.every((k) => k in out) ? out : undefined;
  } catch {
    return undefined;
  }
}

export const isEpochMs = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const isText = (v: unknown, max = 256): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Calendar date parts of an instant in Asia/Jakarta (UTC+7, no daylight saving). */
export function jakartaParts(epochMs: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(epochMs + 7 * 3600000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}
