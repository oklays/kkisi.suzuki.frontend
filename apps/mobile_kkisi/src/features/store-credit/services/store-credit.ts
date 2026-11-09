import { memberCredit, PosError } from '@koperasi/domain/pos/sale';
import type { ProfileRow } from '../../../server/kosipa/member.reader.ts';
import type { SaleRow } from '../../../server/kosipa/store.reader.ts';
import { dayLabel } from '../../../lib/utils/dates.ts';
import { senOf } from '../../../lib/utils/money.ts';

// "Saldo Kredit Toko": the POS credit rule itself (packages/domain/src/pos/sale.ts memberCredit) — limit = gaji_minus when set,
// else limit_toko; used = Kredit+Final sales this Jakarta month (all branches) minus their returns, never below zero.

export type StoreCredit =
  | { eligible: true; limitSen: number; usedSen: number; remainingSen: number; usedPercent: number; spentSen: number; returnedSen: number }
  | { eligible: false; reason: 'MEMBER_INACTIVE' | 'MEMBER_EXPIRED' | 'INVALID_AMOUNT'; spentSen: number; returnedSen: number; usedSen: number };

export function buildStoreCredit(profile: ProfileRow, usage: { spent: string; returned: string }, now: Date): StoreCredit {
  const spentSen = senOf(usage.spent), returnedSen = senOf(usage.returned);
  const usedSen = Math.max(0, spentSen - returnedSen);
  try {
    const c = memberCredit({ id: profile.id, nik: profile.nik, name: profile.name, status: profile.status ?? '', employment: profile.employment ?? '', exitOn: profile.exitOn,
      limitSen: senOf(profile.limitToko), gajiMinusSen: senOf(profile.gajiMinus) }, usedSen, now);
    const usedPercent = c.limitSen > 0 ? Math.min(100, Math.max(0, Math.round((usedSen / c.limitSen) * 100))) : 0;
    return { eligible: true, limitSen: c.limitSen, usedSen, remainingSen: c.remainingSen, usedPercent, spentSen, returnedSen };
  } catch (e) {
    if (e instanceof PosError) return { eligible: false, reason: e.code as 'MEMBER_INACTIVE', spentSen, returnedSen, usedSen };
    throw e;
  }
}

export type PurchaseItem = { id: number; date: string; store: string; amountSen: number };
export const buildPurchases = (sales: readonly SaleRow[]): PurchaseItem[] =>
  sales.map((s) => ({ id: s.id, date: dayLabel(s.date), store: s.store ?? `Toko #${s.companyId}`, amountSen: senOf(s.total) }));
