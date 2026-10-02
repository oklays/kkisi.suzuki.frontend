import { PosError } from './sale.ts';

export type ReceiptLine = {
  name: string; quantity: number; unitPriceSen: number; discountSen: number; totalSen: number;
};
export type Receipt = {
  saleId: number; salesCode: string; saleDate: string; storeName: string; storeAddress: string;
  cashier: string; customerName: string; paymentType: 'Cash' | 'Kredit';
  lines: ReceiptLine[]; subtotalSen: number; discountSen: number; grandTotalSen: number;
  paidSen: number; changeSen: number;
};

export function parseReceiptId(id: string): number {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) throw new PosError('INVALID_INPUT');
  return Number(id);
}
