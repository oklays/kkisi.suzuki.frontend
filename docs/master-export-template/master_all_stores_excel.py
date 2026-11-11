#!/usr/bin/env python3
"""
MASTER FORMAT GENERATOR - LAPORAN PENJUALAN KOPERASI SUZUKI MART (KKISI)
Standar struktur, styling, fungsi agregasi, dan rumus Excel (=SUM, =COUNTA, =Rasio)
untuk ekspor Laporan Penjualan Bulanan (Single Store maupun Konsolidasi Semua Toko).
"""
import json
import shutil
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SCRATCH_DIR = "/Users/macbookprom2/.gemini/antigravity/brain/982b6306-214b-4d05-9e90-eded7ad72f5d/scratch"
OUT_DOCS = "/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/Laporan_Penjualan_SEMUA_TOKO_KKISI_Oktober_2026.xlsx"
OUT_ROOT = "/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/Laporan_Penjualan_SEMUA_TOKO_KKISI_Oktober_2026.xlsx"

with open(f"{SCRATCH_DIR}/october_all_stores_bundle.json", "r", encoding="utf-8") as f:
    bundle = json.load(f)

all_sales = bundle["sales"]
returns_list = bundle["returns"]
nik_to_name = bundle["nikToName"]
items_all = bundle["itemsAll"]
items_by_store = bundle["itemsByStore"]

# Merge with previously resolved nik_to_name.json just in case
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

STORES_META = [
    {"id": 1, "name": "TOKO S-MART TB II", "short": "TB II (Tambun)", "loc": "Tambun II (Bekasi)"},
    {"id": 2, "name": "TOKO S-MART TB II (Kp. Bulu)", "short": "TB II (Kp. Bulu)", "loc": "Kp. Bulu (Tambun)"},
    {"id": 3, "name": "TOKO S-MART GIIC", "short": "GIIC (Cikarang)", "loc": "GIIC (Cikarang)"},
]

ID_DAYS = {
    0: "Senin",
    1: "Selasa",
    2: "Rabu",
    3: "Kamis",
    4: "Jumat",
    5: "Sabtu",
    6: "Minggu",
}

def day_name_id(date_str: str) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return ID_DAYS[dt.weekday()]

wb = openpyxl.Workbook()
default_ws = wb.active

# ==============================================================================
# MASTER STYLES & FORMATTING TOKENS
# ==============================================================================
FONT_FAMILY = "Calibri"
f_title = Font(name=FONT_FAMILY, size=16, bold=True, color="FFFFFF")
f_subtitle = Font(name=FONT_FAMILY, size=10, italic=True, color="E0E7FF")
f_sec_hdr = Font(name=FONT_FAMILY, size=12, bold=True, color="0F172A")
f_tbl_hdr = Font(name=FONT_FAMILY, size=10, bold=True, color="FFFFFF")
f_data = Font(name=FONT_FAMILY, size=10, bold=False, color="1E293B")
f_data_bold = Font(name=FONT_FAMILY, size=10, bold=True, color="0F172A")
f_data_muted = Font(name=FONT_FAMILY, size=9, italic=True, color="64748B")
f_total = Font(name=FONT_FAMILY, size=10, bold=True, color="0F172A")
f_warn = Font(name=FONT_FAMILY, size=10, bold=True, color="B45309")

fill_banner = PatternFill("solid", fgColor="0F2942")
fill_subbanner = PatternFill("solid", fgColor="1E3A5F")
fill_tbl_hdr = PatternFill("solid", fgColor="1E3A5F")
fill_sec_hdr = PatternFill("solid", fgColor="E2E8F0")
fill_zebra = PatternFill("solid", fgColor="F8FAFC")
fill_white = PatternFill("solid", fgColor="FFFFFF")
fill_total = PatternFill("solid", fgColor="DBEAFE")
fill_warn = PatternFill("solid", fgColor="FEF3C7")

thin_side = Side(style="thin", color="CBD5E1")
med_navy = Side(style="medium", color="1E3A5F")
double_bottom = Side(style="double", color="0F172A")

border_cell = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
border_total = Border(top=thin_side, bottom=double_bottom, left=thin_side, right=thin_side)
border_hdr = Border(left=thin_side, right=thin_side, top=med_navy, bottom=med_navy)

FMT_RP = '"Rp"#,##0;("Rp"#,##0);"-"'
FMT_INT = '#,##0'
FMT_PCT = '0.00%'

def style_range(ws, min_col, min_row, max_col, max_row, font=None, fill=None, border=None, alignment=None, num_format=None):
    for row in ws.iter_rows(min_row=min_row, max_row=max_row, min_col=min_col, max_col=max_col):
        for cell in row:
            if font: cell.font = font
            if fill: cell.fill = fill
            if border: cell.border = border
            if alignment: cell.alignment = alignment
            if num_format: cell.number_format = num_format

def add_banner(ws, title, subtitle, max_col=8):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
    ws.cell(1, 1, title)
    ws.cell(2, 1, subtitle)
    style_range(ws, 1, 1, max_col, 1, font=f_title, fill=fill_banner, alignment=Alignment(vertical="center", horizontal="left", indent=1))
    style_range(ws, 1, 2, max_col, 2, font=f_subtitle, fill=fill_subbanner, alignment=Alignment(vertical="center", horizontal="left", indent=1))
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 20

# ==============================================================================
# SHEET 1: RINGKASAN EKSEKUTIF (KONSOLIDASI 3 TOKO)
# ==============================================================================
ws1 = wb.create_sheet("Ringkasan Eksekutif")
ws1.views.sheetView[0].showGridLines = True
add_banner(
    ws1,
    "LAPORAN PENJUALAN BULANAN · KONSOLIDASI SELURUH TOKO KKISI (S-MART)",
    "Periode: 1 Oktober 2026 – 31 Oktober 2026 (1 Bulan Penuh) | Mencakup: TB II Tambun, TB II Kp. Bulu, & GIIC Cikarang",
    max_col=8
)

total_final_tx = len(final_sales)
total_final_rp = sum((s["grandTotalSen"] or 0) // 100 for s in final_sales)
total_paid_rp = sum((s["paidSen"] or 0) // 100 for s in final_sales)
total_change_rp = total_paid_rp - total_final_rp
avg_ticket_rp = round(total_final_rp / total_final_tx) if total_final_tx else 0
active_days = len(set(s["saleDate"] for s in final_sales))
avg_daily_rp = round(total_final_rp / active_days) if active_days else 0
total_qty_sold = int(float(items_all["totals"]["total_qty"]))
total_line_items = int(items_all["totals"]["line_count"])
total_return_rp = sum(int(float(r["grand_total"])) for r in returns_list)
unique_nik_count = len(set(s["memberNik"] for s in final_sales if s["memberNik"]))

# Section 1: Ikhtisar Kinerja Utama (KPI)
r = 4
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "1. IKHTISAR KINERJA UTAMA KONSOLIDASI 3 TOKO (OKTOBER 2026)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

kpis = [
    ("Total Nilai Penjualan Konsolidasi (Final)", total_final_rp, FMT_RP, "Total omzet bersih gabungan 3 toko dari 6.576 struk berstatus Final"),
    ("Total Transaksi Penjualan (Final)", total_final_tx, FMT_INT, "TB II Tambun: 2.674 struk | TB II Kp. Bulu: 1.953 struk | GIIC: 1.949 struk"),
    ("Total Nominal Pembayaran Diterima", total_paid_rp, FMT_RP, "Termasuk uang tunai diterima sebelum kembalian kasir di seluruh toko"),
    ("Total Kembalian Tunai (Cash Change)", total_change_rp, FMT_RP, "TB II Tambun: Rp 3.961.000 | TB II Kp. Bulu: Rp 13.339.500 | GIIC: Rp 0"),
    ("Rata-rata Nilai Transaksi (Basket Size)", avg_ticket_rp, FMT_RP, "Rata-rata nilai belanja per struk Final lintas seluruh cabang toko"),
    ("Hari Operasional Aktif (Gabungan)", active_days, FMT_INT, "TB II Tambun: 26 hari | TB II Kp. Bulu: 30 hari | GIIC Cikarang: 22 hari"),
    ("Rata-rata Omzet Konsolidasi per Hari", avg_daily_rp, FMT_RP, "Rata-rata penjualan gabungan per hari kalender Oktober 2026 (31 hari)"),
    ("Total Volume Barang Terjual (Unit/Pcs)", total_qty_sold, FMT_INT, f"Terdiri dari {total_line_items:,} baris item pada detail struk lintas 3 toko".replace(",", ".")),
    ("Total Retur Penjualan (Oktober 2026)", total_return_rp, FMT_RP, f"{len(returns_list)} transaksi retur di TB II Kp. Bulu (RTN-MJ26101300001 & RTN-MJ26101400002)"),
    ("Transaksi Non-Final (Quotation / Hold)", len(quotation_sales), FMT_INT, "71 struk Quotation nilai Rp 0 (TB II: 37, Kp. Bulu: 14, GIIC: 20)"),
]

r += 1
ws1.cell(r, 1, "Indikator Kinerja (KPI)")
ws1.cell(r, 2, "Nilai Konsolidasi")
ws1.merge_cells(start_row=r, start_column=3, end_row=r, end_column=8)
ws1.cell(r, 3, "Keterangan & Distribusi Operasional Cabang")
style_range(ws1, 1, r, 8, r, font=f_tbl_hdr, fill=fill_tbl_hdr, border=border_hdr, alignment=Alignment(vertical="center", horizontal="left", indent=1))
ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="right")
ws1.row_dimensions[r].height = 22

for idx, (label, val, num_fmt, desc) in enumerate(kpis):
    r += 1
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, label)
    ws1.cell(r, 2, val)
    ws1.merge_cells(start_row=r, start_column=3, end_row=r, end_column=8)
    ws1.cell(r, 3, desc)
    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center"))
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 2).font = f_data_bold
    ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="right")
    ws1.cell(r, 2).number_format = num_fmt
    ws1.row_dimensions[r].height = 20

# Section 2: Rekapitulasi per Cabang Toko (NEW for All-Stores Master Format)
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "2. PERBANDINGAN KINERJA PER CABANG TOKO (TRANSAKSI FINAL)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
store_headers = [
    "Cabang / Nama Toko", "Jumlah Struk", "% Struk",
    "Total Penjualan (Rp)", "% Omzet", "Total Dibayar (Rp)",
    "Rata-rata / Struk (Rp)", "Hari Aktif & NIK Unik"
]
for col_idx, h in enumerate(store_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx in (1, 8) else "right", wrap_text=True)
ws1.row_dimensions[r].height = 24

start_st_row = r + 1
for idx, st in enumerate(STORES_META):
    r += 1
    cid = st["id"]
    s_rows = [s for s in final_sales if s["companyId"] == cid]
    cnt = len(s_rows)
    tot_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s_rows)
    paid_rp = sum((s["paidSen"] or 0) // 100 for s in s_rows)
    s_days = len(set(s["saleDate"] for s in s_rows))
    s_niks = len(set(s["memberNik"] for s in s_rows if s["memberNik"]))
    s_qty = int(float(items_by_store[str(cid)]["totals"]["total_qty"]))
    fill_row = fill_zebra if idx % 2 == 1 else fill_white

    ws1.cell(r, 1, f"{cid}. {st['name']}")
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, cnt / total_final_tx)
    ws1.cell(r, 4, tot_rp)
    ws1.cell(r, 5, tot_rp / total_final_rp)
    ws1.cell(r, 6, paid_rp)
    ws1.cell(r, 7, f"=D{r}/B{r}")
    ws1.cell(r, 8, f"{s_days} hari aktif · {s_niks} NIK · {s_qty:,} pcs".replace(",", "."))

    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 4).font = f_data_bold
    ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 2).number_format = FMT_INT
    ws1.cell(r, 3).number_format = FMT_PCT
    ws1.cell(r, 4).number_format = FMT_RP
    ws1.cell(r, 5).number_format = FMT_PCT
    ws1.cell(r, 6).number_format = FMT_RP
    ws1.cell(r, 7).number_format = FMT_RP
    ws1.row_dimensions[r].height = 21

end_st_row = r
r += 1
ws1.cell(r, 1, "TOTAL KONSOLIDASI (3 TOKO)")
ws1.cell(r, 2, f"=SUM(B{start_st_row}:B{end_st_row})")
ws1.cell(r, 3, f"=SUM(C{start_st_row}:C{end_st_row})")
ws1.cell(r, 4, f"=SUM(D{start_st_row}:D{end_st_row})")
ws1.cell(r, 5, f"=SUM(E{start_st_row}:E{end_st_row})")
ws1.cell(r, 6, f"=SUM(F{start_st_row}:F{end_st_row})")
ws1.cell(r, 7, f"=D{r}/B{r}")
ws1.cell(r, 8, f"31 hari kalender · {unique_nik_count} NIK unik · {total_qty_sold:,} pcs".replace(",", "."))
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
ws1.cell(r, 3).number_format = FMT_PCT
ws1.cell(r, 4).number_format = FMT_RP
ws1.cell(r, 5).number_format = FMT_PCT
ws1.cell(r, 6).number_format = FMT_RP
ws1.cell(r, 7).number_format = FMT_RP
ws1.row_dimensions[r].height = 23

# Section 3: Rekapitulasi per Metode Pembayaran (Gabungan + Rincian Cabang)
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "3. REKAPITULASI BERDASARKAN METODE PEMBAYARAN (GABUNGAN SELURUH TOKO)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
pay_headers = [
    "Metode Pembayaran", "Jumlah Struk", "% Struk",
    "Total Penjualan (Rp)", "% Omzet", "Total Dibayar (Rp)",
    "Rata-rata / Struk (Rp)", "Distribusi Omzet per Toko"
]
for col_idx, h in enumerate(pay_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx in (1, 8) else "right", wrap_text=True)
ws1.row_dimensions[r].height = 24

pay_methods = ["Kredit", "Cash", "QRIS"]
start_pay_row = r + 1
for idx, pm in enumerate(pay_methods):
    r += 1
    pm_rows = [s for s in final_sales if s["paymentType"] == pm]
    cnt = len(pm_rows)
    tot_rp = sum((s["grandTotalSen"] or 0) // 100 for s in pm_rows)
    paid_rp = sum((s["paidSen"] or 0) // 100 for s in pm_rows)
    s1_rp = sum((s["grandTotalSen"] or 0) // 100 for s in pm_rows if s["companyId"] == 1)
    s2_rp = sum((s["grandTotalSen"] or 0) // 100 for s in pm_rows if s["companyId"] == 2)
    s3_rp = sum((s["grandTotalSen"] or 0) // 100 for s in pm_rows if s["companyId"] == 3)
    fill_row = fill_zebra if idx % 2 == 1 else fill_white

    ws1.cell(r, 1, f"{pm} (Potong Gaji Anggota)" if pm == "Kredit" else ("Cash (Tunai)" if pm == "Cash" else "QRIS (Non-Tunai)"))
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, cnt / total_final_tx)
    ws1.cell(r, 4, tot_rp)
    ws1.cell(r, 5, tot_rp / total_final_rp)
    ws1.cell(r, 6, paid_rp)
    ws1.cell(r, 7, f"=D{r}/B{r}")
    ws1.cell(r, 8, f"TB II: Rp {s1_rp:,} | Kp.Bulu: Rp {s2_rp:,} | GIIC: Rp {s3_rp:,}".replace(",", "."))

    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 2).number_format = FMT_INT
    ws1.cell(r, 3).number_format = FMT_PCT
    ws1.cell(r, 4).number_format = FMT_RP
    ws1.cell(r, 5).number_format = FMT_PCT
    ws1.cell(r, 6).number_format = FMT_RP
    ws1.cell(r, 7).number_format = FMT_RP
    ws1.row_dimensions[r].height = 20

end_pay_row = r
r += 1
ws1.cell(r, 1, "TOTAL KESELURUHAN")
ws1.cell(r, 2, f"=SUM(B{start_pay_row}:B{end_pay_row})")
ws1.cell(r, 3, f"=SUM(C{start_pay_row}:C{end_pay_row})")
ws1.cell(r, 4, f"=SUM(D{start_pay_row}:D{end_pay_row})")
ws1.cell(r, 5, f"=SUM(E{start_pay_row}:E{end_pay_row})")
ws1.cell(r, 6, f"=SUM(F{start_pay_row}:F{end_pay_row})")
ws1.cell(r, 7, f"=D{r}/B{r}")
ws1.cell(r, 8, "100% Transaksi POS Terkonsolidasi")
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
ws1.cell(r, 3).number_format = FMT_PCT
ws1.cell(r, 4).number_format = FMT_RP
ws1.cell(r, 5).number_format = FMT_PCT
ws1.cell(r, 6).number_format = FMT_RP
ws1.cell(r, 7).number_format = FMT_RP
ws1.row_dimensions[r].height = 22

# Section 4: Matriks Cabang Toko x Metode Pembayaran
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "4. MATRIKS METODE PEMBAYARAN PER CABANG TOKO (OKTOBER 2026)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
mat_headers = [
    "Cabang / Nama Toko", "Struk Kredit", "Omzet Kredit (Rp)",
    "Struk Cash", "Omzet Cash (Rp)", "Struk QRIS", "Omzet QRIS (Rp)", "Total Omzet Toko (Rp)"
]
for col_idx, h in enumerate(mat_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx == 1 else "right", wrap_text=True)
ws1.row_dimensions[r].height = 24

start_mat_row = r + 1
for idx, st in enumerate(STORES_META):
    r += 1
    cid = st["id"]
    s_rows = [s for s in final_sales if s["companyId"] == cid]
    kr = [s for s in s_rows if s["paymentType"] == "Kredit"]
    ca = [s for s in s_rows if s["paymentType"] == "Cash"]
    qr = [s for s in s_rows if s["paymentType"] == "QRIS"]
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in kr)
    ca_rp = sum((s["grandTotalSen"] or 0) // 100 for s in ca)
    qr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in qr)
    fill_row = fill_zebra if idx % 2 == 1 else fill_white

    ws1.cell(r, 1, f"{cid}. {st['name']}")
    ws1.cell(r, 2, len(kr))
    ws1.cell(r, 3, kr_rp)
    ws1.cell(r, 4, len(ca))
    ws1.cell(r, 5, ca_rp)
    ws1.cell(r, 6, len(qr))
    ws1.cell(r, 7, qr_rp)
    ws1.cell(r, 8, f"=C{r}+E{r}+G{r}")

    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 8).font = f_data_bold
    for ci in (2, 4, 6): ws1.cell(r, ci).number_format = FMT_INT
    for ci in (3, 5, 7, 8): ws1.cell(r, ci).number_format = FMT_RP
    ws1.row_dimensions[r].height = 20

end_mat_row = r
r += 1
ws1.cell(r, 1, "TOTAL GABUNGAN 3 TOKO")
for ci, col_let in [(2, "B"), (3, "C"), (4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H")]:
    ws1.cell(r, ci, f"=SUM({col_let}{start_mat_row}:{col_let}{end_mat_row})")
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
for ci in (2, 4, 6): ws1.cell(r, ci).number_format = FMT_INT
for ci in (3, 5, 7, 8): ws1.cell(r, ci).number_format = FMT_RP
ws1.row_dimensions[r].height = 22

# Section 5: Segmen Pelanggan (Anggota vs Non-Anggota)
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "5. REKAPITULASI PER SEGMEN PELANGGAN (ANGGOTA VS UMUM)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
seg_headers = ["Segmen Pelanggan", "Jumlah Struk", "% Struk", "Total Penjualan (Rp)", "% Omzet", "Rata-rata / Struk (Rp)", "Keterangan", "Cakupan Cabang"]
for col_idx, h in enumerate(seg_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx in (1, 7, 8) else "right")
ws1.row_dimensions[r].height = 22

member_rows = [s for s in final_sales if s["memberNik"]]
non_member_rows = [s for s in final_sales if not s["memberNik"]]
segments = [
    ("Anggota Koperasi (Tercatat NIK)", member_rows, f"{unique_nik_count} NIK anggota unik berbelanja (Kredit, Tunai, QRIS)", "TB II: 483 NIK | Kp.Bulu: 208 NIK | GIIC: 237 NIK"),
    ("Pelanggan Umum / Non-NIK", non_member_rows, "Transaksi walk-in tanpa pencatatan NIK (Tunai & QRIS)", "TB II: 535 struk | Kp.Bulu: 1.503 struk | GIIC: 415 struk"),
]
start_seg_row = r + 1
for idx, (label, rows_seg, note, scope_txt) in enumerate(segments):
    r += 1
    cnt = len(rows_seg)
    tot_rp = sum((s["grandTotalSen"] or 0) // 100 for s in rows_seg)
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, label)
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, cnt / total_final_tx)
    ws1.cell(r, 4, tot_rp)
    ws1.cell(r, 5, tot_rp / total_final_rp)
    ws1.cell(r, 6, f"=D{r}/B{r}")
    ws1.cell(r, 7, note)
    ws1.cell(r, 8, scope_txt)
    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 7).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 2).number_format = FMT_INT
    ws1.cell(r, 3).number_format = FMT_PCT
    ws1.cell(r, 4).number_format = FMT_RP
    ws1.cell(r, 5).number_format = FMT_PCT
    ws1.cell(r, 6).number_format = FMT_RP
    ws1.row_dimensions[r].height = 20

end_seg_row = r
r += 1
ws1.cell(r, 1, "TOTAL SEGMEN PELANGGAN")
ws1.cell(r, 2, f"=SUM(B{start_seg_row}:B{end_seg_row})")
ws1.cell(r, 3, f"=SUM(C{start_seg_row}:C{end_seg_row})")
ws1.cell(r, 4, f"=SUM(D{start_seg_row}:D{end_seg_row})")
ws1.cell(r, 5, f"=SUM(E{start_seg_row}:E{end_seg_row})")
ws1.cell(r, 6, f"=D{r}/B{r}")
ws1.cell(r, 7, "100% Nama Anggota Tervalidasi Master Koperasi")
ws1.cell(r, 8, "Seluruh Cabang (3 Toko)")
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 7).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 8).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
ws1.cell(r, 3).number_format = FMT_PCT
ws1.cell(r, 4).number_format = FMT_RP
ws1.cell(r, 5).number_format = FMT_PCT
ws1.cell(r, 6).number_format = FMT_RP
ws1.row_dimensions[r].height = 22

# Section 6: Rekapitulasi Mingguan
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "6. TREN PENJUALAN MINGGUAN KONSOLIDASI (OKTOBER 2026)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
wk_headers = [
    "Periode Minggu", "Jumlah Struk",
    "Omzet TB II Tambun (Rp)", "Omzet TB II Kp. Bulu (Rp)", "Omzet GIIC Cikarang (Rp)",
    "Penjualan Kredit (Rp)", "Total Omzet Gabungan (Rp)", "% Omzet Bulanan"
]
for col_idx, h in enumerate(wk_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx == 1 else "right", wrap_text=True)
ws1.row_dimensions[r].height = 24

weeks_def = [
    ("Minggu 1 (01 – 04 Okt 2026)", "2026-10-01", "2026-10-04"),
    ("Minggu 2 (05 – 11 Okt 2026)", "2026-10-05", "2026-10-11"),
    ("Minggu 3 (12 – 18 Okt 2026)", "2026-10-12", "2026-10-18"),
    ("Minggu 4 (19 – 25 Okt 2026)", "2026-10-19", "2026-10-25"),
    ("Minggu 5 (26 – 31 Okt 2026)", "2026-10-26", "2026-10-31"),
]
start_wk_row = r + 1
for idx, (wlabel, dfrom, dto) in enumerate(weeks_def):
    r += 1
    wrows = [s for s in final_sales if dfrom <= s["saleDate"] <= dto]
    cnt = len(wrows)
    s1_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["companyId"] == 1)
    s2_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["companyId"] == 2)
    s3_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["companyId"] == 3)
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["paymentType"] == "Kredit")
    tot_rp = s1_rp + s2_rp + s3_rp
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, wlabel)
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, s1_rp)
    ws1.cell(r, 4, s2_rp)
    ws1.cell(r, 5, s3_rp)
    ws1.cell(r, 6, kr_rp)
    ws1.cell(r, 7, f"=C{r}+D{r}+E{r}")
    ws1.cell(r, 8, tot_rp / total_final_rp)
    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 7).font = f_data_bold
    ws1.cell(r, 2).number_format = FMT_INT
    for ci in (3, 4, 5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
    ws1.cell(r, 8).number_format = FMT_PCT
    ws1.row_dimensions[r].height = 20

end_wk_row = r
r += 1
ws1.cell(r, 1, "TOTAL OKTOBER 2026")
for ci, col_let in [(2, "B"), (3, "C"), (4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H")]:
    ws1.cell(r, ci, f"=SUM({col_let}{start_wk_row}:{col_let}{end_wk_row})")
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
for ci in (3, 4, 5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
ws1.cell(r, 8).number_format = FMT_PCT
ws1.row_dimensions[r].height = 22

# Section 7: Kinerja per Operator Kasir Lintas Cabang
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "7. REKAPITULASI PER OPERATOR KASIR LINTAS CABANG (6 OPERATOR)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
op_headers = [
    "Operator (createdBy)", "Cabang Toko", "Jumlah Struk",
    "Struk Kredit", "Omzet Kredit (Rp)", "Omzet Cash + QRIS (Rp)",
    "Total Omzet (Rp)", "% Porsi Omzet"
]
for col_idx, h in enumerate(op_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx in (1, 2) else "right", wrap_text=True)
ws1.row_dimensions[r].height = 24

operators_order = ["KHAILA", "Lia", "ade", "SONIA", "Didin", "Ridho"]
start_op_row = r + 1
for idx, op in enumerate(operators_order):
    r += 1
    orows = [s for s in final_sales if s["createdBy"] == op]
    cnt = len(orows)
    stores_str = ", ".join(sorted(set(s["companyShortName"] for s in orows)))
    kr_cnt = sum(1 for s in orows if s["paymentType"] == "Kredit")
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in orows if s["paymentType"] == "Kredit")
    cq_rp = sum((s["grandTotalSen"] or 0) // 100 for s in orows if s["paymentType"] in ("Cash", "QRIS"))
    tot_rp = kr_rp + cq_rp
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, op)
    ws1.cell(r, 2, stores_str)
    ws1.cell(r, 3, cnt)
    ws1.cell(r, 4, kr_cnt)
    ws1.cell(r, 5, kr_rp)
    ws1.cell(r, 6, cq_rp)
    ws1.cell(r, 7, f"=E{r}+F{r}")
    ws1.cell(r, 8, tot_rp / total_final_rp)
    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 7).font = f_data_bold
    for ci in (3, 4): ws1.cell(r, ci).number_format = FMT_INT
    for ci in (5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
    ws1.cell(r, 8).number_format = FMT_PCT
    ws1.row_dimensions[r].height = 20

end_op_row = r
r += 1
ws1.cell(r, 1, "TOTAL OPERATOR (SELURUH TOKO)")
ws1.cell(r, 2, "3 Cabang S-MART")
for ci, col_let in [(3, "C"), (4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H")]:
    ws1.cell(r, ci, f"=SUM({col_let}{start_op_row}:{col_let}{end_op_row})")
style_range(ws1, 1, r, 8, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
for ci in (3, 4): ws1.cell(r, ci).number_format = FMT_INT
for ci in (5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
ws1.cell(r, 8).number_format = FMT_PCT
ws1.row_dimensions[r].height = 22

# Section 8: Catatan Kualitas Data & Transisi Sistem
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
ws1.cell(r, 1, "8. CATATAN AUDIT DATA, RETUR, & TRANSISI SISTEM POS (OKTOBER 2026)")
style_range(ws1, 1, r, 8, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

notes = [
    ("Konsolidasi 3 Toko (Rp 471.375.000)", "Laporan ini menggabungkan seluruh transaksi dari 3 cabang: TOKO S-MART TB II (Rp 188.383.500 · 39,96%), TOKO S-MART TB II Kp. Bulu (Rp 172.395.500 · 36,57%), dan TOKO S-MART GIIC Cikarang (Rp 110.596.000 · 23,46%). Seluruh 737 NIK anggota unik telah tervalidasi 100% terhadap master anggota koperasi (m_anggota)."),
    ("2 Transaksi Retur di Kp. Bulu (Rp 9.500)", "Terdapat 2 retur penjualan di TOKO S-MART TB II (Kp. Bulu) yang dibuat oleh operator SONIA: RTN-MJ26101300001 (13 Okt 2026, Rp 7.500) dan RTN-MJ26101400002 (14 Okt 2026, Rp 2.000). Tidak ada retur di TB II Tambun maupun GIIC Cikarang."),
    ("6 Struk Final Berstatus 'Unpaid'", "Terdapat 6 transaksi berstatus Final namun payment_status='Unpaid' (semuanya metode Cash dengan paid_amount penuh): 4 struk di TB II Tambun (TBII26100100089 Rp 999.000, TBII26100500396 Rp 229.000, dan duplikat TBII26100500461 ID 244801 & 244802 @ Rp 72.000) serta 2 struk duplikat di TB II Kp. Bulu (MJ26101601182 ID 247708 & 247709 @ Rp 206.000)."),
    ("71 Struk Berstatus 'Quotation' (Rp 0)", "Terdapat 71 record Quotation dengan nilai Rp 0 (37 di TB II Tambun, 14 di TB II Kp. Bulu, 20 di GIIC Cikarang). Seluruhnya dipisahkan pada Sheet 6 agar tidak mencemari perhitungan omzet Final."),
]
for title_n, body_n in notes:
    r += 1
    ws1.cell(r, 1, title_n)
    ws1.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    ws1.cell(r, 2, body_n)
    style_range(ws1, 1, r, 8, r, font=f_data, fill=fill_warn, border=border_cell, alignment=Alignment(vertical="center", wrap_text=True))
    ws1.cell(r, 1).font = f_warn
    ws1.row_dimensions[r].height = 34

ws1_col_widths = [36, 22, 22, 22, 22, 22, 22, 38]
for idx, w in enumerate(ws1_col_widths, 1):
    ws1.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 2: REKAP HARIAN (1-31 OKT) · KONSOLIDASI & PER TOKO
# ==============================================================================
ws2 = wb.create_sheet("Rekap Harian (1-31 Okt)")
ws2.views.sheetView[0].showGridLines = True
add_banner(
    ws2,
    "REKAPITULASI PENJUALAN HARIAN KONSOLIDASI 3 TOKO · OKTOBER 2026 (1 – 31 OKTOBER 2026)",
    "Rincian omzet harian per cabang toko (TB II Tambun, TB II Kp. Bulu, GIIC Cikarang) serta metode pembayaran (Kredit, Cash, QRIS)",
    max_col=16
)

r = 4
d_headers = [
    "Tanggal", "Hari", "Toko Buka",
    "Struk TB II", "Omzet TB II Tambun (Rp)",
    "Struk Kp. Bulu", "Omzet TB II Kp. Bulu (Rp)",
    "Struk GIIC", "Omzet GIIC Cikarang (Rp)",
    "Total Struk (Final)",
    "Omzet Kredit (Rp)", "Omzet Cash (Rp)", "Omzet QRIS (Rp)",
    "Total Omzet Gabungan (Rp)", "Rata-rata / Struk (Rp)", "Struk Quotation (Rp 0)"
]
for col_idx, h in enumerate(d_headers, 1):
    c = ws2.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx <= 3 else "right", wrap_text=True)
ws2.row_dimensions[r].height = 28

start_day_row = r + 1
for day_num in range(1, 32):
    r += 1
    d_str = f"2026-10-{day_num:02d}"
    d_name = day_name_id(d_str)
    d_final = [s for s in final_sales if s["saleDate"] == d_str]
    d_quot = [s for s in quotation_sales if s["saleDate"] == d_str]

    s1 = [s for s in d_final if s["companyId"] == 1]
    s2 = [s for s in d_final if s["companyId"] == 2]
    s3 = [s for s in d_final if s["companyId"] == 3]
    s1_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s1)
    s2_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s2)
    s3_rp = sum((s["grandTotalSen"] or 0) // 100 for s in s3)

    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in d_final if s["paymentType"] == "Kredit")
    ca_rp = sum((s["grandTotalSen"] or 0) // 100 for s in d_final if s["paymentType"] == "Cash")
    qr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in d_final if s["paymentType"] == "QRIS")

    open_stores = sum(1 for arr in (s1, s2, s3) if len(arr) > 0)
    fill_row = fill_zebra if day_num % 2 == 0 else fill_white

    ws2.cell(r, 1, d_str)
    ws2.cell(r, 2, d_name)
    ws2.cell(r, 3, f"{open_stores} Toko Aktif")
    ws2.cell(r, 4, len(s1))
    ws2.cell(r, 5, s1_rp)
    ws2.cell(r, 6, len(s2))
    ws2.cell(r, 7, s2_rp)
    ws2.cell(r, 8, len(s3))
    ws2.cell(r, 9, s3_rp)
    ws2.cell(r, 10, f"=D{r}+F{r}+H{r}")
    ws2.cell(r, 11, kr_rp)
    ws2.cell(r, 12, ca_rp)
    ws2.cell(r, 13, qr_rp)
    ws2.cell(r, 14, f"=E{r}+G{r}+I{r}")
    ws2.cell(r, 15, f"=IF(J{r}>0,N{r}/J{r},0)")
    ws2.cell(r, 16, len(d_quot))

    style_range(ws2, 1, r, 16, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    for ci in (1, 2, 3):
        ws2.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    ws2.cell(r, 1).font = f_data_bold
    ws2.cell(r, 10).font = f_data_bold
    ws2.cell(r, 14).font = f_data_bold
    for ci in (4, 6, 8, 10, 16):
        ws2.cell(r, ci).number_format = FMT_INT
    for ci in (5, 7, 9, 11, 12, 13, 14, 15):
        ws2.cell(r, ci).number_format = FMT_RP
    ws2.row_dimensions[r].height = 20

end_day_row = r
r += 1
ws2.cell(r, 1, "TOTAL")
ws2.cell(r, 2, "31 Hari")
ws2.cell(r, 3, "31 Hari Aktif")
for ci, col_let in [
    (4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I"),
    (10, "J"), (11, "K"), (12, "L"), (13, "M"), (14, "N"), (16, "P")
]:
    ws2.cell(r, ci, f"=SUM({col_let}{start_day_row}:{col_let}{end_day_row})")
ws2.cell(r, 15, f"=N{r}/J{r}")

style_range(ws2, 1, r, 16, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
for ci in (1, 2, 3): ws2.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
for ci in (4, 6, 8, 10, 16): ws2.cell(r, ci).number_format = FMT_INT
for ci in (5, 7, 9, 11, 12, 13, 14, 15): ws2.cell(r, ci).number_format = FMT_RP
ws2.row_dimensions[r].height = 24

ws2.freeze_panes = "D5"
ws2.auto_filter.ref = f"A4:P{end_day_row}"

day_col_widths = [13, 10, 14, 12, 20, 13, 20, 12, 20, 16, 20, 18, 16, 22, 18, 16]
for idx, w in enumerate(day_col_widths, 1):
    ws2.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 3: RIWAYAT TRANSAKSI (FINAL) · 6.576 BARIS (SELURUH TOKO)
# ==============================================================================
ws3 = wb.create_sheet("Riwayat Transaksi (Final)")
ws3.views.sheetView[0].showGridLines = True
add_banner(
    ws3,
    "RIWAYAT TRANSAKSI PENJUALAN (FINAL) · SELURUH TOKO KKISI OKTOBER 2026",
    "Daftar lengkap 6.576 transaksi Final lintas 3 cabang toko pada https://smart.kkisitb2.id/sales (1 – 31 Oktober 2026)",
    max_col=22
)

r = 4
tx_headers = [
    "No", "ID Toko", "Nama Toko / Cabang", "ID Transaksi", "Nomor Struk", "Tanggal", "Hari",
    "NIK Anggota", "Nama Pelanggan (Di Struk)", "Nama Anggota (Master NIK)", "Segmen Pelanggan",
    "Sumber", "Mesin Kasir", "Referensi Sesi Kasir", "ID Sesi",
    "Status Penjualan", "Metode Pembayaran", "Status Pembayaran",
    "Total Penjualan (Rp)", "Nominal Dibayar (Rp)", "Kembalian Tunai (Rp)",
    "Operator (Pembuat)"
]
for col_idx, h in enumerate(tx_headers, 1):
    c = ws3.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(
        vertical="center",
        horizontal="center" if col_idx in (1, 2, 4, 6, 7, 8, 11, 12, 13, 15, 16, 17, 18, 22) else ("right" if col_idx in (19, 20, 21) else "left"),
        wrap_text=True
    )
ws3.row_dimensions[r].height = 28

start_tx_row = r + 1
for idx, s in enumerate(final_sales, 1):
    r += 1
    nik = s["memberNik"] or ""
    raw_name = s["customerName"] or "Nama pelanggan tidak tersimpan"
    resolved_name = nik_to_name.get(nik, raw_name if raw_name != "Nama pelanggan tidak tersimpan" else "Pelanggan Umum (Non-NIK)")
    seg = "Anggota" if nik else "Umum"
    gt_rp = (s["grandTotalSen"] or 0) // 100
    paid_rp = (s["paidSen"] or 0) // 100
    change_rp = max(0, paid_rp - gt_rp) if s["paymentType"] == "Cash" else 0

    ws3.cell(r, 1, idx)
    ws3.cell(r, 2, s["companyId"])
    ws3.cell(r, 3, s["companyName"])
    ws3.cell(r, 4, s["saleId"])
    ws3.cell(r, 5, s["salesCode"])
    ws3.cell(r, 6, s["saleDate"])
    ws3.cell(r, 7, day_name_id(s["saleDate"]))
    ws3.cell(r, 8, nik if nik else "-")
    ws3.cell(r, 9, raw_name)
    ws3.cell(r, 10, resolved_name)
    ws3.cell(r, 11, seg)
    ws3.cell(r, 12, "POS" if s["source"] == "pos" else "Non-POS")
    ws3.cell(r, 13, s["cashierLabel"] or "-")
    ws3.cell(r, 14, s["registerReference"] or "-")
    ws3.cell(r, 15, s["registerId"] or 0)
    ws3.cell(r, 16, s["salesStatus"])
    ws3.cell(r, 17, s["paymentType"])
    ws3.cell(r, 18, s["paymentStatus"])
    ws3.cell(r, 19, gt_rp)
    ws3.cell(r, 20, paid_rp)
    ws3.cell(r, 21, change_rp)
    ws3.cell(r, 22, s["createdBy"] or "-")

    is_unpaid = s["paymentStatus"] != "Paid"
    row_fill = fill_warn if is_unpaid else (fill_zebra if idx % 2 == 0 else fill_white)
    for ci in range(1, 23):
        cell = ws3.cell(r, ci)
        cell.font = f_warn if (is_unpaid and ci in (5, 18)) else f_data
        cell.fill = row_fill
        cell.border = border_cell
    for ci in (1, 2, 4, 15):
        ws3.cell(r, ci).number_format = FMT_INT
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    for ci in (6, 7, 8, 11, 12, 13, 16, 17, 18, 22):
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    for ci in (19, 20, 21):
        ws3.cell(r, ci).number_format = FMT_RP
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")

end_tx_row = r
r += 1
ws3.cell(r, 1, "TOTAL")
ws3.cell(r, 3, "SELURUH TOKO (3 CABANG)")
ws3.cell(r, 5, f"=COUNTA(E{start_tx_row}:E{end_tx_row})")
ws3.cell(r, 19, f"=SUM(S{start_tx_row}:S{end_tx_row})")
ws3.cell(r, 20, f"=SUM(T{start_tx_row}:T{end_tx_row})")
ws3.cell(r, 21, f"=SUM(U{start_tx_row}:U{end_tx_row})")
style_range(ws3, 1, r, 22, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center"))
ws3.cell(r, 5).number_format = FMT_INT
for ci in (19, 20, 21):
    ws3.cell(r, ci).number_format = FMT_RP
    ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")
ws3.row_dimensions[r].height = 24

ws3.freeze_panes = "F5"
ws3.auto_filter.ref = f"A4:V{end_tx_row}"

tx_col_widths = [7, 9, 26, 12, 19, 13, 10, 13, 28, 28, 14, 9, 11, 22, 10, 14, 16, 15, 20, 20, 18, 14]
for idx, w in enumerate(tx_col_widths, 1):
    ws3.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 4: TOP PRODUK & KATEGORI (KONSOLIDASI 3 TOKO)
# ==============================================================================
ws4 = wb.create_sheet("Top Produk & Kategori")
ws4.views.sheetView[0].showGridLines = True
add_banner(
    ws4,
    "ANALISIS KATEGORI BARANG & TOP 100 PRODUK TERLARIS · SELURUH TOKO OKTOBER 2026",
    "Rekapitulasi item terjual berdasarkan baris detail transaksi (db_salesitems) lintas 3 cabang periode 1 – 31 Oktober 2026",
    max_col=9
)

# Section A: Volume & Penjualan Item per Cabang Toko
r = 4
ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
ws4.cell(r, 1, "A. RINGKASAN BARIS DETAIL ITEM (DB_SALESITEMS) PER CABANG TOKO")
style_range(ws4, 1, r, 9, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws4.row_dimensions[r].height = 24

r += 1
st_item_headers = [
    "No", "Cabang / Nama Toko", "Jumlah Kategori", "Struk Memiliki Item",
    "Total Baris Item", "Total Qty Terjual (Pcs)", "Total Nilai Baris Item (Rp)",
    "Estimasi HPP (Rp)", "Estimasi Margin Kotor (Rp)"
]
for col_idx, h in enumerate(st_item_headers, 1):
    c = ws4.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx == 1 else ("left" if col_idx == 2 else "right"), wrap_text=True)
ws4.row_dimensions[r].height = 26

start_sti_row = r + 1
for idx, st in enumerate(STORES_META, 1):
    r += 1
    cid_str = str(st["id"])
    st_tot = items_by_store[cid_str]["totals"]
    st_cats = items_by_store[cid_str]["byCategory"]
    rev = round(float(st_tot["total_line_sales"]))
    cogs = round(float(st_tot["est_cogs"]))
    fill_row = fill_zebra if idx % 2 == 0 else fill_white

    ws4.cell(r, 1, idx)
    ws4.cell(r, 2, st["name"])
    ws4.cell(r, 3, len(st_cats))
    ws4.cell(r, 4, int(st_tot["tx_count"]))
    ws4.cell(r, 5, int(st_tot["line_count"]))
    ws4.cell(r, 6, int(float(st_tot["total_qty"])))
    ws4.cell(r, 7, rev)
    ws4.cell(r, 8, cogs)
    ws4.cell(r, 9, f"=G{r}-H{r}")

    style_range(ws4, 1, r, 9, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws4.cell(r, 1).alignment = Alignment(vertical="center", horizontal="center")
    ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws4.cell(r, 2).font = f_data_bold
    ws4.cell(r, 7).font = f_data_bold
    for ci in (1, 3, 4, 5, 6): ws4.cell(r, ci).number_format = FMT_INT
    for ci in (7, 8, 9): ws4.cell(r, ci).number_format = FMT_RP
    ws4.row_dimensions[r].height = 20

end_sti_row = r
r += 1
ws4.cell(r, 2, "TOTAL GABUNGAN 3 TOKO")
ws4.cell(r, 3, len(items_all["byCategory"]))
for ci, col_let in [(4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I")]:
    ws4.cell(r, ci, f"=SUM({col_let}{start_sti_row}:{col_let}{end_sti_row})")
style_range(ws4, 1, r, 9, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
for ci in (3, 4, 5, 6): ws4.cell(r, ci).number_format = FMT_INT
for ci in (7, 8, 9): ws4.cell(r, ci).number_format = FMT_RP
ws4.row_dimensions[r].height = 22

# Section B: Rekapitulasi per Kategori Barang Gabungan
r += 2
ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
ws4.cell(r, 1, f"B. REKAPITULASI PENJUALAN PER KATEGORI BARANG KONSOLIDASI ({len(items_all['byCategory'])} KATEGORI)")
style_range(ws4, 1, r, 9, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws4.row_dimensions[r].height = 24

r += 1
cat_headers = ["No", "Kategori Produk", "Produk Unik (SKU)", "Frekuensi Struk", "Total Qty Terjual", "Total Penjualan (Rp)", "% Porsi Penjualan", "Estimasi HPP (Rp)", "Estimasi Margin Kotor (Rp)"]
for col_idx, h in enumerate(cat_headers, 1):
    c = ws4.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx == 1 else ("left" if col_idx == 2 else "right"), wrap_text=True)
ws4.row_dimensions[r].height = 26

tot_cat_rev = sum(int(float(c["totalRevenue"])) for c in items_all["byCategory"])
start_cat_row = r + 1
for idx, cat in enumerate(items_all["byCategory"], 1):
    r += 1
    rev = int(float(cat["totalRevenue"]))
    cogs = round(float(cat["estCogs"]))
    qty = int(float(cat["totalQty"]))
    fill_row = fill_zebra if idx % 2 == 0 else fill_white

    ws4.cell(r, 1, idx)
    ws4.cell(r, 2, cat["categoryName"])
    ws4.cell(r, 3, int(cat["uniqueItems"]))
    ws4.cell(r, 4, int(cat["txCount"]))
    ws4.cell(r, 5, qty)
    ws4.cell(r, 6, rev)
    ws4.cell(r, 7, rev / tot_cat_rev if tot_cat_rev else 0)
    ws4.cell(r, 8, cogs)
    ws4.cell(r, 9, f"=F{r}-H{r}")

    style_range(ws4, 1, r, 9, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws4.cell(r, 1).alignment = Alignment(vertical="center", horizontal="center")
    ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws4.cell(r, 2).font = f_data_bold
    for ci in (1, 3, 4, 5): ws4.cell(r, ci).number_format = FMT_INT
    for ci in (6, 8, 9): ws4.cell(r, ci).number_format = FMT_RP
    ws4.cell(r, 7).number_format = FMT_PCT
    ws4.row_dimensions[r].height = 19

end_cat_row = r
r += 1
ws4.cell(r, 2, "TOTAL BARIS ITEM TERJUAL (SELURUH TOKO)")
ws4.cell(r, 3, f"=SUM(C{start_cat_row}:C{end_cat_row})")
ws4.cell(r, 5, f"=SUM(E{start_cat_row}:E{end_cat_row})")
ws4.cell(r, 6, f"=SUM(F{start_cat_row}:F{end_cat_row})")
ws4.cell(r, 7, f"=SUM(G{start_cat_row}:G{end_cat_row})")
ws4.cell(r, 8, f"=SUM(H{start_cat_row}:H{end_cat_row})")
ws4.cell(r, 9, f"=SUM(I{start_cat_row}:I{end_cat_row})")
style_range(ws4, 1, r, 9, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
for ci in (3, 5): ws4.cell(r, ci).number_format = FMT_INT
for ci in (6, 8, 9): ws4.cell(r, ci).number_format = FMT_RP
ws4.cell(r, 7).number_format = FMT_PCT
ws4.row_dimensions[r].height = 22

# Section C: Top 100 Products Consolidated
r += 2
ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
ws4.cell(r, 1, "C. TOP 100 PRODUK TERLARIS KONSOLIDASI BERDASARKAN NILAI PENJUALAN (OKTOBER 2026)")
style_range(ws4, 1, r, 9, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws4.row_dimensions[r].height = 24

r += 1
prod_headers = ["Rank", "Nama Produk", "ID Item", "Kategori", "Frekuensi Struk", "Total Qty", "Harga Jual Satuan (Rp)", "Total Penjualan (Rp)", "Estimasi HPP (Rp)"]
for col_idx, h in enumerate(prod_headers, 1):
    c = ws4.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 3) else ("left" if col_idx in (2, 4) else "right"), wrap_text=True)
ws4.row_dimensions[r].height = 26

start_top_row = r + 1
for idx, it in enumerate(items_all["topItemsByRevenue"], 1):
    r += 1
    rev = int(float(it["totalRevenue"]))
    cogs = round(float(it["estCogs"]))
    uprice = int(float(it["unitPrice"]))
    qty = int(float(it["totalQty"]))
    fill_row = fill_zebra if idx % 2 == 0 else fill_white

    ws4.cell(r, 1, idx)
    ws4.cell(r, 2, it["itemName"])
    ws4.cell(r, 3, int(it["itemId"]))
    ws4.cell(r, 4, it["categoryName"])
    ws4.cell(r, 5, int(it["txCount"]))
    ws4.cell(r, 6, qty)
    ws4.cell(r, 7, uprice)
    ws4.cell(r, 8, rev)
    ws4.cell(r, 9, cogs)

    style_range(ws4, 1, r, 9, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws4.cell(r, 1).alignment = Alignment(vertical="center", horizontal="center")
    ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws4.cell(r, 2).font = f_data_bold
    ws4.cell(r, 3).alignment = Alignment(vertical="center", horizontal="center")
    ws4.cell(r, 4).alignment = Alignment(vertical="center", horizontal="left")
    for ci in (1, 3, 5, 6): ws4.cell(r, ci).number_format = FMT_INT
    for ci in (7, 8, 9): ws4.cell(r, ci).number_format = FMT_RP
    ws4.row_dimensions[r].height = 19

end_top_row = r
r += 1
ws4.cell(r, 2, "TOTAL TOP 100 PRODUK TERLARIS")
ws4.cell(r, 6, f"=SUM(F{start_top_row}:F{end_top_row})")
ws4.cell(r, 8, f"=SUM(H{start_top_row}:H{end_top_row})")
ws4.cell(r, 9, f"=SUM(I{start_top_row}:I{end_top_row})")
style_range(ws4, 1, r, 9, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws4.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
ws4.cell(r, 6).number_format = FMT_INT
for ci in (8, 9): ws4.cell(r, ci).number_format = FMT_RP
ws4.row_dimensions[r].height = 22

cat_col_widths = [8, 36, 16, 18, 18, 22, 22, 22, 24]
for idx, w in enumerate(cat_col_widths, 1):
    ws4.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 5: REKAP BELANJA ANGGOTA (737 ANGGOTA LINTAS 3 TOKO)
# ==============================================================================
ws5 = wb.create_sheet("Rekap Belanja Anggota")
ws5.views.sheetView[0].showGridLines = True
add_banner(
    ws5,
    f"REKAPITULASI BELANJA ANGGOTA KOPERASI · SELURUH TOKO OKTOBER 2026 ({unique_nik_count} ANGGOTA)",
    "Peringkat anggota berdasarkan nilai belanja gabungan di TB II Tambun, TB II Kp. Bulu, dan GIIC Cikarang (1 – 31 Oktober 2026)",
    max_col=12
)

member_agg = {}
for s in final_sales:
    nik = s["memberNik"]
    if not nik:
        continue
    if nik not in member_agg:
        member_agg[nik] = {
            "nik": nik,
            "name": nik_to_name.get(nik, s["customerName"] or f"NIK {nik}"),
            "txCount": 0,
            "store1Rp": 0,
            "store2Rp": 0,
            "store3Rp": 0,
            "kreditRp": 0,
            "cashRp": 0,
            "qrisRp": 0,
            "totalRp": 0,
        }
    gt = (s["grandTotalSen"] or 0) // 100
    member_agg[nik]["txCount"] += 1
    member_agg[nik]["totalRp"] += gt
    if s["companyId"] == 1: member_agg[nik]["store1Rp"] += gt
    elif s["companyId"] == 2: member_agg[nik]["store2Rp"] += gt
    elif s["companyId"] == 3: member_agg[nik]["store3Rp"] += gt
    if s["paymentType"] == "Kredit": member_agg[nik]["kreditRp"] += gt
    elif s["paymentType"] == "Cash": member_agg[nik]["cashRp"] += gt
    elif s["paymentType"] == "QRIS": member_agg[nik]["qrisRp"] += gt

sorted_members = sorted(member_agg.values(), key=lambda x: (-x["totalRp"], -x["txCount"], x["nik"]))

r = 4
mem_headers = [
    "Rank", "NIK Anggota", "Nama Lengkap Anggota", "Frekuensi Struk",
    "Belanja TB II Tambun (Rp)", "Belanja TB II Kp. Bulu (Rp)", "Belanja GIIC Cikarang (Rp)",
    "Belanja Kredit (Rp)", "Belanja Tunai (Rp)", "Belanja QRIS (Rp)",
    "Total Belanja (Rp)", "Rata-rata / Struk (Rp)"
]
for col_idx, h in enumerate(mem_headers, 1):
    c = ws5.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 2) else ("left" if col_idx == 3 else "right"), wrap_text=True)
ws5.row_dimensions[r].height = 28

start_mem_row = r + 1
for idx, m in enumerate(sorted_members, 1):
    r += 1
    fill_row = fill_zebra if idx % 2 == 0 else fill_white
    ws5.cell(r, 1, idx)
    ws5.cell(r, 2, m["nik"])
    ws5.cell(r, 3, m["name"])
    ws5.cell(r, 4, m["txCount"])
    ws5.cell(r, 5, m["store1Rp"])
    ws5.cell(r, 6, m["store2Rp"])
    ws5.cell(r, 7, m["store3Rp"])
    ws5.cell(r, 8, m["kreditRp"])
    ws5.cell(r, 9, m["cashRp"])
    ws5.cell(r, 10, m["qrisRp"])
    ws5.cell(r, 11, f"=E{r}+F{r}+G{r}")
    ws5.cell(r, 12, f"=K{r}/D{r}")

    style_range(ws5, 1, r, 12, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws5.cell(r, 1).alignment = Alignment(vertical="center", horizontal="center")
    ws5.cell(r, 2).alignment = Alignment(vertical="center", horizontal="center")
    ws5.cell(r, 3).alignment = Alignment(vertical="center", horizontal="left")
    ws5.cell(r, 3).font = f_data_bold
    ws5.cell(r, 11).font = f_data_bold
    for ci in (1, 4): ws5.cell(r, ci).number_format = FMT_INT
    for ci in (5, 6, 7, 8, 9, 10, 11, 12): ws5.cell(r, ci).number_format = FMT_RP
    ws5.row_dimensions[r].height = 19

end_mem_row = r
r += 1
ws5.cell(r, 3, f"TOTAL BELANJA ANGGOTA ({unique_nik_count} NIK UNIK)")
for ci, col_let in [(4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I"), (10, "J"), (11, "K")]:
    ws5.cell(r, ci, f"=SUM({col_let}{start_mem_row}:{col_let}{end_mem_row})")
ws5.cell(r, 12, f"=K{r}/D{r}")
style_range(ws5, 1, r, 12, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws5.cell(r, 3).alignment = Alignment(vertical="center", horizontal="left")
ws5.cell(r, 4).number_format = FMT_INT
for ci in (5, 6, 7, 8, 9, 10, 11, 12): ws5.cell(r, ci).number_format = FMT_RP
ws5.row_dimensions[r].height = 24

ws5.freeze_panes = "D5"
ws5.auto_filter.ref = f"A4:L{end_mem_row}"

mem_col_widths = [8, 14, 34, 15, 20, 20, 20, 20, 18, 18, 22, 20]
for idx, w in enumerate(mem_col_widths, 1):
    ws5.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 6: QUOTATION, RETUR, & CATATAN AUDIT (SELURUH TOKO)
# ==============================================================================
ws6 = wb.create_sheet("Quotation & Catatan Audit")
ws6.views.sheetView[0].showGridLines = True
add_banner(
    ws6,
    "DAFTAR TRANSAKSI ANOMALI (UNPAID), RETUR PENJUALAN, & QUOTATION · OKTOBER 2026",
    "6 transaksi Final berstatus Unpaid, 2 transaksi Retur Penjualan, & 71 transaksi Quotation (Rp 0) lintas 3 cabang toko",
    max_col=11
)

# Section A: 6 Unpaid Finals
r = 4
ws6.merge_cells(start_row=r, start_column=1, end_row=r, end_column=11)
ws6.cell(r, 1, "A. 6 TRANSAKSI FINAL DENGAN STATUS PEMBAYARAN 'UNPAID' (TB II TAMBUN & TB II KP. BULU)")
style_range(ws6, 1, r, 11, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws6.row_dimensions[r].height = 24

r += 1
anom_headers = ["No", "Cabang Toko", "ID Transaksi", "Nomor Struk", "Tanggal", "Metode", "Status Penjualan", "Status Bayar", "Total (Rp)", "Dibayar (Rp)", "Operator & Catatan Audit"]
for col_idx, h in enumerate(anom_headers, 1):
    c = ws6.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 3, 4, 5, 6, 7, 8) else ("right" if col_idx in (9, 10) else "left"))
ws6.row_dimensions[r].height = 24

unpaid_finals = [s for s in final_sales if s["paymentStatus"] != "Paid"]
start_unp_row = r + 1
for idx, s in enumerate(unpaid_finals, 1):
    r += 1
    gt = (s["grandTotalSen"] or 0) // 100
    pd = (s["paidSen"] or 0) // 100
    note = f"{s['createdBy']} ({s['cashierLabel']}) · Paid amount penuh tetapi flag payment_status='Unpaid'"
    if s["saleId"] == 244802:
        note = f"{s['createdBy']} ({s['cashierLabel']}) · Duplikat nomor struk TBII26100500461 (tanpa baris item / 0 item)"
    elif s["salesCode"] == "MJ26101601182":
        note = f"{s['createdBy']} ({s['cashierLabel']}) · Duplikat nomor struk MJ26101601182 pada 16 Okt 2026"
    ws6.cell(r, 1, idx)
    ws6.cell(r, 2, s["companyName"])
    ws6.cell(r, 3, s["saleId"])
    ws6.cell(r, 4, s["salesCode"])
    ws6.cell(r, 5, s["saleDate"])
    ws6.cell(r, 6, s["paymentType"])
    ws6.cell(r, 7, s["salesStatus"])
    ws6.cell(r, 8, s["paymentStatus"])
    ws6.cell(r, 9, gt)
    ws6.cell(r, 10, pd)
    ws6.cell(r, 11, note)
    style_range(ws6, 1, r, 11, r, font=f_data, fill=fill_warn, border=border_cell, alignment=Alignment(vertical="center", horizontal="center"))
    ws6.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws6.cell(r, 4).font = f_warn
    ws6.cell(r, 8).font = f_warn
    for ci in (9, 10):
        ws6.cell(r, ci).number_format = FMT_RP
        ws6.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")
    ws6.cell(r, 11).alignment = Alignment(vertical="center", horizontal="left")
    ws6.row_dimensions[r].height = 20

end_unp_row = r
r += 1
ws6.cell(r, 2, "TOTAL TRANSAKSI FINAL UNPAID (6 STRUK)")
ws6.cell(r, 9, f"=SUM(I{start_unp_row}:I{end_unp_row})")
ws6.cell(r, 10, f"=SUM(J{start_unp_row}:J{end_unp_row})")
style_range(ws6, 1, r, 11, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center"))
for ci in (9, 10):
    ws6.cell(r, ci).number_format = FMT_RP
    ws6.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")
ws6.row_dimensions[r].height = 22

# Section B: 2 Sales Returns
r += 2
ws6.merge_cells(start_row=r, start_column=1, end_row=r, end_column=11)
ws6.cell(r, 1, "B. 2 TRANSAKSI RETUR PENJUALAN PERIODE OKTOBER 2026 (TOKO S-MART TB II KP. BULU)")
style_range(ws6, 1, r, 11, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws6.row_dimensions[r].height = 24

r += 1
ret_headers = ["No", "Cabang Toko", "ID Retur", "Nomor Retur", "Tanggal Retur", "Status Retur", "Operator", "Nilai Retur (Rp)", "Keterangan", "", ""]
for col_idx, h in enumerate(ret_headers[:9], 1):
    c = ws6.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 3, 4, 5, 6, 7) else ("right" if col_idx == 8 else "left"))
ws6.merge_cells(start_row=r, start_column=9, end_row=r, end_column=11)
style_range(ws6, 9, r, 11, r, font=f_tbl_hdr, fill=fill_tbl_hdr, border=border_hdr, alignment=Alignment(vertical="center", horizontal="left"))
ws6.row_dimensions[r].height = 24

start_ret_row = r + 1
for idx, rt in enumerate(returns_list, 1):
    r += 1
    fill_row = fill_zebra if idx % 2 == 0 else fill_white
    ws6.cell(r, 1, idx)
    ws6.cell(r, 2, "TOKO S-MART TB II (Kp. Bulu)")
    ws6.cell(r, 3, int(rt["id"]))
    ws6.cell(r, 4, rt["return_code"])
    ws6.cell(r, 5, rt["return_date"])
    ws6.cell(r, 6, rt["return_status"])
    ws6.cell(r, 7, rt["created_by"])
    ws6.cell(r, 8, round(float(rt["grand_total"])))
    ws6.merge_cells(start_row=r, start_column=9, end_row=r, end_column=11)
    ws6.cell(r, 9, "Retur penjualan tercatat pada tabel db_salesreturn cabang Kp. Bulu")
    style_range(ws6, 1, r, 11, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="center"))
    ws6.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws6.cell(r, 8).number_format = FMT_RP
    ws6.cell(r, 8).alignment = Alignment(vertical="center", horizontal="right")
    ws6.cell(r, 9).alignment = Alignment(vertical="center", horizontal="left")
    ws6.row_dimensions[r].height = 20

end_ret_row = r
r += 1
ws6.cell(r, 2, "TOTAL RETUR PENJUALAN OKTOBER 2026")
ws6.cell(r, 8, f"=SUM(H{start_ret_row}:H{end_ret_row})")
style_range(ws6, 1, r, 11, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center"))
ws6.cell(r, 8).number_format = FMT_RP
ws6.cell(r, 8).alignment = Alignment(vertical="center", horizontal="right")
ws6.row_dimensions[r].height = 22

# Section C: 71 Quotations
r += 2
ws6.merge_cells(start_row=r, start_column=1, end_row=r, end_column=11)
ws6.cell(r, 1, f"C. {len(quotation_sales)} TRANSAKSI BERSTATUS 'QUOTATION' (DRAFT / HOLD · NILAI RP 0 LINTAS 3 TOKO)")
style_range(ws6, 1, r, 11, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws6.row_dimensions[r].height = 24

r += 1
q_headers = ["No", "Cabang Toko", "ID Transaksi", "Nomor Struk", "Tanggal", "NIK Anggota", "Nama Anggota (Master)", "Status Penjualan", "Metode", "Total (Rp)", "Operator & Kasir"]
for col_idx, h in enumerate(q_headers, 1):
    c = ws6.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 3, 4, 5, 6, 8, 9) else ("right" if col_idx == 10 else "left"))
ws6.row_dimensions[r].height = 24

for idx, s in enumerate(quotation_sales, 1):
    r += 1
    nik = s["memberNik"] or ""
    rname = nik_to_name.get(nik, "Pelanggan Umum / Tidak Tercatat") if nik else "Pelanggan Umum"
    fill_row = fill_zebra if idx % 2 == 0 else fill_white
    ws6.cell(r, 1, idx)
    ws6.cell(r, 2, s["companyName"])
    ws6.cell(r, 3, s["saleId"])
    ws6.cell(r, 4, s["salesCode"])
    ws6.cell(r, 5, s["saleDate"])
    ws6.cell(r, 6, nik if nik else "-")
    ws6.cell(r, 7, rname)
    ws6.cell(r, 8, s["salesStatus"])
    ws6.cell(r, 9, s["paymentType"] or "-")
    ws6.cell(r, 10, (s["grandTotalSen"] or 0) // 100)
    ws6.cell(r, 11, f"{s['createdBy']} ({s['cashierLabel'] or '-'} · {s['registerReference'] or '-'})")
    style_range(ws6, 1, r, 11, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="center"))
    ws6.cell(r, 2).alignment = Alignment(vertical="center", horizontal="left")
    ws6.cell(r, 7).alignment = Alignment(vertical="center", horizontal="left")
    ws6.cell(r, 10).number_format = FMT_RP
    ws6.cell(r, 10).alignment = Alignment(vertical="center", horizontal="right")
    ws6.cell(r, 11).alignment = Alignment(vertical="center", horizontal="left")
    ws6.row_dimensions[r].height = 19

q_col_widths = [6, 26, 13, 19, 13, 14, 30, 16, 14, 16, 42]
for idx, w in enumerate(q_col_widths, 1):
    ws6.column_dimensions[get_column_letter(idx)].width = w

wb.remove(default_ws)

wb.save(OUT_DOCS)
wb.save(OUT_ROOT)
print("Saved All-Stores Consolidated Excel workbooks successfully:")
print(" -", OUT_DOCS)
print(" -", OUT_ROOT)
