import type { NavEntry, NavSection } from '@koperasi/domain/console/navigation';

/** Icon keys are resolved to lucide components by the UI; the registry itself stays serialisable. */
export type ConsoleIcon = 'dashboard' | 'pos' | 'history' | 'returns' | 'products' | 'warehouse' | 'members' | 'savings' | 'loans'
  | 'installments' | 'payroll' | 'distribution' | 'receiving' | 'identity';

export type ConsoleNavEntry = NavEntry & { icon: ConsoleIcon; description?: string };

export const SECTION_LABELS: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  kosipa: 'KOSIPA',
  toko: 'TOKO & POS',
  warehouse: 'Warehouse',
  reports: 'Laporan',
  settings: 'Pengaturan',
};

/**
 * The single navigation registry (spec REQ-011). Sidebar, breadcrumb, dashboard cards and quick links are all derived
 * from it. `planned` entries describe the roadmap and are never rendered as links; KOSIPA and full Warehouse entries
 * become `available` only when their pages, identity links and capability adapters ship (spec P1/P2).
 * /inventory sits under Warehouse but is the existing TOKO subset (global warehouse master + stock opname), not the
 * separate Gudang application.
 */
export const CONSOLE_NAVIGATION: readonly ConsoleNavEntry[] = [
  { id: 'dashboard', section: 'dashboard', label: 'Dashboard', href: '/console', order: 0, anyOf: [], readiness: 'available', icon: 'dashboard' },

  { id: 'kosipa-members', section: 'kosipa', label: 'Keanggotaan', href: '/console/kosipa/anggota', order: 1, anyOf: ['kosipa.member.view'], readiness: 'available', icon: 'members', description: 'Cari anggota dan lihat Anggota 360 (baca saja)' },
  { id: 'kosipa-savings', section: 'kosipa', label: 'Simpanan', href: '/console/kosipa/simpanan', order: 2, anyOf: [], readiness: 'planned', icon: 'savings' },
  { id: 'kosipa-loans', section: 'kosipa', label: 'Pinjaman', href: '/console/kosipa/pinjaman', order: 3, anyOf: ['kosipa.loan.view'], readiness: 'available', icon: 'loans', description: 'Dokumen dan jadwal pinjaman (baca saja)' },
  { id: 'kosipa-installments', section: 'kosipa', label: 'Angsuran', href: '/console/kosipa/angsuran', order: 4, anyOf: [], readiness: 'planned', icon: 'installments' },
  { id: 'kosipa-payroll', section: 'kosipa', label: 'Payroll', href: '/console/kosipa/payroll', order: 5, anyOf: ['kosipa.payroll.view'], readiness: 'available', icon: 'payroll', description: 'Batch potongan bulanan (baca saja)' },

  { id: 'toko-pos', section: 'toko', label: 'POS / Kasir', href: '/pos', order: 1, anyOf: ['toko.pos.checkout'], readiness: 'available', icon: 'pos', description: 'Transaksi penjualan di konter' },
  { id: 'toko-sales', section: 'toko', label: 'Riwayat Transaksi', href: '/sales', order: 2, anyOf: ['toko.sales.view'], readiness: 'available', icon: 'history', excludePrefix: '/sales/returns', description: 'Cari transaksi dan cetak ulang struk' },
  { id: 'toko-returns', section: 'toko', label: 'Retur Penjualan', href: '/sales/returns', order: 3, anyOf: ['toko.returns.view'], readiness: 'available', icon: 'returns', description: 'Daftar dan detail retur cabang' },
  { id: 'toko-products', section: 'toko', label: 'Produk & Inventory', href: '/products', order: 4, anyOf: ['toko.products.view'], readiness: 'available', icon: 'products', description: 'Katalog produk cabang' },

  { id: 'warehouse-inventory', section: 'warehouse', label: 'Warehouse & Stock Opname', href: '/inventory', order: 1, anyOf: ['toko.inventory.view'], readiness: 'available', icon: 'warehouse', description: 'Master gudang dan stock opname cabang' },
  { id: 'warehouse-distribution', section: 'warehouse', label: 'Distribusi Barang', href: '/console/warehouse/distribusi', order: 2, anyOf: [], readiness: 'planned', icon: 'distribution' },
  { id: 'warehouse-receiving', section: 'warehouse', label: 'Penerimaan Barang', href: '/console/warehouse/penerimaan', order: 3, anyOf: [], readiness: 'planned', icon: 'receiving' },

  { id: 'settings-identity', section: 'settings', label: 'Tautan Akun KOSIPA', href: '/console/settings/identitas', order: 1, anyOf: ['iam.link.manage'], readiness: 'available', icon: 'identity', description: 'Tautkan akun console ke akun KOSIPA' },
];

/** Dashboard module cards: which sections form a module and how it is described. */
export const CONSOLE_MODULES: readonly { section: Extract<NavSection, 'toko' | 'kosipa' | 'warehouse'>; title: string; summary: string }[] = [
  { section: 'toko', title: 'TOKO & POS', summary: 'Kasir, riwayat penjualan, retur, dan katalog produk cabang.' },
  { section: 'kosipa', title: 'KOSIPA', summary: 'Keanggotaan, simpanan, pinjaman, angsuran, dan payroll koperasi.' },
  { section: 'warehouse', title: 'Warehouse', summary: 'Master gudang, stock opname, distribusi, dan penerimaan barang.' },
];
