#!/usr/bin/env python3
import json
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SCRATCH_DIR = "/Users/macbookprom2/.gemini/antigravity/brain/982b6306-214b-4d05-9e90-eded7ad72f5d/scratch"
OUT_DOCS = "/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/Laporan_Penjualan_TOKO_KKISITB2_Oktober_2026.xlsx"
OUT_ROOT = "/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/Laporan_Penjualan_TOKO_KKISITB2_Oktober_2026.xlsx"

with open(f"{SCRATCH_DIR}/october_sales.json", "r", encoding="utf-8") as f:
    all_sales = json.load(f)

with open(f"{SCRATCH_DIR}/nik_to_name.json", "r", encoding="utf-8") as f:
    nik_to_name = json.load(f)

with open(f"{SCRATCH_DIR}/october_items_summary.json", "r", encoding="utf-8") as f:
    items_summary = json.load(f)

final_sales = [s for s in all_sales if s["salesStatus"] == "Final" and s["recordStatus"] == 1]
quotation_sales = [s for s in all_sales if s["salesStatus"] != "Final"]

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
# Remove default sheet later
default_ws = wb.active

# Styles
FONT_FAMILY = "Calibri"
f_title = Font(name=FONT_FAMILY, size=16, bold=True, color="FFFFFF")
f_subtitle = Font(name=FONT_FAMILY, size=10, italic=True, color="E0E7FF")
f_sec_hdr = Font(name=FONT_FAMILY, size=12, bold=True, color="0F172A")
f_tbl_hdr = Font(name=FONT_FAMILY, size=10, bold=True, color="FFFFFF")
f_data = Font(name=FONT_FAMILY, size=10, bold=False, color="1E293B")
f_data_bold = Font(name=FONT_FAMILY, size=10, bold=True, color="0F172A")
f_data_muted = Font(name=FONT_FAMILY, size=9, italic=True, color="64748B")
f_total = Font(name=FONT_FAMILY, size=10, bold=True, color="0F172A")
f_link = Font(name=FONT_FAMILY, size=10, color="1D4ED8", underline="single")
f_warn = Font(name=FONT_FAMILY, size=10, bold=True, color="B45309")

fill_banner = PatternFill("solid", fgColor="0F2942")
fill_subbanner = PatternFill("solid", fgColor="1E3A5F")
fill_tbl_hdr = PatternFill("solid", fgColor="1E3A5F")
fill_sec_hdr = PatternFill("solid", fgColor="E2E8F0")
fill_zebra = PatternFill("solid", fgColor="F8FAFC")
fill_white = PatternFill("solid", fgColor="FFFFFF")
fill_total = PatternFill("solid", fgColor="DBEAFE")
fill_kpi_bg = PatternFill("solid", fgColor="F1F5F9")
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
    c1 = ws.cell(1, 1, title)
    c2 = ws.cell(2, 1, subtitle)
    style_range(ws, 1, 1, max_col, 1, font=f_title, fill=fill_banner, alignment=Alignment(vertical="center", horizontal="left", indent=1))
    style_range(ws, 1, 2, max_col, 2, font=f_subtitle, fill=fill_subbanner, alignment=Alignment(vertical="center", horizontal="left", indent=1))
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 20

# ==============================================================================
# SHEET 1: RINGKASAN EKSEKUTIF
# ==============================================================================
ws1 = wb.create_sheet("Ringkasan Eksekutif")
ws1.views.sheetView[0].showGridLines = True
add_banner(
    ws1,
    "LAPORAN PENJUALAN BULANAN · TOKO KKISITB2 (KOPERASI SUZUKI MART)",
    "Periode: 1 Oktober 2026 – 31 Oktober 2026 (1 Bulan Penuh) | Sumber: https://smart.kkisitb2.id/sales",
    max_col=7
)

total_final_tx = len(final_sales)
total_final_rp = sum((s["grandTotalSen"] or 0) // 100 for s in final_sales)
total_paid_rp = sum((s["paidSen"] or 0) // 100 for s in final_sales)
total_change_rp = total_paid_rp - total_final_rp
avg_ticket_rp = round(total_final_rp / total_final_tx) if total_final_tx else 0
active_days = len(set(s["saleDate"] for s in final_sales))
avg_daily_rp = round(total_final_rp / active_days) if active_days else 0
total_qty_sold = int(float(items_summary["totals"]["total_qty"]))
total_line_items = int(items_summary["totals"]["line_count"])

# Section 1: Ikhtisar Kinerja Utama (KPI)
r = 4
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "1. IKHTISAR KINERJA UTAMA (OKTOBER 2026)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

kpis = [
    ("Total Nilai Penjualan (Status Final)", total_final_rp, FMT_RP, "Total omzet bersih dari 2.674 struk berstatus Final"),
    ("Total Transaksi Penjualan (Final)", total_final_tx, FMT_INT, "100% transaksi berasal dari kanal POS (Point of Sale)"),
    ("Total Nominal Pembayaran Diterima", total_paid_rp, FMT_RP, "Termasuk uang tunai diterima sebelum kembalian kasir"),
    ("Total Kembalian Tunai (Cash Change)", total_change_rp, FMT_RP, "Selisih uang diterima vs nilai belanja pada transaksi Tunai"),
    ("Rata-rata Nilai Transaksi (Basket Size)", avg_ticket_rp, FMT_RP, "Rata-rata nilai belanja per struk Final"),
    ("Hari Operasional Aktif", active_days, FMT_INT, "26 hari aktif dari 31 hari kalender Oktober 2026"),
    ("Rata-rata Omzet per Hari Aktif", avg_daily_rp, FMT_RP, "Rata-rata penjualan per hari operasional toko buka"),
    ("Total Volume Barang Terjual (Unit/Pcs)", total_qty_sold, FMT_INT, f"Terdiri dari {total_line_items:,} baris item pada detail struk".replace(",", ".")),
    ("Total Retur Penjualan (Oktober 2026)", 0, FMT_INT, "Tidak ada retur penjualan selama periode Oktober 2026"),
    ("Transaksi Non-Final (Quotation / Hold)", len(quotation_sales), FMT_INT, "37 struk berstatus Quotation (nilai Rp 0, tidak masuk omzet Final)"),
]

r += 1
headers_kpi = ["Indikator Kinerja (KPI)", "Nilai", "Keterangan & Catatan Operasional"]
ws1.cell(r, 1, headers_kpi[0])
ws1.cell(r, 2, headers_kpi[1])
ws1.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
ws1.cell(r, 3, headers_kpi[2])
style_range(ws1, 1, r, 7, r, font=f_tbl_hdr, fill=fill_tbl_hdr, border=border_hdr, alignment=Alignment(vertical="center", horizontal="left", indent=1))
ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="right")
ws1.row_dimensions[r].height = 22

for idx, (label, val, num_fmt, desc) in enumerate(kpis):
    r += 1
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, label)
    ws1.cell(r, 2, val)
    ws1.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
    ws1.cell(r, 3, desc)
    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center"))
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 2).font = f_data_bold
    ws1.cell(r, 2).alignment = Alignment(vertical="center", horizontal="right")
    ws1.cell(r, 2).number_format = num_fmt
    ws1.row_dimensions[r].height = 20

# Section 2: Rekapitulasi per Metode Pembayaran
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "2. REKAPITULASI BERDASARKAN METODE PEMBAYARAN (TRANSAKSI FINAL)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
pay_headers = ["Metode Pembayaran", "Jumlah Struk", "% Struk", "Total Penjualan (Rp)", "% Omzet", "Total Dibayar (Rp)", "Rata-rata / Struk (Rp)"]
for col_idx, h in enumerate(pay_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx == 1 else "right")
ws1.row_dimensions[r].height = 22

pay_methods = ["Kredit", "Cash", "QRIS"]
start_pay_row = r + 1
for idx, pm in enumerate(pay_methods):
    r += 1
    pm_rows = [s for s in final_sales if s["paymentType"] == pm]
    cnt = len(pm_rows)
    tot_rp = sum((s["grandTotalSen"] or 0) // 100 for s in pm_rows)
    paid_rp = sum((s["paidSen"] or 0) // 100 for s in pm_rows)
    avg_rp = round(tot_rp / cnt) if cnt else 0
    fill_row = fill_zebra if idx % 2 == 1 else fill_white

    ws1.cell(r, 1, f"{pm} (Potong Gaji Anggota)" if pm == "Kredit" else ("Cash (Tunai)" if pm == "Cash" else "QRIS (Non-Tunai)"))
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, cnt / total_final_tx)
    ws1.cell(r, 4, tot_rp)
    ws1.cell(r, 5, tot_rp / total_final_rp)
    ws1.cell(r, 6, paid_rp)
    ws1.cell(r, 7, avg_rp)

    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
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
style_range(ws1, 1, r, 7, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
ws1.cell(r, 3).number_format = FMT_PCT
ws1.cell(r, 4).number_format = FMT_RP
ws1.cell(r, 5).number_format = FMT_PCT
ws1.cell(r, 6).number_format = FMT_RP
ws1.cell(r, 7).number_format = FMT_RP
ws1.row_dimensions[r].height = 22

# Section 3: Segmen Pelanggan (Anggota vs Non-Anggota)
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "3. REKAPITULASI PER SEGMEN PELANGGAN (ANGGOTA VS UMUM)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
seg_headers = ["Segmen Pelanggan", "Jumlah Struk", "% Struk", "Total Penjualan (Rp)", "% Omzet", "Rata-rata / Struk (Rp)", "Keterangan"]
for col_idx, h in enumerate(seg_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx in (1, 7) else "right")
ws1.row_dimensions[r].height = 22

member_rows = [s for s in final_sales if s["memberNik"]]
non_member_rows = [s for s in final_sales if not s["memberNik"]]
segments = [
    ("Anggota Koperasi (Tercatat NIK)", member_rows, "483 NIK anggota unik berbelanja (Kredit, Tunai, QRIS)"),
    ("Pelanggan Umum / Non-NIK", non_member_rows, "Transaksi walk-in tanpa pencatatan NIK (Tunai & QRIS)"),
]
for idx, (label, rows_seg, note) in enumerate(segments):
    r += 1
    cnt = len(rows_seg)
    tot_rp = sum((s["grandTotalSen"] or 0) // 100 for s in rows_seg)
    avg_rp = round(tot_rp / cnt) if cnt else 0
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, label)
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, cnt / total_final_tx)
    ws1.cell(r, 4, tot_rp)
    ws1.cell(r, 5, tot_rp / total_final_rp)
    ws1.cell(r, 6, avg_rp)
    ws1.cell(r, 7, note)
    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 7).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 2).number_format = FMT_INT
    ws1.cell(r, 3).number_format = FMT_PCT
    ws1.cell(r, 4).number_format = FMT_RP
    ws1.cell(r, 5).number_format = FMT_PCT
    ws1.cell(r, 6).number_format = FMT_RP
    ws1.row_dimensions[r].height = 20

# Section 4: Rekapitulasi Mingguan
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "4. TREN PENJUALAN MINGGUAN (OKTOBER 2026)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
wk_headers = ["Periode Minggu", "Jumlah Struk", "Penjualan Kredit (Rp)", "Penjualan Tunai (Rp)", "Penjualan QRIS (Rp)", "Total Omzet (Rp)", "% Omzet Bulanan"]
for col_idx, h in enumerate(wk_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx == 1 else "right")
ws1.row_dimensions[r].height = 22

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
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["paymentType"] == "Kredit")
    ca_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["paymentType"] == "Cash")
    qr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in wrows if s["paymentType"] == "QRIS")
    tot_rp = kr_rp + ca_rp + qr_rp
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, wlabel)
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, kr_rp)
    ws1.cell(r, 4, ca_rp)
    ws1.cell(r, 5, qr_rp)
    ws1.cell(r, 6, tot_rp)
    ws1.cell(r, 7, tot_rp / total_final_rp)
    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    ws1.cell(r, 2).number_format = FMT_INT
    for ci in (3, 4, 5, 6): ws1.cell(r, ci).number_format = FMT_RP
    ws1.cell(r, 7).number_format = FMT_PCT
    ws1.row_dimensions[r].height = 20

end_wk_row = r
r += 1
ws1.cell(r, 1, "TOTAL OKTOBER 2026")
for ci, col_let in [(2, "B"), (3, "C"), (4, "D"), (5, "E"), (6, "F"), (7, "G")]:
    ws1.cell(r, ci, f"=SUM({col_let}{start_wk_row}:{col_let}{end_wk_row})")
style_range(ws1, 1, r, 7, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
ws1.cell(r, 2).number_format = FMT_INT
for ci in (3, 4, 5, 6): ws1.cell(r, ci).number_format = FMT_RP
ws1.cell(r, 7).number_format = FMT_PCT
ws1.row_dimensions[r].height = 22

# Section 5: Kinerja per Operator / Pembuat & Mesin Kasir
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "5. REKAPITULASI PER OPERATOR KASIR (PEMBUAT TRANSAKSI)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

r += 1
op_headers = ["Operator (createdBy)", "Jumlah Struk", "Struk di KRS01", "Struk di KRS02", "Omzet Kredit (Rp)", "Omzet Cash + QRIS (Rp)", "Total Omzet (Rp)"]
for col_idx, h in enumerate(op_headers, 1):
    c = ws1.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="left" if col_idx == 1 else "right")
ws1.row_dimensions[r].height = 22

operators = ["KHAILA", "Didin", "ade"]
start_op_row = r + 1
for idx, op in enumerate(operators):
    r += 1
    orows = [s for s in final_sales if s["createdBy"] == op]
    cnt = len(orows)
    k1 = sum(1 for s in orows if s["cashierLabel"] == "KRS01")
    k2 = sum(1 for s in orows if s["cashierLabel"] == "KRS02")
    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in orows if s["paymentType"] == "Kredit")
    cq_rp = sum((s["grandTotalSen"] or 0) // 100 for s in orows if s["paymentType"] in ("Cash", "QRIS"))
    tot_rp = kr_rp + cq_rp
    fill_row = fill_zebra if idx % 2 == 1 else fill_white
    ws1.cell(r, 1, op)
    ws1.cell(r, 2, cnt)
    ws1.cell(r, 3, k1)
    ws1.cell(r, 4, k2)
    ws1.cell(r, 5, kr_rp)
    ws1.cell(r, 6, cq_rp)
    ws1.cell(r, 7, tot_rp)
    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
    ws1.cell(r, 1).font = f_data_bold
    for ci in (2, 3, 4): ws1.cell(r, ci).number_format = FMT_INT
    for ci in (5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
    ws1.row_dimensions[r].height = 20

end_op_row = r
r += 1
ws1.cell(r, 1, "TOTAL OPERATOR")
for ci, col_let in [(2, "B"), (3, "C"), (4, "D"), (5, "E"), (6, "F"), (7, "G")]:
    ws1.cell(r, ci, f"=SUM({col_let}{start_op_row}:{col_let}{end_op_row})")
style_range(ws1, 1, r, 7, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws1.cell(r, 1).alignment = Alignment(vertical="center", horizontal="left")
for ci in (2, 3, 4): ws1.cell(r, ci).number_format = FMT_INT
for ci in (5, 6, 7): ws1.cell(r, ci).number_format = FMT_RP
ws1.row_dimensions[r].height = 22

# Section 6: Catatan Kualitas Data & Transisi Sistem
r += 2
ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws1.cell(r, 1, "6. CATATAN AUDIT DATA & TRANSISI SISTEM POS (OKTOBER 2026)")
style_range(ws1, 1, r, 7, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws1.row_dimensions[r].height = 24

notes = [
    ("Cutover ke Next.js POS (13–14 Okt 2026)", "Sejak 13 Oktober 2026 (struk TBII26101301228), aplikasi POS baru (smart.kkisitb2.id) mulai aktif menyimpan nama lengkap anggota pada header struk (1.498 struk). Untuk 641 struk anggota pada 1–13 Oktober 2026 yang hanya menyimpan NIK, nama anggota telah dilengkapi 100% dari master anggota koperasi pada sheet Riwayat Transaksi."),
    ("Aktivasi Pembayaran QRIS (14 Okt 2026)", "Transaksi QRIS mulai tercatat sejak 14 Oktober 2026 sebanyak 123 struk senilai Rp 4.418.500 (100% berstatus Paid)."),
    ("4 Struk Final Berstatus 'Unpaid' (Legacy POS)", "Terdapat 4 transaksi berstatus Final namun payment_status='Unpaid' pada sistem lama (1 & 5 Okt 2026): TBII26100100089 (Rp 999.000), TBII26100500396 (Rp 229.000), serta 2 baris dengan nomor struk ganda TBII26100500461 (ID 244801 & ID 244802 masing-masing Rp 72.000, di mana ID 244802 tidak memiliki baris item). Seluruhnya memiliki paid_amount = grand_total pada metode Cash."),
    ("37 Struk Berstatus 'Quotation' (Rp 0)", "Pada filter 'Semua Status' di /sales terdapat 37 record berstatus Quotation dengan nilai Rp 0 (transaksi ditahan/batal di kasir). Daftar lengkapnya dipisahkan pada Sheet 6 agar tidak mencemari perhitungan omzet Final."),
]
for title_n, body_n in notes:
    r += 1
    ws1.cell(r, 1, title_n)
    ws1.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
    ws1.cell(r, 2, body_n)
    style_range(ws1, 1, r, 7, r, font=f_data, fill=fill_warn, border=border_cell, alignment=Alignment(vertical="center", wrap_text=True))
    ws1.cell(r, 1).font = f_warn
    ws1.row_dimensions[r].height = 34

ws1.column_dimensions["A"].width = 38
ws1.column_dimensions["B"].width = 20
ws1.column_dimensions["C"].width = 22
ws1.column_dimensions["D"].width = 22
ws1.column_dimensions["E"].width = 22
ws1.column_dimensions["F"].width = 22
ws1.column_dimensions["G"].width = 24

# ==============================================================================
# SHEET 2: REKAP HARIAN (1-31 OKT)
# ==============================================================================
ws2 = wb.create_sheet("Rekap Harian (1-31 Okt)")
ws2.views.sheetView[0].showGridLines = True
add_banner(
    ws2,
    "REKAPITULASI PENJUALAN HARIAN · OKTOBER 2026 (1 – 31 OKTOBER 2026)",
    "Rincian transaksi Final per hari kalender beserta pemisahan metode pembayaran (Kredit, Cash, QRIS) dan Quotation",
    max_col=13
)

r = 4
d_headers = [
    "Tanggal", "Hari", "Status Toko", "Total Struk (Final)",
    "Struk Kredit", "Omzet Kredit (Rp)",
    "Struk Cash", "Omzet Cash (Rp)",
    "Struk QRIS", "Omzet QRIS (Rp)",
    "Total Omzet Final (Rp)", "Rata-rata / Struk (Rp)", "Struk Quotation (Rp 0)"
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

    kr = [s for s in d_final if s["paymentType"] == "Kredit"]
    ca = [s for s in d_final if s["paymentType"] == "Cash"]
    qr = [s for s in d_final if s["paymentType"] == "QRIS"]

    kr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in kr)
    ca_rp = sum((s["grandTotalSen"] or 0) // 100 for s in ca)
    qr_rp = sum((s["grandTotalSen"] or 0) // 100 for s in qr)
    tot_rp = kr_rp + ca_rp + qr_rp
    cnt = len(d_final)
    avg_rp = round(tot_rp / cnt) if cnt else 0

    is_off = cnt == 0
    fill_row = PatternFill("solid", fgColor="F1F5F9") if is_off else (fill_zebra if day_num % 2 == 0 else fill_white)
    font_row = f_data_muted if is_off else f_data

    ws2.cell(r, 1, d_str)
    ws2.cell(r, 2, d_name)
    ws2.cell(r, 3, "Tutup / Akhir Pekan" if is_off else "Operasional Aktif")
    ws2.cell(r, 4, cnt)
    ws2.cell(r, 5, len(kr))
    ws2.cell(r, 6, kr_rp)
    ws2.cell(r, 7, len(ca))
    ws2.cell(r, 8, ca_rp)
    ws2.cell(r, 9, len(qr))
    ws2.cell(r, 10, qr_rp)
    ws2.cell(r, 11, tot_rp)
    ws2.cell(r, 12, avg_rp)
    ws2.cell(r, 13, len(d_quot))

    style_range(ws2, 1, r, 13, r, font=font_row, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    for ci in (1, 2, 3):
        ws2.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    if not is_off:
        ws2.cell(r, 1).font = f_data_bold
        ws2.cell(r, 11).font = f_data_bold
    for ci in (4, 5, 7, 9, 13):
        ws2.cell(r, ci).number_format = FMT_INT
    for ci in (6, 8, 10, 11, 12):
        ws2.cell(r, ci).number_format = FMT_RP
    ws2.row_dimensions[r].height = 20

end_day_row = r
r += 1
ws2.cell(r, 1, "TOTAL")
ws2.cell(r, 2, "31 Hari")
ws2.cell(r, 3, "26 Hari Aktif")
for ci, col_let in [(4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I"), (10, "J"), (11, "K"), (13, "M")]:
    ws2.cell(r, ci, f"=SUM({col_let}{start_day_row}:{col_let}{end_day_row})")
ws2.cell(r, 12, f"=K{r}/D{r}")

style_range(ws2, 1, r, 13, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
for ci in (1, 2, 3): ws2.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
for ci in (4, 5, 7, 9, 13): ws2.cell(r, ci).number_format = FMT_INT
for ci in (6, 8, 10, 11, 12): ws2.cell(r, ci).number_format = FMT_RP
ws2.row_dimensions[r].height = 24

ws2.freeze_panes = "A5"
ws2.auto_filter.ref = f"A4:M{end_day_row}"

day_col_widths = [14, 12, 20, 16, 14, 20, 14, 18, 14, 18, 22, 20, 18]
for idx, w in enumerate(day_col_widths, 1):
    ws2.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 3: RIWAYAT TRANSAKSI (FINAL) · 2.674 BARIS
# ==============================================================================
ws3 = wb.create_sheet("Riwayat Transaksi (Final)")
ws3.views.sheetView[0].showGridLines = True
add_banner(
    ws3,
    "RIWAYAT TRANSAKSI PENJUALAN (FINAL) · TOKO KKISITB2 OKTOBER 2026",
    "Daftar lengkap 2.674 transaksi Final pada https://smart.kkisitb2.id/sales (1 Oktober 2026 – 31 Oktober 2026)",
    max_col=20
)

r = 4
tx_headers = [
    "No", "ID Transaksi", "Nomor Struk", "Tanggal", "Hari",
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
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 2, 4, 5, 6, 9, 10, 11, 13, 14, 15, 16, 20) else ("right" if col_idx in (17, 18, 19) else "left"), wrap_text=True)
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
    ws3.cell(r, 2, s["saleId"])
    ws3.cell(r, 3, s["salesCode"])
    ws3.cell(r, 4, s["saleDate"])
    ws3.cell(r, 5, day_name_id(s["saleDate"]))
    ws3.cell(r, 6, nik if nik else "-")
    ws3.cell(r, 7, raw_name)
    ws3.cell(r, 8, resolved_name)
    ws3.cell(r, 9, seg)
    ws3.cell(r, 10, "POS" if s["source"] == "pos" else "Non-POS")
    ws3.cell(r, 11, s["cashierLabel"] or "-")
    ws3.cell(r, 12, s["registerReference"] or "-")
    ws3.cell(r, 13, s["registerId"] or 0)
    ws3.cell(r, 14, s["salesStatus"])
    ws3.cell(r, 15, s["paymentType"])
    ws3.cell(r, 16, s["paymentStatus"])
    ws3.cell(r, 17, gt_rp)
    ws3.cell(r, 18, paid_rp)
    ws3.cell(r, 19, change_rp)
    ws3.cell(r, 20, s["createdBy"] or "-")

    is_unpaid = s["paymentStatus"] != "Paid"
    row_fill = fill_warn if is_unpaid else (fill_zebra if idx % 2 == 0 else fill_white)
    for ci in range(1, 21):
        cell = ws3.cell(r, ci)
        cell.font = f_warn if (is_unpaid and ci in (3, 16)) else f_data
        cell.fill = row_fill
        cell.border = border_cell
    for ci in (1, 2, 13):
        ws3.cell(r, ci).number_format = FMT_INT
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    for ci in (4, 5, 6, 9, 10, 11, 14, 15, 16, 20):
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="center")
    for ci in (17, 18, 19):
        ws3.cell(r, ci).number_format = FMT_RP
        ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")

end_tx_row = r
r += 1
ws3.cell(r, 1, "TOTAL")
ws3.cell(r, 3, f"=COUNTA(C{start_tx_row}:C{end_tx_row})")
ws3.cell(r, 17, f"=SUM(Q{start_tx_row}:Q{end_tx_row})")
ws3.cell(r, 18, f"=SUM(R{start_tx_row}:R{end_tx_row})")
ws3.cell(r, 19, f"=SUM(S{start_tx_row}:S{end_tx_row})")
style_range(ws3, 1, r, 20, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center"))
ws3.cell(r, 3).number_format = FMT_INT
for ci in (17, 18, 19):
    ws3.cell(r, ci).number_format = FMT_RP
    ws3.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")
ws3.row_dimensions[r].height = 24

ws3.freeze_panes = "D5"
ws3.auto_filter.ref = f"A4:T{end_tx_row}"

tx_col_widths = [7, 12, 19, 13, 10, 13, 28, 28, 14, 9, 11, 22, 10, 14, 16, 15, 20, 20, 18, 14]
for idx, w in enumerate(tx_col_widths, 1):
    ws3.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 4: TOP PRODUK & KATEGORI
# ==============================================================================
ws4 = wb.create_sheet("Top Produk & Kategori")
ws4.views.sheetView[0].showGridLines = True
add_banner(
    ws4,
    "ANALISIS KATEGORI BARANG & TOP 100 PRODUK TERLARIS · OKTOBER 2026",
    "Rekapitulasi item terjual berdasarkan baris detail transaksi (db_salesitems) periode 1 – 31 Oktober 2026",
    max_col=9
)

r = 4
ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
ws4.cell(r, 1, "A. REKAPITULASI PENJUALAN PER KATEGORI BARANG (27 KATEGORI)")
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

tot_cat_rev = sum(int(float(c["totalRevenue"])) for c in items_summary["byCategory"])
start_cat_row = r + 1
for idx, cat in enumerate(items_summary["byCategory"], 1):
    r += 1
    rev = int(float(cat["totalRevenue"]))
    cogs = round(float(cat["estCogs"]))
    margin = rev - cogs
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
    ws4.cell(r, 9, margin)

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
ws4.cell(r, 2, "TOTAL BARIS ITEM TERJUAL")
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

# Top 100 Products
r += 2
ws4.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
ws4.cell(r, 1, "B. TOP 100 PRODUK TERLARIS BERDASARKAN NILAI PENJUALAN (OKTOBER 2026)")
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

for idx, it in enumerate(items_summary["topItemsByRevenue"], 1):
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

cat_col_widths = [8, 36, 15, 18, 16, 22, 20, 22, 24]
for idx, w in enumerate(cat_col_widths, 1):
    ws4.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 5: REKAP BELANJA ANGGOTA (483 ANGGOTA)
# ==============================================================================
ws5 = wb.create_sheet("Rekap Belanja Anggota")
ws5.views.sheetView[0].showGridLines = True
add_banner(
    ws5,
    "REKAPITULASI BELANJA ANGGOTA KOPERASI · OKTOBER 2026 (483 ANGGOTA)",
    "Peringkat anggota berdasarkan nilai belanja selama 1 – 31 Oktober 2026 (Kredit Potong Gaji, Tunai, dan QRIS)",
    max_col=9
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
            "kreditRp": 0,
            "cashRp": 0,
            "qrisRp": 0,
            "totalRp": 0,
        }
    gt = (s["grandTotalSen"] or 0) // 100
    member_agg[nik]["txCount"] += 1
    member_agg[nik]["totalRp"] += gt
    if s["paymentType"] == "Kredit": member_agg[nik]["kreditRp"] += gt
    elif s["paymentType"] == "Cash": member_agg[nik]["cashRp"] += gt
    elif s["paymentType"] == "QRIS": member_agg[nik]["qrisRp"] += gt

sorted_members = sorted(member_agg.values(), key=lambda x: (-x["totalRp"], -x["txCount"], x["nik"]))

r = 4
mem_headers = ["Rank", "NIK Anggota", "Nama Lengkap Anggota", "Frekuensi Struk", "Belanja Kredit (Rp)", "Belanja Tunai (Rp)", "Belanja QRIS (Rp)", "Total Belanja (Rp)", "Rata-rata / Struk (Rp)"]
for col_idx, h in enumerate(mem_headers, 1):
    c = ws5.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 2) else ("left" if col_idx == 3 else "right"), wrap_text=True)
ws5.row_dimensions[r].height = 26

start_mem_row = r + 1
for idx, m in enumerate(sorted_members, 1):
    r += 1
    fill_row = fill_zebra if idx % 2 == 0 else fill_white
    avg_m = round(m["totalRp"] / m["txCount"]) if m["txCount"] else 0
    ws5.cell(r, 1, idx)
    ws5.cell(r, 2, m["nik"])
    ws5.cell(r, 3, m["name"])
    ws5.cell(r, 4, m["txCount"])
    ws5.cell(r, 5, m["kreditRp"])
    ws5.cell(r, 6, m["cashRp"])
    ws5.cell(r, 7, m["qrisRp"])
    ws5.cell(r, 8, m["totalRp"])
    ws5.cell(r, 9, avg_m)

    style_range(ws5, 1, r, 9, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="right"))
    ws5.cell(r, 1).alignment = Alignment(vertical="center", horizontal="center")
    ws5.cell(r, 2).alignment = Alignment(vertical="center", horizontal="center")
    ws5.cell(r, 3).alignment = Alignment(vertical="center", horizontal="left")
    ws5.cell(r, 3).font = f_data_bold
    ws5.cell(r, 8).font = f_data_bold
    for ci in (1, 4): ws5.cell(r, ci).number_format = FMT_INT
    for ci in (5, 6, 7, 8, 9): ws5.cell(r, ci).number_format = FMT_RP
    ws5.row_dimensions[r].height = 19

end_mem_row = r
r += 1
ws5.cell(r, 3, "TOTAL BELANJA ANGGOTA (483 NIK)")
for ci, col_let in [(4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H")]:
    ws5.cell(r, ci, f"=SUM({col_let}{start_mem_row}:{col_let}{end_mem_row})")
ws5.cell(r, 9, f"=H{r}/D{r}")
style_range(ws5, 1, r, 9, r, font=f_total, fill=fill_total, border=border_total, alignment=Alignment(vertical="center", horizontal="right"))
ws5.cell(r, 3).alignment = Alignment(vertical="center", horizontal="left")
ws5.cell(r, 4).number_format = FMT_INT
for ci in (5, 6, 7, 8, 9): ws5.cell(r, ci).number_format = FMT_RP
ws5.row_dimensions[r].height = 24

ws5.freeze_panes = "D5"
ws5.auto_filter.ref = f"A4:I{end_mem_row}"

mem_col_widths = [8, 14, 34, 16, 20, 18, 18, 22, 20]
for idx, w in enumerate(mem_col_widths, 1):
    ws5.column_dimensions[get_column_letter(idx)].width = w

# ==============================================================================
# SHEET 6: TRANSAKSI QUOTATION & ANOMALI
# ==============================================================================
ws6 = wb.create_sheet("Quotation & Catatan Audit")
ws6.views.sheetView[0].showGridLines = True
add_banner(
    ws6,
    "DAFTAR TRANSAKSI ANOMALI (UNPAID) & QUOTATION (NON-FINAL) · OKTOBER 2026",
    "4 transaksi Final berstatus Unpaid (POS Lama) & 37 transaksi Quotation (Rp 0) pada https://smart.kkisitb2.id/sales",
    max_col=10
)

r = 4
ws6.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
ws6.cell(r, 1, "A. 4 TRANSAKSI FINAL DENGAN STATUS PEMBAYARAN 'UNPAID' (POS LEGACY 1 & 5 OKTOBER 2026)")
style_range(ws6, 1, r, 10, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws6.row_dimensions[r].height = 24

r += 1
anom_headers = ["No", "ID Transaksi", "Nomor Struk", "Tanggal", "Metode", "Status Penjualan", "Status Bayar", "Total (Rp)", "Dibayar (Rp)", "Operator & Catatan Audit"]
for col_idx, h in enumerate(anom_headers, 1):
    c = ws6.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx <= 7 else ("right" if col_idx in (8, 9) else "left"))
ws6.row_dimensions[r].height = 24

unpaid_finals = [s for s in final_sales if s["paymentStatus"] != "Paid"]
for idx, s in enumerate(unpaid_finals, 1):
    r += 1
    gt = (s["grandTotalSen"] or 0) // 100
    pd = (s["paidSen"] or 0) // 100
    note = f"{s['createdBy']} ({s['cashierLabel']}) · Paid amount penuh tetapi flag payment_status='Unpaid' di POS lama"
    if s["saleId"] == 244802:
        note = f"{s['createdBy']} ({s['cashierLabel']}) · Duplikat nomor struk TBII26100500461 (tanpa baris item / 0 item)"
    ws6.cell(r, 1, idx)
    ws6.cell(r, 2, s["saleId"])
    ws6.cell(r, 3, s["salesCode"])
    ws6.cell(r, 4, s["saleDate"])
    ws6.cell(r, 5, s["paymentType"])
    ws6.cell(r, 6, s["salesStatus"])
    ws6.cell(r, 7, s["paymentStatus"])
    ws6.cell(r, 8, gt)
    ws6.cell(r, 9, pd)
    ws6.cell(r, 10, note)
    style_range(ws6, 1, r, 10, r, font=f_data, fill=fill_warn, border=border_cell, alignment=Alignment(vertical="center", horizontal="center"))
    ws6.cell(r, 3).font = f_warn
    ws6.cell(r, 7).font = f_warn
    for ci in (8, 9):
        ws6.cell(r, ci).number_format = FMT_RP
        ws6.cell(r, ci).alignment = Alignment(vertical="center", horizontal="right")
    ws6.cell(r, 10).alignment = Alignment(vertical="center", horizontal="left")
    ws6.row_dimensions[r].height = 20

r += 2
ws6.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
ws6.cell(r, 1, "B. 37 TRANSAKSI BERSTATUS 'QUOTATION' (DRAFT / HOLD · NILAI RP 0)")
style_range(ws6, 1, r, 10, r, font=f_sec_hdr, fill=fill_sec_hdr, alignment=Alignment(vertical="center", indent=1))
ws6.row_dimensions[r].height = 24

r += 1
q_headers = ["No", "ID Transaksi", "Nomor Struk", "Tanggal", "NIK Anggota", "Nama Anggota (Master)", "Status Penjualan", "Metode", "Total (Rp)", "Operator & Kasir"]
for col_idx, h in enumerate(q_headers, 1):
    c = ws6.cell(r, col_idx, h)
    c.font = f_tbl_hdr
    c.fill = fill_tbl_hdr
    c.border = border_hdr
    c.alignment = Alignment(vertical="center", horizontal="center" if col_idx in (1, 2, 3, 4, 5, 7, 8) else ("right" if col_idx == 9 else "left"))
ws6.row_dimensions[r].height = 24

for idx, s in enumerate(quotation_sales, 1):
    r += 1
    nik = s["memberNik"] or ""
    rname = nik_to_name.get(nik, "Pelanggan Umum / Tidak Tercatat") if nik else "Pelanggan Umum"
    fill_row = fill_zebra if idx % 2 == 0 else fill_white
    ws6.cell(r, 1, idx)
    ws6.cell(r, 2, s["saleId"])
    ws6.cell(r, 3, s["salesCode"])
    ws6.cell(r, 4, s["saleDate"])
    ws6.cell(r, 5, nik if nik else "-")
    ws6.cell(r, 6, rname)
    ws6.cell(r, 7, s["salesStatus"])
    ws6.cell(r, 8, s["paymentType"] or "-")
    ws6.cell(r, 9, (s["grandTotalSen"] or 0) // 100)
    ws6.cell(r, 10, f"{s['createdBy']} ({s['cashierLabel'] or '-'} · {s['registerReference'] or '-'})")
    style_range(ws6, 1, r, 10, r, font=f_data, fill=fill_row, border=border_cell, alignment=Alignment(vertical="center", horizontal="center"))
    ws6.cell(r, 6).alignment = Alignment(vertical="center", horizontal="left")
    ws6.cell(r, 9).number_format = FMT_RP
    ws6.cell(r, 9).alignment = Alignment(vertical="center", horizontal="right")
    ws6.cell(r, 10).alignment = Alignment(vertical="center", horizontal="left")
    ws6.row_dimensions[r].height = 19

q_col_widths = [6, 13, 19, 13, 14, 30, 16, 14, 16, 48]
for idx, w in enumerate(q_col_widths, 1):
    ws6.column_dimensions[get_column_letter(idx)].width = w

# Remove initial empty sheet
wb.remove(default_ws)

wb.save(OUT_DOCS)
wb.save(OUT_ROOT)
print("Saved Excel workbooks successfully:")
print(" -", OUT_DOCS)
print(" -", OUT_ROOT)
