'use client';

import { useState } from 'react';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/**
 * Period filter for the KOSIPA finance cards, like the legacy dashboard (Perbulan / Pertahun, bulan, tahun). A plain GET form:
 * it applies on "Terapkan" (keyboard-friendly, no reload per arrow key) and works without JavaScript; with JS the month
 * picker hides itself for "Pertahun", as in legacy.
 */
export function KosipaFinanceFilter({ range, month, year, years }: { range: 'bulan' | 'tahun'; month: number; year: number; years: readonly number[] }) {
  const [current, setCurrent] = useState(range);
  return (
    <form method="get" action="/console" className="console-finance-filter" aria-label="Periode ringkasan keuangan">
      <label>
        <span className="console-visually-hidden">Jenis periode</span>
        <select name="periode" defaultValue={range} onChange={(e) => setCurrent(e.currentTarget.value === 'tahun' ? 'tahun' : 'bulan')}>
          <option value="bulan">Perbulan</option>
          <option value="tahun">Pertahun</option>
        </select>
      </label>
      {current === 'bulan' && (
        <label>
          <span className="console-visually-hidden">Bulan</span>
          <select name="bulan" defaultValue={String(month)}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
      )}
      <label>
        <span className="console-visually-hidden">Tahun</span>
        <select name="tahun" defaultValue={String(year)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <button type="submit">Terapkan</button>
    </form>
  );
}
