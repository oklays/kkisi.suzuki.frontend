/**
 * Exact money handling. The legacy DB stores prices as DOUBLE(18,2); the repository turns them
 * into 2-decimal strings and everything after that is integer sen (1 Rp = 100 sen), so no
 * floating-point arithmetic is ever applied to an amount.
 */
export function toMinorUnits(decimal: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal);
  if (!match) throw new RangeError('Invalid money amount');
  const sen = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(sen)) throw new RangeError('Invalid money amount');
  return match[1] ? -sen : sen;
}
