import Link from "next/link";
import type { PosSession } from "@/features/pos/types";
import { RegisterControls } from "./RegisterControls";
import { SessionControls } from "./SessionControls";
import { Barcode, Boxes, ChartColumn, ChevronDown, LayoutDashboard, ShoppingBag, Store, Warehouse } from "lucide-react";

export function PosShell({ children, branchName, session, active = "pos" }: { children: React.ReactNode; branchName: string; session: PosSession; active?: "pos" | "inventory" | "products" }) {
  return (
    <div className="pos-shell">
      <a className="pos-skip" href="#pos-workspace">Langsung ke area kerja</a>
      <aside className="pos-sidebar" aria-label="Navigasi aplikasi">
        <Link href="/" className="pos-brand">
          <span className="pos-brand-mark" aria-hidden="true"><span /></span>
          <span><strong>KOPERASI <em>SUZUKI</em> MART</strong><small>Integrated Cooperative Platform</small></span>
        </Link>
        <div className="pos-store"><Store size={18} /><div><small>CABANG</small><strong>{branchName}</strong></div><ChevronDown size={15} aria-hidden="true" /></div>
        <nav>
          <p className="pos-nav-label">Menu Utama</p>
          <button disabled><LayoutDashboard size={18} />Dashboard Supervisor</button>
          <Link href="/pos" aria-current={active === "pos" ? "page" : undefined}><ShoppingBag size={18} />POS / Kasir</Link>
          {session.canProducts ? <Link href="/products" aria-current={active === "products" ? "page" : undefined}><Boxes size={18} />Produk &amp; Inventory</Link> : <button disabled title="Akun ini belum memiliki izin melihat produk"><Boxes size={18} />Produk &amp; Inventory</button>}
          {session.canInventory ? <Link href="/inventory" aria-current={active === "inventory" ? "page" : undefined}><Warehouse size={18} />Warehouse &amp; Stock Opname</Link> : <button disabled title="Akun ini belum memiliki izin inventory"><Warehouse size={18} />Warehouse &amp; Stock Opname</button>}
          <button disabled><ChartColumn size={18} />Laporan Keuangan</button>
        </nav>
        <div className="pos-barcode-help"><Barcode size={23} /><strong>Siap untuk barcode</strong><p>Fokuskan kolom pencarian, lalu scan barcode produk lalu tekan Enter.</p></div>
        <div className="pos-sidebar-bottom"><div className="pos-sidebar-foot">Koperasi Suzuki Mart<br /><span>POS · Kasir</span></div><SessionControls session={session} /></div>
      </aside>
      <div className="pos-main">{children}</div>
    </div>
  );
}

export function PosHeader({ session, locked = false }: { session: PosSession; locked?: boolean }) {
  const register = session.register;
  const registerText = register.open
    ? `Sesi ${register.open.noref}${register.open.stale ? " · belum ditutup (hari lalu)" : ""}`
    : "Sesi kasir belum dibuka";
  return (
    <header className="pos-header">
      <div><h1>POS / Kasir</h1><p>Transaksi penjualan langsung di konter</p></div>
      <div className="pos-header-context">
        <div className="pos-status"><span aria-hidden="true" /><div><strong>{session.branchName}</strong><small>{registerText}{register.multiple ? " · lebih dari satu sesi terbuka" : ""}</small></div></div>
        <RegisterControls session={session} locked={locked} />
        <div className="pos-user"><span aria-hidden="true">{session.userName.trim().slice(0, 1).toUpperCase() || "K"}</span><div><strong>{session.userName || "Kasir"}</strong><small>Masuk</small></div></div>
      </div>
    </header>
  );
}
