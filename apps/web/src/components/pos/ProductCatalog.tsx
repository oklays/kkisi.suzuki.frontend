"use client";

import { useRef, useState } from "react";
import { Barcode, LoaderCircle, PackageSearch, Plus, Search, TriangleAlert, X } from "lucide-react";
import type { CatalogStatus, PosProduct } from "@/features/pos/types";
import { formatRupiah, hasPrice, illustrationFamily, netPriceSen, productImage, productIllustration } from "./preview";

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
  return <span className={`pos-stock ${empty ? "is-empty" : ""}`}>{empty ? "Stok habis" : `Stok: ${product.stock}`}</span>;
}

export function ProductSearch({ query, onQuery, onScan, disabled = false }: { query: string; onQuery: (query: string) => void; onScan: () => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form className="pos-search" onSubmit={(event) => { event.preventDefault(); if (!disabled) onScan(); }} role="search">
      <Search size={19} aria-hidden="true" />
      <input ref={input} aria-label="Cari produk berdasarkan nama, kode, atau barcode" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Scan barcode atau cari produk (nama/kode)..." autoComplete="off" />
      {query && <button className="pos-icon-button" type="button" aria-label="Hapus pencarian" onClick={() => { onQuery(""); input.current?.focus(); }}><X size={16} /></button>}
      <button className="pos-scan" type="button" disabled={disabled} onClick={() => { if (query.trim()) onScan(); else input.current?.focus(); }}><Barcode size={17} />Scan</button>
    </form>
  );
}

export function ProductCard({ product, quantity, onAdd, locked = false }: { product: PosProduct; quantity: number; onAdd: (product: PosProduct) => void; locked?: boolean }) {
  const disabled = locked || product.stock <= 0 || quantity >= product.stock || !hasPrice(product);
  return (
    <article className="pos-product-card">
      <div className={`pos-product-image family-${illustrationFamily(product.categoryName)}`}>
        {product.stock <= 0 && <span className="pos-empty-stock">Stok Habis</span>}
        {quantity > 0 && <span className="pos-in-cart">{quantity} di keranjang</span>}
        <ProductIllustration product={product} />
      </div>
      <div className="pos-product-detail">
        <h3>{product.name}</h3><p>{product.code}</p>
        <div className="pos-product-bottom"><div>{hasPrice(product) ? <strong>{formatRupiah(netPriceSen(product))}</strong> : <strong className="pos-no-price">Harga belum diatur</strong>}{product.discountSen > 0 && hasPrice(product) && <s className="pos-list-price">{formatRupiah(product.priceSen)}</s>}<StockBadge product={product} /></div>
          <button className="pos-add" disabled={disabled} aria-label={`Tambah ${product.name}`} onClick={() => onAdd(product)}><Plus size={19} /></button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, quantities, onAdd, status = "ready", onReset, onRetry, locked = false }: { products: PosProduct[]; quantities: Record<string, number>; onAdd: (product: PosProduct) => void; status?: CatalogStatus; onReset: () => void; onRetry: () => void; locked?: boolean }) {
  if (status === "loading") return <div className="pos-catalog-state" role="status"><LoaderCircle className="pos-spinner" size={32} /><h2>Memuat produk…</h2><p>Mohon tunggu sebentar.</p></div>;
  if (status === "error") return <div className="pos-catalog-state" role="alert"><TriangleAlert size={32} /><h2>Produk belum dapat dimuat</h2><p>Periksa koneksi dan coba muat kembali.</p><button className="pos-text-button" onClick={onRetry}>Coba lagi</button></div>;
  if (products.length === 0) return <div className="pos-catalog-state" role="status"><PackageSearch size={36} /><h2>Produk tidak ditemukan</h2><p>Coba kata kunci nama, kode, atau barcode lain.</p><button className="pos-text-button" onClick={onReset}>Tampilkan semua produk</button></div>;
  return <div className="pos-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} quantity={quantities[product.id] ?? 0} onAdd={onAdd} locked={locked} />)}</div>;
}
