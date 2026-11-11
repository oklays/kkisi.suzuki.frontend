#!/usr/bin/env python3
"""
MASTER PDF GENERATOR - LAPORAN PENJUALAN KOPERASI SUZUKI MART (KKISI)
Menghasilkan HTML/PDF laporan eksekutif 4 halaman berstandar tinggi (A4 Portrait)
untuk Konsolidasi Seluruh Toko (TB II Tambun, TB II Kp. Bulu, GIIC Cikarang).
"""
import json
from datetime import datetime

SCRATCH_DIR = "/Users/macbookprom2/.gemini/antigravity/brain/982b6306-214b-4d05-9e90-eded7ad72f5d/scratch"
HTML_PATH = f"{SCRATCH_DIR}/report_all_stores_oktober_2026.html"

with open(f"{SCRATCH_DIR}/october_all_stores_bundle.json", "r", encoding="utf-8") as f:
    bundle = json.load(f)

all_sales = bundle["sales"]
returns_list = bundle["returns"]
nik_to_name = bundle["nikToName"]
items_all = bundle["itemsAll"]
items_by_store = bundle["itemsByStore"]

try:
    with open(f"{SCRATCH_DIR}/nik_to_name.json", "r", encoding="utf-8") as f:
        extra_niks = json.load(f)
        for k, v in extra_niks.items():
            if k not in nik_to_name and v:
                nik_to_name[k] = v
except Exception:
    pass

final_sales = [s for s in all_sales if s["salesStatus"] == "Final" and s["recordStatus"] == 1]
quotation_sales = [s for s in all_sales if s["salesStatus"] != "Final"]

ID_DAYS = {0: "Senin", 1: "Selasa", 2: "Rabu", 3: "Kamis", 4: "Jumat", 5: "Sabtu", 6: "Minggu"}

def fmt_rp(val: float | int) -> str:
    v = int(round(val))
    if v == 0:
        return "Rp\u00a00"
    return "Rp\u00a0" + f"{v:,}".replace(",", ".")

def fmt_int(val: float | int) -> str:
    return f"{int(round(val)):,}".replace(",", ".")

def fmt_pct(val: float) -> str:
    return f"{val:.2f}%".replace(".", ",")

total_tx = len(final_sales)
total_rp = sum((s["grandTotalSen"] or 0) // 100 for s in final_sales)
total_paid = sum((s["paidSen"] or 0) // 100 for s in final_sales)
total_change = total_paid - total_rp
avg_ticket = round(total_rp / total_tx)

# Daily rows (all 31 days on 1 page)
daily_rows = []
daily_totals_tmp = []
for d in range(1, 32):
    d_str = f"2026-10-{d:02d}"
    df = [s for s in final_sales if s["saleDate"] == d_str]
    daily_totals_tmp.append(sum((s["grandTotalSen"] or 0) // 100 for s in df))
max_daily_rp = max(daily_totals_tmp) if daily_totals_tmp else 1

for d in range(1, 32):
    d_str = f"2026-10-{d:02d}"
    dt = datetime.strptime(d_str, "%Y-%m-%d")
    d_name = ID_DAYS[dt.weekday()]
    df = [s for s in final_sales if s["saleDate"] == d_str]
    s1 = [s for s in df if s["companyId"] == 1]
    s2 = [s for s in df if s["companyId"] == 2]
    s3 = [s for s in df if s["companyId"] == 3]
    s1_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s1)
    s2_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s2)
    s3_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s3)
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in df if s["paymentType"] == "Kredit")
    tot = s1_rp + s2_rp + s3_rp
    cnt = len(df)
    avg = round(tot / cnt) if cnt else 0
    bar_w = round((tot / max_daily_rp) * 100, 1) if tot > 0 else 0
    tr_cls = 'class="row-peak"' if tot >= 25000000 else ""
    daily_rows.append(f"""
      <tr {tr_cls}>
        <td class="c-center mono nowrap">{d:02d} Okt</td>
        <td class="c-left nowrap">{d_name}</td>
        <td class="c-right nowrap">{fmt_int(cnt)}</td>
        <td class="c-right nowrap">{fmt_rp(s1_rp) if s1_rp else "-"} <span class="sub-cnt">({len(s1)})</span></td>
        <td class="c-right nowrap">{fmt_rp(s2_rp) if s2_rp else "-"} <span class="sub-cnt">({len(s2)})</span></td>
        <td class="c-right nowrap">{fmt_rp(s3_rp) if s3_rp else "-"} <span class="sub-cnt">({len(s3)})</span></td>
        <td class="c-right nowrap">{fmt_rp(kr_rp) if kr_rp else "-"}</td>
        <td class="c-right bold nowrap">{fmt_rp(tot)}</td>
        <td class="c-right nowrap">{fmt_rp(avg)}</td>
        <td class="c-bar nowrap">
          <div class="bar-track"><div class="bar-fill" style="width:{bar_w}%"></div></div>
          <span class="bar-pct">{fmt_pct(tot / total_rp * 100)}</span>
        </td>
      </tr>
    """)

# Categories top 12 + Lainnya
cats = items_all["byCategory"]
tot_cat_rev = sum(int(float(c["totalRevenue"])) for c in cats)
cat_rows_html = []
for idx, c in enumerate(cats[:12], 1):
    rev = int(float(c["totalRevenue"]))
    cogs = round(float(c["estCogs"]))
    margin = rev - cogs
    qty = int(float(c["totalQty"]))
    pct = rev / tot_cat_rev * 100
    cat_rows_html.append(f"""
      <tr>
        <td class="c-center nowrap">{idx}</td>
        <td class="c-left bold">{c["categoryName"]}</td>
        <td class="c-right nowrap">{fmt_int(int(c["uniqueItems"]))}</td>
        <td class="c-right nowrap">{fmt_int(int(c["txCount"]))}</td>
        <td class="c-right nowrap">{fmt_int(qty)}</td>
        <td class="c-right bold nowrap">{fmt_rp(rev)}</td>
        <td class="c-right nowrap">{fmt_pct(pct)}</td>
        <td class="c-right nowrap">{fmt_rp(cogs)}</td>
        <td class="c-right nowrap">{fmt_rp(margin)}</td>
      </tr>
    """)
other_cats = cats[12:]
if other_cats:
    o_sku = sum(int(c["uniqueItems"]) for c in other_cats)
    o_tx = sum(int(c["txCount"]) for c in other_cats)
    o_qty = sum(int(float(c["totalQty"])) for c in other_cats)
    o_rev = sum(int(float(c["totalRevenue"])) for c in other_cats)
    o_cogs = sum(round(float(c["estCogs"])) for c in other_cats)
    o_mar = o_rev - o_cogs
    cat_rows_html.append(f"""
      <tr>
        <td class="c-center nowrap">13</td>
        <td class="c-left italic">{len(other_cats)} Kategori Lainnya (Gabungan)</td>
        <td class="c-right nowrap">{fmt_int(o_sku)}</td>
        <td class="c-right nowrap">{fmt_int(o_tx)}</td>
        <td class="c-right nowrap">{fmt_int(o_qty)}</td>
        <td class="c-right bold nowrap">{fmt_rp(o_rev)}</td>
        <td class="c-right nowrap">{fmt_pct(o_rev / tot_cat_rev * 100)}</td>
        <td class="c-right nowrap">{fmt_rp(o_cogs)}</td>
        <td class="c-right nowrap">{fmt_rp(o_mar)}</td>
      </tr>
    """)

# Top 16 Products
prod_rows_html = []
for idx, it in enumerate(items_all["topItemsByRevenue"][:16], 1):
    rev = int(float(it["totalRevenue"]))
    cogs = round(float(it["estCogs"]))
    uprice = int(float(it["unitPrice"]))
    qty = int(float(it["totalQty"]))
    prod_rows_html.append(f"""
      <tr>
        <td class="c-center nowrap">{idx}</td>
        <td class="c-left bold">{it["itemName"]}</td>
        <td class="c-left nowrap">{it["categoryName"]}</td>
        <td class="c-right nowrap">{fmt_int(int(it["txCount"]))}</td>
        <td class="c-right nowrap">{fmt_int(qty)}</td>
        <td class="c-right nowrap">{fmt_rp(uprice)}</td>
        <td class="c-right bold nowrap">{fmt_rp(rev)}</td>
        <td class="c-right nowrap">{fmt_rp(cogs)}</td>
      </tr>
    """)

# Top 20 Members across all 3 stores
member_agg = {}
for s in final_sales:
    nik = s["memberNik"]
    if not nik:
        continue
    if nik not in member_agg:
        member_agg[nik] = {
            "nik": nik,
            "name": nik_to_name.get(nik, s["customerName"] or f"NIK {nik}"),
            "txCount": 0, "s1Rp": 0, "s2Rp": 0, "s3Rp": 0, "kreditRp": 0, "totalRp": 0
        }
    gt = (s["grandTotalSen"] or 0) // 100
    member_agg[nik]["txCount"] += 1
    member_agg[nik]["totalRp"] += gt
    if s["companyId"] == 1: member_agg[nik]["s1Rp"] += gt
    elif s["companyId"] == 2: member_agg[nik]["s2Rp"] += gt
    elif s["companyId"] == 3: member_agg[nik]["s3Rp"] += gt
    if s["paymentType"] == "Kredit": member_agg[nik]["kreditRp"] += gt

sorted_members = sorted(member_agg.values(), key=lambda x: (-x["totalRp"], -x["txCount"], x["nik"]))
mem_rows_html = []
for idx, m in enumerate(sorted_members[:20], 1):
    avg_m = round(m["totalRp"] / m["txCount"])
    mem_rows_html.append(f"""
      <tr>
        <td class="c-center nowrap">{idx}</td>
        <td class="c-center mono nowrap">{m["nik"]}</td>
        <td class="c-left bold">{m["name"]}</td>
        <td class="c-right nowrap">{fmt_int(m["txCount"])}</td>
        <td class="c-right nowrap">{fmt_rp(m["s1Rp"]) if m["s1Rp"] else "-"}</td>
        <td class="c-right nowrap">{fmt_rp(m["s2Rp"]) if m["s2Rp"] else "-"}</td>
        <td class="c-right nowrap">{fmt_rp(m["s3Rp"]) if m["s3Rp"] else "-"}</td>
        <td class="c-right bold nowrap">{fmt_rp(m["totalRp"])}</td>
        <td class="c-right nowrap">{fmt_rp(avg_m)}</td>
      </tr>
    """)

html = f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Laporan Penjualan Konsolidasi Semua Toko KKISI · Oktober 2026</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 10mm 11mm 10mm 11mm;
  }}
  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 8.3pt;
    line-height: 1.28;
  }}
  .page {{
    height: 276mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    overflow: hidden;
  }}
  .page:last-child {{
    page-break-after: auto;
  }}
  .page-content {{
    flex: 1;
  }}
  .top-rule {{
    height: 4px;
    background: linear-gradient(90deg, #0f2942 0%, #0d9488 100%);
    margin-bottom: 7px;
    border-radius: 2px;
  }}
  .doc-header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 5px;
    margin-bottom: 8px;
  }}
  .doc-header h1 {{
    font-size: 15pt;
    font-weight: 800;
    color: #0f2942;
    margin: 0 0 2px 0;
    letter-spacing: -0.3px;
  }}
  .doc-header .subtitle {{
    font-size: 8.6pt;
    color: #0f766e;
    font-weight: 600;
    margin: 0;
  }}
  .doc-header .meta {{
    text-align: right;
    font-size: 7.3pt;
    color: #475569;
    line-height: 1.3;
    white-space: nowrap;
  }}
  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 8px;
  }}
  .kpi-card {{
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-top: 3px solid #0f2942;
    border-radius: 4px;
    padding: 5px 8px;
  }}
  .kpi-card.accent-teal {{
    border-top-color: #0d9488;
  }}
  .kpi-card.accent-amber {{
    border-top-color: #d97706;
  }}
  .kpi-label {{
    font-size: 6.9pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #475569;
    font-weight: 700;
    margin-bottom: 1px;
  }}
  .kpi-val {{
    font-size: 12.6pt;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 1px;
  }}
  .kpi-sub {{
    font-size: 7pt;
    color: #475569;
  }}
  h2.sec-title {{
    font-size: 9.1pt;
    font-weight: 700;
    color: #0f2942;
    margin: 6px 0 3px 0;
    padding-bottom: 2px;
    border-bottom: 1.5px solid #0f2942;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }}
  h2.sec-title span.sec-sub {{
    font-size: 7.2pt;
    font-weight: 400;
    color: #475569;
  }}
  .stacked-wrap {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 8px;
    margin-bottom: 6px;
  }}
  .stacked-title {{
    font-size: 7.4pt;
    font-weight: 700;
    color: #334155;
    margin-bottom: 3px;
  }}
  .stacked-bar {{
    display: flex;
    height: 11px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 3px;
  }}
  .sb-kredit {{ background: #0f2942; }}
  .sb-cash {{ background: #0d9488; }}
  .sb-qris {{ background: #f59e0b; }}
  .sb-legend {{
    display: flex;
    gap: 14px;
    font-size: 7.2pt;
    color: #334155;
  }}
  .dot {{
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 5px;
    font-size: 7.2pt;
  }}
  table.daily-table {{
    font-size: 6.7pt;
    margin-bottom: 4px;
  }}
  table.daily-table th {{
    padding: 2.8px 2px;
  }}
  table.daily-table td {{
    padding: 2px 2px;
  }}
  th {{
    background: #0f2942;
    color: #ffffff;
    font-weight: 700;
    padding: 3.2px 3.5px;
    border: 1px solid #0f2942;
    white-space: nowrap;
  }}
  td {{
    padding: 2.6px 3.5px;
    border-bottom: 1px solid #e2e8f0;
    color: #1e293b;
  }}
  tr:nth-child(even) td {{
    background: #f8fafc;
  }}
  tr.row-peak td {{
    background: #f0fdf4 !important;
  }}
  tr.tfoot td {{
    background: #dbeafe !important;
    font-weight: 700;
    color: #0f172a;
    border-top: 1.5px solid #0f2942;
    border-bottom: 2px double #0f2942;
    white-space: nowrap;
  }}
  .nowrap {{ white-space: nowrap; }}
  .c-left {{ text-align: left; }}
  .c-right {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .c-center {{ text-align: center; font-variant-numeric: tabular-nums; }}
  .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7pt; }}
  .bold {{ font-weight: 700; color: #0f172a; }}
  .italic {{ font-style: italic; color: #475569; }}
  .sub-cnt {{ font-size: 6.4pt; color: #64748b; }}
  .two-col {{
    display: grid;
    grid-template-columns: 48.5% 50%;
    justify-content: space-between;
  }}
  .c-bar {{
    width: 64px;
    vertical-align: middle;
  }}
  .bar-track {{
    display: inline-block;
    width: 22px;
    height: 6px;
    background: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
    vertical-align: middle;
    margin-right: 2px;
  }}
  .bar-fill {{
    height: 100%;
    background: #0d9488;
  }}
  .bar-pct {{
    font-size: 6.5pt;
    color: #475569;
    font-variant-numeric: tabular-nums;
  }}
  .callout {{
    background: #f8fafc;
    border-left: 3.5px solid #0d9488;
    border-top: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    padding: 5px 8px;
    border-radius: 0 4px 4px 0;
    margin-top: 3px;
    font-size: 7.3pt;
    line-height: 1.32;
  }}
  .callout.warn {{
    background: #fffbeb;
    border-left-color: #d97706;
    border-color: #fde68a;
    border-left-width: 3.5px;
  }}
  .callout ul {{
    margin: 2px 0 0 0;
    padding-left: 15px;
  }}
  .callout li {{
    margin-bottom: 1.5px;
  }}
  .page-footer {{
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7.1pt;
    color: #64748b;
  }}
</style>
</head>
<body>

<!-- ==================== PAGE 1 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Laporan Penjualan Konsolidasi · Seluruh Toko KKISI</h1>
        <p class="subtitle">Koperasi Karyawan Indomobil Suzuki Internasional (S-MART TB II Tambun · TB II Kp. Bulu · GIIC Cikarang)</p>
      </div>
      <div class="meta">
        <strong>Periode:</strong> 1 – 31 Oktober 2026 (1 Bulan Penuh)<br/>
        <strong>Sumber Data:</strong> https://smart.kkisitb2.id/sales<br/>
        <strong>Cakupan:</strong> 3 Cabang Toko (company_id = 1, 2, 3)
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Omzet Konsolidasi (Final)</div>
        <div class="kpi-val">Rp 471.375.000</div>
        <div class="kpi-sub">Dibayar Rp 488.675.500 · Kembalian Rp 17.300.500</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kpi-label">Total Struk Transaksi (Final)</div>
        <div class="kpi-val">6.576 Struk</div>
        <div class="kpi-sub">TB II: 2.674 · Kp.Bulu: 1.953 · GIIC: 1.949 (+71 Quo)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rata-Rata Nilai Belanja</div>
        <div class="kpi-val">Rp 71.681 / struk</div>
        <div class="kpi-sub">Rata-rata Rp 15.205.645 / hari (31 hari aktif)</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kpi-label">Dominasi Kredit Anggota</div>
        <div class="kpi-val">85,06% Omzet</div>
        <div class="kpi-sub">Rp 400.961.500 (4.019 struk potong gaji)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Volume Produk Terjual</div>
        <div class="kpi-val">33.066 Unit</div>
        <div class="kpi-sub">20.717 baris item · 62 kategori barang</div>
      </div>
      <div class="kpi-card accent-amber">
        <div class="kpi-label">Pelanggan Anggota Aktif</div>
        <div class="kpi-val">737 NIK Unik</div>
        <div class="kpi-sub">4.123 struk anggota (86,09% total omzet)</div>
      </div>
    </div>

    <div class="stacked-wrap">
      <div class="stacked-title">Proporsi Kontribusi Omzet per Cabang Toko (Total Rp 471.375.000)</div>
      <div class="stacked-bar">
        <div class="sb-kredit" style="width: 39.96%"></div>
        <div class="sb-cash" style="width: 36.57%"></div>
        <div class="sb-qris" style="width: 23.46%"></div>
      </div>
      <div class="sb-legend">
        <span><i class="dot sb-kredit"></i><strong>TOKO S-MART TB II (Tambun):</strong> Rp 188.383.500 (39,96% · 2.674 struk)</span>
        <span><i class="dot sb-cash"></i><strong>TOKO S-MART TB II (Kp. Bulu):</strong> Rp 172.395.500 (36,57% · 1.953 struk)</span>
        <span><i class="dot sb-qris"></i><strong>TOKO S-MART GIIC (Cikarang):</strong> Rp 110.596.000 (23,46% · 1.949 struk)</span>
      </div>
    </div>

    <h2 class="sec-title">1. Perbandingan Kinerja per Cabang Toko <span class="sec-sub">Transaksi Berstatus Final (Oktober 2026)</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-left">Cabang / Nama Toko</th>
          <th class="c-right">Struk (% Porsi)</th>
          <th class="c-right">Omzet Kredit</th>
          <th class="c-right">Omzet Cash</th>
          <th class="c-right">Omzet QRIS</th>
          <th class="c-right">Total Omzet</th>
          <th class="c-right">% Omzet</th>
          <th class="c-right">Rata-Rata</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="c-left bold nowrap">1. TOKO S-MART TB II (Tambun)</td>
          <td class="c-right nowrap">2.674 (40,66%)</td>
          <td class="c-right nowrap">Rp 165.397.500</td>
          <td class="c-right nowrap">Rp 18.567.500</td>
          <td class="c-right nowrap">Rp 4.418.500</td>
          <td class="c-right bold nowrap">Rp 188.383.500</td>
          <td class="c-right nowrap">39,96%</td>
          <td class="c-right nowrap">Rp 70.450</td>
        </tr>
        <tr>
          <td class="c-left bold nowrap">2. TOKO S-MART TB II (Kp. Bulu)</td>
          <td class="c-right nowrap">1.953 (29,70%)</td>
          <td class="c-right nowrap">Rp 135.066.000</td>
          <td class="c-right nowrap">Rp 35.178.500</td>
          <td class="c-right nowrap">Rp 2.151.000</td>
          <td class="c-right bold nowrap">Rp 172.395.500</td>
          <td class="c-right nowrap">36,57%</td>
          <td class="c-right nowrap">Rp 88.272</td>
        </tr>
        <tr>
          <td class="c-left bold nowrap">3. TOKO S-MART GIIC (Cikarang)</td>
          <td class="c-right nowrap">1.949 (29,64%)</td>
          <td class="c-right nowrap">Rp 100.498.000</td>
          <td class="c-right nowrap">Rp 10.098.000</td>
          <td class="c-right nowrap">Rp 0</td>
          <td class="c-right bold nowrap">Rp 110.596.000</td>
          <td class="c-right nowrap">23,46%</td>
          <td class="c-right nowrap">Rp 56.745</td>
        </tr>
        <tr class="tfoot">
          <td class="c-left">TOTAL KONSOLIDASI 3 TOKO</td>
          <td class="c-right">6.576 (100,00%)</td>
          <td class="c-right">Rp 400.961.500</td>
          <td class="c-right">Rp 63.844.000</td>
          <td class="c-right">Rp 6.569.500</td>
          <td class="c-right">Rp 471.375.000</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 71.681</td>
        </tr>
      </tbody>
    </table>

    <h2 class="sec-title">2. Rekapitulasi Metode Pembayaran Konsolidasi <span class="sec-sub">Seluruh Toko (1 – 31 Oktober 2026)</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-left">Metode Pembayaran</th>
          <th class="c-right">Jml Struk</th>
          <th class="c-right">% Struk</th>
          <th class="c-right">Total Penjualan</th>
          <th class="c-right">% Omzet</th>
          <th class="c-right">Total Diterima</th>
          <th class="c-right">Rata-Rata / Struk</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="c-left bold">Kredit (Potong Gaji Anggota)</td>
          <td class="c-right nowrap">4.019</td>
          <td class="c-right nowrap">61,12%</td>
          <td class="c-right bold nowrap">Rp 400.961.500</td>
          <td class="c-right nowrap">85,06%</td>
          <td class="c-right nowrap">Rp 400.961.500</td>
          <td class="c-right nowrap">Rp 99.766</td>
        </tr>
        <tr>
          <td class="c-left bold">Cash (Tunai di Kasir)</td>
          <td class="c-right nowrap">2.372</td>
          <td class="c-right nowrap">36,07%</td>
          <td class="c-right bold nowrap">Rp 63.844.000</td>
          <td class="c-right nowrap">13,54%</td>
          <td class="c-right nowrap">Rp 81.144.500</td>
          <td class="c-right nowrap">Rp 26.916</td>
        </tr>
        <tr>
          <td class="c-left bold">QRIS (Pembayaran Digital · TB II & Kp. Bulu)</td>
          <td class="c-right nowrap">185</td>
          <td class="c-right nowrap">2,81%</td>
          <td class="c-right bold nowrap">Rp 6.569.500</td>
          <td class="c-right nowrap">1,39%</td>
          <td class="c-right nowrap">Rp 6.569.500</td>
          <td class="c-right nowrap">Rp 35.511</td>
        </tr>
        <tr class="tfoot">
          <td class="c-left">TOTAL PENJUALAN FINAL SELURUH TOKO</td>
          <td class="c-right">6.576</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 471.375.000</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 488.675.500</td>
          <td class="c-right">Rp 71.681</td>
        </tr>
      </tbody>
    </table>

    <div class="two-col">
      <div>
        <h2 class="sec-title">3. Tren Mingguan Konsolidasi</h2>
        <table>
          <thead>
            <tr>
              <th class="c-left">Periode Minggu</th>
              <th class="c-right">Struk</th>
              <th class="c-right">Total Omzet</th>
              <th class="c-right">Porsi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="c-left bold nowrap">Minggu 1 (01–04 Okt)</td>
              <td class="c-right nowrap">864</td>
              <td class="c-right bold nowrap">Rp 118.431.000</td>
              <td class="c-right nowrap">25,12%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 2 (05–11 Okt)</td>
              <td class="c-right nowrap">1.466</td>
              <td class="c-right bold nowrap">Rp 119.515.500</td>
              <td class="c-right nowrap">25,35%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 3 (12–18 Okt)</td>
              <td class="c-right nowrap">1.491</td>
              <td class="c-right bold nowrap">Rp 93.456.000</td>
              <td class="c-right nowrap">19,83%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 4 (19–25 Okt)</td>
              <td class="c-right nowrap">1.454</td>
              <td class="c-right bold nowrap">Rp 79.136.000</td>
              <td class="c-right nowrap">16,79%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 5 (26–31 Okt)</td>
              <td class="c-right nowrap">1.301</td>
              <td class="c-right bold nowrap">Rp 60.836.500</td>
              <td class="c-right nowrap">12,91%</td>
            </tr>
            <tr class="tfoot">
              <td class="c-left">TOTAL 5 MINGGU</td>
              <td class="c-right">6.576</td>
              <td class="c-right">Rp 471.375.000</td>
              <td class="c-right">100,00%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h2 class="sec-title">4. Kinerja 6 Operator Kasir</h2>
        <table>
          <thead>
            <tr>
              <th class="c-left">Operator</th>
              <th class="c-left">Cabang</th>
              <th class="c-right">Struk</th>
              <th class="c-right">Total Omzet</th>
              <th class="c-right">Porsi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="c-left bold nowrap">KHAILA</td>
              <td class="c-left nowrap">TB II Tambun</td>
              <td class="c-right nowrap">2.000</td>
              <td class="c-right bold nowrap">Rp 131.266.000</td>
              <td class="c-right nowrap">27,85%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Lia</td>
              <td class="c-left nowrap">GIIC Cikarang</td>
              <td class="c-right nowrap">1.949</td>
              <td class="c-right bold nowrap">Rp 110.596.000</td>
              <td class="c-right nowrap">23,46%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">ade</td>
              <td class="c-left nowrap">TB II & Kp.Bulu</td>
              <td class="c-right nowrap">463</td>
              <td class="c-right bold nowrap">Rp 94.828.500</td>
              <td class="c-right nowrap">20,12%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">SONIA</td>
              <td class="c-left nowrap">TB II Kp.Bulu</td>
              <td class="c-right nowrap">1.530</td>
              <td class="c-right bold nowrap">Rp 87.986.000</td>
              <td class="c-right nowrap">18,67%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Didin</td>
              <td class="c-left nowrap">TB II Tambun</td>
              <td class="c-right nowrap">460</td>
              <td class="c-right bold nowrap">Rp 30.709.000</td>
              <td class="c-right nowrap">6,51%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Ridho</td>
              <td class="c-left nowrap">TB II Kp.Bulu</td>
              <td class="c-right nowrap">174</td>
              <td class="c-right bold nowrap">Rp 15.989.500</td>
              <td class="c-right nowrap">3,39%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="callout">
      <strong>Sorotan Eksekutif Konsolidasi 3 Toko (Oktober 2026):</strong>
      <ul>
        <li><strong>Distribusi Omzet Cabang:</strong> <strong>TOKO S-MART TB II Tambun</strong> menyumbang omzet terbesar (Rp 188,38 juta · 39,96%), disusul ketat oleh <strong>TOKO S-MART TB II Kp. Bulu</strong> (Rp 172,40 juta · 36,57% dengan nilai rata-rata struk tertinggi Rp 88.272), dan <strong>TOKO S-MART GIIC Cikarang</strong> (Rp 110,60 juta · 23,46%).</li>
        <li><strong>Karakteristik Belanja Cabang:</strong> Cabang Kp. Bulu memiliki porsi transaksi Tunai tertinggi (1.452 struk senilai Rp 35,18 juta) sekaligus rata-rata belanja Kredit terbesar (Rp 307.667/struk untuk paket sembako bulanan anggota), sedangkan TB II Tambun dan GIIC didominasi transaksi harian anggota di lingkungan pabrik.</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Konsolidasi · Seluruh Toko KKISI (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 1 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 2 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Rincian & Tren Penjualan Harian Konsolidasi (1 – 31 Oktober 2026)</h1>
        <p class="subtitle">Rekapitulasi Harian Transaksi Final per Cabang Toko (TB II Tambun · TB II Kp. Bulu · GIIC Cikarang)</p>
      </div>
      <div class="meta">
        <strong>Hari Aktif Gabungan:</strong> 31 Hari Kalender<br/>
        <strong>Total Omzet:</strong> Rp 471.375.000 (6.576 struk)
      </div>
    </div>

    <table class="daily-table">
      <thead>
        <tr>
          <th class="c-center" style="width:38px">Tgl</th>
          <th class="c-left" style="width:42px">Hari</th>
          <th class="c-right" style="width:34px">Struk</th>
          <th class="c-right">TB II Tambun</th>
          <th class="c-right">TB II Kp. Bulu</th>
          <th class="c-right">GIIC Cikarang</th>
          <th class="c-right">Total Kredit</th>
          <th class="c-right">Total Gabungan</th>
          <th class="c-right">Rata-Rata</th>
          <th class="c-left" style="width:76px">Porsi</th>
        </tr>
      </thead>
      <tbody>
        {"".join(daily_rows)}
        <tr class="tfoot">
          <td class="c-center" colspan="2">TOTAL 31 HARI</td>
          <td class="c-right">6.576</td>
          <td class="c-right">Rp 188.383.500</td>
          <td class="c-right">Rp 172.395.500</td>
          <td class="c-right">Rp 110.596.000</td>
          <td class="c-right">Rp 400.961.500</td>
          <td class="c-right">Rp 471.375.000</td>
          <td class="c-right">Rp 71.681</td>
          <td class="c-right">100,00%</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Konsolidasi · Seluruh Toko KKISI (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 2 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 3 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Analisis Kategori Barang & Produk Terlaris (Seluruh Toko)</h1>
        <p class="subtitle">Evaluasi Penjualan per Kategori (62 Kategori) dan 16 Produk Kontributor Omzet Terbesar Lintas Cabang · Oktober 2026</p>
      </div>
      <div class="meta">
        <strong>Total Unit Terjual:</strong> 33.066 pcs<br/>
        <strong>Total Baris Item:</strong> 20.717 baris
      </div>
    </div>

    <h2 class="sec-title">5. Rekapitulasi Penjualan per Kategori Barang Konsolidasi <span class="sec-sub">Berdasarkan Baris Detail Item (db_salesitems)</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:24px">#</th>
          <th class="c-left">Kategori Produk</th>
          <th class="c-right">SKU</th>
          <th class="c-right">Jml Struk</th>
          <th class="c-right">Qty</th>
          <th class="c-right">Total Penjualan</th>
          <th class="c-right">Porsi</th>
          <th class="c-right">Estimasi HPP</th>
          <th class="c-right">Est. Margin Kotor</th>
        </tr>
      </thead>
      <tbody>
        {"".join(cat_rows_html)}
        <tr class="tfoot">
          <td class="c-center" colspan="2">TOTAL BARIS ITEM (62 KATEGORI · 3 TOKO)</td>
          <td class="c-right">{fmt_int(sum(int(c["uniqueItems"]) for c in cats))}</td>
          <td class="c-right">6.574</td>
          <td class="c-right">33.066</td>
          <td class="c-right">Rp 472.913.500</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 406.399.630</td>
          <td class="c-right">Rp 66.513.870</td>
        </tr>
      </tbody>
    </table>

    <h2 class="sec-title">6. Top 16 Produk Terlaris Berdasarkan Nilai Penjualan <span class="sec-sub">Konsolidasi 3 Toko · 1 – 31 Oktober 2026</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:24px">#</th>
          <th class="c-left">Nama Produk</th>
          <th class="c-left">Kategori</th>
          <th class="c-right">Frekuensi Struk</th>
          <th class="c-right">Total Qty</th>
          <th class="c-right">Harga Satuan</th>
          <th class="c-right">Total Penjualan</th>
          <th class="c-right">Estimasi HPP</th>
        </tr>
      </thead>
      <tbody>
        {"".join(prod_rows_html)}
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Konsolidasi · Seluruh Toko KKISI (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 3 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 4 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Top 20 Anggota Pembelanja Terbesar & Catatan Audit Data</h1>
        <p class="subtitle">Partisipasi Belanja 737 Anggota Unik Lintas 3 Cabang Toko & Rekonsiliasi Status Data POS · Oktober 2026</p>
      </div>
      <div class="meta">
        <strong>Anggota Aktif:</strong> 737 NIK Unik<br/>
        <strong>Omzet Anggota:</strong> Rp 405.818.500 (86,09%)
      </div>
    </div>

    <h2 class="sec-title">7. Peringkat 20 Anggota Koperasi dengan Nilai Belanja Terbesar <span class="sec-sub">Dari Total 737 Anggota Unik Lintas 3 Toko</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:24px">#</th>
          <th class="c-center">NIK</th>
          <th class="c-left">Nama Lengkap Anggota</th>
          <th class="c-right">Struk</th>
          <th class="c-right">TB II Tambun</th>
          <th class="c-right">TB II Kp. Bulu</th>
          <th class="c-right">GIIC Cikarang</th>
          <th class="c-right">Total Belanja</th>
          <th class="c-right">Rata-Rata</th>
        </tr>
      </thead>
      <tbody>
        {"".join(mem_rows_html)}
      </tbody>
    </table>

    <h2 class="sec-title">8. Perbandingan Segmen Pelanggan (Anggota vs Pelanggan Umum)</h2>
    <table>
      <thead>
        <tr>
          <th class="c-left">Segmen Pelanggan</th>
          <th class="c-right">Jml Struk</th>
          <th class="c-right">% Struk</th>
          <th class="c-right">Total Penjualan</th>
          <th class="c-right">% Omzet</th>
          <th class="c-right">Rata-Rata</th>
          <th class="c-left">Distribusi Cabang</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="c-left bold nowrap">Anggota Koperasi (NIK)</td>
          <td class="c-right nowrap">4.123</td>
          <td class="c-right nowrap">62,70%</td>
          <td class="c-right bold nowrap">Rp 405.818.500</td>
          <td class="c-right nowrap">86,09%</td>
          <td class="c-right nowrap">Rp 98.428</td>
          <td class="c-left nowrap">TB II: 483 · Kp.Bulu: 208 · GIIC: 237 NIK</td>
        </tr>
        <tr>
          <td class="c-left bold nowrap">Pelanggan Umum (Non-NIK)</td>
          <td class="c-right nowrap">2.453</td>
          <td class="c-right nowrap">37,30%</td>
          <td class="c-right bold nowrap">Rp 65.556.500</td>
          <td class="c-right nowrap">13,91%</td>
          <td class="c-right nowrap">Rp 26.725</td>
          <td class="c-left nowrap">TB II: 535 · Kp.Bulu: 1.503 · GIIC: 415 struk</td>
        </tr>
        <tr class="tfoot">
          <td class="c-left">TOTAL KESELURUHAN (3 TOKO)</td>
          <td class="c-right">6.576</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 471.375.000</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 71.681</td>
          <td class="c-left">Total 737 NIK Anggota Unik Lintas Toko</td>
        </tr>
      </tbody>
    </table>

    <div class="callout warn">
      <strong>Catatan Audit Data, Retur, & Rekonsiliasi Sistem (Oktober 2026):</strong>
      <ul>
        <li><strong>2 Transaksi Retur Penjualan (Rp 9.500):</strong> Tercatat di cabang <strong>TOKO S-MART TB II (Kp. Bulu)</strong> oleh operator SONIA: <code>RTN-MJ26101300001</code> (13 Okt 2026, Rp 7.500) dan <code>RTN-MJ26101400002</code> (14 Okt 2026, Rp 2.000).</li>
        <li><strong>6 Struk Final Berstatus Pembayaran 'Unpaid':</strong> Seluruhnya merupakan transaksi <code>Cash</code> dengan <code>paid_amount = grand_total</code>: 4 struk di TB II Tambun (<code>TBII26100100089</code> Rp 999.000, <code>TBII26100500396</code> Rp 229.000, dan duplikat <code>TBII26100500461</code> ID 244801 & 244802 @ Rp 72.000) serta 2 struk duplikat di TB II Kp. Bulu (<code>MJ26101601182</code> ID 247708 & 247709 @ Rp 206.000 pada 16 Okt 2026).</li>
        <li><strong>71 Struk Berstatus 'Quotation' (Nilai Rp 0):</strong> Terdiri dari 37 struk di TB II Tambun, 14 struk di TB II Kp. Bulu, dan 20 struk di GIIC Cikarang. Seluruhnya dipisahkan pada Sheet 6 file Excel agar tidak mencemari perhitungan omzet Final.</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Konsolidasi · Seluruh Toko KKISI (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 4 dari 4</span>
  </div>
</div>

</body>
</html>
"""

with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(html)

print("Generated HTML:", HTML_PATH)
