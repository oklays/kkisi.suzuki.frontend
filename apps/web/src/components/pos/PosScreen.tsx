"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, LayoutGrid, ShoppingBag } from "lucide-react";
import { CATALOG_PAGE_SIZE, type CatalogStatus, type PosCategory, type PosProduct, type PosSession, type PreviewCartLine } from "@/features/pos/types";
import { PosHeader, PosShell } from "./PosShell";
import { ProductGrid, ProductSearch } from "./ProductCatalog";
import { TransactionPanel } from "./TransactionPanel";
import { CenterCart, ClearCartButton } from "./CenterCart";
import { changeQuantity, hasPrice } from "./preview";
import { createCartScanGuard } from "@/features/pos/checkout-state";
import "./pos.css";

class SessionEnded extends Error {}

async function fetchProducts(params: URLSearchParams, signal?: AbortSignal): Promise<PosProduct[]> {
  const response = await fetch(`/api/pos/products?${params}`, { signal, cache: "no-store" });
  if (response.status === 401) throw new SessionEnded("session ended");
  if (!response.ok) throw new Error("catalog request failed");
  return (await response.json()).products as PosProduct[];
}

export function PosScreen({ products: initialProducts, catalogStatus = "ready", session }: { products: PosProduct[]; categories?: readonly PosCategory[]; catalogStatus?: CatalogStatus; session: PosSession }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"product" | "cart">("product");
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [products, setProducts] = useState(initialProducts);
  const [status, setStatus] = useState<CatalogStatus>(catalogStatus);
  const [fetching, setFetching] = useState(false);
  const [retry, setRetry] = useState(0);
  const [locked, setLocked] = useState(false);
  const checkoutLocked = useRef(false);
  const [scanGuard] = useState(createCartScanGuard);
  const updateLock = useCallback((value: boolean) => { if (value && !checkoutLocked.current) scanGuard.invalidate(); checkoutLocked.current = value; setLocked(value); }, [scanGuard]);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `kkisi-cart:${session.userId}:${session.companyId}:${session.register.open?.noref ?? "closed"}`;
  const [cart, setCart] = useState<PreviewCartLine[]>([]);
  const [message, setMessage] = useState("");
  const quantities = Object.fromEntries(cart.map((line) => [line.product.id, line.quantity]));
  const requestKey = query.trim();
  // Key of the request whose result is on screen; the server already supplied the initial (empty query) list.
  const loadedKey = useRef<string | null>(catalogStatus === "ready" ? "" : null);

  useEffect(() => {
    if (loadedKey.current === requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFetching(true);
      if (products.length === 0) setStatus("loading");
      try {
        const params = new URLSearchParams({ q: query.trim() });
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
    // `products.length` and `query` are read only to build this one request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retry]);

  useEffect(() => {
    scanGuard.invalidate();
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(saved) && saved.length <= 80) setCart(saved.filter((line) => line?.product?.companyId === String(session.companyId) && Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.product.priceSen) && Number.isSafeInteger(line.product.discountSen)));
      } catch { /* Storage is optional; the server still validates every checkout. */ }
      setHydrated(true);
    });
    return () => { active = false; scanGuard.invalidate(); };
  }, [storageKey, session.companyId, scanGuard]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Storage may be disabled. */ }
  }, [cart, hydrated, storageKey]);

  function adjust(product: PosProduct, delta: 1 | -1) {
    if (checkoutLocked.current) return;
    setCart((current) => changeQuantity(current, product, delta));
    setMessage(delta === 1 ? `${product.name} ditambahkan ke keranjang.` : `Jumlah ${product.name} dikurangi.`);
  }

  function clearCart() { scanGuard.invalidate(); setCart([]); }

  async function scan() {
    const identifier = query.trim();
    if (!identifier || checkoutLocked.current) return;
    const scanGeneration = scanGuard.capture();
    try {
      let [product] = await fetchProducts(new URLSearchParams({ barcode: identifier }));
      if (!product) {
        const results = await fetchProducts(new URLSearchParams({ q: identifier }));
        const exact = results.find(
          (p) =>
            p.barcode.toLowerCase() === identifier.toLowerCase() ||
            p.code.toLowerCase() === identifier.toLowerCase()
        );
        product = exact ?? (results.length === 1 ? results[0] : undefined);
      }
      if (checkoutLocked.current || !scanGuard.isCurrent(scanGeneration)) return;
      if (!product) { setMessage("Produk tidak ditemukan. Pilih produk dari hasil pencarian."); return; }
      if (!hasPrice(product)) { setMessage(`Harga ${product.name} belum diatur.`); return; }
      if (product.stock <= 0 || (quantities[product.id] ?? 0) >= product.stock) { setMessage(`Stok ${product.name} tidak mencukupi.`); return; }
      adjust(product, 1); setQuery(""); setTab("cart");
    } catch (error) {
      if (!scanGuard.isCurrent(scanGeneration)) return;
      if (error instanceof SessionEnded) { router.replace("/login"); return; }
      setMessage("Barcode belum dapat diperiksa. Coba lagi.");
    }
  }

  return (
    <PosShell branchName={session.branchName} session={session}>
      <PosHeader session={session} locked={locked} />
      <main className="pos-content" id="pos-workspace">
        <div className="pos-preview-notice"><Info size={16} /><span><strong>POS / Kasir</strong> · Harga, stok, dan limit anggota diperiksa kembali saat pembayaran.</span></div>
        <div className="pos-workspace">
          <section className="pos-catalog" aria-label="Produk dan keranjang">
            <ProductSearch query={query} onQuery={setQuery} onScan={scan} disabled={locked} />
            <div className="pos-tab-actions">
              <div className="pos-tabs" role="tablist" aria-label="Tampilan kasir" onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "product" ? 1 : 0;
                setTab(index === 0 ? "product" : "cart"); tabButtons.current[index]?.focus();
              }}>
                <button ref={(element) => { tabButtons.current[0] = element; }} id="pos-product-tab" role="tab" aria-selected={tab === "product"} aria-controls="pos-product-panel" tabIndex={tab === "product" ? 0 : -1} onClick={() => setTab("product")}><LayoutGrid size={17} />Product</button>
                <button ref={(element) => { tabButtons.current[1] = element; }} id="pos-cart-tab" role="tab" aria-selected={tab === "cart"} aria-controls="pos-cart-panel" tabIndex={tab === "cart" ? 0 : -1} onClick={() => setTab("cart")}><ShoppingBag size={17} />Keranjang <span>{cart.reduce((sum, line) => sum + line.quantity, 0)}</span></button>
              </div>
              <ClearCartButton disabled={locked || cart.length === 0} onClear={() => { if (!checkoutLocked.current) clearCart(); }} />
            </div>
            <div className="pos-tabpanel" id="pos-product-panel" role="tabpanel" aria-labelledby="pos-product-tab" tabIndex={0} hidden={tab !== "product"}>
              <div className="pos-catalog-meta"><span>{status === "ready" ? `${products.length} produk${products.length >= CATALOG_PAGE_SIZE ? " pertama · persempit pencarian" : ""}` : ""}</span><span>{query.trim() ? "Hasil pencarian termasuk stok habis" : "Daftar hanya menampilkan produk berstok"}</span></div>
              <div className="pos-catalog-scroll" aria-busy={fetching}><ProductGrid products={products} quantities={quantities} locked={locked} onAdd={(product) => { adjust(product, 1); setTab("cart"); }} status={status} onReset={() => setQuery("")} onRetry={() => setRetry((count) => count + 1)} /></div>
            </div>
            <div className="pos-tabpanel" id="pos-cart-panel" role="tabpanel" aria-labelledby="pos-cart-tab" tabIndex={0} hidden={tab !== "cart"}>
              <CenterCart cart={cart} locked={locked} onChange={adjust} onRemove={(id) => { if (!checkoutLocked.current) setCart((current) => current.filter((line) => line.product.id !== id)); }} />
            </div>
          </section>
          <TransactionPanel key={storageKey} cart={cart} session={session} storageKey={storageKey} onLockChange={updateLock} onClear={() => { clearCart(); loadedKey.current = null; setRetry((count) => count + 1); }} />
        </div>
        <p className="pos-sr-only" role="status">{message}</p>
      </main>
    </PosShell>
  );
}
