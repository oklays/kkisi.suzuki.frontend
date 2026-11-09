import type { OrderRow, SaleRow } from '../../../server/kosipa/store.reader.ts';
import { dayLabel, monthShort, titleCase } from '../../../lib/utils/dates.ts';
import { senOf } from '../../../lib/utils/money.ts';

// Transaction history = the member's POS sales (db_sales) + smartkkisi orders (online store and PPOB). Status words are mapped
// only where their meaning is certain; anything else is shown as recorded.

export type TxKind = 'Pesanan Toko' | 'PPOB' | 'Belanja Online';
export type TxTone = 'success' | 'waiting' | 'danger' | 'muted';
export type TxItem = { key: string; kind: TxKind; title: string; reference: string; date: string; dateIso: string; period: string; amountSen: number; status: string; tone: TxTone; store: string | null; payment: string | null };

function saleStatus(s: SaleRow): { status: string; tone: TxTone } {
  if (s.status === 'Final') return { status: 'Selesai', tone: 'success' };
  return { status: titleCase(s.status) || 'Status tidak tercatat', tone: 'muted' };
}
function orderStatus(o: OrderRow): { status: string; tone: TxTone } {
  const s = o.status.toLowerCase();
  if (o.inProcess) return { status: 'Diproses', tone: 'waiting' };
  if (['delivered', 'success', 'completed', 'confirmed'].includes(s)) return { status: 'Berhasil', tone: 'success' };
  if (['canceled', 'cancelled', 'failed', 'returned'].includes(s)) return { status: 'Dibatalkan', tone: 'danger' };
  if (['pending', 'processing', 'out_for_delivery'].includes(s)) return { status: 'Diproses', tone: 'waiting' };
  return { status: titleCase(o.status) || 'Status tidak tercatat', tone: 'muted' };
}

export function buildTransactions(sales: readonly SaleRow[], orders: readonly OrderRow[]): TxItem[] {
  const items: TxItem[] = [
    ...sales.map((s) => ({
      key: `s${s.id}`, kind: (s.ppob ? 'PPOB' : 'Pesanan Toko') as TxKind, title: s.ppob ? titleCase(s.ppobType) || 'PPOB' : 'Pesanan Toko',
      reference: s.ppob ? s.code : s.store ?? `Toko #${s.companyId}`, date: dayLabel(s.date), dateIso: s.date, period: monthShort(s.date), amountSen: senOf(s.total),
      ...saleStatus(s), store: s.ppob ? null : s.store, payment: s.paymentType || null,
    })),
    ...orders.map((o) => ({
      key: `o${o.id}`, kind: (o.ppob ? 'PPOB' : 'Belanja Online') as TxKind, title: o.ppob ? titleCase(o.ppobType) || 'PPOB' : 'Belanja Online', reference: o.code,
      date: dayLabel(o.date), dateIso: o.date, period: monthShort(o.date), amountSen: senOf(o.amount), ...orderStatus(o), store: null, payment: null,
    })),
  ];
  return items.sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.key.localeCompare(a.key));
}

export type TxFilter = { kind: string; status: string; store: string; period: string };
export function parseTxFilter(params: Record<string, string | string[] | undefined>): TxFilter {
  const one = (k: string) => { const v = params[k]; return typeof v === 'string' ? v.slice(0, 60) : ''; };
  return { kind: one('jenis'), status: one('status'), store: one('toko'), period: one('periode') };
}
export const applyTxFilter = (items: readonly TxItem[], f: TxFilter) => items.filter((t) =>
  (!f.kind || t.kind === f.kind) && (!f.status || t.status === f.status) && (!f.store || t.store === f.store) && (!f.period || t.period === f.period));
export function txFilterOptions(items: readonly TxItem[]) {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return { kinds: uniq(items.map((t) => t.kind)), statuses: uniq(items.map((t) => t.status)), stores: uniq(items.map((t) => t.store)), periods: uniq(items.map((t) => t.period)) };
}
