import type { MasterProduct } from '@koperasi/domain/inventory';
export const stockState = (item: Pick<MasterProduct, 'stock' | 'alertQty'>): 'empty' | 'low' | 'available' => item.stock <= 0 ? 'empty' : item.stock <= item.alertQty ? 'low' : 'available';
export function csvCell(value: string | number): string {
  const text = String(value);
  return `"${(/^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
}
export function productsCsv(items: MasterProduct[]): string {
  const rows = [['Kode barang', 'SKU', 'Barcode', 'Barcode kemasan', 'Nama produk', 'Kategori', 'Merek', 'Satuan', 'Harga jual', 'Harga beli', 'Diskon', 'Stok', 'Stok minimum', 'Status', 'Stock opname'],
    ...items.map(p => [p.code, p.sku, p.barcode, p.packBarcode, p.name, p.category ?? '', p.brand ?? '', p.unit ?? '', p.sellingPrice, p.purchasePrice, p.discount, p.stock, p.alertQty, p.active ? 'Aktif' : 'Nonaktif', p.locked ? 'Sedang SO' : ''])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export const legacyProductUrl = (id?: number) => `https://tokonew.kkisitb2.id/items/${id ? `update/${id}` : 'add'}`;
