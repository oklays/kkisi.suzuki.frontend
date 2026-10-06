import { PosError, isPaymentMethod, type PaymentMethod } from '../pos/sale.ts';

/**
 * Sales return (retur penjualan) policy over the existing legacy tables db_salesreturn / db_salesitemsreturn /
 * db_salespaymentsreturn. A return always references one saved sale, is immutable once written, and may be partial;
 * several returns per sale are allowed until every unit is returned.
 */

/** Cash and QRIS sales: returnable from the sale day through this many calendar days after it (Asia/Jakarta). */
export const RETURN_CASH_WINDOW_DAYS = 7;
export const RETURN_REASON_MAX = 200;

/** Cash and QRIS refunds leave the cashier drawer as cash; Kredit refunds reduce the member's monthly credit usage. */
export type RefundMethod = 'Cash' | 'Kredit';

export type ReturnRequest = {
  items: { itemId: number; quantity: number }[];
  reason: string;
  idempotencyKey: string;
};

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647;

export function parseReturnRequest(value: unknown): ReturnRequest {
  if (!value || typeof value !== 'object') throw new PosError('INVALID_INPUT');
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 200) throw new PosError('INVALID_INPUT');
  const items = body.items.map((line: unknown) => {
    if (!line || typeof line !== 'object') throw new PosError('INVALID_INPUT');
    const { itemId, quantity } = line as Record<string, unknown>;
    if (!positiveId(itemId) || !positiveId(quantity) || quantity > 9999) throw new PosError('INVALID_INPUT');
    return { itemId, quantity };
  }).sort((a, b) => a.itemId - b.itemId);
  if (new Set(items.map((line) => line.itemId)).size !== items.length) throw new PosError('INVALID_INPUT');
  if (typeof body.reason !== 'string') throw new PosError('RETURN_REASON_REQUIRED');
  const reason = body.reason.trim().replace(/\s+/g, ' ');
  if (reason.length < 3) throw new PosError('RETURN_REASON_REQUIRED');
  // db_salesreturn is latin1: keep the note printable ASCII so it is stored exactly as entered.
  if (reason.length > RETURN_REASON_MAX || !/^[\x20-\x7e]+$/.test(reason)) throw new PosError('INVALID_INPUT');
  if (typeof body.idempotencyKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.idempotencyKey)) throw new PosError('INVALID_INPUT');
  return { items, reason, idempotencyKey: body.idempotencyKey.toLowerCase() };
}

export function refundMethodFor(paymentType: PaymentMethod): RefundMethod {
  return paymentType === 'Kredit' ? 'Kredit' : 'Cash';
}

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dayNumber(day)) && new Date(dayNumber(day) * 86_400_000).toISOString().slice(0, 10) === day;

/**
 * Server-side return window. Kredit: no reliable payroll/credit-cycle OPEN/CLOSED status exists for store sales
 * (trans_tagihan only covers PPOB), so the fallback is the sale's own calendar month: once the month is over its
 * payroll deduction may already be finalized and must not change.
 */
export function returnWindow(paymentType: PaymentMethod, saleDate: string, today: string): { open: boolean; deadline: string; reason: 'RETURN_WINDOW_EXPIRED' | 'CREDIT_PERIOD_CLOSED' | 'SALE_DATE_INVALID' | null } {
  if (!isDay(saleDate) || !isDay(today) || saleDate > today) return { open: false, deadline: saleDate, reason: 'SALE_DATE_INVALID' };
  if (paymentType === 'Kredit') {
    const deadline = new Date(Date.UTC(Number(saleDate.slice(0, 4)), Number(saleDate.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const open = saleDate.slice(0, 7) === today.slice(0, 7);
    return { open, deadline, reason: open ? null : 'CREDIT_PERIOD_CLOSED' };
  }
  const deadline = new Date((dayNumber(saleDate) + RETURN_CASH_WINDOW_DAYS) * 86_400_000).toISOString().slice(0, 10);
  const open = today <= deadline;
  return { open, deadline, reason: open ? null : 'RETURN_WINDOW_EXPIRED' };
}

/** One returnable product of a sale; legacy sales may hold one item on several rows, so rows are grouped by item. */
export type ReturnableLine = { itemId: number; soldQty: number; returnedQty: number; totalSen: number; returnedSen: number };

/**
 * Refund for `quantity` more units, allocated cumulatively from the saved line total so that the sum of every partial
 * return equals the saved total exactly (no drift from per-unit rounding). Whole-rupiah totals are allocated in whole
 * rupiah. BigInt keeps total × quantity exact.
 */
export function allocateRefund(line: Pick<ReturnableLine, 'soldQty' | 'returnedQty' | 'totalSen'>, quantity: number): number {
  const { soldQty, returnedQty, totalSen } = line;
  if (![soldQty, returnedQty, totalSen, quantity].every(Number.isSafeInteger) || soldQty <= 0 || returnedQty < 0 || totalSen < 0 || quantity <= 0) throw new PosError('INVALID_AMOUNT');
  if (returnedQty + quantity > soldQty) throw new PosError('RETURN_QUANTITY_EXCEEDED');
  const unit = BigInt(totalSen % 100 === 0 ? 100 : 1);
  const total = BigInt(totalSen) / unit, sold = BigInt(soldQty);
  const until = (qty: number) => (total * BigInt(qty)) / sold;
  return Number((until(returnedQty + quantity) - until(returnedQty)) * unit);
}

export type ReturnFacts = {
  salesStatus: string; recordStatus: number; paymentType: string; paymentStatus: string; saleDate: string;
  customerId: number; consistentTotals: boolean; lines: ReturnableLine[];
};
export type ReturnReason =
  | 'NON_FINAL' | 'INACTIVE_RECORD' | 'PAYMENT_METHOD_UNSUPPORTED' | 'PAYMENT_NOT_SETTLED' | 'LEGACY_TOTALS_UNSUPPORTED'
  | 'RETURN_WINDOW_EXPIRED' | 'CREDIT_PERIOD_CLOSED' | 'SALE_DATE_INVALID' | 'MEMBER_MISSING' | 'FULLY_RETURNED';

/** Whether a sale may receive (another) return today. The write path re-evaluates this on locked rows. */
export function evaluateReturnEligibility(facts: ReturnFacts, today: string): { allowed: boolean; reasons: ReturnReason[]; refundMethod: RefundMethod | null; deadline: string | null } {
  const reasons = new Set<ReturnReason>();
  if (facts.salesStatus !== 'Final') reasons.add('NON_FINAL');
  if (facts.recordStatus !== 1) reasons.add('INACTIVE_RECORD');
  if (!['Paid', 'Dibayar'].includes(facts.paymentStatus)) reasons.add('PAYMENT_NOT_SETTLED');
  if (!facts.consistentTotals) reasons.add('LEGACY_TOTALS_UNSUPPORTED');
  if (!facts.lines.some((line) => line.returnedQty < line.soldQty)) reasons.add('FULLY_RETURNED');
  let deadline: string | null = null; let refundMethod: RefundMethod | null = null;
  if (!isPaymentMethod(facts.paymentType)) reasons.add('PAYMENT_METHOD_UNSUPPORTED');
  else {
    refundMethod = refundMethodFor(facts.paymentType);
    if (facts.paymentType === 'Kredit' && facts.customerId <= 0) reasons.add('MEMBER_MISSING');
    const window = returnWindow(facts.paymentType, facts.saleDate, today);
    deadline = window.deadline;
    if (window.reason) reasons.add(window.reason);
  }
  return { allowed: reasons.size === 0, reasons: [...reasons], refundMethod, deadline };
}

export type ReturnListQuery = { from: string; to: string; q: string; page: number; pageSize: number };

/** Return list filter: Jakarta month to date by default, at most 93 days, one value per key, no unknown keys. */
export function parseReturnListQuery(params: { keys(): Iterable<string>; getAll(name: string): readonly string[] }, today: string): ReturnListQuery {
  const allowed = new Set(['from', 'to', 'q', 'page']);
  const one = (key: string) => { const values = params.getAll(key); if (values.length > 1) throw new PosError('INVALID_INPUT'); return values[0]; };
  for (const key of new Set(params.keys())) if (!allowed.has(key)) throw new PosError('INVALID_INPUT');
  const from = one('from') || `${today.slice(0, 7)}-01`, to = one('to') || today;
  if (!isDay(from) || !isDay(to) || from > to || dayNumber(to) - dayNumber(from) > 92) throw new PosError('INVALID_INPUT');
  const q = (one('q') ?? '').trim();
  if (q.length > 50 || !/^[\x20-\x7e]*$/.test(q)) throw new PosError('INVALID_INPUT');
  const rawPage = one('page') ?? '1';
  if (!/^[1-9]\d{0,4}$/.test(rawPage) || Number(rawPage) > 4000) throw new PosError('INVALID_INPUT');
  return { from, to, q, page: Number(rawPage), pageSize: 25 };
}

/** Prices one requested return against the sale's returnable lines (exact sen). */
export function priceReturn(lines: readonly ReturnableLine[], items: ReturnRequest['items']): { lines: (ReturnableLine & { quantity: number; refundSen: number })[]; totalSen: number } {
  let totalSen = 0;
  const priced = items.map((item) => {
    const line = lines.find((candidate) => candidate.itemId === item.itemId);
    if (!line) throw new PosError('RETURN_ITEM_NOT_IN_SALE');
    if (line.returnedSen > line.totalSen) throw new PosError('LEGACY_TOTALS_UNSUPPORTED');
    // Earlier returns written by other code may have priced units differently: never refund past the saved total.
    const refundSen = Math.min(allocateRefund(line, item.quantity), line.totalSen - line.returnedSen);
    totalSen += refundSen;
    return { ...line, quantity: item.quantity, refundSen };
  });
  if (!Number.isSafeInteger(totalSen) || totalSen <= 0) throw new PosError('INVALID_AMOUNT');
  return { lines: priced, totalSen };
}
