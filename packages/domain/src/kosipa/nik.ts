import { KosipaError } from './errors.ts';

const NIK = /^[0-9A-Za-z]{1,20}$/;

/**
 * Member key normalisation (spec BR-010). Legacy compares CONVERT(nik_kar, UNSIGNED) = '<input>', which makes '00123'
 * equal to '123' but turns every non-numeric NIK into 0 (all of them match each other). Here: trim; numeric NIKs lose
 * leading zeros ('0' stays '0'); alphanumeric NIKs are kept as typed.
 */
export function canonicalNik(raw: string): string {
  const value = raw.trim();
  if (!NIK.test(value)) throw new KosipaError('NIK_INVALID');
  return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : value;
}

/** Literal values to try with an indexable `nik_kar IN (...)` instead of a function on the column. */
export function nikLookupKeys(raw: string): string[] {
  const canonical = canonicalNik(raw);
  return [...new Set([raw.trim(), canonical])];
}

export function sameMember(a: string, b: string): boolean {
  try { return canonicalNik(a) === canonicalNik(b); } catch { return false; }
}
