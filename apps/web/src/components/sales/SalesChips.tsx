import { Banknote, Check, CreditCard, QrCode } from 'lucide-react';

export function PaymentMethodChip({ value }: { value: string }) {
  const kind = value.trim().toLowerCase();
  const Icon = kind === 'cash' ? Banknote : kind === 'qris' ? QrCode : CreditCard;
  const tone = ['cash', 'qris', 'kredit'].includes(kind) ? kind : 'neutral';
  return <span className={`sales-chip sales-chip--${tone}`}><Icon size={13} aria-hidden="true" />{value || 'Tidak tersimpan'}</span>;
}
export function StatusChip({ value, payment = false }: { value: string; payment?: boolean }) {
  const kind = value.trim().toLowerCase();
  const success = payment ? ['paid', 'dibayar', 'lunas'].includes(kind) : kind === 'final';
  const tone = success ? 'success' : ['partial', 'sebagian', 'hold', 'draft', 'quotation'].includes(kind) ? 'warning' : ['unpaid', 'belum dibayar', 'cancelled', 'batal'].includes(kind) ? 'danger' : 'neutral';
  return <span className={`sales-chip sales-chip--${tone}`}>{success ? <Check size={12} aria-hidden="true" /> : <span className="sales-chip-dot" aria-hidden="true" />}{value || 'Tidak tersimpan'}</span>;
}
export function formatSalesMoney(amount: number | null) {
  return amount === null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: amount % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(amount / 100);
}
export function formatSalesDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}
export const safeSalesReturn = (value: string | undefined) => value && (value === '/sales' || value.startsWith('/sales?')) ? value : '/sales';
export function salesListHref(query: import('@koperasi/domain/sales/history').SalesHistoryQuery, patch: Partial<import('@koperasi/domain/sales/history').SalesHistoryQuery> = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...patch })) if (value !== '' && value !== null) search.set(key, String(value));
  return `/sales?${search}`;
}
