"""Generate synthetic KOSIPA import fixtures from the documented column contracts.

No legacy file is copied: headers are typed from LEGACY_FEATURE_INVENTORY.md section C, and every example value is synthetic
(NIK 99901-99909, names "CONTOH SINTETIS n"). Run: python3 -I generate_fixtures.py   (requires openpyxl)
"""
import datetime
import os

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
LOAN_AI = ["TGL CAIR", "TGL POTONGAN KE-1", "NIK", "JUMLAH PINJAMAN", "JANGKA WAKTU", "SUKU BUNGA", "BUNGA (%)",
           "BIAYA ADMIN (%)", "BIAYA ASURANSI (%)"]
LOAN_ROW = ["05-12-2025", "10-01-2026", "99901", "15000000", "12", "Flat", "1", "0", "0"]
MATRIX = ["NIK", "KASBON 1X POT", "KASBON >1X", "SEPEDA", "ELEKTRONIK", "SERVICE MOTOR MOBIL", "SURAT2", "SIM", "PBS",
          "PRESSING", "DKM", "TOUR WELDING", " SPV UP", "SBC", "PGPG", "SUKARELA", "KPR BTN BEKASI", "KPR BTN PUR",
          "GAJI MINUS", "SIMPANAN WAJIB", "DANA KOP", "JASA DANA KOP", "KOP ANUITAS", "JASA KOP ANUITAS", "DANAMON",
          "JASA DANAMON", "DKI", "JASA DKI", "BJB", "JASA BJB", "BSM/BSI", "JASA BSM/BSI", "BSI NEW", "JASA BSI NEW",
          "MUAMALAT", "JASA MUAMALAT", "KONSINYIASI", "TOKO TB", "TOKO MJ", "TOKO GIIC", "PPOB"]

# template id -> (file, header, one synthetic example row, legacy features)
TEMPLATES = {
    "KOS-TPL-001": ("tpl001_members.xlsx", ["NIK", "ID_CARD", "NAMA", "GENDER", "GROUP_ANGGOTA", "STATUS", "SIM_POKOK", "SIM_WAJIB", "LIMIT_TOKO"],
                    ["99901", "", "CONTOH SINTETIS 1", "L", "ANGGOTA", "AKTIVE", "0", "0", "0"], "IMP-001, IMP-002"),
    "KOS-TPL-002": ("tpl002_limits_as_parsed.xlsx", ["NIK", "LIMIT_TOKO", "GAJI_MINUS", "LIMIT_PPOB"],
                    ["99901", "500000", "", "100000"], "IMP-003, IMP-004 (4 columns as the parser reads them; legacy template has 3)"),
    "KOS-TPL-003": ("tpl003_savings_lines.xlsx", ["NIK (nik 5 digit)", "NOMINAL"], ["99901", "100000"], "IMP-005, 006, 007"),
    "KOS-TPL-004": ("tpl004_withdrawals.xlsx", ["tgl", "NIK", "NOMINAL"], ["03-06-2025", "99901", "500000"], "IMP-008"),
    "KOS-TPL-005": ("tpl005_exit_settlement.xlsx",
                    ["nik", "tgl_masuk", "tgl_keluar", "sim_pokok", "sim_wajib", "sim_sukarela", "kasbon", "jasa_kasbo", "pembiayaan",
                     "jasa_pembiayaan", "reguler", "jasa_regular", "bank", "jasa_bank", "toko", "ppob", "surat_pernyataan (Ya/Tidak)"],
                    ["99901", "01-01-2020", "31-10-2025"] + ["0"] * 13 + ["Ya"], "IMP-009"),
    "KOS-TPL-006": ("tpl006_deduction_master.xlsx", ["NIK", "NOMINAL"], ["99901", "50000"], "IMP-010"),
    "KOS-TPL-007": ("tpl007_loans_any.xlsx", LOAN_AI + ["JENIS PINJAMAN", "PEMBIAYA/JENIS"], LOAN_ROW + ["PINJAMAN REGULER", "PINJAMAN REGULAR"], "IMP-011"),
    "KOS-TPL-008": ("tpl008_loans_regular.xlsx", LOAN_AI + ["JENIS PINJAMAN", "BLOKIR 1X"], LOAN_ROW + ["PINJAMAN REGULAR", "NO"], "IMP-012"),
    "KOS-TPL-009": ("tpl009_loans_bank_kpr.xlsx", LOAN_AI + ["BANK", "Executing/Chanelling"], LOAN_ROW + ["BANK DKI", "Executing"], "IMP-013, IMP-017"),
    "KOS-TPL-010": ("tpl010_kasbon.xlsx", LOAN_AI + ["JENIS KASBON"], LOAN_ROW + ["KASBON 1X POT"], "IMP-014"),
    "KOS-TPL-011": ("tpl011_pembiayaan.xlsx", LOAN_AI + ["JENIS PEMBIAYAAN", "KETERANGAN"], LOAN_ROW + ["ELEKTRONIK", "contoh"], "IMP-015"),
    "KOS-TPL-012": ("tpl012_gaji_minus.xlsx", LOAN_AI[:7], LOAN_ROW[:7], "IMP-016"),
    "KOS-TPL-013": ("tpl013_payroll_matrix.xlsx", MATRIX, ["99901"] + ["0"] * 40, "IMP-018"),
    "KOS-TPL-014": ("tpl014_store_bills.xlsx", ["NIK", "NAMA TOKO", "TAGIHAN"], ["99901", "TOKO_TAMBUN", "250000"], "IMP-019"),
    "KOS-TPL-015": ("tpl015_shu.xlsx", ["NIK", "SIMPANAN", "TRANSASI USAHA", "SUKARELA", "BAGIAN", "PLANT"],
                    ["99901", "1000000", "500000", "12345", "BAGIAN CONTOH", "PLANT CONTOH"], "IMP-020"),
    "KOS-TPL-016": ("tpl016_shu_sukarela.xlsx", ["NIK", "JASA SIM SUKARELA"], ["99901", "12345"], "IMP-021"),
}


def write(path, header, rows, sheet="Sheet1"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
    ws.append(header)
    for r in rows:
        ws.append(r)
    wb.save(path)


def main():
    os.makedirs(os.path.join(HERE, "templates"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "samples"), exist_ok=True)
    for tid, (fname, header, example, feats) in TEMPLATES.items():
        write(os.path.join(HERE, "templates", fname), header, [])                                   # header only
        write(os.path.join(HERE, "samples", fname.replace(".xlsx", "_example.xlsx")), header, [example])  # 1 synthetic row
    # Edge cases used by the runtime probes (all synthetic)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["TGL CAIR", "NIK", "JUMLAH PINJAMAN"])
    ws.append(["05-12-2022", "09901", 15000000])                                 # text date, text NIK, numeric amount
    ws.append([datetime.datetime(2022, 12, 5), 9901, "15.000.000"])              # date cell, numeric NIK, formatted text
    ws.append(["=TEXT(DATE(2022,12,5),\"DD-MM-YYYY\")", "99999", "1.500.000,00"])  # formula, Indonesian decimal text
    wb.save(os.path.join(HERE, "samples", "edge_cells.xlsx"))
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["TGL CAIR", "TGL POTONGAN KE-1", "NIK"])
    ws.append(["05-12-2022", "05-01-2023", "99901"])
    ws.append(["05-12-2022", "05-01-2023", "99902"])
    wb.create_sheet("Sheet2")
    wb.create_sheet("Sheet3")
    wb.save(os.path.join(HERE, "samples", "edge_three_sheets.xlsx"))
    print("generated", len(TEMPLATES), "templates,", len(TEMPLATES), "examples, 2 edge-case workbooks")


if __name__ == "__main__":
    main()
