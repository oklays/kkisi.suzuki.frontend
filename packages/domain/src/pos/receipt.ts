import { PosError } from './sale.ts';
import type { PaymentMethod } from './payment-method.ts';

export type ReceiptLine = {
  name: string; quantity: number; unitPriceSen: number; discountSen: number; totalSen: number; taxSen: number | null;
};
export type Receipt = {
  saleId: number; salesCode: string; saleDate: string; storeName: string; storeAddress: string;
  cashier: string; customerName: string; memberNik: string | null; paymentType: PaymentMethod;
  limitSen: number | null; usedLimitSen: number | null; remainingLimitSen: number | null;
  lines: ReceiptLine[]; subtotalSen: number; discountSen: number; taxTotalSen: number | null; grandTotalSen: number;
  paidSen: number; changeSen: number;
  mode: 'checkout' | 'reprint';
};
export type ReceiptReadMode = 'checkout' | 'reprint';

export function parseReceiptId(id: string): number {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) throw new PosError('INVALID_INPUT');
  return Number(id);
}
