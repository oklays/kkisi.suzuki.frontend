import { Boxes, ChevronDown, FileChartColumn, LayoutGrid, Package, Search, Settings, ShoppingCart, UserRound, Users } from "lucide-react";

const NAV = [
  { icon: ShoppingCart, label: "POS / Kasir", active: true },
  { icon: Package, label: "Produk" },
  { icon: Boxes, label: "Stok" },
  { icon: Users, label: "Member" },
  { icon: FileChartColumn, label: "Laporan" },
  { icon: Settings, label: "Pengaturan" },
];

// Thumbnails reuse the POS product illustrations shipped with the app (no remote images, no data).
const PRODUCTS = ["minuman-illustration-1", "sembako-illustration-2", "rumah-tangga-illustration-3", "makanan-illustration-4"];

/**
 * Decorative desktop monitor showing a static preview of the management console. Not interactive, no API calls:
 * the whole visualization is hidden from assistive technologies by HeroVisualization.
 */
export function ConsolePreview() {
  return (
    <div className="lp-monitor">
      <div className="lp-monitor-frame">
        <div className="lp-cp">
          <aside className="lp-cp-side">
            <div className="lp-cp-brand"><span className="lp-cp-logo">KSM</span><span>Koperasi</span></div>
            <ul>
              {NAV.map(({ icon: Icon, label, active }) => (
                <li key={label} className={active ? "is-active" : undefined}><Icon strokeWidth={2} /><span>{label}</span></li>
              ))}
            </ul>
          </aside>
          <div className="lp-cp-main">
            <div className="lp-cp-top">
              <span className="lp-cp-search"><Search strokeWidth={2.2} />Cari produk, kode, atau nama...</span>
              <span className="lp-cp-user"><span className="lp-cp-avatar"><UserRound strokeWidth={2} /></span>Kasir Toko<ChevronDown strokeWidth={2.2} /></span>
            </div>
            <div className="lp-cp-body">
              <section className="lp-cp-products">
                <p className="lp-cp-heading"><LayoutGrid strokeWidth={2.2} />Daftar Barang</p>
                <div className="lp-cp-grid">
                  {PRODUCTS.map((name) => (
                    <div key={name} className="lp-cp-product">
                      <span className="lp-cp-thumb" style={{ backgroundImage: `url(/illustrations/${name}.svg)` }} />
                      <span className="lp-sk lp-sk-lg" /><span className="lp-sk lp-sk-sm" />
                    </div>
                  ))}
                </div>
              </section>
              <section className="lp-cp-cart">
                <p className="lp-cp-heading">Daftar Transaksi</p>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="lp-cp-row">
                    <span className="lp-cp-row-icon" />
                    <span className="lp-cp-row-lines"><span className="lp-sk lp-sk-lg" /><span className="lp-sk lp-sk-sm" /></span>
                    <span className="lp-cp-row-end"><span className="lp-sk lp-sk-xs" /><span className="lp-sk lp-sk-xs" /></span>
                  </div>
                ))}
                <div className="lp-cp-total"><span>Total</span><strong>Rp 756.000</strong></div>
                <span className="lp-cp-pay">Proses Pembayaran</span>
              </section>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-monitor-neck" />
      <div className="lp-monitor-base" />
    </div>
  );
}
