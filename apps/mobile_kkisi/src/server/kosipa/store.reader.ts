import { dec, query, txt, type Db } from './sql.ts';

// TOKO (POS) reads for one member. Store credit uses EXACTLY the POS credit-usage rule (kosipa-member.repository.ts storeCredit
// and sales-return-ledger.ts kreditReturnedSen): Kredit + Final sales this business month, all branches, minus their returns.

export async function readCreditUsage(db: Db, nik: string, monthStart: string, monthEnd: string): Promise<{ spent: string; returned: string }> {
  const [spent] = await query<{ amount: string }>(db, `SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))), 0) AS DECIMAL(18,2)) AS amount FROM db_sales
    WHERE nik_kar = ? AND payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ? AND sales_date < ?`, [nik, monthStart, monthEnd]);
  const [ret] = await query<{ amount: string }>(db, `SELECT CAST(COALESCE(SUM(CAST(r.grand_total AS DECIMAL(18,2))), 0) AS DECIMAL(18,2)) AS amount
    FROM db_salesreturn r JOIN db_sales s ON s.id = r.sales_id AND s.company_id = r.company_id
    WHERE s.nik_kar = ? AND s.payment_type = 'Kredit' AND s.sales_status = 'Final' AND s.sales_date >= ? AND s.sales_date < ?`, [nik, monthStart, monthEnd]);
  return { spent: spent?.amount ?? '0.00', returned: ret?.amount ?? '0.00' };
}

export type SaleRow = { id: number; code: string; date: string; total: string; status: string; paymentType: string; store: string | null; companyId: number; ppob: boolean; ppobType: string | null };

/** The member's POS sales (db_sales), newest first. `kreditOnly` + month window = the credit history of the Saldo screen. */
export async function readSales(db: Db, nikKeys: string[], opts: { from?: string; toExclusive?: string; kreditOnly?: boolean; limit: number }): Promise<SaleRow[]> {
  const params: unknown[] = [nikKeys];
  let where = 's.nik_kar IN (?)';
  if (opts.from) { where += ' AND s.sales_date >= ?'; params.push(opts.from); }
  if (opts.toExclusive) { where += ' AND s.sales_date < ?'; params.push(opts.toExclusive); }
  if (opts.kreditOnly) where += " AND s.payment_type = 'Kredit' AND s.sales_status = 'Final'";
  params.push(opts.limit);
  const r = await query<Record<string, string | null>>(db, `SELECT s.id, s.sales_code, ${txt('s.sales_date')} AS sales_date, ${dec('s.grand_total')} AS total, s.sales_status, s.payment_type,
      s.company_id, c.company_name, s.ppob, s.ppob_type
    FROM db_sales s LEFT JOIN db_company c ON c.id = s.company_id WHERE ${where} ORDER BY s.sales_date DESC, s.id DESC LIMIT ?`, params);
  return r.map((x) => ({ id: Number(x.id), code: x.sales_code ?? '', date: x.sales_date ?? '', total: x.total ?? '0.00', status: x.sales_status ?? '', paymentType: x.payment_type ?? '',
    store: x.company_name, companyId: Number(x.company_id), ppob: Number(x.ppob) === 1, ppobType: x.ppob_type }));
}

export type OrderRow = { id: number; code: string; date: string; amount: string; status: string; paymentStatus: string; ppob: boolean; ppobType: string | null; inProcess: boolean };
/** smartkkisi `orders` of the member (online store and PPOB). Read-only; status words are shown as recorded. */
export async function readOrders(db: Db, nikKeys: string[], limit: number): Promise<OrderRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, order_code, ${txt('created_at')} AS created, ${dec('order_amount')} AS amount, order_status, payment_status, ppob, ppob_type, in_proses
    FROM orders WHERE nik_kar IN (?) ORDER BY id DESC LIMIT ?`, [nikKeys, limit]);
  return r.map((x) => ({ id: Number(x.id), code: x.order_code ?? '', date: (x.created ?? '').slice(0, 10), amount: x.amount ?? '0.00', status: x.order_status ?? '', paymentStatus: x.payment_status ?? '',
    ppob: Number(x.ppob) === 1, ppobType: x.ppob_type, inProcess: Number(x.in_proses) === 1 }));
}

// ---------------------------------------------------------------------------------------------------------------- catalog
export type CatalogItem = { id: number; name: string; sku: string; category: string; unit: string; price: string };
export type CatalogQuery = { companyId: number; q: string; category: string | null; sort: 'name' | 'price-low' | 'price-high'; limit: number; offset: number };
// Same scope as the approved mockup snapshot (db_items via the project's SELECT-only reader): active finished products of one
// store that are not the PPOB balance item. Stock is not read and never promised.
const CATALOG_WHERE = "i.company_id = ? AND i.status = 1 AND i.status_so = 0 AND i.type = 'Produk Jadi' AND i.custom_barcode <> 'SALDOPPOB'";
const ORDER: Record<CatalogQuery['sort'], string> = { name: 'i.item_name, i.id', 'price-low': 'i.sales_price, i.item_name, i.id', 'price-high': 'i.sales_price DESC, i.item_name, i.id' };
const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export async function readCatalog(db: Db, q: CatalogQuery): Promise<{ items: CatalogItem[]; total: number }> {
  const params: unknown[] = [q.companyId];
  let where = CATALOG_WHERE;
  if (q.q) { where += ' AND (i.item_name LIKE ? OR i.item_code LIKE ?)'; params.push(like(q.q), like(q.q)); }
  if (q.category) { where += " AND COALESCE(c.category_name, 'Tanpa kategori') = ?"; params.push(q.category); }
  const countJoin = q.category ? ' LEFT JOIN db_category c ON c.id = i.category_id' : '';
  const [count] = await query<{ n: string }>(db, `SELECT COUNT(*) AS n FROM db_items i${countJoin} WHERE ${where}`, params);
  const r = await query<Record<string, string | null>>(db, `SELECT i.id, i.item_name, i.item_code, COALESCE(c.category_name, 'Tanpa kategori') AS category, COALESCE(u.unit_name, '') AS unit, ${dec('i.sales_price')} AS price
    FROM db_items i LEFT JOIN db_category c ON c.id = i.category_id LEFT JOIN db_units u ON u.id = i.unit_id
    WHERE ${where} ORDER BY ${ORDER[q.sort]} LIMIT ? OFFSET ?`, [...params, q.limit, q.offset]);
  return { total: Number(count?.n ?? 0), items: r.map((x) => ({ id: Number(x.id), name: (x.item_name ?? '').trim(), sku: x.item_code ?? '', category: x.category ?? 'Tanpa kategori', unit: x.unit ?? '', price: x.price ?? '0.00' })) };
}

export async function readCatalogCategories(db: Db, companyId: number): Promise<string[]> {
  const r = await query<{ category: string }>(db, `SELECT DISTINCT COALESCE(c.category_name, 'Tanpa kategori') AS category FROM db_items i LEFT JOIN db_category c ON c.id = i.category_id
    WHERE ${CATALOG_WHERE} ORDER BY 1 LIMIT 200`, [companyId]);
  return r.map((x) => x.category);
}

/** Current prices of specific catalog items (checkout never trusts prices sent by the browser). */
export async function readCatalogItems(db: Db, companyId: number, ids: number[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  const r = await query<Record<string, string | null>>(db, `SELECT i.id, i.item_name, i.item_code, COALESCE(c.category_name, 'Tanpa kategori') AS category, COALESCE(u.unit_name, '') AS unit, ${dec('i.sales_price')} AS price
    FROM db_items i LEFT JOIN db_category c ON c.id = i.category_id LEFT JOIN db_units u ON u.id = i.unit_id WHERE ${CATALOG_WHERE} AND i.id IN (?) LIMIT ?`, [companyId, ids, ids.length]);
  return r.map((x) => ({ id: Number(x.id), name: (x.item_name ?? '').trim(), sku: x.item_code ?? '', category: x.category ?? '', unit: x.unit ?? '', price: x.price ?? '0.00' }));
}
