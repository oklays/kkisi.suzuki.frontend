import Link from "next/link";
import Image from "next/image";
import type { PosSession } from "@/features/pos/types";
import { RegisterControls } from "./RegisterControls";
import { ShellNavLink } from "./ShellNavLink";
import { SessionControls } from "./SessionControls";
import { Barcode, Boxes, ChartColumn, ChevronDown, ClipboardList, LayoutDashboard, ShoppingBag, Store, Undo2, Warehouse } from "lucide-react";

export function PosShell({ children, branchName, session, active = "pos" }: { children: React.ReactNode; branchName: string; session: PosSession; active?: "pos" | "inventory" | "products" | "sales" }) {
  return (
    <div className={active === "sales" ? "pos-shell sales-shell" : "pos-shell"}>
      <a className="pos-skip" href="#pos-workspace">Langsung ke area kerja</a>
      <aside className="pos-sidebar" aria-label="Navigasi aplikasi">
        <Link href="/" className="pos-brand">
          <Image className="pos-brand-image" src="/illustrations/kopkar-landscape-logo.png" width={1671} height={299} sizes="240px" loading="eager" alt="Koperasi Smart Suzuki" />
        </Link>
        <div className="pos-store"><Store size={18} /><div><small>CABANG</small><strong>{branchName}</strong></div><ChevronDown size={15} aria-hidden="true" /></div>
        <nav>
          <p className="pos-nav-label">Menu Utama</p>
          <button disabled><LayoutDashboard size={18} />Dashboard Supervisor</button>
          {session.canCheckout !== false && <Link href="/pos" aria-current={active === "pos" ? "page" : undefined}><ShoppingBag size={18} />POS / Kasir</Link>}
          {session.canSales && <ShellNavLink href="/sales" activePrefix={active === "sales" ? "/sales" : null} excludePrefix="/sales/returns"><ClipboardList size={18} />Riwayat Transaksi</ShellNavLink>}
          {session.canSales && session.canReturns && <ShellNavLink href="/sales/returns" activePrefix={active === "sales" ? "/sales/returns" : null}><Undo2 size={18} />Retur Penjualan</ShellNavLink>}
          {session.canProducts ? <Link href="/products" aria-current={active === "products" ? "page" : undefined}><Boxes size={18} />Produk &amp; Inventory</Link> : <button disabled title="Akun ini belum memiliki izin melihat produk"><Boxes size={18} />Produk &amp; Inventory</button>}
          {session.canInventory ? <Link href="/inventory" aria-current={active === "inventory" ? "page" : undefined}><Warehouse size={18} />Warehouse &amp; Stock Opname</Link> : <button disabled title="Akun ini belum memiliki izin inventory"><Warehouse size={18} />Warehouse &amp; Stock Opname</button>}
          <button disabled><ChartColumn size={18} />Laporan Keuangan</button>
        </nav>
        {active === "sales" ? <div className="pos-barcode-help"><ClipboardList size={23} /><strong>Telusuri transaksi</strong><p>Cari nomor struk atau pelanggan, periksa pembayaran, lalu buka pratinjau cetak ulang.</p></div> : <div className="pos-barcode-help"><Barcode size={23} /><strong>Siap untuk barcode</strong><p>Fokuskan kolom pencarian, lalu scan barcode produk lalu tekan Enter.</p></div>}
      <div className="pos-sidebar-bottom"><div className="pos-sidebar-foot">Koperasi Suzuki Mart<br /><span>POS · Kasir</span>{process.env.APP_VERSION && <span className="pos-version">Versi {process.env.APP_VERSION}</span>}</div><SessionControls session={session} /></div>
      </aside>
      <div className="pos-main">{children}</div>
    </div>
  );
}

export function PosHeader({ session, locked = false, title = "POS / Kasir", subtitle = "Transaksi penjualan langsung di konter", showRegisterControls = true }: { session: PosSession; locked?: boolean; title?: string; subtitle?: string; showRegisterControls?: boolean }) {
  const register = session.register;
  const registerText = register.open
    ? `Sesi ${register.open.noref}${register.open.stale ? " · belum ditutup (hari lalu)" : ""}`
    : "Sesi kasir belum dibuka";
  return (
    <header className="pos-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="pos-header-context">
      <div className="pos-status"><span aria-hidden="true" /><div><strong>{session.branchName}</strong><small>{showRegisterControls ? registerText : "Cabang aktif"}{showRegisterControls && register.multiple ? " · lebih dari satu sesi terbuka" : ""}</small></div></div>
        {showRegisterControls && <RegisterControls session={session} locked={locked} />}
        <div className="pos-user"><span aria-hidden="true">{session.userName.trim().slice(0, 1).toUpperCase() || "K"}</span><div><strong>{session.userName || "Kasir"}</strong><small>Masuk</small></div></div>
      </div>
    </header>
  );
}
