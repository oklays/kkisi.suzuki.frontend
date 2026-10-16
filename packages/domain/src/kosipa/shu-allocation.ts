import { KosipaError } from './errors.ts';

/**
 * Proportional SHU allocation of one pool (spec REQ-037). Legacy divided without a zero guard and rounded each member to
 * thousands independently, so the parts did not add up to the pool. Here: largest-remainder rounding to `unitSen`;
 * Σ allocations = floor(pool / unit) * unit, and the sub-unit remainder is reported, never lost silently.
 */
const ZERO = BigInt(0), ONE = BigInt(1); // the shared tsconfig targets ES2017 (no BigInt literals)

export type ShuWeight = { nik: string; weightSen: number };

export function allocateShu(input: { poolSen: number; unitSen: number; weights: readonly ShuWeight[] }): { allocations: { nik: string; amountSen: number }[]; remainderSen: number } {
  const { poolSen, unitSen, weights } = input;
  if (!Number.isSafeInteger(poolSen) || poolSen < 0) throw new KosipaError('AMOUNT_INVALID');
  if (!Number.isSafeInteger(unitSen) || unitSen < 1) throw new KosipaError('UNIT_INVALID');
  const total = weights.reduce((s, w) => {
    if (!Number.isSafeInteger(w.weightSen) || w.weightSen < 0) throw new KosipaError('AMOUNT_INVALID');
    return s + BigInt(w.weightSen);
  }, ZERO);
  if (total === ZERO) throw new KosipaError('SHU_TOTAL_ZERO');
  if (new Set(weights.map((w) => w.nik)).size !== weights.length) throw new KosipaError('DUPLICATE_MEMBER');
  const units = BigInt(Math.floor(poolSen / unitSen));
  const parts = weights.map((w) => {
    const exact = units * BigInt(w.weightSen);
    return { nik: w.nik, units: exact / total, remainder: exact % total };
  });
  let leftover = units - parts.reduce((s, p) => s + p.units, ZERO);
  for (const p of [...parts].sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.nik.localeCompare(b.nik)))) {
    if (leftover === ZERO) break;
    p.units += ONE; leftover -= ONE;
  }
  return { allocations: parts.map((p) => ({ nik: p.nik, amountSen: Number(p.units) * unitSen })), remainderSen: poolSen - Number(units) * unitSen };
}
