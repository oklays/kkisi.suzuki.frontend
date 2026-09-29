"use client";

import { useRef, useState } from "react";
import { Barcode, Boxes, Coffee, House, LayoutGrid, LoaderCircle, PackageSearch, Plus, Search, ShoppingBag, Soup, TriangleAlert, X } from "lucide-react";
import type { CatalogStatus, PosCategory, PosProduct } from "@/application/pos/contracts";
import { formatRupiah, illustrationFamily, productImage, productIllustration } from "./preview";

export function ProductIllustration({ product }: { product: PosProduct }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = productImage(product);
  return (
    // Legacy image URLs are supplied by the future trusted server projection.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={failedUrl === image ? productIllustration(product) : image} alt={product.name} loading="lazy" onError={() => setFailedUrl(image)} />
  );
}

export function StockBadge({ product }: { product: PosProduct }) {
  const empty = product.stock <= 0;
  return <span className={`pos-stock ${empty ? "is-empty" : product.stockStatus === "low" ? "is-low" : ""}`}>{empty ? "Stok habis" : `Stok: ${product.stock}${product.stockStatus === "low" ? " · Menipis" : ""}`}</span>;
}

export function ProductSearch({ query, onQuery, onScan }: { query: string; onQuery: (query: string) => void; onScan: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form className="pos-search" onSubmit={(event) => { event.preventDefault(); onScan(); }} role="search">
      <Search size={19} aria-hidden="true" />
      <input ref={input} aria-label="Cari produk berdasarkan nama, kode, atau barcode" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Scan barcode atau cari produk (nama/kode)..." autoComplete="off" />
      {query && <button className="pos-icon-button" type="button" aria-label="Hapus pencarian" onClick={() => { onQuery(""); input.current?.focus(); }}><X size={16} /></button>}
      <button className="pos-scan" type="button" onClick={() => input.current?.focus()}><Barcode size={17} />Scan</button>
    </form>
  );
}

const categoryIcons = { sembako: ShoppingBag, minuman: Coffee, makanan: Soup, "rumah-tangga": House, lainnya: Boxes };

export function CategoryFilter({ categories, selected, onSelect }: { categories: readonly PosCategory[]; selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="pos-categories" role="group" aria-label="Kategori produk">
      <button aria-pressed={selected === null} className={selected === null ? "is-selected" : ""} onClick={() => onSelect(null)}><LayoutGrid size={16} />Semua</button>
      {categories.map((category) => {
        const Icon = categoryIcons[illustrationFamily(category.name) as keyof typeof categoryIcons];
        return <button key={category.id} aria-pressed={selected === category.id} className={selected === category.id ? "is-selected" : ""} onClick={() => onSelect(category.id)}><Icon size={16} />{category.name}</button>;
      })}
    </div>
  );
}

export function ProductCard({ product, quantity, onAdd }: { product: PosProduct; quantity: number; onAdd: (product: PosProduct) => void }) {
  const disabled = product.stock <= 0 || quantity >= product.stock;
  return (
    <article className="pos-product-card">
      <div className={`pos-product-image family-${illustrationFamily(product.categoryName)}`}>
        {product.stock <= 0 && <span className="pos-empty-stock">Stok Habis</span>}
        {quantity > 0 && <span className="pos-in-cart">{quantity} di keranjang</span>}
        <ProductIllustration product={product} />
      </div>
      <div className="pos-product-detail">
        <h3>{product.name}</h3><p>{product.code}</p>
        <div className="pos-product-bottom"><div><strong>{formatRupiah(product.unitPriceRp)}</strong><StockBadge product={product} /></div>
          <button className="pos-add" disabled={disabled} aria-label={`Tambah ${product.name}`} onClick={() => onAdd(product)}><Plus size={19} /></button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, quantities, onAdd, status = "ready", onReset }: { products: PosProduct[]; quantities: Record<string, number>; onAdd: (product: PosProduct) => void; status?: CatalogStatus; onReset: () => void }) {
  if (status === "loading") return <div className="pos-catalog-state" role="status"><LoaderCircle className="pos-spinner" size={32} /><h2>Memuat produk…</h2><p>Mohon tunggu sebentar.</p></div>;
  if (status === "error") return <div className="pos-catalog-state" role="alert"><TriangleAlert size={32} /><h2>Produk belum dapat dimuat</h2><p>Periksa koneksi dan coba muat kembali.</p></div>;
  if (products.length === 0) return <div className="pos-catalog-state" role="status"><PackageSearch size={36} /><h2>Produk tidak ditemukan</h2><p>Coba kata kunci lain atau pilih kategori berbeda.</p><button className="pos-text-button" onClick={onReset}>Tampilkan semua produk</button></div>;
  return <div className="pos-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} quantity={quantities[product.id] ?? 0} onAdd={onAdd} />)}</div>;
}
