#!/usr/bin/env python3
import json
from datetime import datetime

SCRATCH_DIR = "/Users/macbookprom2/.gemini/antigravity/brain/982b6306-214b-4d05-9e90-eded7ad72f5d/scratch"
HTML_PATH = f"{SCRATCH_DIR}/report_oktober_2026.html"

with open(f"{SCRATCH_DIR}/october_sales.json", "r", encoding="utf-8") as f:
    all_sales = json.load(f)

with open(f"{SCRATCH_DIR}/nik_to_name.json", "r", encoding="utf-8") as f:
    nik_to_name = json.load(f)

with open(f"{SCRATCH_DIR}/october_items_summary.json", "r", encoding="utf-8") as f:
    items_summary = json.load(f)

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
max_daily_rp = 17539000
for d in range(1, 32):
    d_str = f"2026-10-{d:02d}"
    dt = datetime.strptime(d_str, "%Y-%m-%d")
    d_name = ID_DAYS[dt.weekday()]
    df = [s for s in final_sales if s["saleDate"] == d_str]
    kr = [s for s in df if s["paymentType"] == "Kredit"]
    ca = [s for s in df if s["paymentType"] == "Cash"]
    qr = [s for s in df if s["paymentType"] == "QRIS"]
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in kr)
    ca_rp = sum((s["grandTotalSen"] or 0) // 100 for s in ca)
    qr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in qr)
    tot = kr_rp + ca_rp + qr_rp
    cnt = len(df)
    avg = round(tot / cnt) if cnt else 0
    bar_w = round((tot / max_daily_rp) * 100, 1) if tot > 0 else 0
    is_off = cnt == 0
    tr_cls = 'class="row-off"' if is_off else ('class="row-peak"' if tot >= 12000000 else "")
    daily_rows.append(f"""
      <tr {tr_cls}>
        <td class="c-center mono nowrap">{d:02d} Okt</td>
        <td class="c-left nowrap">{d_name}</td>
        <td class="c-right nowrap">{fmt_int(cnt) if cnt else "-"}</td>
        <td class="c-right nowrap">{fmt_rp(kr_rp) if kr_rp else "-"} <span class="sub-cnt">({len(kr)})</span></td>
        <td class="c-right nowrap">{fmt_rp(ca_rp) if ca_rp else "-"} <span class="sub-cnt">({len(ca)})</span></td>
        <td class="c-right nowrap">{fmt_rp(qr_rp) if qr_rp else "-"} <span class="sub-cnt">({len(qr)})</span></td>
        <td class="c-right bold nowrap">{fmt_rp(tot) if tot else "Tutup"}</td>
        <td class="c-right nowrap">{fmt_rp(avg) if avg else "-"}</td>
        <td class="c-bar nowrap">
          <div class="bar-track"><div class="bar-fill" style="width:{bar_w}%"></div></div>
          <span class="bar-pct">{fmt_pct(tot / total_rp * 100) if tot else "-"}</span>
        </td>
      </tr>
    """)

# Categories top 12 + Lainnya
cats = items_summary["byCategory"]
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
        <td class="c-left italic">15 Kategori Lainnya (Gabungan)</td>
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
for idx, it in enumerate(items_summary["topItemsByRevenue"][:16], 1):
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

# Top 20 Members
member_agg = {}
for s in final_sales:
    nik = s["memberNik"]
    if not nik:
        continue
    if nik not in member_agg:
        member_agg[nik] = {
            "nik": nik,
            "name": nik_to_name.get(nik, s["customerName"] or f"NIK {nik}"),
            "txCount": 0, "kreditRp": 0, "cashRp": 0, "qrisRp": 0, "totalRp": 0
        }
    gt = (s["grandTotalSen"] or 0) // 100
    member_agg[nik]["txCount"] += 1
    member_agg[nik]["totalRp"] += gt
    if s["paymentType"] == "Kredit": member_agg[nik]["kreditRp"] += gt
    elif s["paymentType"] == "Cash": member_agg[nik]["cashRp"] += gt
    elif s["paymentType"] == "QRIS": member_agg[nik]["qrisRp"] += gt

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
        <td class="c-right nowrap">{fmt_rp(m["kreditRp"]) if m["kreditRp"] else "-"}</td>
        <td class="c-right nowrap">{fmt_rp(m["cashRp"] + m["qrisRp"]) if (m["cashRp"] + m["qrisRp"]) else "-"}</td>
        <td class="c-right bold nowrap">{fmt_rp(m["totalRp"])}</td>
        <td class="c-right nowrap">{fmt_rp(avg_m)}</td>
      </tr>
    """)

html = f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Laporan Penjualan TOKO KKISITB2 · Oktober 2026</title>
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
    font-size: 8.4pt;
    line-height: 1.3;
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
    margin-bottom: 8px;
    border-radius: 2px;
  }}
  .doc-header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 6px;
    margin-bottom: 9px;
  }}
  .doc-header h1 {{
    font-size: 15.5pt;
    font-weight: 800;
    color: #0f2942;
    margin: 0 0 2px 0;
    letter-spacing: -0.3px;
  }}
  .doc-header .subtitle {{
    font-size: 8.8pt;
    color: #0f766e;
    font-weight: 600;
    margin: 0;
  }}
  .doc-header .meta {{
    text-align: right;
    font-size: 7.4pt;
    color: #475569;
    line-height: 1.3;
    white-space: nowrap;
  }}
  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
    margin-bottom: 9px;
  }}
  .kpi-card {{
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-top: 3px solid #0f2942;
    border-radius: 4px;
    padding: 6px 9px;
  }}
  .kpi-card.accent-teal {{
    border-top-color: #0d9488;
  }}
  .kpi-card.accent-amber {{
    border-top-color: #d97706;
  }}
  .kpi-label {{
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #475569;
    font-weight: 700;
    margin-bottom: 1px;
  }}
  .kpi-val {{
    font-size: 13pt;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 1px;
  }}
  .kpi-sub {{
    font-size: 7.1pt;
    color: #475569;
  }}
  h2.sec-title {{
    font-size: 9.4pt;
    font-weight: 700;
    color: #0f2942;
    margin: 8px 0 4px 0;
    padding-bottom: 2px;
    border-bottom: 1.5px solid #0f2942;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }}
  h2.sec-title span.sec-sub {{
    font-size: 7.4pt;
    font-weight: 400;
    color: #475569;
  }}
  .stacked-wrap {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 6px 9px;
    margin-bottom: 8px;
  }}
  .stacked-title {{
    font-size: 7.6pt;
    font-weight: 700;
    color: #334155;
    margin-bottom: 4px;
  }}
  .stacked-bar {{
    display: flex;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 4px;
  }}
  .sb-kredit {{ background: #0f2942; }}
  .sb-cash {{ background: #0d9488; }}
  .sb-qris {{ background: #f59e0b; }}
  .sb-legend {{
    display: flex;
    gap: 14px;
    font-size: 7.4pt;
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
    margin-bottom: 7px;
    font-size: 7.6pt;
  }}
  table.daily-table {{
    font-size: 7.3pt;
    margin-bottom: 4px;
  }}
  table.daily-table th {{
    padding: 3.2px 3px;
  }}
  table.daily-table td {{
    padding: 2.2px 3px;
  }}
  th {{
    background: #0f2942;
    color: #ffffff;
    font-weight: 700;
    padding: 3.8px 4.5px;
    border: 1px solid #0f2942;
    white-space: nowrap;
  }}
  td {{
    padding: 3px 4.5px;
    border-bottom: 1px solid #e2e8f0;
    color: #1e293b;
  }}
  tr:nth-child(even) td {{
    background: #f8fafc;
  }}
  tr.row-off td {{
    background: #f1f5f9 !important;
    color: #94a3b8;
    font-style: italic;
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
  .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7.2pt; }}
  .bold {{ font-weight: 700; color: #0f172a; }}
  .italic {{ font-style: italic; color: #475569; }}
  .sub-cnt {{ font-size: 6.7pt; color: #64748b; }}
  .two-col {{
    display: grid;
    grid-template-columns: 43.5% 55%;
    justify-content: space-between;
  }}
  .c-bar {{
    width: 82px;
    vertical-align: middle;
  }}
  .bar-track {{
    display: inline-block;
    width: 34px;
    height: 6.5px;
    background: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
    vertical-align: middle;
    margin-right: 3px;
  }}
  .bar-fill {{
    height: 100%;
    background: #0d9488;
  }}
  .bar-pct {{
    font-size: 6.9pt;
    color: #475569;
    font-variant-numeric: tabular-nums;
  }}
  .callout {{
    background: #f8fafc;
    border-left: 3.5px solid #0d9488;
    border-top: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    padding: 6px 9px;
    border-radius: 0 4px 4px 0;
    margin-top: 4px;
    font-size: 7.5pt;
    line-height: 1.35;
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
    margin-bottom: 2px;
  }}
  .page-footer {{
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7.2pt;
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
        <h1>Laporan Penjualan TOKO KKISITB2</h1>
        <p class="subtitle">Koperasi Karyawan Indomobil Suzuki Internasional (Koperasi Suzuki Mart) · Periode Oktober 2026</p>
      </div>
      <div class="meta">
        <strong>Periode:</strong> 1 – 31 Oktober 2026 (1 Bulan Penuh)<br/>
        <strong>Sumber Data:</strong> https://smart.kkisitb2.id/sales<br/>
        <strong>Status Data:</strong> Terverifikasi (company_id = 1)
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Omzet Penjualan (Final)</div>
        <div class="kpi-val">Rp 188.383.500</div>
        <div class="kpi-sub">Dibayar Rp 192.344.500 · Kembalian Rp 3.961.000</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kpi-label">Total Struk Transaksi (Final)</div>
        <div class="kpi-val">2.674 Struk</div>
        <div class="kpi-sub">100% Kanal POS · +37 Quotation (Rp 0)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rata-Rata Nilai Belanja</div>
        <div class="kpi-val">Rp 70.450 / struk</div>
        <div class="kpi-sub">Rata-rata Rp 7.245.519 / hari (26 hari aktif)</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kpi-label">Dominasi Kredit Anggota</div>
        <div class="kpi-val">87,80% Omzet</div>
        <div class="kpi-sub">Rp 165.397.500 (2.046 struk potong gaji)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Volume Produk Terjual</div>
        <div class="kpi-val">11.756 Unit</div>
        <div class="kpi-sub">7.254 baris item · 27 kategori barang</div>
      </div>
      <div class="kpi-card accent-amber">
        <div class="kpi-label">Pelanggan Anggota Aktif</div>
        <div class="kpi-val">483 NIK Unik</div>
        <div class="kpi-sub">2.139 struk anggota (89,56% total omzet)</div>
      </div>
    </div>

    <div class="stacked-wrap">
      <div class="stacked-title">Proporsi Nilai Omzet Berdasarkan Metode Pembayaran (Total Rp 188.383.500)</div>
      <div class="stacked-bar">
        <div class="sb-kredit" style="width: 87.80%"></div>
        <div class="sb-cash" style="width: 9.86%"></div>
        <div class="sb-qris" style="width: 2.35%"></div>
      </div>
      <div class="sb-legend">
        <span><i class="dot sb-kredit"></i><strong>Kredit (Potong Gaji):</strong> Rp 165.397.500 (87,80% · 2.046 struk)</span>
        <span><i class="dot sb-cash"></i><strong>Cash (Tunai):</strong> Rp 18.567.500 (9,86% · 505 struk)</span>
        <span><i class="dot sb-qris"></i><strong>QRIS (Non-Tunai):</strong> Rp 4.418.500 (2,35% · 123 struk)</span>
      </div>
    </div>

    <h2 class="sec-title">1. Rekapitulasi per Metode Pembayaran <span class="sec-sub">Transaksi Berstatus Final</span></h2>
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
          <td class="c-right nowrap">2.046</td>
          <td class="c-right nowrap">76,51%</td>
          <td class="c-right bold nowrap">Rp 165.397.500</td>
          <td class="c-right nowrap">87,80%</td>
          <td class="c-right nowrap">Rp 165.397.500</td>
          <td class="c-right nowrap">Rp 80.839</td>
        </tr>
        <tr>
          <td class="c-left bold">Cash (Tunai di Kasir)</td>
          <td class="c-right nowrap">505</td>
          <td class="c-right nowrap">18,89%</td>
          <td class="c-right bold nowrap">Rp 18.567.500</td>
          <td class="c-right nowrap">9,86%</td>
          <td class="c-right nowrap">Rp 22.528.500</td>
          <td class="c-right nowrap">Rp 36.767</td>
        </tr>
        <tr>
          <td class="c-left bold">QRIS (Pembayaran Digital · Aktif 14 Okt)</td>
          <td class="c-right nowrap">123</td>
          <td class="c-right nowrap">4,60%</td>
          <td class="c-right bold nowrap">Rp 4.418.500</td>
          <td class="c-right nowrap">2,35%</td>
          <td class="c-right nowrap">Rp 4.418.500</td>
          <td class="c-right nowrap">Rp 35.923</td>
        </tr>
        <tr class="tfoot">
          <td class="c-left">TOTAL PENJUALAN FINAL OKTOBER 2026</td>
          <td class="c-right">2.674</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 188.383.500</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 192.344.500</td>
          <td class="c-right">Rp 70.450</td>
        </tr>
      </tbody>
    </table>

    <div class="two-col">
      <div>
        <h2 class="sec-title">2. Tren Mingguan (Oktober 2026)</h2>
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
              <td class="c-right nowrap">339</td>
              <td class="c-right bold nowrap">Rp 41.861.000</td>
              <td class="c-right nowrap">22,22%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 2 (05–11 Okt)</td>
              <td class="c-right nowrap">615</td>
              <td class="c-right bold nowrap">Rp 50.868.500</td>
              <td class="c-right nowrap">27,00%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 3 (12–18 Okt)</td>
              <td class="c-right nowrap">600</td>
              <td class="c-right bold nowrap">Rp 38.849.000</td>
              <td class="c-right nowrap">20,62%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 4 (19–25 Okt)</td>
              <td class="c-right nowrap">601</td>
              <td class="c-right bold nowrap">Rp 32.054.500</td>
              <td class="c-right nowrap">17,02%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Minggu 5 (26–31 Okt)</td>
              <td class="c-right nowrap">519</td>
              <td class="c-right bold nowrap">Rp 24.750.500</td>
              <td class="c-right nowrap">13,14%</td>
            </tr>
            <tr class="tfoot">
              <td class="c-left">TOTAL 5 MINGGU</td>
              <td class="c-right">2.674</td>
              <td class="c-right">Rp 188.383.500</td>
              <td class="c-right">100,00%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h2 class="sec-title">3. Kinerja Operator & Mesin Kasir</h2>
        <table>
          <thead>
            <tr>
              <th class="c-left">Operator / Kasir</th>
              <th class="c-right">Struk</th>
              <th class="c-right">KRS01/02</th>
              <th class="c-right">Total Omzet</th>
              <th class="c-right">Porsi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="c-left bold nowrap">KHAILA (Operator)</td>
              <td class="c-right nowrap">2.000</td>
              <td class="c-right nowrap">1.984/16</td>
              <td class="c-right bold nowrap">Rp 131.266.000</td>
              <td class="c-right nowrap">69,68%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">Didin (Operator)</td>
              <td class="c-right nowrap">460</td>
              <td class="c-right nowrap">341/119</td>
              <td class="c-right bold nowrap">Rp 30.709.000</td>
              <td class="c-right nowrap">16,30%</td>
            </tr>
            <tr>
              <td class="c-left bold nowrap">ade (Operator)</td>
              <td class="c-right nowrap">214</td>
              <td class="c-right nowrap">154/60</td>
              <td class="c-right bold nowrap">Rp 26.408.500</td>
              <td class="c-right nowrap">14,02%</td>
            </tr>
            <tr>
              <td class="c-left italic nowrap">Mesin Kasir KRS01</td>
              <td class="c-right nowrap">2.479</td>
              <td class="c-right nowrap">92,71%</td>
              <td class="c-right nowrap">Rp 169.136.500</td>
              <td class="c-right nowrap">89,78%</td>
            </tr>
            <tr>
              <td class="c-left italic nowrap">Mesin Kasir KRS02</td>
              <td class="c-right nowrap">195</td>
              <td class="c-right nowrap">7,29%</td>
              <td class="c-right nowrap">Rp 19.247.000</td>
              <td class="c-right nowrap">10,22%</td>
            </tr>
            <tr class="tfoot">
              <td class="c-left">TOTAL KASIR</td>
              <td class="c-right">2.674</td>
              <td class="c-right">70 Sesi</td>
              <td class="c-right">Rp 188.383.500</td>
              <td class="c-right">100,00%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="callout">
      <strong>Sorotan Eksekutif & Pola Operasional Oktober 2026:</strong>
      <ul>
        <li><strong>Konsentrasi Belanja Awal Bulan (1–6 Oktober):</strong> Enam hari pertama menyumbang <strong>Rp 69.956.500 (37,14% omzet bulanan)</strong>, didorong oleh belanja kebutuhan pokok (beras, minyak, rokok, token listrik) menggunakan fasilitas Kredit Anggota pasca penggajian.</li>
        <li><strong>Go-Live Sistem Baru (13–14 Oktober 2026):</strong> Transisi ke aplikasi POS Next.js (<code>smart.kkisitb2.id</code>) berjalan lancar mulai 13 Oktober (pencatatan nama anggota otomatis pada 1.498 struk) diikuti aktivasi pembayaran digital <strong>QRIS</strong> pada 14 Oktober (123 transaksi senilai Rp 4.418.500).</li>
        <li><strong>Zero Return (0 Retur):</strong> Tidak terdapat transaksi retur penjualan sepanjang 1–31 Oktober 2026 pada endpoint <code>/api/sales/returns</code>.</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Bulanan · TOKO KKISITB2 (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 1 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 2 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Rincian & Tren Penjualan Harian (1 – 31 Oktober 2026)</h1>
        <p class="subtitle">Rekapitulasi Harian Transaksi Final Berdasarkan Metode Pembayaran · 26 Hari Aktif & 5 Hari Libur</p>
      </div>
      <div class="meta">
        <strong>Puncak Harian:</strong> Senin, 05 Okt (Rp 17.539.000)<br/>
        <strong>Struk Terbanyak:</strong> Sabtu, 03 Okt (150 struk)
      </div>
    </div>

    <table class="daily-table">
      <thead>
        <tr>
          <th class="c-center" style="width:42px">Tgl</th>
          <th class="c-left" style="width:46px">Hari</th>
          <th class="c-right" style="width:36px">Struk</th>
          <th class="c-right">Kredit (Rp & Struk)</th>
          <th class="c-right">Cash (Rp & Struk)</th>
          <th class="c-right">QRIS (Rp & Struk)</th>
          <th class="c-right">Total Omzet</th>
          <th class="c-right">Rata-Rata</th>
          <th class="c-left" style="width:82px">Porsi Harian</th>
        </tr>
      </thead>
      <tbody>
        {"".join(daily_rows)}
        <tr class="tfoot">
          <td class="c-center" colspan="2">TOTAL 31 HARI</td>
          <td class="c-right">2.674</td>
          <td class="c-right">Rp 165.397.500 (2.046)</td>
          <td class="c-right">Rp 18.567.500 (505)</td>
          <td class="c-right">Rp 4.418.500 (123)</td>
          <td class="c-right">Rp 188.383.500</td>
          <td class="c-right">Rp 70.450</td>
          <td class="c-right">100,00%</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Bulanan · TOKO KKISITB2 (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 2 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 3 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Analisis Kategori Barang & Produk Terlaris</h1>
        <p class="subtitle">Evaluasi Penjualan per Kategori (27 Kategori) dan 16 Produk Kontributor Omzet Terbesar · Oktober 2026</p>
      </div>
      <div class="meta">
        <strong>Total Unit Terjual:</strong> 11.756 pcs<br/>
        <strong>Total Baris Item:</strong> 7.254 baris
      </div>
    </div>

    <h2 class="sec-title">4. Rekapitulasi Penjualan per Kategori Barang <span class="sec-sub">Berdasarkan Baris Detail Item (db_salesitems)</span></h2>
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
          <td class="c-center" colspan="2">TOTAL BARIS ITEM (27 KATEGORI)</td>
          <td class="c-right">815</td>
          <td class="c-right">2.673</td>
          <td class="c-right">11.756</td>
          <td class="c-right">Rp 190.076.500</td>
          <td class="c-right">100,00%</td>
          <td class="c-right">Rp 156.989.459</td>
          <td class="c-right">Rp 33.087.041</td>
        </tr>
      </tbody>
    </table>

    <h2 class="sec-title">5. Top 16 Produk Terlaris Berdasarkan Nilai Penjualan <span class="sec-sub">Top 100 Produk Tersedia di Sheet 4 File Excel</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:24px">#</th>
          <th class="c-left">Nama Produk / Barang</th>
          <th class="c-left">Kategori</th>
          <th class="c-right">Jml Struk</th>
          <th class="c-right">Qty Terjual</th>
          <th class="c-right">Harga Jual</th>
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
    <span>Laporan Penjualan Bulanan · TOKO KKISITB2 (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 3 dari 4</span>
  </div>
</div>

<!-- ==================== PAGE 4 ==================== -->
<div class="page">
  <div class="page-content">
    <div class="top-rule"></div>
    <div class="doc-header">
      <div>
        <h1>Top Anggota Belanja & Catatan Audit Rekonsiliasi</h1>
        <p class="subtitle">20 Anggota Koperasi dengan Nilai Belanja Tertinggi (dari 483 Anggota) & Temuan Kualitas Data</p>
      </div>
      <div class="meta">
        <strong>Total Belanja Anggota:</strong> Rp 168.721.000 (2.139 struk)<br/>
        <strong>Belanja Non-NIK (Umum):</strong> Rp 19.662.500 (535 struk)
      </div>
    </div>

    <h2 class="sec-title">6. Top 20 Anggota Koperasi Berdasarkan Nilai Belanja <span class="sec-sub">Seluruh 483 Anggota Tersedia di Sheet 5 File Excel</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:24px">#</th>
          <th class="c-center" style="width:52px">NIK</th>
          <th class="c-left">Nama Lengkap Anggota</th>
          <th class="c-right">Jml Struk</th>
          <th class="c-right">Belanja Kredit</th>
          <th class="c-right">Cash + QRIS</th>
          <th class="c-right">Total Belanja</th>
          <th class="c-right">Rata-Rata / Struk</th>
        </tr>
      </thead>
      <tbody>
        {"".join(mem_rows_html)}
      </tbody>
    </table>

    <h2 class="sec-title">7. Catatan Kualitas Data & Audit Rekonsiliasi Sistem <span class="sec-sub">Temuan Verifikasi Database & API /sales</span></h2>
    <table>
      <thead>
        <tr>
          <th class="c-center" style="width:46px">ID</th>
          <th class="c-left" style="width:102px">Nomor Struk</th>
          <th class="c-center" style="width:62px">Tanggal</th>
          <th class="c-center" style="width:44px">Metode</th>
          <th class="c-center" style="width:50px">Status</th>
          <th class="c-right" style="width:76px">Total & Bayar</th>
          <th class="c-left">Penjelasan Teknis & Keterangan Audit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="c-center mono nowrap">243857</td>
          <td class="c-left mono bold nowrap">TBII26100100089</td>
          <td class="c-center nowrap">01 Okt 2026</td>
          <td class="c-center nowrap">Cash</td>
          <td class="c-center bold nowrap" style="color:#b45309">Unpaid</td>
          <td class="c-right nowrap">Rp 999.000</td>
          <td class="c-left">POS lama (Didin · KRS02, 5 baris item). Nominal <code>paid_amount</code> sudah penuh (Rp 999.000), namun <code>payment_status</code> tersimpan <code>Unpaid</code>.</td>
        </tr>
        <tr>
          <td class="c-center mono nowrap">244676</td>
          <td class="c-left mono bold nowrap">TBII26100500396</td>
          <td class="c-center nowrap">05 Okt 2026</td>
          <td class="c-center nowrap">Cash</td>
          <td class="c-center bold nowrap" style="color:#b45309">Unpaid</td>
          <td class="c-right nowrap">Rp 229.000</td>
          <td class="c-left">POS lama (Didin · KRS02, 14 baris item). Nominal <code>paid_amount</code> sudah penuh (Rp 229.000), namun <code>payment_status</code> tersimpan <code>Unpaid</code>.</td>
        </tr>
        <tr>
          <td class="c-center mono nowrap">244801</td>
          <td class="c-left mono bold nowrap">TBII26100500461</td>
          <td class="c-center nowrap">05 Okt 2026</td>
          <td class="c-center nowrap">Cash</td>
          <td class="c-center bold nowrap" style="color:#b45309">Unpaid</td>
          <td class="c-right nowrap">Rp 72.000</td>
          <td class="c-left">POS lama (ade · KRS02, 1 baris item). Nomor struk beririsan dengan ID 244802 akibat race condition penomoran di sistem CodeIgniter lama.</td>
        </tr>
        <tr>
          <td class="c-center mono nowrap">244802</td>
          <td class="c-left mono bold nowrap">TBII26100500461</td>
          <td class="c-center nowrap">05 Okt 2026</td>
          <td class="c-center nowrap">Cash</td>
          <td class="c-center bold nowrap" style="color:#b45309">Unpaid</td>
          <td class="c-right nowrap">Rp 72.000</td>
          <td class="c-left">Header struk ganda pada POS lama (KHAILA · KRS01) dengan <strong>0 baris item</strong> di <code>db_salesitems</code> (sehingga struk beritem tercatat 2.673 dari 2.674).</td>
        </tr>
      </tbody>
    </table>

    <div class="callout warn">
      <strong>Informasi Lampiran File Kerja Excel (<code>Laporan_Penjualan_TOKO_KKISITB2_Oktober_2026.xlsx</code>):</strong>
      <ul>
        <li><strong>6 Worksheet Lengkap:</strong> (1) <em>Ringkasan Eksekutif</em>, (2) <em>Rekap Harian (1-31 Okt)</em>, (3) <em>Riwayat Transaksi (Final)</em> berisi seluruh <strong>2.674 struk</strong>, (4) <em>Top Produk & Kategori</em>, (5) <em>Rekap Belanja Anggota</em> berisi seluruh <strong>483 anggota</strong>, dan (6) <em>Quotation & Catatan Audit</em> berisi <strong>37 struk Quotation (Rp 0)</strong> beserta 4 transaksi anomali di atas.</li>
        <li><strong>Rekonsiliasi Header vs Baris Item:</strong> Selisih antara total header <code>db_sales</code> (Rp 188.383.500) dan total kotor baris <code>db_salesitems</code> (Rp 190.076.500) berasal dari baris item historis pada transaksi POS lama (1–12 Oktober 2026) serta HPP produk <em>Token Listrik</em> yang tercatat Rp 0 pada master barang.</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <span>Laporan Penjualan Bulanan · TOKO KKISITB2 (Koperasi Suzuki Mart) · Periode Oktober 2026</span>
    <span>Halaman 4 dari 4</span>
  </div>
</div>

</body>
</html>
"""

with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(html)

print("HTML written to:", HTML_PATH)
