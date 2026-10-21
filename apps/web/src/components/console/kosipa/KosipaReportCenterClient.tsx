'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  BarChart3,
  Building2,
  Calendar,
  Clock,
  Coins,
  Database,
  FileSpreadsheet,
  FileText,
  Filter,
  MoreVertical,
  Receipt,
  Search,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';

export type ReportCardItem = {
  id: 'loan' | 'payroll' | 'membership' | 'savings-movement' | 'savings-book' | 'quality';
  title: string;
  srSuffix?: string;
  description: string;
  href: string;
  supportsYearParam: boolean;
  tone: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal';
  format: 'csv' | 'web';
};

export type MonthlyReportPoint = {
  monthIndex: number;
  label: string;
  pinjaman: number;
  payroll: number;
  simpanan: number;
  keanggotaan: number;
};

export type RecentReportEntry = {
  id: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeTone: 'green' | 'red';
  href: string;
  actionLabel: string;
  format: 'csv' | 'web';
};

export type KosipaReportCenterData = {
  branchName: string;
  canSwitchBranch: boolean;
  canExport: boolean;
  availableYears: number[];
  defaultYear: number;
  periodOptions: { value: string; label: string; year: number }[];
  kpi: {
    totalReports: number;
    totalReportsDelta: string;
    totalReportsSub: string;
    monthlyReports: number;
    monthlyReportsDelta: string;
    monthlyReportsSub: string;
    processedRecordsDisplay: string;
    processedRecordsDelta: string;
    processedRecordsSub: string;
    findingsCount: number | null;
    findingsDelta: string;
    findingsSub: string;
  };
  cards: ReportCardItem[];
  monthlyByYear: Record<number, MonthlyReportPoint[]>;
  recentReports: RecentReportEntry[];
};

function CardCategoryIcon({ id }: { id: ReportCardItem['id'] }) {
  switch (id) {
    case 'loan':
      return <Coins size={19} aria-hidden="true" />;
    case 'payroll':
      return <Receipt size={19} aria-hidden="true" />;
    case 'membership':
      return <Users size={19} aria-hidden="true" />;
    case 'savings-movement':
      return <Database size={19} aria-hidden="true" />;
    case 'savings-book':
      return <BarChart3 size={19} aria-hidden="true" />;
    case 'quality':
      return <ShieldCheck size={19} aria-hidden="true" />;
  }
}

export function KosipaReportCenterClient({ data }: { data: KosipaReportCenterData }) {
  const [selectedYear, setSelectedYear] = useState<number>(data.defaultYear);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    data.periodOptions[0]?.value ?? String(data.defaultYear),
  );
  const [selectedBranch, setSelectedBranch] = useState<string>(
    data.canSwitchBranch ? 'all' : data.branchName,
  );
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [appliedFormat, setAppliedFormat] = useState<string>('all');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [showAllRecent, setShowAllRecent] = useState<boolean>(false);

  const points: MonthlyReportPoint[] = data.monthlyByYear[selectedYear] ?? [];

  const totals = points.reduce(
    (acc, p) => {
      acc.pinjaman += p.pinjaman;
      acc.payroll += p.payroll;
      acc.simpanan += p.simpanan;
      acc.keanggotaan += p.keanggotaan;
      return acc;
    },
    { pinjaman: 0, payroll: 0, simpanan: 0, keanggotaan: 0 },
  );

  const grandTotal =
    totals.pinjaman + totals.payroll + totals.simpanan + totals.keanggotaan;

  // Compute mathematically consistent percentages that sum to 100% when grandTotal > 0
  const rawCategories = [
    { key: 'pinjaman', label: 'Pinjaman', count: totals.pinjaman, color: '#0B52EA' },
    { key: 'payroll', label: 'Payroll', count: totals.payroll, color: '#2E74FF' },
    { key: 'simpanan', label: 'Simpanan', count: totals.simpanan, color: '#38BDF8' },
    { key: 'keanggotaan', label: 'Keanggotaan', count: totals.keanggotaan, color: '#93C5FD' },
  ];

  const categoriesWithPct = (() => {
    if (grandTotal <= 0) {
      return rawCategories.map((c) => ({ ...c, pct: 0 }));
    }
    const exact = rawCategories.map((c) => (c.count / grandTotal) * 100);
    const floored = exact.map((v) => Math.floor(v));
    const remainder = 100 - floored.reduce((a, b) => a + b, 0);
    const order = exact
      .map((v, idx) => ({ idx, frac: v - floored[idx] }))
      .sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remainder && i < order.length; i++) {
      floored[order[i].idx] += 1;
    }
    return rawCategories.map((c, idx) => ({ ...c, pct: floored[idx] }));
  })();

  const maxMonthTotal = Math.max(
    40,
    ...points.map((p) => p.pinjaman + p.payroll + p.simpanan + p.keanggotaan),
  );

  const visibleCards =
    appliedFormat === 'all'
      ? data.cards
      : data.cards.filter((c) => c.format === appliedFormat);

  const visibleRecent = (
    appliedFormat === 'all'
      ? data.recentReports
      : data.recentReports.filter((r) => r.format === appliedFormat)
  ).slice(0, showAllRecent ? 10 : 5);

  function handleApplyFilter(e: React.FormEvent) {
    e.preventDefault();
    const matchedPeriod = data.periodOptions.find((p) => p.value === selectedPeriod);
    if (matchedPeriod) {
      setSelectedYear(matchedPeriod.year);
    }
    setAppliedFormat(selectedFormat);
  }

  function handleResetFilter() {
    setSelectedYear(data.defaultYear);
    setSelectedPeriod(data.periodOptions[0]?.value ?? String(data.defaultYear));
    setSelectedBranch(data.canSwitchBranch ? 'all' : data.branchName);
    setSelectedFormat('all');
    setAppliedFormat('all');
  }

  // SVG Donut geometry (r = 48, circumference = 301.59)
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const donutSegments = categoriesWithPct.reduce<
    { key: string; color: string; dashArray: string; dashOffset: number }[]
  >((acc, cat) => {
    const prevPct = acc.reduce((sum, seg) => {
      const segLen = parseFloat(seg.dashArray.split(' ')[0] || '0');
      return sum + segLen / circumference;
    }, 0);
    const segLength = grandTotal > 0 ? (cat.pct / 100) * circumference : circumference / 4;
    const offset = circumference * (1 - prevPct) + circumference * 0.25;
    acc.push({
      key: cat.key,
      color: cat.color,
      dashArray: `${Math.max(0, segLength - 2.5)} ${circumference}`,
      dashOffset: offset,
    });
    return acc;
  }, []);

  return (
    <div className="kosipa-rc">
      {/* 1. PAGE INTRODUCTION / HERO SECTION */}
      <header className="kosipa-rc-hero">
        <div className="kosipa-rc-hero-copy">
          <p className="kosipa-rc-eyebrow">
            <span>KOSIPA</span>
            <span className="kosipa-rc-eyebrow-sep" aria-hidden="true">
              /
            </span>
            <span>Administrasi koperasi</span>
          </p>
          <h1>Laporan KOSIPA</h1>
          <p className="kosipa-rc-subtitle">
            Pusat laporan terintegrasi untuk monitoring, analisis, dan akses cepat seluruh laporan
            koperasi.
            <br />
            Dapatkan insight dari data keanggotaan, simpanan, pinjaman, payroll, dan operasional.
          </p>
        </div>

        <div className="kosipa-rc-hero-banner" aria-hidden="true">
          <div className="kosipa-rc-hero-art">
            <svg
              viewBox="0 0 180 112"
              className="kosipa-rc-hero-svg"
              focusable="false"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="rcBgGlow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#CFE2FF" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.25" />
                </linearGradient>
                <filter id="rcDocShadow" x="-15%" y="-15%" width="130%" height="135%">
                  <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0F296B" floodOpacity="0.12" />
                </filter>
              </defs>
              {/* Soft background cloud/wave */}
              <ellipse cx="88" cy="64" rx="74" ry="42" fill="url(#rcBgGlow)" />
              {/* Back tilted sheet */}
              <g transform="translate(24, 18) rotate(-10 40 40)" filter="url(#rcDocShadow)">
                <rect x="0" y="0" width="66" height="80" rx="8" fill="#E2EEFF" stroke="#C3DAFE" strokeWidth="1" />
                <rect x="10" y="14" width="32" height="5" rx="2.5" fill="#93C5FD" />
                <rect x="10" y="24" width="44" height="4" rx="2" fill="#BFDBFE" />
                <rect x="10" y="33" width="38" height="4" rx="2" fill="#BFDBFE" />
                <rect x="10" y="46" width="20" height="20" rx="4" fill="#60A5FA" opacity="0.45" />
              </g>
              {/* Front main report card with 4 blue bars */}
              <g transform="translate(62, 10) rotate(3 44 44)" filter="url(#rcDocShadow)">
                <rect x="0" y="0" width="84" height="88" rx="9" fill="#FFFFFF" stroke="#DCE7F9" strokeWidth="1" />
                <rect x="12" y="13" width="34" height="5" rx="2.5" fill="#CBD5E1" />
                <rect x="12" y="22" width="52" height="4" rx="2" fill="#E2E8F0" />
                <rect x="12" y="30" width="42" height="4" rx="2" fill="#E2E8F0" />
                {/* 4 vertical chart bars */}
                <rect x="14" y="56" width="10" height="20" rx="2.5" fill="#3B82F6" />
                <rect x="29" y="44" width="10" height="32" rx="2.5" fill="#155EEF" />
                <rect x="44" y="36" width="10" height="40" rx="2.5" fill="#0B46C4" />
                <rect x="59" y="50" width="10" height="26" rx="2.5" fill="#60A5FA" />
                <line x1="11" y1="76" x2="73" y2="76" stroke="#E2E8F0" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
          <div className="kosipa-rc-hero-tagline">
            <p>
              Laporan yang akurat
              <br />
              untuk koperasi yang
              <br />
              lebih maju
            </p>
            <div className="kosipa-rc-hero-accent">
              <span className="kosipa-rc-hero-accent-main" />
              <span className="kosipa-rc-hero-accent-sub" />
            </div>
          </div>
        </div>
      </header>

      {/* 2. KPI SUMMARY — 4 CARDS */}
      <section className="kosipa-rc-kpi-grid" aria-label="Ringkasan indikator laporan">
        <article className="kosipa-rc-kpi-card">
          <div className="kosipa-rc-kpi-top">
            <span className="kosipa-rc-kpi-icon is-blue" aria-hidden="true">
              <FileText size={20} />
            </span>
            <div className="kosipa-rc-kpi-main">
              <span className="kosipa-rc-kpi-label">Total Laporan</span>
              <strong className="kosipa-rc-kpi-value">{data.kpi.totalReports}</strong>
              <span className="kosipa-rc-kpi-sub">{data.kpi.totalReportsSub}</span>
            </div>
          </div>
          <div className="kosipa-rc-kpi-foot">
            <span className="kosipa-rc-trend is-up">{data.kpi.totalReportsDelta}</span>
            <span className="kosipa-rc-trend-note">modul laporan aktif</span>
          </div>
        </article>

        <article className="kosipa-rc-kpi-card">
          <div className="kosipa-rc-kpi-top">
            <span className="kosipa-rc-kpi-icon is-blue" aria-hidden="true">
              <Calendar size={20} />
            </span>
            <div className="kosipa-rc-kpi-main">
              <span className="kosipa-rc-kpi-label">Laporan Bulan Ini</span>
              <strong className="kosipa-rc-kpi-value">{data.kpi.monthlyReports}</strong>
              <span className="kosipa-rc-kpi-sub">{data.kpi.monthlyReportsSub}</span>
            </div>
          </div>
          <div className="kosipa-rc-kpi-foot">
            <span className="kosipa-rc-trend is-up">{data.kpi.monthlyReportsDelta}</span>
            <span className="kosipa-rc-trend-note">periode tercatat</span>
          </div>
        </article>

        <article className="kosipa-rc-kpi-card">
          <div className="kosipa-rc-kpi-top">
            <span className="kosipa-rc-kpi-icon is-green" aria-hidden="true">
              <Database size={20} />
            </span>
            <div className="kosipa-rc-kpi-main">
              <span className="kosipa-rc-kpi-label">Data Terproses</span>
              <strong className="kosipa-rc-kpi-value">{data.kpi.processedRecordsDisplay}</strong>
              <span className="kosipa-rc-kpi-sub">{data.kpi.processedRecordsSub}</span>
            </div>
          </div>
          <div className="kosipa-rc-kpi-foot">
            <span className="kosipa-rc-trend is-up">{data.kpi.processedRecordsDelta}</span>
            <span className="kosipa-rc-trend-note">dari sumber tercatat</span>
          </div>
        </article>

        <article className="kosipa-rc-kpi-card">
          <div className="kosipa-rc-kpi-top">
            <span className="kosipa-rc-kpi-icon is-red" aria-hidden="true">
              <AlertTriangle size={20} />
            </span>
            <div className="kosipa-rc-kpi-main">
              <span className="kosipa-rc-kpi-label">Temuan / Perlu Tinjau</span>
              <strong className="kosipa-rc-kpi-value">
                {data.kpi.findingsCount !== null ? data.kpi.findingsCount : '—'}
              </strong>
              <span className="kosipa-rc-kpi-sub">{data.kpi.findingsSub}</span>
            </div>
          </div>
          <div className="kosipa-rc-kpi-foot">
            <span className="kosipa-rc-trend is-warn">{data.kpi.findingsDelta}</span>
            <span className="kosipa-rc-trend-note">diagnostik kualitas data</span>
          </div>
        </article>
      </section>

      {/* 3. MAIN TWO-COLUMN GRID */}
      <div className="kosipa-rc-main-grid">
        {/* PRIMARY LEFT COLUMN */}
        <div className="kosipa-rc-primary-col">
          {/* AKSES CEPAT LAPORAN */}
          <section className="kosipa-rc-panel" aria-labelledby="rc-quick-heading">
            <div className="kosipa-rc-section-head">
              <div className="kosipa-rc-section-title-wrap">
                <span className="kosipa-rc-section-icon" aria-hidden="true">
                  <Zap size={18} />
                </span>
                <div>
                  <h2 id="rc-quick-heading">Akses Cepat Laporan</h2>
                  <p>
                    Pilih jenis laporan yang ingin Anda lihat. Setiap laporan menyediakan data
                    terkini dengan berbagai opsi filter dan format.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="kosipa-rc-see-all-btn"
                onClick={() => {
                  setSelectedFormat('all');
                  setAppliedFormat('all');
                }}
              >
                Lihat Semua Laporan <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>

            <div className="kosipa-rc-cards-grid" role="list" aria-label="Daftar laporan">
              {visibleCards.map((card) => {
                const targetHref =
                  card.supportsYearParam && selectedYear !== data.defaultYear
                    ? `${card.href}?tahun=${selectedYear}`
                    : card.href;
                return (
                  <article key={card.id} className="kosipa-rc-report-card" role="listitem">
                    <div className="kosipa-rc-report-card-body">
                      <span
                        className={`kosipa-rc-report-icon is-${card.tone}`}
                        aria-hidden="true"
                      >
                        <CardCategoryIcon id={card.id} />
                      </span>
                      <div className="kosipa-rc-report-copy">
                        <h3>
                          <Link
                            prefetch={false}
                            href={targetHref}
                            className="kosipa-rc-report-title-link"
                          >
                            {card.title}
                            {card.srSuffix && (
                              <span className="console-visually-hidden">{card.srSuffix}</span>
                            )}
                          </Link>
                        </h3>
                        <p>{card.description}</p>
                        <Link
                          prefetch={false}
                          href={targetHref}
                          className="kosipa-rc-report-cta"
                        >
                          Lihat Laporan <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* BOTTOM ANALYTICS ROW */}
          <div className="kosipa-rc-analytics-row">
            {/* TREN AKTIVITAS LAPORAN */}
            <section className="kosipa-rc-panel kosipa-rc-trend-panel" aria-labelledby="rc-trend-heading">
              <div className="kosipa-rc-chart-head">
                <div className="kosipa-rc-chart-title-group">
                  <span className="kosipa-rc-chart-icon" aria-hidden="true">
                    <BarChart3 size={16} />
                  </span>
                  <div>
                    <h2 id="rc-trend-heading">Tren Aktivitas Laporan</h2>
                    <p>Jumlah laporan yang dibuat per bulan pada tahun {selectedYear}.</p>
                  </div>
                </div>
                <label className="kosipa-rc-year-select-wrap">
                  <span className="console-visually-hidden">Pilih tahun laporan</span>
                  <select
                    aria-label="Pilih tahun laporan"
                    className="kosipa-rc-year-select"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {data.availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        Tahun {yr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="kosipa-rc-bar-chart" role="img" aria-label={`Grafik tren aktivitas laporan tahun ${selectedYear}`}>
                <div className="kosipa-rc-y-axis" aria-hidden="true">
                  <span>{maxMonthTotal}</span>
                  <span>{Math.round(maxMonthTotal * 0.75)}</span>
                  <span>{Math.round(maxMonthTotal * 0.5)}</span>
                  <span>{Math.round(maxMonthTotal * 0.25)}</span>
                  <span>0</span>
                </div>
                <div className="kosipa-rc-bars-stage">
                  <div className="kosipa-rc-gridlines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="kosipa-rc-bars-columns">
                    {points.map((pt) => {
                      const sum = pt.pinjaman + pt.payroll + pt.simpanan + pt.keanggotaan;
                      const hPinjaman = Math.max(4, Math.round((pt.pinjaman / maxMonthTotal) * 100));
                      const hPayroll = Math.max(4, Math.round((pt.payroll / maxMonthTotal) * 100));
                      const hSimpanan = Math.max(5, Math.round((pt.simpanan / maxMonthTotal) * 100));
                      const hKeanggotaan = Math.max(5, Math.round((pt.keanggotaan / maxMonthTotal) * 100));
                      const isHovered = hoveredMonth === pt.monthIndex;
                      return (
                        <div
                          key={pt.label}
                          className="kosipa-rc-bar-col"
                          onMouseEnter={() => setHoveredMonth(pt.monthIndex)}
                          onMouseLeave={() => setHoveredMonth(null)}
                        >
                          {isHovered && (
                            <div className="kosipa-rc-bar-tooltip" role="status">
                              <strong>
                                {pt.label} {selectedYear}
                              </strong>
                              <span>Total: {sum}</span>
                            </div>
                          )}
                          <div className="kosipa-rc-bar-stack">
                            <span
                              className="kosipa-rc-seg is-keanggotaan"
                              style={{ height: `${hKeanggotaan}%` }}
                            />
                            <span
                              className="kosipa-rc-seg is-simpanan"
                              style={{ height: `${hSimpanan}%` }}
                            />
                            <span
                              className="kosipa-rc-seg is-payroll"
                              style={{ height: `${hPayroll}%` }}
                            />
                            <span
                              className="kosipa-rc-seg is-pinjaman"
                              style={{ height: `${hPinjaman}%` }}
                            />
                          </div>
                          <span className="kosipa-rc-bar-label">{pt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="kosipa-rc-chart-legend" aria-hidden="true">
                <span>
                  <i className="is-pinjaman" />
                  Pinjaman
                </span>
                <span>
                  <i className="is-payroll" />
                  Payroll
                </span>
                <span>
                  <i className="is-simpanan" />
                  Simpanan
                </span>
                <span>
                  <i className="is-keanggotaan" />
                  Keanggotaan
                </span>
              </div>
            </section>

            {/* DISTRIBUSI LAPORAN */}
            <section className="kosipa-rc-panel kosipa-rc-dist-panel" aria-labelledby="rc-dist-heading">
              <div className="kosipa-rc-chart-head">
                <div className="kosipa-rc-chart-title-group">
                  <span className="kosipa-rc-chart-icon" aria-hidden="true">
                    <BarChart2 size={16} />
                  </span>
                  <div>
                    <h2 id="rc-dist-heading">Distribusi Laporan</h2>
                  </div>
                </div>
              </div>

              <div className="kosipa-rc-donut-wrap">
                <svg
                  viewBox="0 0 128 128"
                  className="kosipa-rc-donut-svg"
                  role="img"
                  aria-label={`Distribusi laporan total ${grandTotal}`}
                >
                  <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    fill="none"
                    stroke="#EEF2F8"
                    strokeWidth="18"
                  />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.key}
                      cx="64"
                      cy="64"
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="18"
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      strokeLinecap="butt"
                    />
                  ))}
                </svg>
                <div className="kosipa-rc-donut-center">
                  <span>Total</span>
                  <strong>{grandTotal}</strong>
                </div>
              </div>

              <ul className="kosipa-rc-dist-list" aria-label="Rincian distribusi laporan">
                {categoriesWithPct.map((cat) => (
                  <li key={cat.key}>
                    <span className="kosipa-rc-dist-name">
                      <i style={{ backgroundColor: cat.color }} aria-hidden="true" />
                      {cat.label}
                    </span>
                    <strong className="kosipa-rc-dist-pct">{cat.pct}%</strong>
                    <span className="kosipa-rc-dist-count">({cat.count})</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* SECONDARY RIGHT COLUMN */}
        <aside className="kosipa-rc-secondary-col" aria-label="Filter dan laporan terbaru">
          {/* FILTER CEPAT */}
          <section className="kosipa-rc-panel kosipa-rc-filter-panel" aria-labelledby="rc-filter-heading">
            <div className="kosipa-rc-side-head">
              <div className="kosipa-rc-side-title">
                <span className="kosipa-rc-chart-icon" aria-hidden="true">
                  <Filter size={15} />
                </span>
                <h2 id="rc-filter-heading">Filter Cepat</h2>
              </div>
              <button
                type="button"
                className="kosipa-rc-text-btn"
                onClick={handleResetFilter}
              >
                Reset
              </button>
            </div>

            <form className="kosipa-rc-filter-form" onSubmit={handleApplyFilter}>
              <label className="kosipa-rc-field">
                <span className="kosipa-rc-field-label">Periode</span>
                <span className="kosipa-rc-select-box">
                  <Calendar size={15} aria-hidden="true" />
                  <select
                    name="periode"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                  >
                    {data.periodOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              <label className="kosipa-rc-field">
                <span className="kosipa-rc-field-label">Cabang</span>
                <span className="kosipa-rc-select-box">
                  <Building2 size={15} aria-hidden="true" />
                  <select
                    name="cabang"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    {data.canSwitchBranch && <option value="all">Semua Cabang</option>}
                    <option value={data.branchName}>{data.branchName}</option>
                  </select>
                </span>
              </label>

              <label className="kosipa-rc-field">
                <span className="kosipa-rc-field-label">Format Laporan</span>
                <span className="kosipa-rc-select-box">
                  <FileSpreadsheet size={15} aria-hidden="true" />
                  <select
                    name="format"
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value)}
                  >
                    <option value="all">Semua Format</option>
                    <option value="csv">Excel / CSV</option>
                    <option value="web">PDF / Baca-Saja</option>
                  </select>
                </span>
              </label>

              <button type="submit" className="kosipa-rc-apply-btn">
                <Search size={15} aria-hidden="true" />
                Terapkan Filter
              </button>
            </form>
          </section>

          {/* LAPORAN TERBARU */}
          <section className="kosipa-rc-panel kosipa-rc-recent-panel" aria-labelledby="rc-recent-heading">
            <div className="kosipa-rc-side-head">
              <div className="kosipa-rc-side-title">
                <span className="kosipa-rc-chart-icon" aria-hidden="true">
                  <Clock size={15} />
                </span>
                <h2 id="rc-recent-heading">Laporan Terbaru</h2>
              </div>
              <button
                type="button"
                className="kosipa-rc-text-btn"
                onClick={() => setShowAllRecent((v) => !v)}
              >
                Lihat Semua
              </button>
            </div>

            <ul className="kosipa-rc-recent-list" aria-label="Daftar laporan terbaru">
              {visibleRecent.map((item) => (
                <li key={item.id} className="kosipa-rc-recent-item">
                  <span className="kosipa-rc-recent-icon" aria-hidden="true">
                    <FileText size={16} />
                  </span>
                  <div className="kosipa-rc-recent-copy">
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  <span className={`kosipa-rc-format-badge is-${item.badgeTone}`}>
                    {item.badgeLabel}
                  </span>
                  <Link
                    prefetch={false}
                    href={item.href}
                    className="kosipa-rc-recent-more"
                    aria-label={item.actionLabel}
                  >
                    <MoreVertical size={15} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
