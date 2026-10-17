// E2: synthetic rows only, written through the kkisi_e2e_seed account into kkisi_e2e_legacy. Passwords are random, hashes are
// generated at run time (bcrypt cost 4, $2y$ like the legacy ones); the passwords go to a mode-600 gitignored fixture file only.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { assertE2eTarget, RANGES, num } from './e2e-guards.mjs';

if (!process.env.E2E_SEED_URL || !process.env.E2E_FIXTURE) throw new Error('E2E_SEED_URL and E2E_FIXTURE are required');
const db = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
try {
  await assertE2eTarget(db);
  for (const [table, [col]] of Object.entries(RANGES)) {
    const n = num((await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`kkisi_e2e_legacy\`.\`${table}\``))[0].n);
    if (n !== 0) throw new Error(`refusing to seed: ${table} is not empty (${n} rows on ${col})`);
  }
  const pw = {};
  const users = [['admin', 1, 9001, 1], ['koperasi', 2, 9001, 1], ['kepala', 3, 9001, 1], ['kasir1', 4, 9001, 1], ['kasir2', 4, 9002, 1], ['off', 4, 9001, 0], ['nobranch', 4, 9004, 1]];
  for (const [n] of users) pw[n] = randomBytes(12).toString('base64url');
  await db.$transaction(async (tx) => {
    const t = (sql, ...p) => tx.$executeRawUnsafe(sql, ...p);
    await t("SET SESSION sql_mode=''");                       // legacy NOT NULL columns without defaults (synthetic rows only)
    for (const [id, name, status] of [[9001, 'SYNTH BRANCH 1', 1], [9002, 'SYNTH BRANCH 2', 1], [9003, 'SYNTH BRANCH 3', 1], [9004, 'SYNTH INACTIVE BRANCH', 0]])
      await t('INSERT INTO db_company (id, company_name, status, sales_init) VALUES (?,?,?,?)', id, name, status, `S${id - 9000}`);
    for (const [id, name, status] of [[1, 'Administrator', 1], [2, 'Admin Koperasi', 1], [3, 'Kepala Toko', 0], [4, 'Kasir Toko', 1]])
      await t('INSERT INTO db_roles (id, role_name, description, status) VALUES (?,?,"",?)', id, name, status);
    for (const r of [1, 2, 3, 4]) await t('INSERT INTO db_permissions (role_id, permissions) VALUES (?, "sales_add")', r);
    for (const r of [2, 3, 4]) await t('INSERT INTO db_permissions (role_id, permissions) VALUES (?, "master_kasir")', r);
    let id = 900001;
    for (const [n, role, company, status] of users)
      await t('INSERT INTO db_users (id, username, nik_account, role_id, company_id, akses_lokasi, fullname, password, status) VALUES (?,?,"0",?,?,?,?,?,?)',
        id++, `synth_${n}`, role, company, company, `SYNTH ${n}`, '$2y$' + bcrypt.hashSync(pw[n], 4).slice(4), status);
    await t('INSERT INTO db_kasir (id, company_id, no_kasir, status, cd, cd_usr, description) VALUES (9001,9001,"KRS01",1,0,"",""),(9002,9002,"KRS01",1,0,"","")');
    // registers use Asia/Bangkok wall time like the legacy PHP app: today = open, 2026-09-16 = stale
    await t('INSERT INTO db_buka_kasir (id, noref, id_kasir, saldo_awal, tgl_buka, user_id, status, saldo_kredit, company_id) VALUES (9001,"KRS-S-1",9001,0,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR),900004,1,0,9001),(9002,"KRS-S-2",9002,0,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR),900002,1,0,9002),(9003,"KRS-S-3",9002,0,"2026-09-16 08:00:00",900005,1,0,9002)');
    await t('INSERT INTO db_category (id, category_name, status) VALUES (9001,"SYNTH MAKANAN",1),(9002,"SYNTH MINUMAN",1)');
    const item = (i, code, barcode, name, cat, price, stock, company, discount = 0) => t(
      'INSERT INTO db_items (id, item_code, custom_barcode, custom_barcode_pack, item_name, category_id, type, unit_perpack, purchase_price, sales_price, alert_qty, stock, tax_id, company_id, konsinyasi, discount, discount_persen, status, status_so, item_image) VALUES (?,?,?,"",?,?,"Produk Jadi",1,1000,?,0,?,1,?,0,?,0,1,0,"")', i, code, barcode, name, cat, price, stock, company, discount);
    await item(9001, 'S1-A', 'SYNTH1A', 'SYNTH ITEM BRANCH1 A', 9001, 4000.10, 20, 9001);
    await item(9002, 'S1-B', 'SYNTH1B', 'SYNTH ITEM BRANCH1 B', 9002, 6500, 5, 9001, 500);
    await item(9003, 'S1-C', 'SYNTH1C', 'SYNTH ITEM BRANCH1 C EMPTY', 9001, 3000, 0, 9001);
    await item(9004, 'S1-D', 'SYNTH1D', 'SYNTH ITEM BRANCH1 D NOPRICE', 9002, 0, 3, 9001);
    await item(9005, 'S2-A', 'SYNTH2A', 'SYNTH ITEM BRANCH2 A', 9001, 9000, 7, 9002);
    await item(9006, 'S3-A', 'SYNTH3A', 'SYNTH ITEM BRANCH3 A', 9002, 1000, 9, 9003);
    // Checkpoint 3: synthetic KOSIPA rows (all ids in SYNTH.small; values are fictitious).
    await t(`INSERT INTO m_anggota (id, nik_kar, nama_kar, kd_group, status_anggota, status_karyawan, tgl_daftar, tgl_keluar, no_telp, email, no_rek, bank_rek, divisi, bagian, gaji, gaji_minus, limit_toko, limit_ppob, surat_kuasa)
      VALUES (9001,'S9001','SYNTH ANGGOTA SATU','ANGGOTA','AKTIVE','TETAP','2020-01-01',NULL,'081200009001','satu@example.invalid','9900119001','SYNTH BANK','SYNTH DIV','SYNTH BAG',5000000,0,1000000,0,0),
             (9002,'S9002','SYNTH ANGGOTA KONTRAK','ANGGOTA','AKTIVE','KONTRAK','2024-01-01','2026-01-31','081200009002','dua@example.invalid','9900119002','SYNTH BANK','SYNTH DIV','SYNTH BAG',4000000,0,500000,0,0)`);
    await t(`INSERT INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9001,'synth_ksp','SYNTH PETUGAS KOSIPA',1,'x','',0,''),(9002,'synth_ksp_off','SYNTH KOSIPA NONAKTIF',0,'x','',0,'')`);
    await t(`INSERT INTO ref_group (id, nama_group, status) VALUES (9001,'SYNTH KOSIPA',1)`);
    await t(`INSERT INTO ref_group_akses (id, id_user, id_group, status) VALUES (9001,9001,9001,1),(9002,9002,9001,1)`);
    await t(`INSERT INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9001,'SYNTH Anggota','anggota/anggota_c',1,0,'WEB','PRIVATE'),(9002,'SYNTH Kas Anggota','simpanan/kas_anggota_c',1,0,'WEB','PRIVATE'),(9003,'SYNTH Pinjaman','pinjaman/pinjaman_c',1,0,'WEB','PRIVATE'),(9004,'SYNTH Toko','anggota/trans_toko_c',1,0,'WEB','PRIVATE')`);
    await t(`INSERT INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9001,9001,9001,1,0,0,0,0,0),(9002,9002,9001,1,0,0,0,0,0),(9003,9003,9001,1,0,0,0,0,0),(9004,9004,9001,1,0,0,0,0,0)`);
    await t(`INSERT INTO trans_simpanan (id, doc_no, doc_date, doc_status, jenis_simpanan, jenis_transaksi, is_mobile, saldo_awal_penarikan) VALUES (9001,'SYNSIM9001','2026-09-25','APPROVED','SIMPANAN WAJIB','PAYROLL',0,0),(9002,'SYNSIM9002','2026-10-02','OPEN','SIMPANAN SUKARELA','CASH/TRANSFER',0,0)`);
    await t(`INSERT INTO trans_simpanan_dtl (id, doc_no, nik_kar, jenis_simpanan, kredit, kredit_cash, debit, jasa_kredit, saldo) VALUES (9001,'SYNSIM9001','S9001','SIMPANAN WAJIB',500000,0,0,1000,0),(9002,'SYNSIM9002','S9001','SIMPANAN SUKARELA',0,0,100000,0,0)`);
    await t(`INSERT INTO trans_pinjaman (id, doc_no, doc_date, nik, nama, jenis_pinjaman, jenis_suku_bunga, plan_pinjaman, plan_jangka_waktu, plan_angsuran, doc_status, status_pencairan, status_bayar) VALUES (9001,'PINSYN9001','2026-08-10','S9001','SYNTH ANGGOTA SATU','REGULER','Flat',12000000,12,1120000,'APPROVED','APPROVED','BELUM LUNAS')`);
    await t(`INSERT INTO db_sales (id, company_id, sales_code, nik_kar, payment_type, sales_status, sales_date, grand_total) VALUES (9001,9001,'SYNSALE9001','S9001','Kredit','Final',DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)),150000)`);
    await t(`INSERT INTO db_salesreturn (id, company_id, sales_id, grand_total, payment_type, return_status, status, return_date) VALUES (9001,9001,9001,30000,'Kredit','Return',1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR))`);
    // Checkpoint 6 (TASK-027): synthetic payroll. Period 2026-08 reads the July 2026 Kredit sales (BR-006). Values are fictitious.
    //   A POTSYN202608A (APPROVED, ANGGOTA): S9001 150000 (TOKO_TAMBUN 100000 + PPOB 50000), S9002 100000 (TOKO_TAMBUN, recorded NOT net of its 20000 return)
    //   B POTSYN202608B (OPEN, BMP):         S9001 40000 (TOKO_MJ)
    //   C POTSYN202607A: zero period date, duplicate (batch, NIK) rows with sub-sen amounts   D POTSYN202606A: header without rows
    //   E POTSYN202605A: unknown status, header total differs from the rows
    const AMOUNTS = ['TOKO_TAMBUN', 'TOKO_MJ', 'TOKO_GIIC', 'PPOB', 'SIMPANAN_WAJIB', 'SIMPANAN_SUKARELA'];
    const hd = (id, no, grp, status, bl, periodDate, total) => t('INSERT INTO trans_potongan_bulanan (id, doc_no, doc_date, doc_status, periode_potongan, remarks, cd_usr, ud_usr, total, periode_bl, periode_th, kd_group, tgl_cair, total_cair, is_mobile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)',
      id, no, '2026-09-28', status, periodDate, 'SYNTH', 'synth_maker', 'synth_checker', total, bl, '2026', grp, '2026-09-30', total);
    await hd(9001, 'POTSYN202608A', 'ANGGOTA', 'APPROVED', '08', '2026-08-31', 250000);
    await hd(9002, 'POTSYN202608B', 'BMP', 'OPEN', '08', '2026-08-31', 40000);
    await hd(9003, 'POTSYN202607A', 'ANGGOTA', 'APPROVED', '07', '0000-00-00', 50000.6666);
    await hd(9004, 'POTSYN202606A', 'ANGGOTA', 'APPROVED', '06', '2026-06-30', 0);
    await hd(9005, 'POTSYN202605A', 'ANGGOTA', 'REVIEW', '05', '2026-05-31', 99999);
    const mx = (id, no, nik, name, amounts) => {
      const cols = Object.keys(amounts); const total = cols.filter((c) => c !== 'potongan_toko').reduce((n, c) => n + Number(amounts[c]), 0);
      const all = { ...amounts, total_potongan: total, gaji_payroll: 12345678 };
      return t(`INSERT INTO trans_potongan_matrix (id, periode, doc_no_dtl, nik_kar, nama, kd_group, ${Object.keys(all).join(', ')}) VALUES (?,?,?,?,?,?,${Object.keys(all).map(() => '?').join(',')})`, id, no, `${no}-${id}`, nik, name, 'ANGGOTA', ...Object.values(all));
    };
    await mx(9001, 'POTSYN202608A', 'S9001', 'SYNTH ANGGOTA SATU', { TOKO_TAMBUN: 100000, potongan_toko: 100000, PPOB: 50000 });
    await mx(9002, 'POTSYN202608A', 'S9002', 'SYNTH ANGGOTA KONTRAK', { TOKO_TAMBUN: 100000, potongan_toko: 100000 });
    await mx(9003, 'POTSYN202608B', 'S9001', 'SYNTH ANGGOTA SATU', { TOKO_MJ: 40000, potongan_toko: 40000 });
    await mx(9004, 'POTSYN202607A', 'S9001', 'SYNTH ANGGOTA SATU', { SIMPANAN_WAJIB: 25000.3333 });
    await mx(9005, 'POTSYN202607A', 'S9001', 'SYNTH ANGGOTA SATU', { SIMPANAN_WAJIB: 25000.3333 });
    await mx(9006, 'POTSYN202605A', 'S9002', 'SYNTH ANGGOTA KONTRAK', { SIMPANAN_SUKARELA: 10000 });
    void AMOUNTS;
    const sl = (id, company, nik, total) => t('INSERT INTO db_sales (id, company_id, sales_code, nik_kar, payment_type, sales_status, sales_date, grand_total) VALUES (?,?,?,?,"Kredit","Final","2026-07-15 10:00:00",?)', id, company, `SYNSALE${id}`, nik, total);
    await sl(9011, 1, 'S9001', 100000); await sl(9012, 1, 'S9002', 100000); await sl(9013, 2, 'S9001', 40000);
    await sl(9014, 9001, 'S9001', 5000);          // a branch the empirical store-column map does not know: must be reported, not dropped
    await sl(9015, 3, 'S9003', 30000);            // Kredit sale of a member with no payroll row in the period
    await t(`INSERT INTO db_salesreturn (id, company_id, sales_id, grand_total, payment_type, return_status, status, return_date) VALUES (9011,1,9012,20000,'Kredit','Return',1,'2026-07-20 09:00:00')`);
    await t(`INSERT INTO trans_pinjaman_dtl (id, doc_no, nik_kar, ke_cicilan, tgl_cicilan, pokok_cicilan, bunga_cicilan, angsuran_cicilan, status_cicilan, type_cicilan) VALUES
      (9001,'PINSYN9001','S9001',3,'2026-08-25',100000,5000,105000,'Belum Bayar',NULL),(9002,'PINSYN-ORPH','S9001',1,'2026-08-26',1,0,1,'Belum Bayar',NULL),
      (9003,'PINSYN9001','S9001',2,'0000-00-00',1,0,1,'Belum Bayar',NULL),(9004,'PINSYN9001','S9001',9,'9999-12-10',1,0,1,'Belum Bayar',NULL),
      (9005,'PINSYN9001','S9002',1,'2026-08-25',1,0,1,'Bayar','PAYROLL')`);
  });
  writeFileSync(process.env.E2E_FIXTURE, JSON.stringify(pw)); chmodSync(process.env.E2E_FIXTURE, 0o600);
  const counts = {};
  for (const table of Object.keys(RANGES)) counts[table] = num((await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`kkisi_e2e_legacy\`.\`${table}\``))[0].n);
  console.log('seeded synthetic rows:', JSON.stringify(counts), '| passwords written to the mode-600 fixture (not printed)');
} finally { await db.$disconnect(); }
