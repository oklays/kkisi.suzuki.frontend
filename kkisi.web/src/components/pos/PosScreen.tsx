"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { CatalogStatus, PosCategory, PosMember, PosProduct, PreviewCartLine } from "@/application/pos/contracts";
import { PosHeader, PosShell } from "./PosShell";
import { CategoryFilter, ProductGrid, ProductSearch } from "./ProductCatalog";
import { TransactionPanel } from "./TransactionPanel";
import { catalogCategories, changeQuantity, filterProducts } from "./preview";
import "./pos.css";

export function PosScreen({ products, categories = catalogCategories(products), members = [], catalogStatus = "ready" }: { products: PosProduct[]; categories?: readonly PosCategory[]; members?: readonly PosMember[]; catalogStatus?: CatalogStatus }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<PreviewCartLine[]>([]);
  const [message, setMessage] = useState("");
  const filtered = filterProducts(products, query, category);
  const quantities = Object.fromEntries(cart.map((line) => [line.product.id, line.quantity]));

  function adjust(product: PosProduct, delta: 1 | -1) {
    setCart((current) => changeQuantity(current, product, delta));
    setMessage(delta === 1 ? `${product.name} ditambahkan ke keranjang contoh.` : `Jumlah ${product.name} dikurangi.`);
  }

  function scan() {
    const identifier = query.trim();
    const product = products.find((item) => item.code.toLowerCase() === identifier.toLowerCase() || item.barcode === identifier);
    if (!product) { setMessage("Kode produk tidak ditemukan dalam data contoh."); return; }
    if (product.stock <= 0 || (quantities[product.id] ?? 0) >= product.stock) { setMessage(`Stok ${product.name} tidak mencukupi.`); return; }
    adjust(product, 1); setQuery(""); setCategory(null);
  }

  return (
    <PosShell>
      <PosHeader />
      <main className="pos-content" id="pos-workspace">
        <div className="pos-preview-notice"><Info size={16} /><span><strong>Pratinjau antarmuka</strong> · Produk, stok, dan anggota menggunakan data contoh. Tidak ada transaksi tersimpan.</span></div>
        <div className="pos-workspace">
          <section className="pos-catalog" aria-label="Katalog produk">
            <ProductSearch query={query} onQuery={setQuery} onScan={scan} />
            <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
            <div className="pos-catalog-meta"><span>{filtered.length} produk contoh</span><span>Cari nama, kode, atau barcode</span></div>
            <div className="pos-catalog-scroll"><ProductGrid products={filtered} quantities={quantities} onAdd={(product) => adjust(product, 1)} status={catalogStatus} onReset={() => { setQuery(""); setCategory(null); }} /></div>
          </section>
          <TransactionPanel cart={cart} members={members} onChange={adjust} onRemove={(id) => setCart((current) => current.filter((line) => line.product.id !== id))} onClear={() => setCart([])} />
        </div>
        <p className="pos-sr-only" role="status">{message}</p>
      </main>
    </PosShell>
  );
}
