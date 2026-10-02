"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { CATALOG_PAGE_SIZE, type CatalogStatus, type PosCategory, type PosMember, type PosProduct, type PosSession, type PreviewCartLine } from "@/features/pos/types";
import { PosHeader, PosShell } from "./PosShell";
import { CategoryFilter, ProductGrid, ProductSearch } from "./ProductCatalog";
import { TransactionPanel } from "./TransactionPanel";
import { changeQuantity, hasPrice } from "./preview";
import "./pos.css";

class SessionEnded extends Error {}

async function fetchProducts(params: URLSearchParams, signal?: AbortSignal): Promise<PosProduct[]> {
  const response = await fetch(`/api/pos/products?${params}`, { signal, cache: "no-store" });
  if (response.status === 401) throw new SessionEnded("session ended");
  if (!response.ok) throw new Error("catalog request failed");
  return (await response.json()).products as PosProduct[];
}

export function PosScreen({ products: initialProducts, categories, members = [], catalogStatus = "ready", session }: { products: PosProduct[]; categories: readonly PosCategory[]; members?: readonly PosMember[]; catalogStatus?: CatalogStatus; session: PosSession }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [products, setProducts] = useState(initialProducts);
  const [status, setStatus] = useState<CatalogStatus>(catalogStatus);
  const [fetching, setFetching] = useState(false);
  const [retry, setRetry] = useState(0);
  const [cart, setCart] = useState<PreviewCartLine[]>([]);
  const [message, setMessage] = useState("");
  const quantities = Object.fromEntries(cart.map((line) => [line.product.id, line.quantity]));
  const requestKey = `${query.trim()}|${category ?? ""}`;
  // Key of the request whose result is on screen; the server already supplied the initial (empty query) list.
  const loadedKey = useRef<string | null>(catalogStatus === "ready" ? "|" : null);

  useEffect(() => {
    if (loadedKey.current === requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFetching(true);
      if (products.length === 0) setStatus("loading");
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (category) params.set("category", category);
        setProducts(await fetchProducts(params, controller.signal));
        setStatus("ready");
        loadedKey.current = requestKey;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (error instanceof SessionEnded) { router.replace("/login"); return; }
        loadedKey.current = null;
        setStatus("error");
      } finally {
        if (!controller.signal.aborted) setFetching(false);
      }
    }, query.trim() ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
    // `products.length` and `query`/`category` are read only to build this one request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retry]);

  function adjust(product: PosProduct, delta: 1 | -1) {
    setCart((current) => changeQuantity(current, product, delta));
    setMessage(delta === 1 ? `${product.name} ditambahkan ke keranjang contoh.` : `Jumlah ${product.name} dikurangi.`);
  }

  async function scan() {
    const identifier = query.trim();
    if (!identifier) return;
    try {
      const [product] = await fetchProducts(new URLSearchParams({ barcode: identifier }));
      if (!product) { setMessage("Barcode tidak ditemukan. Pilih produk dari hasil pencarian."); return; }
      if (!hasPrice(product)) { setMessage(`Harga ${product.name} belum diatur.`); return; }
      if (product.stock <= 0 || (quantities[product.id] ?? 0) >= product.stock) { setMessage(`Stok ${product.name} tidak mencukupi.`); return; }
      adjust(product, 1); setQuery(""); setCategory(null);
    } catch (error) {
      if (error instanceof SessionEnded) { router.replace("/login"); return; }
      setMessage("Barcode belum dapat diperiksa. Coba lagi.");
    }
  }

  return (
    <PosShell branchName={session.branchName}>
      <PosHeader session={session} />
      <main className="pos-content" id="pos-workspace">
        <div className="pos-preview-notice"><Info size={16} /><span><strong>Pratinjau antarmuka</strong> · Produk, harga, dan stok cabang Anda dibaca dari database staging. Anggota masih data contoh. Tidak ada transaksi tersimpan.</span></div>
        <div className="pos-workspace">
          <section className="pos-catalog" aria-label="Katalog produk">
            <ProductSearch query={query} onQuery={setQuery} onScan={scan} />
            <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
            <div className="pos-catalog-meta"><span>{status === "ready" ? `${products.length} produk${products.length >= CATALOG_PAGE_SIZE ? " pertama · persempit pencarian" : ""}` : ""}</span><span>{query.trim() ? "Hasil pencarian termasuk stok habis" : "Daftar hanya menampilkan produk berstok"}</span></div>
            <div className="pos-catalog-scroll" aria-busy={fetching}><ProductGrid products={products} quantities={quantities} onAdd={(product) => adjust(product, 1)} status={status} onReset={() => { setQuery(""); setCategory(null); }} onRetry={() => setRetry((count) => count + 1)} /></div>
          </section>
          <TransactionPanel cart={cart} members={members} onChange={adjust} onRemove={(id) => setCart((current) => current.filter((line) => line.product.id !== id))} onClear={() => setCart([])} />
        </div>
        <p className="pos-sr-only" role="status">{message}</p>
      </main>
    </PosShell>
  );
}
