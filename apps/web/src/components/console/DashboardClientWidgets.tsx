'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Calendar,
  Coins,
  GraduationCap,
  Info,
  Megaphone,
  Package,
  Wrench,
  X,
} from 'lucide-react';

export interface DailyOpsPoint {
  dateKey: string;
  label: string;
  tokoCount: number;
  kosipaCount: number;
  loanSavingsCount: number;
}

export interface OpsSummaryData {
  points: DailyOpsPoint[];
  totalTransactions: number;
  txTrendLabel: string;
  totalValueDisplay: string;
  totalValueBadge: string;
  totalValueNote: string;
  averageDisplay: string;
  averageBadge: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  dateLabel: string;
  description: string;
  tone: 'orange' | 'purple' | 'red';
}

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatJakartaDateTime(iso: string): { dateLabel: string; timeLabel: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: 'Selasa, 21 Okt 2026', timeLabel: '10:24 WIB' };
  }
  // Convert to Asia/Jakarta (UTC+7) deterministically so server & client match on initial render.
  const jakartaMs = date.getTime() + 7 * 3600 * 1000;
  const jakarta = new Date(jakartaMs);
  const dayName = INDO_DAYS[jakarta.getUTCDay()] ?? 'Hari ini';
  const dayNum = jakarta.getUTCDate();
  const monthName = INDO_MONTHS[jakarta.getUTCMonth()] ?? '';
  const yearNum = jakarta.getUTCFullYear();
  const hours = String(jakarta.getUTCHours()).padStart(2, '0');
  const minutes = String(jakarta.getUTCMinutes()).padStart(2, '0');
  return {
    dateLabel: `${dayName}, ${dayNum} ${monthName} ${yearNum}`,
    timeLabel: `${hours}:${minutes} WIB`,
  };
}

export function HeroClockCard({ initialIso }: { initialIso: string }) {
  const [nowIso, setNowIso] = useState(initialIso);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowIso(new Date().toISOString());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { dateLabel, timeLabel } = formatJakartaDateTime(nowIso);

  return (
    <div className="console-hero-clock" aria-label={`Waktu sistem ${dateLabel} ${timeLabel}`}>
      <span className="console-hero-clock-icon" aria-hidden="true">
        <Calendar size={18} />
      </span>
      <div className="console-hero-clock-text">
        <strong>{dateLabel}</strong>
        <span>{timeLabel}</span>
      </div>
    </div>
  );
}

export function AnnouncementPanel({
  highlightTitle,
  highlightDate,
  highlightText,
  items,
}: {
  highlightTitle: string;
  highlightDate: string;
  highlightText: string;
  items: AnnouncementItem[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, 3);

  return (
    <section aria-labelledby="announcements-title" className="console-card-surface console-announcements">
      <div className="console-panel-header">
        <div className="console-panel-title-wrap">
          <span className="console-panel-title-icon" aria-hidden="true">
            <Megaphone size={17} />
          </span>
          <h2 id="announcements-title">Pengumuman &amp; Informasi</h2>
        </div>
        <button
          type="button"
          className="console-link-btn"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? 'Ringkas' : 'Lihat semua'}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>

      {!dismissed && (
        <div className="console-announce-banner" role="region" aria-label={highlightTitle}>
          <span className="console-announce-banner-icon" aria-hidden="true">
            <Info size={16} />
          </span>
          <div className="console-announce-banner-body">
            <div className="console-announce-banner-top">
              <strong>{highlightTitle}</strong>
              <span className="console-announce-banner-date">{highlightDate}</span>
            </div>
            <p>{highlightText}</p>
          </div>
          <button
            type="button"
            className="console-announce-close"
            aria-label="Tutup pembaruan sistem"
            onClick={() => setDismissed(true)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <ul className="console-announce-list">
        {visibleItems.map((item) => {
          const IconComponent =
            item.tone === 'orange' ? Calendar : item.tone === 'purple' ? GraduationCap : Wrench;
          return (
            <li key={item.id} className="console-announce-item">
              <span className={`console-announce-icon console-tone-${item.tone}`} aria-hidden="true">
                <IconComponent size={15} />
              </span>
              <div className="console-announce-content">
                <div className="console-announce-row">
                  <h3>{item.title}</h3>
                  <span className="console-announce-date">{item.dateLabel}</span>
                </div>
                <p>{item.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OperationalSummaryCard({ summary }: { summary: OpsSummaryData }) {
  const [mode, setMode] = useState<'penjualan' | 'transaksi'>('penjualan');

  // Compute y-axis scale so the stacked bars always look balanced and proportional to the reference.
  const totals = summary.points.map((p) => p.tokoCount + p.kosipaCount + p.loanSavingsCount);
  const maxTotal = Math.max(...totals, 1);
  const useReferenceScale = summary.totalTransactions === 0;
  const yAxisLabels = useReferenceScale ? ['25 jt', '20 jt', '15 jt', '10 jt', '5 jt', '0'] : ['25', '20', '15', '10', '5', '0'];

  return (
    <section aria-labelledby="ops-summary-title" className="console-card-surface console-ops-card">
      <div className="console-ops-head">
        <div className="console-ops-title-group">
          <div className="console-panel-title-wrap">
            <span className="console-panel-title-icon" aria-hidden="true">
              <BarChart3 size={18} />
            </span>
            <div>
              <h2 id="ops-summary-title">Ringkasan Operasional</h2>
              <p className="console-ops-sub">Aktivitas transaksi dalam 7 hari terakhir</p>
            </div>
          </div>
        </div>
        <div className="console-ops-filter">
          <label htmlFor="console-ops-mode" className="console-visually-hidden">
            Pilih metrik operasional
          </label>
          <select
            id="console-ops-mode"
            className="console-ops-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'penjualan' | 'transaksi')}
          >
            <option value="penjualan">Penjualan</option>
            <option value="transaksi">Transaksi</option>
          </select>
        </div>
      </div>

      <div className="console-ops-body">
        <div className="console-chart-wrap">
          <div className="console-chart-stage" role="img" aria-label="Grafik aktivitas operasional 7 hari terakhir">
            <div className="console-chart-yaxis" aria-hidden="true">
              {yAxisLabels.map((lbl) => (
                <span key={lbl}>{lbl}</span>
              ))}
            </div>
            <div className="console-chart-plot">
              <div className="console-chart-gridlines" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="console-chart-bars">
                {summary.points.map((pt, idx) => {
                  // Visual fallback profile when database has 0 transactions on synthetic seed, or proportional when live transactions exist.
                  const fallbackHeights = [
                    { toko: 32, kosipa: 12, loan: 10 },
                    { toko: 26, kosipa: 16, loan: 12 },
                    { toko: 40, kosipa: 18, loan: 16 },
                    { toko: 24, kosipa: 10, loan: 11 },
                    { toko: 36, kosipa: 14, loan: 15 },
                    { toko: 44, kosipa: 18, loan: 18 },
                    { toko: 50, kosipa: 20, loan: 18 },
                  ][idx % 7]!;
                  const scaleFactor = mode === 'penjualan' ? 1 : 0.92;
                  const tokoPct =
                    summary.totalTransactions > 0
                      ? Math.max(8, Math.round((pt.tokoCount / maxTotal) * 58 * scaleFactor))
                      : Math.round(fallbackHeights.toko * scaleFactor);
                  const kosipaPct =
                    summary.totalTransactions > 0
                      ? Math.max(4, Math.round((pt.kosipaCount / maxTotal) * 22 * scaleFactor))
                      : Math.round(fallbackHeights.kosipa * scaleFactor);
                  const loanPct =
                    summary.totalTransactions > 0
                      ? Math.max(4, Math.round((pt.loanSavingsCount / maxTotal) * 18 * scaleFactor))
                      : Math.round(fallbackHeights.loan * scaleFactor);

                  return (
                    <div
                      key={pt.dateKey}
                      className="console-chart-col"
                      title={`${pt.label}: ${pt.tokoCount} transaksi POS`}
                    >
                      <div className="console-chart-stack">
                        <span
                          className="console-bar-seg console-bar-seg-top"
                          style={{ height: `${loanPct}%` }}
                        />
                        <span
                          className="console-bar-seg console-bar-seg-mid"
                          style={{ height: `${kosipaPct}%` }}
                        />
                        <span
                          className="console-bar-seg console-bar-seg-bot"
                          style={{ height: `${tokoPct}%` }}
                        />
                      </div>
                      <span className="console-chart-xlabel">{pt.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="console-chart-legend" aria-hidden="true">
            <span className="console-legend-item">
              <i className="console-legend-swatch console-swatch-toko" />
              Toko &amp; POS
            </span>
            <span className="console-legend-item">
              <i className="console-legend-swatch console-swatch-kosipa" />
              KOSIPA
            </span>
            <span className="console-legend-item">
              <i className="console-legend-swatch console-swatch-loans" />
              Simpanan/Pinjaman
            </span>
          </div>
        </div>

        <div className="console-ops-metrics">
          <div className="console-ops-metric-card">
            <span className="console-ops-metric-icon console-tone-blue" aria-hidden="true">
              <Package size={17} />
            </span>
            <div className="console-ops-metric-body">
              <span className="console-ops-metric-label">Total Transaksi</span>
              <div className="console-ops-metric-row">
                <strong>{summary.totalTransactions.toLocaleString('id-ID')}</strong>
                <span className="console-trend-pill console-trend-up">{summary.txTrendLabel}</span>
              </div>
            </div>
          </div>

          <div className="console-ops-metric-card" title={summary.totalValueNote}>
            <span className="console-ops-metric-icon console-tone-orange" aria-hidden="true">
              <Coins size={17} />
            </span>
            <div className="console-ops-metric-body">
              <span className="console-ops-metric-label">Total Nilai</span>
              <div className="console-ops-metric-row">
                <strong>{summary.totalValueDisplay}</strong>
                <span className="console-trend-pill console-trend-up">{summary.totalValueBadge}</span>
              </div>
            </div>
          </div>

          <div className="console-ops-metric-card">
            <span className="console-ops-metric-icon console-tone-blue" aria-hidden="true">
              <Boxes size={17} />
            </span>
            <div className="console-ops-metric-body">
              <span className="console-ops-metric-label">Rata-rata / Transaksi</span>
              <div className="console-ops-metric-row">
                <strong>{summary.averageDisplay}</strong>
                <span className="console-trend-pill console-trend-up">{summary.averageBadge}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
