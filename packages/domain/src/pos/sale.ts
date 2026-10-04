import { toMinorUnits } from '../money/money.ts';
import { isPaymentMethod, type PaymentMethod } from './payment-method.ts';
export { PAYMENT_METHODS, type PaymentMethod, isPaymentMethod, isCashPayment, isQrisPayment, isCreditPayment } from './payment-method.ts';

export class PosError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export type CheckoutInput = {
  items: { itemId: number; quantity: number }[];
  paymentType: PaymentMethod;
  paidSen: number;
  memberId: number | null;
  idempotencyKey: string;
};
export type MemberRecord = {
  id: number; nik: string; name: string; status: string; employment: string;
  exitOn: string | null; limitSen: number; gajiMinusSen: number;
};
export type MemberCredit = { id: number; nik: string; name: string; limitSen: number; spentSen: number; remainingSen: number };
export type CheckoutResult = { saleId: number; salesCode: string; grandTotalSen: number; paidSen: number; changeSen: number; paymentType: PaymentMethod };

export function businessDates(now: Date) {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const monthStart = `${day.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { day, monthStart, monthEnd, monthCode: day.slice(2, 7).replace('-', ''), dayCode: day.slice(2).replaceAll('-', '') };
}

export function memberCredit(member: MemberRecord, spentSen: number, now: Date): MemberCredit {
  if (!member.nik || member.nik === '0' || member.status !== 'AKTIVE') throw new PosError('MEMBER_INACTIVE');
  if (member.employment === 'KONTRAK' && (!member.exitOn || businessDates(now).day >= member.exitOn)) throw new PosError('MEMBER_EXPIRED');
  const limitSen = member.gajiMinusSen > 0 ? member.gajiMinusSen : member.limitSen;
  const remainingSen = limitSen - spentSen;
  if (![limitSen, spentSen, remainingSen].every(Number.isSafeInteger)) throw new PosError('INVALID_AMOUNT');
  return { id: member.id, nik: member.nik, name: member.name, limitSen, spentSen, remainingSen };
}

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export function parseCheckout(value: unknown): CheckoutInput {
  if (!value || typeof value !== 'object') throw new PosError('INVALID_INPUT');
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 80) throw new PosError('INVALID_INPUT');
  const items = body.items.map((line: unknown) => {
    if (!line || typeof line !== 'object') throw new PosError('INVALID_INPUT');
    const { itemId, quantity } = line as Record<string, unknown>;
    if (!positiveId(itemId) || !positiveId(quantity) || quantity > 9999) throw new PosError('INVALID_INPUT');
    return { itemId, quantity };
  }).sort((a, b) => a.itemId - b.itemId);
  if (new Set(items.map((line) => line.itemId)).size !== items.length) throw new PosError('INVALID_INPUT');
  if (!isPaymentMethod(body.paymentType)) throw new PosError('INVALID_INPUT');
  const memberId = body.memberId == null ? null : body.memberId;
  if (memberId !== null && !positiveId(memberId)) throw new PosError('INVALID_INPUT');
  if (body.paymentType === 'Kredit' && memberId === null) throw new PosError('MEMBER_REQUIRED');
  if (typeof body.idempotencyKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.idempotencyKey)) throw new PosError('INVALID_INPUT');
  let paidSen = 0;
  if (body.paymentType === 'Cash') {
    if (typeof body.paidAmount !== 'string' || !/^\d{1,10}$/.test(body.paidAmount) || Number(body.paidAmount) > 9_999_999_999) throw new PosError('INVALID_AMOUNT');
    paidSen = toMinorUnits(body.paidAmount);
  }
  return { items, memberId, paymentType: body.paymentType, paidSen, idempotencyKey: body.idempotencyKey.toLowerCase() };
}

/** Parameter values for DECIMAL / legacy DOUBLE(18,2), produced without floating-point arithmetic. */
export function decimalAmount(sen: number): string {
  if (!Number.isSafeInteger(sen)) throw new PosError('INVALID_AMOUNT');
  return `${sen < 0 ? '-' : ''}${Math.floor(Math.abs(sen) / 100)}.${String(Math.abs(sen) % 100).padStart(2, '0')}`;
}
