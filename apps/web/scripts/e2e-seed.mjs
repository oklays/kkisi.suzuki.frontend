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
  });
  writeFileSync(process.env.E2E_FIXTURE, JSON.stringify(pw)); chmodSync(process.env.E2E_FIXTURE, 0o600);
  const counts = {};
  for (const table of Object.keys(RANGES)) counts[table] = num((await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`kkisi_e2e_legacy\`.\`${table}\``))[0].n);
  console.log('seeded synthetic rows:', JSON.stringify(counts), '| passwords written to the mode-600 fixture (not printed)');
} finally { await db.$disconnect(); }
