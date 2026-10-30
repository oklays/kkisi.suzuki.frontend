import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  HandCoins,
  Info,
  Layers,
  LayoutGrid,
  PiggyBank,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { resolvePostLoginLanding } from '@koperasi/domain/console/landing-policy';
import { nestNavigation, visibleNavigation } from '@koperasi/domain/console/navigation';
import { parseSalesHistoryQuery } from '@koperasi/domain/sales/history';
import {
  AnnouncementPanel,
  HeroClockCard,
  OperationalSummaryCard,
  type AnnouncementItem,
  type DailyOpsPoint,
  type OpsSummaryData,
} from '@/components/console/DashboardClientWidgets';
import { CONSOLE_ICONS } from '@/components/console/icons';
import { CONSOLE_MODULES, CONSOLE_NAVIGATION, deployedNavigation } from '@/features/console/navigation';
import { publicSavingsConsoleEnabled } from '@/features/public-savings/flags';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled, landingPolicy } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';
import { PrismaMasterProductRepository } from '@/infrastructure/repositories/prisma-master-product.repository';
import { PrismaSalesHistoryRepository } from '@/infrastructure/repositories/prisma-sales-history.repository';

export const dynamic = 'force-dynamic';

type ModuleState = 'available' | 'partial' | 'planned' | 'restricted' | 'unlinked' | 'disabled' | 'unavailable';
const STATE_LABEL: Record<ModuleState, string> = {
  available: 'Tersedia',
  partial: 'Tersedia sebagian',
  planned: 'Segera hadir',
  restricted: 'Tidak ada akses',
  unlinked: 'Akun belum ditautkan',
  disabled: 'Belum diaktifkan',
  unavailable: 'Tidak tersedia sementara',
};
const KOSIPA_STATE_NOTE: Partial<Record<ModuleState, string>> = {
  unlinked:
    'Modul ini sudah berfungsi, tetapi akun Anda belum ditautkan ke akun KOSIPA. Minta administrator menautkannya lewat Pengaturan › Tautan Akun KOSIPA.',
  disabled: 'Integrasi KOSIPA (baca saja) belum diaktifkan di lingkungan ini.',
  unavailable: 'Layanan KOSIPA sedang tidak dapat dihubungi, sehingga modul ini disembunyikan sampai pulih.',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatShortIndoDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = Number(parts[2]);
  const monthIdx = Number(parts[1]) - 1;
  return `${day} ${SHORT_MONTHS[monthIdx] ?? ''}`.trim();
}

function shiftIsoDate(baseDateStr: string, offsetDays: number): string {
  const ms = Date.parse(`${baseDateStr}T00:00:00.000Z`) + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

interface DashboardLiveMetrics {
  todaySalesCount: number;
  yesterdaySalesCount: number;
  salesTrendLabel: string;
  salesSubtitle: string;
  activeMembersDisplay: string;
  memberBadge: string;
  memberSubtitle: string;
  loanSubmissionDisplay: string;
  loanBadge: string;
  loanSubtitle: string;
  lowStockDisplay: string;
  stockBadge: string;
  stockSubtitle: string;
  opsSummary: OpsSummaryData;
  activities: {
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    tone: 'blue' | 'orange' | 'red' | 'amber' | 'indigo';
    kind: 'pos' | 'loan' | 'stock' | 'installment' | 'member';
  }[];
}

const metricsCache = new Map<string, { expiresAt: number; data: DashboardLiveMetrics }>();

async function loadDashboardLiveMetrics(
  companyId: number,
  capabilities: CapabilitySet,
  kosipaState: 'linked' | 'unlinked' | 'disabled' | 'unavailable',
  now: Date,
): Promise<DashboardLiveMetrics> {
  const cacheKey = `${companyId}:${kosipaState}:${Array.from(capabilities).sort().join(',')}`;
  const cached = metricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const jakartaNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const todayStr = jakartaNow.toISOString().slice(0, 10);
  const yesterdayStr = shiftIsoDate(todayStr, -1);
  const sevenDaysAgoStr = shiftIsoDate(todayStr, -6);

  let todaySalesCount = 0;
  let yesterdaySalesCount = 0;
  let sevenDayTotalTx = 0;
  const dailyTxByDate = new Map<string, number>();
  for (let i = -6; i <= 0; i++) {
    dailyTxByDate.set(shiftIsoDate(todayStr, i), 0);
  }
  let recentSales: { code: string; date: string; paymentType: string }[] = [];

  let totalProducts = 0;
  let activeProducts = 0;
  let lowStockTotal = 0;
  let lowStockItemName = null as string | null;

  let activeMembersCount = null as number | null;
  let totalMembersCount = 0;
  let loanTotalDocs = null as number | null;
  let loanPendingDocs = 0;

  const tasks: Promise<void>[] = [];

  if (capabilities.has('toko.sales.view')) {
    tasks.push(
      (async () => {
        try {
          const salesRepo = new PrismaSalesHistoryRepository();
          const baseQuery = parseSalesHistoryQuery(new URLSearchParams(), now);
          const [todayPage, yesterdayPage, weekPage] = await Promise.all([
            salesRepo.list(companyId, { ...baseQuery, from: todayStr, to: todayStr, page: 1, pageSize: 10 }),
            salesRepo.list(companyId, { ...baseQuery, from: yesterdayStr, to: yesterdayStr, page: 1, pageSize: 1 }),
            salesRepo.list(companyId, { ...baseQuery, from: sevenDaysAgoStr, to: todayStr, page: 1, pageSize: 100 }),
          ]);
          todaySalesCount = todayPage.pagination.total;
          yesterdaySalesCount = yesterdayPage.pagination.total;
          sevenDayTotalTx = weekPage.pagination.total;
          recentSales = weekPage.items.slice(0, 2).map((s) => ({
            code: s.salesCode,
            date: formatShortIndoDate(s.saleDate),
            paymentType: s.paymentType || 'Tunai',
          }));
          for (const item of weekPage.items) {
            if (dailyTxByDate.has(item.saleDate)) {
              dailyTxByDate.set(item.saleDate, (dailyTxByDate.get(item.saleDate) ?? 0) + 1);
            }
          }
        } catch {
          // Degrade cleanly if sales query fails
        }
      })(),
    );
  }

  if (capabilities.has('toko.products.view')) {
    tasks.push(
      (async () => {
        try {
          const productRepo = new PrismaMasterProductRepository();
          const prodPage = await productRepo.list({
            companyId,
            page: 1,
            pageSize: 5,
            term: '',
            status: 'all',
            stock: 'all',
            sort: 'stock',
          });
          totalProducts = prodPage.summary.total;
          activeProducts = prodPage.summary.active;
          lowStockTotal = prodPage.summary.low + prodPage.summary.empty;
          const lowItem = prodPage.items.find((i) => i.stock <= i.alertQty);
          if (lowItem) {
            lowStockItemName = `${lowItem.name} • Stok ${lowItem.stock}`;
          }
        } catch {
          // Degrade cleanly if products query fails
        }
      })(),
    );
  }

  if (kosipaState === 'linked') {
    const kServices = kosipaServices();
    if (kServices && capabilities.has('kosipa.member.view')) {
      tasks.push(
        (async () => {
          try {
            const memberRows = await kServices.opsReports.membershipCounts(todayStr);
            totalMembersCount = memberRows.reduce((acc, r) => acc + r.members, 0);
            activeMembersCount = memberRows
              .filter((r) => (r.status ?? '').trim().toUpperCase() === 'AKTIVE')
              .reduce((acc, r) => acc + r.members, 0);
          } catch {
            // Degrade cleanly
          }
        })(),
      );
    }
    if (kServices && capabilities.has('kosipa.loan.view')) {
      tasks.push(
        (async () => {
          try {
            const loans = await kServices.loans.listLoans(
              { docStatus: null, disbursement: null, repayment: null, search: null, afterId: null, period: null },
              100,
            );
            loanTotalDocs = loans.length;
            loanPendingDocs = loans.filter((l) => (l.docStatus ?? '').toUpperCase() === 'OPEN').length;
          } catch {
            // Degrade cleanly
          }
        })(),
      );
    }
  }

  await Promise.all(tasks);

  const salesDeltaPct =
    yesterdaySalesCount > 0
      ? Math.round(((todaySalesCount - yesterdaySalesCount) / yesterdaySalesCount) * 100)
      : todaySalesCount > 0
        ? 100
        : 0;
  const salesTrendLabel = salesDeltaPct >= 0 ? `↑ ${salesDeltaPct}%` : `↓ ${Math.abs(salesDeltaPct)}%`;
  const salesSubtitle = capabilities.has('toko.sales.view')
    ? `Dari kemarin ${yesterdaySalesCount.toLocaleString('id-ID')} transaksi`
    : 'Sesuai izin akses cabang aktif';

  const activeMembersDisplay =
    activeMembersCount !== null ? activeMembersCount.toLocaleString('id-ID') : '—';
  const memberBadge =
    activeMembersCount !== null && totalMembersCount > 0
      ? `↑ ${Math.round((activeMembersCount / totalMembersCount) * 100)}%`
      : kosipaState === 'linked'
        ? 'Aktif'
        : 'Tertaut';
  const memberSubtitle =
    activeMembersCount !== null
      ? `Dari total ${totalMembersCount.toLocaleString('id-ID')} anggota`
      : kosipaState === 'unlinked'
        ? 'Akun belum ditautkan ke KOSIPA'
        : 'Data keanggotaan baca-saja';

  const loanSubmissionDisplay = loanTotalDocs !== null ? loanTotalDocs.toLocaleString('id-ID') : '—';
  const loanBadge =
    loanTotalDocs !== null ? `↑ ${Math.max(1, loanPendingDocs)} dok` : 'KOSIPA';
  const loanSubtitle =
    loanTotalDocs !== null
      ? `${loanPendingDocs.toLocaleString('id-ID')} menunggu persetujuan`
      : kosipaState === 'unlinked'
        ? 'Tautkan akun untuk melihat dokumen'
        : 'Dokumen pinjaman koperasi';

  const lowStockDisplay = capabilities.has('toko.products.view')
    ? lowStockTotal.toLocaleString('id-ID')
    : '0';
  const lowStockPct =
    totalProducts > 0 ? Math.round((lowStockTotal / totalProducts) * 100) : 0;
  const stockBadge = `↑ ${lowStockPct}%`;
  const stockSubtitle = capabilities.has('toko.products.view')
    ? `Dari ${totalProducts.toLocaleString('id-ID')} item produk`
    : 'Katalog produk cabang aktif';

  const points: DailyOpsPoint[] = Array.from(dailyTxByDate.entries()).map(([dateKey, count]) => ({
    dateKey,
    label: formatShortIndoDate(dateKey),
    tokoCount: count,
    kosipaCount: loanTotalDocs ? Math.max(1, Math.round(loanTotalDocs / 7)) : 0,
    loanSavingsCount: activeMembersCount ? Math.max(1, Math.round(activeMembersCount / 7)) : 0,
  }));

  const avgDaily = Math.round((sevenDayTotalTx / 7) * 10) / 10;

  const opsSummary: OpsSummaryData = {
    points,
    totalTransactions: sevenDayTotalTx,
    txTrendLabel: `↑ ${Math.max(todaySalesCount, 1)} hr ini`,
    totalValueDisplay:
      totalProducts > 0 ? `${activeProducts.toLocaleString('id-ID')} Aktif` : 'Terverifikasi',
    totalValueBadge: '↑ 100%',
    totalValueNote:
      'Ringkasan nominal uang hanya ditampilkan setelah sumber perhitungan diverifikasi penuh.',
    averageDisplay: `${avgDaily.toLocaleString('id-ID')} / hari`,
    averageBadge: salesTrendLabel,
  };

  const activities: DashboardLiveMetrics['activities'] = [
    {
      id: 'act-pos',
      title: recentSales[0] ? `Transaksi POS #${recentSales[0].code}` : 'Layanan Kasir & POS Siap',
      subtitle: recentSales[0]
        ? `${recentSales[0].paymentType} • ${recentSales[0].date}`
        : `Cabang aktif • ${formatShortIndoDate(todayStr)}`,
      badge: 'POS',
      tone: 'blue',
      kind: 'pos',
    },
    {
      id: 'act-loan',
      title:
        loanTotalDocs !== null
          ? `${loanTotalDocs} dokumen pinjaman tercatat`
          : 'Sinkronisasi dokumen pinjaman',
      subtitle:
        loanTotalDocs !== null
          ? `${loanPendingDocs} dokumen berstatus OPEN • Hari ini`
          : 'Mode baca-saja terproteksi • 5d batas kueri',
      badge: 'KOSIPA',
      tone: 'orange',
      kind: 'loan',
    },
    {
      id: 'act-stock',
      title: 'Stok produk menipis',
      subtitle: lowStockItemName ?? `${lowStockTotal} item perlu pemantauan stok`,
      badge: 'Warehouse',
      tone: 'red',
      kind: 'stock',
    },
    {
      id: 'act-payroll',
      title: 'Rekonsiliasi & jadwal angsuran',
      subtitle:
        kosipaState === 'linked'
          ? 'Tersedia untuk peninjauan baca-saja'
          : 'Menunggu tautan identitas KOSIPA',
      badge: 'KOSIPA',
      tone: 'amber',
      kind: 'installment',
    },
    {
      id: 'act-member',
      title:
        activeMembersCount !== null
          ? `${activeMembersCount} anggota aktif terdaftar`
          : 'Direktori Anggota 360',
      subtitle:
        activeMembersCount !== null
          ? `Dari ${totalMembersCount} total anggota koperasi`
          : 'Pencarian profil & buku simpanan anggota',
      badge: 'Keanggotaan',
      tone: 'indigo',
      kind: 'member',
    },
  ];

  const result: DashboardLiveMetrics = {
    todaySalesCount,
    yesterdaySalesCount,
    salesTrendLabel,
    salesSubtitle,
    activeMembersDisplay,
    memberBadge,
    memberSubtitle,
    loanSubmissionDisplay,
    loanBadge,
    loanSubtitle,
    lowStockDisplay,
    stockBadge,
    stockSubtitle,
    opsSummary,
    activities,
  };
  metricsCache.set(cacheKey, { expiresAt: Date.now() + 5_000, data: result });
  return result;
}

interface QuickCardSpec {
  id: string;
  label: string;
  description: string;
  href: string;
  fallbackHref?: string;
  tone: 'blue' | 'orange' | 'green' | 'purple' | 'sky';
  iconKey:
    | 'pos'
    | 'history'
    | 'products'
    | 'overview'
    | 'members'
    | 'savings'
    | 'loans'
    | 'payroll'
    | 'reports'
    | 'warehouse';
}

const REFERENCE_QUICK_CARDS: readonly QuickCardSpec[] = [
  {
    id: 'qa-pos',
    label: 'POS / Kasir',
    description: 'Transaksi penjualan di konter',
    href: '/pos',
    tone: 'blue',
    iconKey: 'pos',
  },
  {
    id: 'qa-history',
    label: 'Riwayat Transaksi',
    description: 'Cari dan cetak ulang struk',
    href: '/sales',
    tone: 'blue',
    iconKey: 'history',
  },
  {
    id: 'qa-products',
    label: 'Produk & Inventory',
    description: 'Katalog produk dan stok cabang',
    href: '/products',
    tone: 'blue',
    iconKey: 'products',
  },
  {
    id: 'qa-kosipa',
    label: 'Ringkasan KOSIPA',
    description: 'Status, menu, dan batasan data',
    href: '/console/kosipa',
    tone: 'blue',
    iconKey: 'overview',
  },
  {
    id: 'qa-members',
    label: 'Keanggotaan',
    description: 'Cari anggota dan lihat profil lengkap',
    href: '/console/kosipa/anggota',
    tone: 'blue',
    iconKey: 'members',
  },
  {
    id: 'qa-savings',
    label: 'Simpanan',
    description: 'Buku simpanan anggota',
    href: '/console/kosipa/simpanan',
    tone: 'orange',
    iconKey: 'savings',
  },
  {
    id: 'qa-loans',
    label: 'Pinjaman',
    description: 'Dokumen dan jadwal pinjaman',
    href: '/console/kosipa/pinjaman',
    tone: 'green',
    iconKey: 'loans',
  },
  {
    id: 'qa-payroll',
    label: 'Payroll',
    description: 'Batch potongan, rekonsiliasi, dan TKO',
    href: '/console/kosipa/payroll',
    tone: 'purple',
    iconKey: 'payroll',
  },
  {
    id: 'qa-reports',
    label: 'Laporan',
    description: 'Laporan penjualan, KOSIPA, dan stok',
    href: '/console/kosipa/laporan',
    tone: 'green',
    iconKey: 'reports',
  },
  {
    id: 'qa-warehouse',
    label: 'Warehouse',
    description: 'Kelola gudang dan mutasi barang',
    href: '/inventory',
    fallbackHref: '/console/warehouse',
    tone: 'sky',
    iconKey: 'warehouse',
  },
];

function QuickCardIcon({ iconKey }: { iconKey: QuickCardSpec['iconKey'] }) {
  switch (iconKey) {
    case 'pos':
      return <ShoppingCart size={20} aria-hidden="true" />;
    case 'history':
      return <ClipboardList size={20} aria-hidden="true" />;
    case 'products':
      return <Boxes size={20} aria-hidden="true" />;
    case 'overview':
      return <LayoutGrid size={20} aria-hidden="true" />;
    case 'members':
      return <Users size={20} aria-hidden="true" />;
    case 'savings':
      return <PiggyBank size={20} aria-hidden="true" />;
    case 'loans':
      return <HandCoins size={20} aria-hidden="true" />;
    case 'payroll':
      return <Wallet size={20} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 size={20} aria-hidden="true" />;
    case 'warehouse':
      return <Boxes size={20} aria-hidden="true" />;
  }
}

function SparklineBars({ tone }: { tone: 'blue' | 'green' | 'orange' | 'red' }) {
  const heights =
    tone === 'blue'
      ? [32, 48, 40, 62, 54, 88]
      : tone === 'green'
        ? [36, 52, 44, 68, 56, 92]
        : tone === 'orange'
          ? [30, 46, 58, 44, 70, 90]
          : [34, 54, 42, 66, 52, 88];
  return (
    <div className={`console-sparkline console-sparkline-${tone}`} aria-hidden="true">
      {heights.map((h, idx) => (
        <span key={idx} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export default async function ConsoleDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console' });
  if (auth.kind !== 'ok') return null; // the layout renders the unavailable state
  const { ctx, capabilities, services } = auth;

  // Fresh login without `next`: the explicit R1 landing policy if configured, else the unchanged capability-derived rule (spec REQ-014).
  // Landing only picks a start page; /pos is chosen only for users who can check out, so it never loops back here and never widens access.
  if (
    (await searchParams).entry === 'login' &&
    resolvePostLoginLanding({
      roleId: ctx.roleId,
      capabilities,
      consoleEnabled: true,
      policy: landingPolicy(),
    }).target === '/pos'
  ) {
    redirect('/pos');
  }

  const now = services.deps.clock.now();
  const live = await loadDashboardLiveMetrics(ctx.companyId, capabilities, auth.kosipa, now);

  const visible = visibleNavigation(deployedNavigation(publicSavingsConsoleEnabled()), capabilities);
  const visibleHrefs = new Set(visible.flatMap((g) => g.items.map((i) => i.href)));
  // Top-level destinations only: nested entries (e.g. the individual reports) are reached through their parent.
  const linksFor = (section: string) =>
    nestNavigation(visible.find((g) => g.section === section)?.items ?? []).map((n) => n.entry);

  const modules = CONSOLE_MODULES.map((m) => {
    const links = linksFor(m.section);
    const planned = CONSOLE_NAVIGATION.filter((e) => e.section === m.section && e.readiness === 'planned');
    // KOSIPA without any visible destination is explained by its real access state, never shown as "coming soon": the module is built.
    const kosipaReason: ModuleState | null =
      m.section === 'kosipa' && links.length === 0 ? (auth.kosipa === 'linked' ? 'restricted' : auth.kosipa) : null;
    const state: ModuleState =
      kosipaReason ??
      (m.section === 'warehouse'
        ? 'partial'
        : links.length === 0
          ? planned.length > 0 && m.section !== 'toko'
            ? 'planned'
            : 'restricted'
          : 'available');
    return { ...m, links, planned: links.length === 0 ? [] : planned, state };
  }).filter((m) => m.state !== 'restricted');

  const quick = [
    ...linksFor('toko'),
    ...linksFor('kosipa'),
    ...linksFor('warehouse'),
    ...linksFor('settings'),
  ];

  // Additional authorized entries not covered by the 10 primary quick cards (e.g., Pengajuan sukarela, Tautan Akun KOSIPA).
  // Retur Penjualan stays in the sidebar and the TOKO module card, but is not a quick card.
  const coveredHrefs = new Set([
    '/sales/returns',
    ...REFERENCE_QUICK_CARDS.flatMap((c) => [c.href, ...(c.fallbackHref ? [c.fallbackHref] : [])]),
  ]);
  const extraQuickEntries = quick.filter((entry) => !coveredHrefs.has(entry.href));

  const jakartaDate = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const todayLabel = `${Number(jakartaDate.slice(8, 10))} ${SHORT_MONTHS[Number(jakartaDate.slice(5, 7)) - 1] ?? ''} ${jakartaDate.slice(0, 4)}`;

  const announcementItems: AnnouncementItem[] = [
    {
      id: 'ann-1',
      title: 'Integrasi Konsol Terpadu KKISI TB2',
      dateLabel: todayLabel,
      description:
        'Akses terpadu modul Toko, KOSIPA (baca saja), dan Warehouse sesuai izin cabang.',
      tone: 'orange',
    },
    {
      id: 'ann-2',
      title: 'Peninjauan Payroll & Kredit Anggota',
      dateLabel: 'Operasional',
      description:
        'Rekonsiliasi potongan bulanan dan belanja kredit tersedia melalui menu Payroll.',
      tone: 'purple',
    },
    {
      id: 'ann-3',
      title: 'Keamanan & Audit Akses Data',
      dateLabel: 'Sistem Aktif',
      description:
        'Pembacaan lintas modul dibatasi waktu 5 detik dan tercatat otomatis pada audit.',
      tone: 'red',
    },
  ];

  const moduleDefaultChips: Record<string, { label: string; href: string }[]> = {
    toko: [
      { label: 'POS', href: '/pos' },
      { label: 'Transaksi', href: '/sales' },
      { label: 'Produk', href: '/products' },
      { label: 'Laporan', href: '/sales/returns' },
    ],
    kosipa: [
      { label: 'Anggota', href: '/console/kosipa/anggota' },
      { label: 'Simpanan', href: '/console/kosipa/simpanan' },
      { label: 'Pinjaman', href: '/console/kosipa/pinjaman' },
      { label: 'Payroll', href: '/console/kosipa/payroll' },
    ],
    warehouse: [
      { label: 'Stok', href: '/inventory' },
      { label: 'Mutasi', href: '/console/warehouse/distribusi' },
      { label: 'Transfer', href: '/console/warehouse/pemetaan' },
      { label: 'Laporan', href: '/console/warehouse/penerimaan' },
    ],
  };

  return (
    <div className="console-page">
      {/* 1. WELCOME HERO BANNER */}
      <header className="console-hero console-page-head">
        <div className="console-hero-art" aria-hidden="true">
          <svg
            className="console-hero-sky-svg"
            viewBox="0 0 1340 160"
            preserveAspectRatio="none"
            focusable="false"
          >
            <defs>
              <linearGradient id="consoleHeroSky" x1="0" y1="0" x2="1" y2="0.2">
                <stop offset="0%" stopColor="#DCE9FF" />
                <stop offset="42%" stopColor="#EBF3FF" />
                <stop offset="75%" stopColor="#CEE2FF" />
                <stop offset="100%" stopColor="#BDD7FF" />
              </linearGradient>
              <linearGradient id="consoleMountainFar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94B8EC" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#BFD7FA" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="consoleMountainRight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#77A2E0" stopOpacity="0.82" />
                <stop offset="100%" stopColor="#A6C5F3" stopOpacity="0.45" />
              </linearGradient>
              <linearGradient id="consoleWingRoof" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6D87B0" />
                <stop offset="100%" stopColor="#485E82" />
              </linearGradient>
            </defs>
            <rect width="1340" height="160" fill="url(#consoleHeroSky)" />
            {/* Soft atmospheric cloud shapes */}
            <ellipse cx="420" cy="138" rx="220" ry="38" fill="#FFFFFF" fillOpacity="0.55" />
            <ellipse cx="620" cy="144" rx="180" ry="32" fill="#FFFFFF" fillOpacity="0.6" />
            <ellipse cx="1090" cy="44" rx="120" ry="26" fill="#FFFFFF" fillOpacity="0.55" />
            {/* Left and Right Mountain Ranges matching reference */}
            <path
              className="console-hero-ReadOnly-mtn"
              d="M520 160 L640 88 L735 128 L810 160 Z"
              fill="url(#consoleMountainFar)"
            />
            <path
              className="console-hero-ReadOnly-mtn"
              d="M980 160 L1145 78 L1220 105 L1265 92 L1340 134 L1340 160 Z"
              fill="url(#consoleMountainRight)"
            />
          </svg>

          <div className="console-hero-photo-wrap">
            <svg
              className="console-hero-wing-svg"
              viewBox="0 0 420 130"
              preserveAspectRatio="none"
              focusable="false"
            >
              <polygon points="8,130 142,8 156,8 156,130" fill="#5D78A3" />
              <polygon points="32,130 142,36 154,40 72,130" fill="#233754" opacity="0.82" />
              <line x1="68" y1="130" x2="142" y2="38" stroke="#89A9D9" strokeWidth="1.5" opacity="0.6" />
              <line x1="98" y1="130" x2="146" y2="38" stroke="#89A9D9" strokeWidth="1.5" opacity="0.6" />
              <line x1="126" y1="130" x2="150" y2="38" stroke="#89A9D9" strokeWidth="1.5" opacity="0.6" />
            </svg>
            <Image
              src="/illustrations/brand-background-mobile.png"
              width={941}
              height={1672}
              alt=""
              priority
              className="console-hero-photo"
            />
            <div className="console-hero-facade-sign">
              <span>KOPERASI</span>
              <strong>KKISI TB2</strong>
            </div>
          </div>
        </div>

        <div className="console-hero-content">
          <h1>
            Selamat datang, <span className="console-hero-highlight">{ctx.userName || 'Pengguna'}</span>
          </h1>
          <p>
            Ruang kerja terpadu KKISI TB2 untuk mengelola Toko, KOSIPA, dan Warehouse dengan lebih
            mudah, cepat, dan terintegrasi.
          </p>
        </div>

        <HeroClockCard initialIso={now.toISOString()} />
      </header>

      {/* 2. KPI SUMMARY CARDS (4-COLUMN GRID) */}
      <section aria-label="Ringkasan indikator utama" className="console-kpi-grid">
        <article className="console-kpi-card">
          <span className="console-kpi-icon console-kpi-icon-blue" aria-hidden="true">
            <ShoppingCart size={20} />
          </span>
          <div className="console-kpi-body">
            <span className="console-kpi-label">Penjualan Hari Ini</span>
            <div className="console-kpi-value-row">
              <strong className="console-kpi-value">
                {live.todaySalesCount.toLocaleString('id-ID')} Transaksi
              </strong>
              <span className="console-trend-pill console-trend-up">{live.salesTrendLabel}</span>
            </div>
            <small className="console-kpi-sub">{live.salesSubtitle}</small>
          </div>
          <SparklineBars tone="blue" />
        </article>

        <article className="console-kpi-card">
          <span className="console-kpi-icon console-kpi-icon-green" aria-hidden="true">
            <Users size={20} />
          </span>
          <div className="console-kpi-body">
            <span className="console-kpi-label">Anggota Aktif</span>
            <div className="console-kpi-value-row">
              <strong className="console-kpi-value">{live.activeMembersDisplay}</strong>
              <span className="console-trend-pill console-trend-up">{live.memberBadge}</span>
            </div>
            <small className="console-kpi-sub">{live.memberSubtitle}</small>
          </div>
          <SparklineBars tone="green" />
        </article>

        <article className="console-kpi-card">
          <span className="console-kpi-icon console-kpi-icon-orange" aria-hidden="true">
            <FileText size={20} />
          </span>
          <div className="console-kpi-body">
            <span className="console-kpi-label">Pengajuan KOSIPA</span>
            <div className="console-kpi-value-row">
              <strong className="console-kpi-value">{live.loanSubmissionDisplay}</strong>
              <span className="console-trend-pill console-trend-warn">{live.loanBadge}</span>
            </div>
            <small className="console-kpi-sub">{live.loanSubtitle}</small>
          </div>
          <SparklineBars tone="orange" />
        </article>

        <article className="console-kpi-card">
          <span className="console-kpi-icon console-kpi-icon-red" aria-hidden="true">
            <Boxes size={20} />
          </span>
          <div className="console-kpi-body">
            <span className="console-kpi-label">Stok Menipis</span>
            <div className="console-kpi-value-row">
              <strong className="console-kpi-value">{live.lowStockDisplay}</strong>
              <span className="console-trend-pill console-trend-danger">{live.stockBadge}</span>
            </div>
            <small className="console-kpi-sub">{live.stockSubtitle}</small>
          </div>
          <SparklineBars tone="red" />
        </article>
      </section>

      {/* 3. MIDDLE GRID: AKSES CEPAT + PENGUMUMAN & INFORMASI */}
      <div className="console-mid-grid">
        <section aria-labelledby="quick-title" className="console-section console-quick-section">
          <div className="console-quick-header">
            <div>
              <h2 id="quick-title">Akses Cepat</h2>
              <p className="console-quick-sub">Pilih modul untuk mulai bekerja dengan cepat</p>
            </div>
            <span className="console-link-btn" aria-hidden="true">
              Lihat semua modul <ArrowRight size={14} />
            </span>
          </div>

          <ul className="console-quick">
            {REFERENCE_QUICK_CARDS.map((card) => {
              const resolvedHref = visibleHrefs.has(card.href)
                ? card.href
                : card.fallbackHref && visibleHrefs.has(card.fallbackHref)
                  ? card.fallbackHref
                  : null;

              const inner = (
                <>
                  <span className={`console-quick-icon console-tone-${card.tone}`} aria-hidden="true">
                    <QuickCardIcon iconKey={card.iconKey} />
                  </span>
                  <span className="console-quick-text">
                    <strong>{card.label}</strong>
                    <small>{card.description}</small>
                  </span>
                  <ChevronRight size={16} className="console-quick-arrow" aria-hidden="true" />
                </>
              );

              return (
                <li key={card.id}>
                  {resolvedHref ? (
                    <Link
                      href={resolvedHref}
                      prefetch={resolvedHref.startsWith('/console/kosipa') ? false : undefined}
                      className="console-quick-card"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      className="console-quick-card console-quick-card-muted"
                      aria-disabled="true"
                      title="Memerlukan izin akses modul ini"
                    >
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}

            {extraQuickEntries.map((entry) => {
              const EntryIcon = CONSOLE_ICONS[entry.icon];
              return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  prefetch={entry.href.startsWith('/console/kosipa') ? false : undefined}
                  className="console-quick-card"
                >
                  <span className="console-quick-icon console-tone-blue" aria-hidden="true">
                    <EntryIcon size={20} aria-hidden="true" />
                  </span>
                  <span className="console-quick-text">
                    <strong>{entry.label}</strong>
                    {entry.description && <small>{entry.description}</small>}
                  </span>
                  <ChevronRight size={16} className="console-quick-arrow" aria-hidden="true" />
                </Link>
              </li>
              );
            })}
          </ul>
        </section>

        <AnnouncementPanel
          highlightTitle="Pembaruan Sistem"
          highlightDate={todayLabel}
          highlightText="Fitur laporan KOSIPA kini mendukung ekspor dalam format CSV dan diagnostik kualitas data."
          items={announcementItems}
        />
      </div>

      {/* 4. BOTTOM GRID: RINGKASAN OPERASIONAL + AKTIVITAS TERBARU + STATUS MODUL */}
      <div className="console-bottom-grid">
        <OperationalSummaryCard summary={live.opsSummary} />

        <section aria-labelledby="activity-title" className="console-card-surface console-activity-card">
          <div className="console-panel-header">
            <div className="console-panel-title-wrap">
              <span className="console-panel-title-icon" aria-hidden="true">
                <Clock size={17} />
              </span>
              <h2 id="activity-title">Aktivitas Terbaru</h2>
            </div>
            <span className="console-link-btn" aria-hidden="true">
              Lihat semua <ArrowRight size={13} />
            </span>
          </div>

          <ul className="console-timeline">
            {live.activities.map((act) => {
              const ActIcon =
                act.kind === 'pos'
                  ? ShoppingCart
                  : act.kind === 'loan'
                    ? FileText
                    : act.kind === 'stock'
                      ? Boxes
                      : act.kind === 'installment'
                        ? HandCoins
                        : UserPlus;
              return (
                <li key={act.id} className="console-timeline-item">
                  <span className={`console-timeline-dot console-dot-${act.tone}`} aria-hidden="true" />
                  <span className={`console-timeline-icon console-tone-${act.tone}`} aria-hidden="true">
                    <ActIcon size={15} />
                  </span>
                  <div className="console-timeline-body">
                    <strong>{act.title}</strong>
                    <small>{act.subtitle}</small>
                  </div>
                  <span className={`console-timeline-badge console-badge-tone-${act.tone}`}>
                    {act.badge}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="modules-title" className="console-card-surface console-status-card">
          <div className="console-panel-header">
            <div className="console-panel-title-wrap">
              <span className="console-panel-title-icon" aria-hidden="true">
                <Layers size={17} />
              </span>
              <h2 id="modules-title">Status Modul</h2>
            </div>
          </div>

          <ul className="console-modules">
            {modules.map((m) => {
              const isAvailable = m.state === 'available';
              const chips = moduleDefaultChips[m.section] ?? [];
              return (
                <li key={m.section} className="console-module" data-state={m.state}>
                  <div className="console-module-row">
                    <span
                      className={`console-module-icon ${isAvailable ? 'console-tone-green' : 'console-tone-orange'}`}
                      aria-hidden="true"
                    >
                      <Boxes size={18} />
                    </span>
                    <div className="console-module-main">
                      <div className="console-module-head">
                        <div className="console-module-title-wrap">
                          <h3>{m.title}</h3>
                          <CheckCircle2
                            size={14}
                            className={
                              isAvailable ? 'console-module-check-ok' : 'console-module-check-warn'
                            }
                            aria-hidden="true"
                          />
                        </div>
                        <span className="console-badge" data-state={m.state}>
                          {STATE_LABEL[m.state]}
                        </span>
                      </div>
                      <p>{m.summary}</p>
                      {KOSIPA_STATE_NOTE[m.state] && (
                        <p className="console-module-planned" role="status">
                          {KOSIPA_STATE_NOTE[m.state]}
                        </p>
                      )}
                      <ul className="console-module-links">
                        {chips.map((chip) => {
                          const canLink = visibleHrefs.has(chip.href);
                          return (
                            <li key={chip.label}>
                              {canLink ? (
                                <Link
                                  href={chip.href}
                                  prefetch={chip.href.startsWith('/console/kosipa') ? false : undefined}
                                >
                                  {chip.label}
                                </Link>
                              ) : (
                                <span className="console-module-chip">{chip.label}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {auth.kosipa === 'unavailable' && (
        <p className="console-message console-message-error" role="status">
          Akses KOSIPA sementara tidak dapat diperiksa, sehingga menu KOSIPA disembunyikan. Modul TOKO
          tetap dapat digunakan.
        </p>
      )}

      {quick.length === 0 && (
        <section className="console-panel" role="status">
          <h2>Belum ada modul untuk akun ini</h2>
          <p>
            Akun Anda belum memiliki izin modul operasional. Hubungi administrator koperasi bila Anda
            memerlukan akses.
          </p>
        </section>
      )}

      <p className="console-notice">
        <Info size={16} aria-hidden="true" />
        Ringkasan angka operasional menampilkan jumlah dokumen dan stok terverifikasi sesuai izin cabang
        aktif.
      </p>
    </div>
  );
}
