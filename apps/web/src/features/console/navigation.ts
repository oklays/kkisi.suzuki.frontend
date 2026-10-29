import type { NavEntry, NavSection } from '@koperasi/domain/console/navigation';

/** Icon keys are resolved to lucide components by the UI; the registry itself stays serialisable. */
export type ConsoleIcon =
  // module (section) parents
  | 'dashboard' | 'kosipa' | 'toko' | 'warehouse' | 'reports' | 'settings'
  // KOSIPA
  | 'overview' | 'members' | 'savings' | 'voluntary' | 'loans' | 'installments' | 'payroll' | 'reportMembers' | 'reportSavings' | 'reportLoans' | 'reportPayroll' | 'quality'
  // TOKO & POS
  | 'pos' | 'history' | 'returns' | 'products'
  // Warehouse and administration
  | 'stockOpname' | 'preview' | 'distribution' | 'mapping' | 'receiving' | 'identity'
  // sidebar footer actions that are not registry routes
  | 'help';

export type ConsoleNavEntry = NavEntry & { icon: ConsoleIcon; description?: string };

export const SECTION_LABELS: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  kosipa: 'KOSIPA',
  toko: 'TOKO & POS',
  warehouse: 'Warehouse',
  reports: 'Laporan',
  settings: 'Pengaturan',
};

/** The icon of each module parent in the sidebar (the section itself is not a route). */
export const SECTION_ICONS: Record<NavSection, ConsoleIcon> = {
  dashboard: 'dashboard', kosipa: 'kosipa', toko: 'toko', warehouse: 'warehouse', reports: 'reports', settings: 'settings',
};

/** Any read-only KOSIPA capability: enough to open the KOSIPA overview and the report index (each destination still checks its own capability). */
const KOSIPA_VIEW = ['kosipa.member.view', 'kosipa.savings.view', 'kosipa.loan.view', 'kosipa.payroll.view'] as const;

/**
 * The single navigation registry (spec REQ-011). Sidebar, breadcrumb, dashboard cards and quick links are all derived
 * from it. KOSIPA "Laporan" has nested report entries (`parent`). `planned` entries describe the roadmap and are never rendered as links; KOSIPA and full Warehouse entries
 * become `available` only when their pages, identity links and capability adapters ship (spec P1/P2).
 * /inventory sits under Warehouse but is the existing TOKO subset (global warehouse master + stock opname), not the
 * separate Gudang application.
 */
export const CONSOLE_NAVIGATION: readonly ConsoleNavEntry[] = [
  { id: 'dashboard', section: 'dashboard', label: 'Dashboard', href: '/console', order: 0, anyOf: [], readiness: 'available', icon: 'dashboard' },

  { id: 'kosipa-overview', section: 'kosipa', label: 'Ringkasan KOSIPA', href: '/console/kosipa', order: 0, anyOf: KOSIPA_VIEW, readiness: 'available', icon: 'overview', description: 'Pintu masuk modul KOSIPA: menu yang diizinkan, status, dan batasan data' },
  { id: 'kosipa-members', section: 'kosipa', label: 'Keanggotaan', href: '/console/kosipa/anggota', order: 1, anyOf: ['kosipa.member.view'], readiness: 'available', icon: 'members', description: 'Cari anggota dan lihat Anggota 360 (baca saja)' },
  { id: 'kosipa-savings', section: 'kosipa', label: 'Simpanan', href: '/console/kosipa/simpanan', order: 2, anyOf: ['kosipa.savings.view'], readiness: 'available', icon: 'savings', description: 'Buku simpanan per anggota (baca saja)' },
  { id: 'kosipa-loans', section: 'kosipa', label: 'Pinjaman', href: '/console/kosipa/pinjaman', order: 3, anyOf: ['kosipa.loan.view'], readiness: 'available', icon: 'loans', description: 'Dokumen dan jadwal pinjaman (baca saja)' },
  { id: 'kosipa-installments', section: 'kosipa', label: 'Angsuran', href: '/console/kosipa/angsuran', order: 4, anyOf: [], readiness: 'planned', icon: 'installments' },
  { id: 'kosipa-payroll', section: 'kosipa', label: 'Payroll', href: '/console/kosipa/payroll', order: 5, anyOf: ['kosipa.payroll.view'], readiness: 'available', icon: 'payroll', description: 'Batch potongan bulanan, rekonsiliasi kredit TOKO untuk ditinjau (baca saja)' },
  { id: 'kosipa-reports', section: 'kosipa', label: 'Laporan', href: '/console/kosipa/laporan', order: 6, anyOf: KOSIPA_VIEW, readiness: 'available', icon: 'reports', description: 'Laporan pinjaman, payroll, keanggotaan, simpanan dan kualitas data (baca saja)' },
  { id: 'kosipa-report-members', section: 'kosipa', parent: 'kosipa-reports', label: 'Keanggotaan', href: '/console/kosipa/laporan/keanggotaan', order: 7, anyOf: ['kosipa.member.view'], readiness: 'available', icon: 'reportMembers' },
  { id: 'kosipa-report-savings', section: 'kosipa', parent: 'kosipa-reports', label: 'Mutasi simpanan', href: '/console/kosipa/laporan/simpanan', order: 8, anyOf: ['kosipa.savings.view'], readiness: 'available', icon: 'reportSavings' },
  { id: 'kosipa-report-loans', section: 'kosipa', parent: 'kosipa-reports', label: 'Pinjaman', href: '/console/kosipa/laporan/pinjaman', order: 9, anyOf: ['kosipa.loan.view'], readiness: 'available', icon: 'reportLoans' },
  { id: 'kosipa-report-payroll', section: 'kosipa', parent: 'kosipa-reports', label: 'Payroll', href: '/console/kosipa/laporan/payroll', order: 10, anyOf: ['kosipa.payroll.view'], readiness: 'available', icon: 'reportPayroll' },
  { id: 'kosipa-report-quality', section: 'kosipa', parent: 'kosipa-reports', label: 'Kualitas data', href: '/console/kosipa/laporan/kualitas-data', order: 11, anyOf: ['kosipa.loan.view', 'kosipa.payroll.view'], readiness: 'available', icon: 'quality' },
  { id: 'kosipa-public-savings', section: 'kosipa', label: 'Pengajuan sukarela', href: '/console/kosipa/simpanan-sukarela', order: 12, anyOf: ['kosipa.savings.view'], readiness: 'available', icon: 'voluntary', description: 'Tautan pengajuan potongan Simpanan Sukarela dan bukti PDF; pemrosesan tetap di KOSIPA CI2' },

  { id: 'toko-pos', section: 'toko', label: 'POS / Kasir', href: '/pos', order: 1, anyOf: ['toko.pos.checkout'], readiness: 'available', icon: 'pos', description: 'Transaksi penjualan di konter' },
  { id: 'toko-sales', section: 'toko', label: 'Riwayat Transaksi', href: '/sales', order: 2, anyOf: ['toko.sales.view'], readiness: 'available', icon: 'history', excludePrefix: '/sales/returns', description: 'Cari transaksi dan cetak ulang struk' },
  { id: 'toko-returns', section: 'toko', label: 'Retur Penjualan', href: '/sales/returns', order: 3, anyOf: ['toko.returns.view'], readiness: 'available', icon: 'returns', description: 'Daftar dan detail retur cabang' },
  { id: 'toko-products', section: 'toko', label: 'Produk & Inventory', href: '/products', order: 4, anyOf: ['toko.products.view'], readiness: 'available', icon: 'products', description: 'Katalog produk cabang' },

  { id: 'warehouse-inventory', section: 'warehouse', label: 'Warehouse & Stock Opname', href: '/inventory', order: 1, anyOf: ['toko.inventory.view'], readiness: 'available', icon: 'stockOpname', description: 'Master gudang dan stock opname cabang' },
  { id: 'warehouse-preview', section: 'warehouse', label: 'Pratinjau Warehouse (sintetis)', href: '/console/warehouse', order: 2, anyOf: ['warehouse.preview.view'], readiness: 'available', icon: 'preview', description: 'Pratinjau data SINTETIS; tidak terhubung ke Gudang atau stok TOKO' },
  { id: 'warehouse-distribution', section: 'warehouse', label: 'Distribusi Barang', href: '/console/warehouse/distribusi', order: 3, anyOf: ['warehouse.preview.view'], readiness: 'available', icon: 'distribution', description: 'Dokumen distribusi (pratinjau sintetis, baca saja)' },
  { id: 'warehouse-mapping', section: 'warehouse', label: 'Pemetaan Barang', href: '/console/warehouse/pemetaan', order: 4, anyOf: ['warehouse.preview.view'], readiness: 'available', icon: 'mapping', description: 'Pemetaan barang Gudang ke TOKO (pratinjau sintetis, baca saja)' },
  { id: 'warehouse-receiving', section: 'warehouse', label: 'Penerimaan & Selisih', href: '/console/warehouse/penerimaan', order: 5, anyOf: ['warehouse.preview.view'], readiness: 'available', icon: 'receiving', description: 'Penerimaan dan rekonsiliasi (pratinjau sintetis, baca saja)' },

  { id: 'settings-identity', section: 'settings', label: 'Tautan Akun KOSIPA', href: '/console/settings/identitas', order: 1, anyOf: ['iam.link.manage'], readiness: 'available', icon: 'identity', description: 'Tautkan akun console ke akun KOSIPA' },
];

/** Registry minus entries whose deployment flag is off. The flag is read by the caller (server side); every page still enforces its own gate. */
export function deployedNavigation(publicSavingsConsole: boolean): readonly ConsoleNavEntry[] {
  return publicSavingsConsole ? CONSOLE_NAVIGATION : CONSOLE_NAVIGATION.filter((e) => e.id !== 'kosipa-public-savings');
}

/** Dashboard module cards: which sections form a module and how it is described. */
export const CONSOLE_MODULES: readonly { section: Extract<NavSection, 'toko' | 'kosipa' | 'warehouse'>; title: string; summary: string }[] = [
  { section: 'toko', title: 'TOKO & POS', summary: 'Kasir, riwayat penjualan, retur, dan katalog produk cabang.' },
  { section: 'kosipa', title: 'KOSIPA', summary: 'Keanggotaan, simpanan, pinjaman, angsuran, dan payroll koperasi.' },
  { section: 'warehouse', title: 'Warehouse', summary: 'Master gudang, stock opname, distribusi, dan penerimaan barang.' },
];
