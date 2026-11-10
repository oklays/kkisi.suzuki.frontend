// Fictitious data for the synthetic stack only. Every person, NIK, phone and amount here is invented ("ANGGOTA UJI ...").
// Months are relative to the current Jakarta business month so "bulan ini" screens always have data.
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';

export const TEST_PASSWORD = 'Uji-Sandi#2026';
export const MEMBERS = {
  a: { userId: 101, memberId: 9001, nik: '10234', email: 'anggota.uji1@contoh.test', phone: '081200000001', pin: '2468', name: 'ANGGOTA UJI SATU' },
  b: { userId: 102, memberId: 9002, nik: '20567', email: 'anggota.uji2@contoh.test', phone: '081200000002', pin: '1357', name: 'ANGGOTA UJI DUA' },
  inactive: { userId: 103, nik: '30001', email: 'nonaktif@contoh.test', phone: '081200000003', pin: '1111' },
  deleted: { userId: 104, nik: '30002', email: 'dihapus@contoh.test', phone: '081200000004', pin: '1111' },
  noMember: { userId: 105, nik: '40001', email: 'bukan.anggota@contoh.test', phone: '081200000005', pin: '1111' },
  duplicateNik: { userId: 108, nik: '60001', email: 'duplikat@contoh.test', phone: '081200000008', pin: '1111', name: 'ANGGOTA UJI DUPLIKAT' },
  resignedAndActive: { userId: 109, memberId: 9008, nik: '60002', email: 'aktif.unik@contoh.test', phone: '081200000009', pin: '2222', name: 'ANGGOTA UJI AKTIF UNIK' },
  sharedPhone: '081299999999',
};

function months() {
  const day = new Date(Date.now() + 7 * 3600_000);
  const at = (offset) => { const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, iso: (dd) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}` }; };
  return at;
}

export async function seed(_env, rootPassword, port, database) {
  const db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: rootPassword, database, multipleStatements: false });
  const run = (sql, params = []) => db.query(sql, params);
  await run("SET SESSION sql_mode = ''");
  const tables = ['users', 'm_anggota', 'trans_simpanan', 'trans_simpanan_dtl', 'm_simpanan_aktif', 'trans_simpanan_pengajuan', 'trans_simpanan_penarikan', 'trans_pinjaman', 'trans_pinjaman_dtl',
    'trans_pinjaman_pengajuan', 'm_pinjaman_mobile', 'm_jenis_pinjaman', 'trans_potongan_matrix', 'trans_potongan_bulanan', 'trans_shu', 'trans_shu_dtl', 'db_sales', 'db_salesreturn', 'db_company',
    'db_items', 'db_category', 'db_units', 'orders', 'wishlists', 'products', 'faqs', 'notifications'];
  for (const t of tables) await run(`TRUNCATE TABLE \`${t}\``);
  await run('DELETE FROM kkisi_member_auth.member_sessions');
  await run('DELETE FROM kkisi_member_auth.member_auth_throttle');
  await run('DELETE FROM kkisi_member_auth.member_pin_credentials');
  await run('DELETE FROM kkisi_member_auth.member_command_ledger');
  await run('DELETE FROM kkisi_member_auth.member_write_lease');

  const hash = (await bcrypt.hash(TEST_PASSWORD, 10)).replace(/^\$2b\$/, '$2y$');   // Laravel stores $2y$
  const M = MEMBERS;
  const user = (id, nik, email, phone, pin, active, deleted, name) => run(
    'INSERT INTO users (id, nik, ktp, name, phone, image, email, password, is_active, admin_verifikasi, pin, persetujuan, is_delete) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, nik, `KTP-UJI-${id}`, name, phone, 'def.png', email, hash, active ? 1 : 0, active ? 1 : 0, pin, 1, deleted ? 1 : null]);
  await user(M.a.userId, M.a.nik, M.a.email, M.a.phone, M.a.pin, true, false, M.a.name);
  await user(M.b.userId, M.b.nik, M.b.email, M.b.phone, M.b.pin, true, false, M.b.name);
  await user(M.inactive.userId, M.inactive.nik, M.inactive.email, M.inactive.phone, M.inactive.pin, false, false, 'ANGGOTA UJI NONAKTIF');
  await user(M.deleted.userId, M.deleted.nik, M.deleted.email, M.deleted.phone, M.deleted.pin, true, true, 'ANGGOTA UJI DIHAPUS');
  await user(M.noMember.userId, M.noMember.nik, M.noMember.email, M.noMember.phone, M.noMember.pin, true, false, 'PELANGGAN UJI');
  await user(106, '50001', 'ganda1@contoh.test', M.sharedPhone, '1111', true, false, 'ANGGOTA UJI GANDA 1');
  await user(107, '50002', 'ganda2@contoh.test', M.sharedPhone, '1111', true, false, 'ANGGOTA UJI GANDA 2');
  await user(M.duplicateNik.userId, M.duplicateNik.nik, M.duplicateNik.email, M.duplicateNik.phone, M.duplicateNik.pin, true, false, M.duplicateNik.name);
  await user(M.resignedAndActive.userId, M.resignedAndActive.nik, M.resignedAndActive.email, M.resignedAndActive.phone, M.resignedAndActive.pin, true, false, M.resignedAndActive.name);

  const member = (id, nik, name, status, limit) => run(`INSERT INTO m_anggota (id, nik_kar, nama_kar, kd_group, status_anggota, status_karyawan, divisi, dept, bagian, lokasi, no_telp, email,
      alamat_tinggal, kelurahan_tinggal, kecamatan_tinggal, kabupaten_tinggal, limit_toko, gaji_minus, limit_ppob, gaji, surat_kuasa, status_pot_wajib, tgl_daftar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [id, nik, name, 'ANGGOTA', status, 'TETAP', 'PRODUKSI', 'WELDING', 'WELDING LINE 2', 'TAMBUN 2', '081200000001', 'anggota.uji@contoh.test', 'JL. CONTOH UJI NO. 1', 'KELURAHAN UJI', 'KECAMATAN UJI', 'BEKASI', limit, 0, 1000000, 0, 1, 1, '2019-03-01']);
  await member(M.a.memberId, M.a.nik, M.a.name, 'AKTIVE', 5000000);
  await member(M.b.memberId, M.b.nik, M.b.name, 'AKTIVE', 3000000);
  await member(9003, M.inactive.nik, 'ANGGOTA UJI NONAKTIF', 'RESIGN', 0);
  await member(9004, M.deleted.nik, 'ANGGOTA UJI DIHAPUS', 'AKTIVE', 0);
  await member(9005, M.duplicateNik.nik, 'ANGGOTA UJI DUPLIKAT 1', 'AKTIVE', 1000000);
  await member(9006, M.duplicateNik.nik, 'ANGGOTA UJI DUPLIKAT 2', 'AKTIVE', 1000000);
  await member(9007, M.resignedAndActive.nik, 'ANGGOTA UJI LAMA RESIGN', 'RESIGN', 0);
  await member(M.resignedAndActive.memberId, M.resignedAndActive.nik, M.resignedAndActive.name, 'AKTIVE', 2000000);

  const at = months();
  // ---- savings: header per document, detail per member line
  let doc = 1;
  const saving = async (nik, type, status, kind, monthOffset, credit, debit = 0) => {
    const mo = at(monthOffset); const no = `SMP-UJI-${String(doc++).padStart(4, '0')}`;
    await run('INSERT INTO trans_simpanan (doc_no, doc_date, doc_status, jenis_simpanan, jenis_transaksi, periode_th, periode_bl, is_mobile) VALUES (?,?,?,?,?,?,?,0)', [no, mo.iso(25), status, type, kind, String(mo.y), String(mo.m).padStart(2, '0')]);
    await run('INSERT INTO trans_simpanan_dtl (doc_no, nik_kar, nama, kd_group, kredit, kredit_cash, debit, jasa_kredit, saldo, jenis_simpanan, doc_status, remark_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [no, nik, 'ANGGOTA UJI', 'ANGGOTA', credit, 0, debit, 0, 0, type, status, kind === 'SALDO AWAL' ? 'Saldo awal' : debit ? 'Penarikan' : 'Potongan payroll']);
  };
  await saving(M.a.nik, 'SIMPANAN POKOK', 'APPROVED', 'SALDO AWAL', -12, 100000);
  await saving(M.a.nik, 'PBS', 'APPROVED', 'SALDO AWAL', -12, 250000);
  for (const off of [-4, -3, -2, -1]) { await saving(M.a.nik, 'SIMPANAN WAJIB', 'APPROVED', 'SETORAN', off, 100000); await saving(M.a.nik, 'SIMPANAN SUKARELA', 'APPROVED', 'SETORAN', off, 50000); }
  await saving(M.a.nik, 'SIMPANAN WAJIB', 'APPROVED', 'SALDO AWAL', -12, 1100000);
  await saving(M.a.nik, 'SIMPANAN SUKARELA', 'APPROVED', 'SALDO AWAL', -12, 650000);
  await saving(M.a.nik, 'SIMPANAN SUKARELA', 'APPROVED', 'PENARIKAN', -2, 0, 100000);
  await saving(M.a.nik, 'SIMPANAN SUKARELA', 'OPEN', 'SETORAN', 0, 50000);
  await saving(M.b.nik, 'SIMPANAN WAJIB', 'APPROVED', 'SALDO AWAL', -12, 7770000);

  await run('INSERT INTO m_simpanan_aktif (doc_no, jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_old, potongan_payroll, status, periode_start, is_mobile) VALUES ?', [[
    ['MSA-UJI-1', 'SIMPANAN WAJIB', M.a.nik, M.a.name, 'ANGGOTA', 100000, 100000, 1, at(-12).iso(1), 0],
    ['MSA-UJI-2', 'SIMPANAN SUKARELA', M.a.nik, M.a.name, 'ANGGOTA', 50000, 50000, 1, at(-12).iso(1), 0],
    ['MSA-UJI-3', 'SIMPANAN WAJIB', M.b.nik, M.b.name, 'ANGGOTA', 100000, 100000, 1, at(-12).iso(1), 0],
  ]]);
  await run('INSERT INTO trans_simpanan_penarikan (doc_no, doc_date, doc_status, nik_kar, jenis_simpanan, total_penarikan) VALUES (?,?,?,?,?,?)', ['PNR-UJI-1', at(-2).iso(20), 'APPROVED', M.a.nik, 'SIMPANAN SUKARELA', 100000]);

  // ---- loans: an active Flat 1 % regular loan for A (24 x Rp1.240.000), started 10 months ago; one loan for B (IDOR checks)
  const loan = async (docNo, nik, name, principal, months, startOffset, paidCount) => {
    const start = at(startOffset);
    const pokok = principal / months, jasa = principal * 0.01;
    await run(`INSERT INTO trans_pinjaman (doc_no, doc_date, doc_status, status_bayar, status_pencairan, nik, nama, jenis_pinjaman, jenis_suku_bunga, biaya_suku_bunga, bank_pembiaya,
        plan_pinjaman, actual_pinjaman, plan_angsuran, actual_angsuran, plan_jangka_waktu, actual_jangka_waktu, awal_pinjaman, akhir_pinjaman, tgl_pencairan, nominal_pencairan, gaji_pokok,
        jasa_angsuran, kasbon_pinjaman, jasa_kasbon_pinjaman, remark_pelunasan, metode_pelunasan, pengajuan_mobile, publish)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,'','',0,1)`,
    [docNo, start.iso(1), 'APPROVED', 'BELUM LUNAS', 'APPROVED', nik, name, 'PINJAMAN REGULAR', 'Flat', '1.00', 'KOPERASI', principal, 0, pokok + jasa, 0, months, 0, start.iso(25), at(startOffset + months - 1).iso(25), start.iso(5), principal]);
    for (let k = 1; k <= months; k++) {
      const due = at(startOffset + k - 1).iso(25);
      await run('INSERT INTO trans_pinjaman_dtl (doc_no, nik_kar, ke_cicilan, tgl_cicilan, pokok_cicilan, bunga_cicilan, angsuran_cicilan, status_cicilan, rool_over, blokir, type_cicilan) VALUES (?,?,?,?,?,?,?,?,0,0,?)',
        [docNo, nik, k, due, pokok, jasa, pokok + jasa, k <= paidCount ? 'Bayar' : 'Belum Bayar', 'PAYROLL']);
    }
  };
  await loan('PJ-UJI-0001', M.a.nik, M.a.name, 24000000, 24, -10, 10);
  await loan('PJ-UJI-0002', M.b.nik, M.b.name, 6000000, 12, -3, 3);
  await run('INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_date, doc_status, nik_kar, nama, jenis_pinjaman, total_pinjaman, lama_angsuran, is_payroll, is_online) VALUES (?,?,?,?,?,?,?,?,1,1)',
    ['PGJ-UJI-0001', at(0).iso(3), 'OPEN', M.a.nik, M.a.name, 'KASBON 1X POT', 1000000, 1]);

  // ---- Master Pinjaman Mobile and jenis pinjaman: same product parameters as the 30 Sep 2026 master (not personal data)
  await run('INSERT INTO m_pinjaman_mobile (id, jenis_pinjaman, min_nominal, max_nominal, min_jw, max_jw, jasa, status) VALUES ?', [[
    [1, 'PINJAMAN REGULAR', 1000000, 50000000, 6, 60, '1', 1], [2, 'KASBON', 100000, 2000000, 1, 10, '1', 1], [3, 'PINJAMAN KHUSUS', 1000000, 2000000, 1, 1, '1', 0]]]);
  await run("INSERT INTO m_jenis_pinjaman (id, jenis_pinjaman_code, jenis_pinjaman_name, jenis_bunga, is_active, max_angsuran, max_pinjaman) VALUES (1,'PINJAMAN REGULAR','PINJAMAN REGULAR','Flat','1',0,0),(3,'KASBON','KASBON','Flat','1',0,0)");

  // ---- payroll: two approved monthly batches with A's recorded components
  for (const [off, extra] of [[-2, -90000], [-1, 0]]) {   // chronological, as legacy inserts batches
    const mo = at(off); const no = `POT-UJI-${mo.y}${String(mo.m).padStart(2, '0')}`;
    await run('INSERT INTO trans_potongan_bulanan (doc_no, doc_date, doc_status, periode_potongan, periode_th, periode_bl, kd_group, total, is_mobile) VALUES (?,?,?,?,?,?,?,?,0)',
      [no, mo.iso(25), 'APPROVED', mo.iso(25), String(mo.y), String(mo.m).padStart(2, '0'), 'ANGGOTA', 1990000 + extra]);
    await run(`INSERT INTO trans_potongan_matrix (periode, nik_kar, nama, kd_group, SIMPANAN_WAJIB, SIMPANAN_SUKARELA, PIUTANG_DANA_KOP, JASA_PIUTANG_DANA_KOP, TOKO_TAMBUN, PPOB, potongan_toko, total_potongan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [no, M.a.nik, M.a.name, 'ANGGOTA', 100000, 50000, 1000000, 240000, 450000 + extra, 150000, 450000 + extra, 1990000 + extra]);
  }

  // ---- SHU: 2025 published, 2024 not published (must stay hidden)
  await run("INSERT INTO trans_shu (doc_no, doc_status, periode_th, publish, total_simpanan, total_usaha) VALUES ('SHU-UJI-2025','APPROVED','2025',1,0,0),('SHU-UJI-2024','APPROVED','2024',0,0,0)");
  const shu = (no, year, v) => run(`INSERT INTO trans_shu_dtl (doc_no, periode_th, nik_kar, nama_kar, jasa_simpanan, jasa_transaksi_usaha, total_shu, total_shu_pembulatan, jasa_simpanan_sukarela, pembulatan_sukarela, pendapatan_shu)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [no, year, M.a.nik, M.a.name, ...v]);
  await shu('SHU-UJI-2025', '2025', [310000, 125000, 435000, 435000, 40000, 40000, 475000]);
  await shu('SHU-UJI-2024', '2024', [999000, 999000, 999000, 999000, 999000, 999000, 999000]);

  // ---- store: companies, catalog, A's sales/returns this month, orders
  await run("INSERT INTO db_company (id, company_name, status) VALUES (1,'TOKO S-MART TB II',1),(2,'TOKO S-MART MJ',1)");
  await run("INSERT INTO db_category (id, category_name, status) VALUES (1,'MAKANAN',1),(2,'MINUMAN BOTOL',1),(3,'RUMAH TANGGA',1)");
  await run("INSERT INTO db_units (id, unit_name, status) VALUES (1,'Pcs',1),(2,'Pack',1)");
  const items = [];
  const names = ['BERAS UJI 5 KG', 'MINYAK UJI 1 L', 'GULA UJI 1 KG', 'KOPI UJI SACHET', 'TEH UJI KOTAK', 'MIE UJI GORENG', 'SUSU UJI UHT 200 ML', 'AIR MINERAL UJI 600 ML', 'SABUN UJI CAIR', 'DETERJEN UJI 800 G',
    'BISKUIT UJI COKLAT', 'ROTI UJI TAWAR', 'KECAP UJI 520 ML', 'SAMBAL UJI 335 ML', 'TISU UJI 250 LBR', 'PASTA GIGI UJI', 'SAMPO UJI 170 ML', 'TELUR UJI 10 BTR', 'SARDEN UJI 155 G', 'JUS UJI JERUK 250 ML',
    'KERUPUK UJI 250 G', 'GARAM UJI 500 G', 'TEPUNG UJI 1 KG', 'MENTEGA UJI 200 G', 'CUKA UJI 150 ML', 'SIRUP UJI 460 ML', 'BATERAI UJI AA', 'SPONS UJI CUCI', 'PEWANGI UJI 900 ML', 'KACANG UJI 100 G'];
  names.forEach((n, i) => items.push([i + 1, `BRG-UJI-${String(i + 1).padStart(4, '0')}`, `899${String(i + 1).padStart(10, '0')}`, n, (i % 3) + 1, (i % 4 === 0) ? 2 : 1, 'Produk Jadi', 1, 1, 0, 3000 + i * 2500]));
  items.push([31, 'BRG-UJI-0031', '8990000000031', 'PRODUK UJI TANPA HARGA', 1, 1, 'Produk Jadi', 1, 1, 0, 0]);
  items.push([32, 'BRG-UJI-0032', 'SALDOPPOB', 'SALDO PPOB (TIDAK DIJUAL)', 1, 1, 'Produk Jadi', 1, 1, 0, 10000]);
  items.push([33, 'BRG-UJI-0033', '8990000000033', 'PRODUK UJI CABANG LAIN', 1, 1, 'Produk Jadi', 2, 1, 0, 9000]);
  items.push([34, 'BRG-UJI-0034', '8990000000034', 'PRODUK UJI NONAKTIF', 1, 1, 'Produk Jadi', 1, 0, 0, 9000]);
  await run('INSERT INTO db_items (id, item_code, custom_barcode, item_name, category_id, unit_id, type, company_id, status, status_so, sales_price) VALUES ?', [items]);
  const now = at(0), prev = at(-1);
  const sale = (id, code, date, total, payment, company, ppob = 0, ppobType = null, nik = M.a.nik) => run(
    'INSERT INTO db_sales (id, sales_code, customer_id, nik_kar, customer_name, grand_total, sales_status, sales_date, payment_type, company_id, ppob, ppob_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, code, 0, nik, 'ANGGOTA UJI', total, 'Final', date, payment, company, ppob, ppobType]);
  await sale(1, 'SL-UJI-0001', now.iso(2), 350000, 'Kredit', 1);
  await sale(2, 'SL-UJI-0002', now.iso(5), 200000, 'Kredit', 1);
  await sale(3, 'SL-UJI-0003', now.iso(3), 11000, 'Tunai', 1, 1, 'PULSA');
  await sale(4, 'SL-UJI-0004', prev.iso(28), 150000, 'Tunai', 2);
  await sale(5, 'SL-UJI-0005', now.iso(4), 999000, 'Kredit', 1, 0, null, M.b.nik);
  await run("INSERT INTO db_salesreturn (id, return_code, return_date, grand_total, sales_id, company_id, return_status) VALUES (1,'RT-UJI-0001',?,50000,2,1,'Final')", [`${now.iso(6)} 10:00:00`]);
  await run(`INSERT INTO orders (id, order_code, customer_id, id_anggota, nik_kar, payment_status, order_status, order_group_id, order_amount, shipping_method_id, order_type, ppob, ppob_type, in_proses, created_at)
    VALUES (1,'ORD-UJI-0001',?,?,?,'paid','pending','grp-uji-1',102000,0,'default_type',1,'PLN',1,?)`, [String(M.a.userId), M.a.memberId, M.a.nik, `${now.iso(1)} 09:15:00`]);

  await run("INSERT INTO products (id, name, unit, unit_price, purchase_price, variant_product, shipping_cost, multiply_qty, temp_shipping_cost, is_shipping_cost_updated, ppob, paket_data, profit_margin, admin, driver_emoney, komisi) VALUES (5,'BERAS UJI 5 KG','Pcs',75000,0,0,0,0,0,0,0,0,0,0,0,0)");
  await run('INSERT INTO wishlists (customer_id, product_id) VALUES (?, 5)', [M.a.userId]);
  await run("INSERT INTO faqs (id, pertanyaan, jawaban) VALUES (1,'Pertanyaan uji: bagaimana cara melihat simpanan?','Jawaban uji: buka menu Simpanan pada beranda.'),(2,'Pertanyaan uji: kapan potongan payroll berlaku?','Jawaban uji: sesuai periode potongan koperasi.')");
  await run("INSERT INTO notifications (id, title, description, notification_count, status, type, created_at) VALUES (1,'Informasi uji','Pengumuman uji untuk lingkungan pengujian.',1,1,'Informasi',?)", [`${now.iso(1)} 08:00:00`]);
  await db.end();
}
