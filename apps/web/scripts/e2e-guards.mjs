// Shared safety guards for the Gate A seed and cleanup. Every write/delete goes through assertE2eTarget() first.
export const SYNTH = {
  users: [900001, 900007],           // db_users.id and auth_session.user_id approved for Gate A
  companies: [9001, 9004],
  small: [9001, 9099],               // db_kasir / db_buka_kasir / db_category / db_items
  roles: [1, 4],
};
export const THROTTLE_USERNAMES = ['synth_admin', 'synth_koperasi', 'synth_kepala', 'synth_kasir1', 'synth_kasir2', 'synth_off', 'synth_nobranch', 'synth_ghost', 'synth_ghost2'];
export const num = (v) => Number(typeof v === 'bigint' ? Number(v) : v);

/** Refuses, before any statement that writes, unless the connection is provably the synthetic e2e schema. */
export async function assertE2eTarget(db, expectedDb = 'kkisi_e2e_legacy') {
  if (!/^kkisi_e2e_[a-z0-9_]{1,40}$/.test(expectedDb) || expectedDb === 'kkisi_staging') throw new Error('refusing: not an e2e schema name');
  const who = await db.$queryRawUnsafe('SELECT CURRENT_USER() AS u, DATABASE() AS d');
  if (!String(who[0].u).startsWith('kkisi_e2e_seed@')) throw new Error('refusing: connected account is not kkisi_e2e_seed');
  if (who[0].d !== expectedDb) throw new Error('refusing: connected database differs from the declared target');
  const marker = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = '_e2e_marker'`, expectedDb);
  if (num(marker[0].n) !== 1) throw new Error('refusing: marker table missing (not a synthetic schema)');
  const row = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${expectedDb}\`.\`_e2e_marker\` WHERE purpose = 'synthetic-only'`);
  if (num(row[0].n) !== 1) throw new Error('refusing: marker row missing');
}

/** Table -> [column, low, high] describing which rows are synthetic. Anything outside the range makes cleanup abort. */
export const RANGES = {
  db_users: ['id', SYNTH.users[0], SYNTH.users[1]],
  db_company: ['id', SYNTH.companies[0], SYNTH.companies[1]],
  db_roles: ['id', SYNTH.roles[0], SYNTH.roles[1]],
  db_permissions: ['role_id', SYNTH.roles[0], SYNTH.roles[1]],
  db_kasir: ['id', SYNTH.small[0], SYNTH.small[1]],
  db_buka_kasir: ['id', SYNTH.small[0], SYNTH.small[1]],
  db_category: ['id', SYNTH.small[0], SYNTH.small[1]],
  db_items: ['id', SYNTH.small[0], SYNTH.small[1]],
  // Checkpoint 3: KOSIPA-shaped tables read by the console (db/e2e/003_e2e_kosipa_structure.sql).
  m_anggota: ['id', SYNTH.small[0], SYNTH.small[1]],
  ref_users: ['id_ref_user', SYNTH.small[0], SYNTH.small[1]],
  ref_group: ['id', SYNTH.small[0], SYNTH.small[1]],
  ref_group_akses: ['id', SYNTH.small[0], SYNTH.small[1]],
  ref_menu: ['id', SYNTH.small[0], SYNTH.small[1]],
  ref_menu_akses: ['id', SYNTH.small[0], SYNTH.small[1]],
  trans_simpanan: ['id', SYNTH.small[0], SYNTH.small[1]],
  trans_simpanan_dtl: ['id', SYNTH.small[0], SYNTH.small[1]],
  trans_pinjaman: ['id', SYNTH.small[0], SYNTH.small[1]],
  db_sales: ['id', SYNTH.small[0], SYNTH.small[1]],
  db_salesreturn: ['id', SYNTH.small[0], SYNTH.small[1]],
  // Checkpoint 6 (TASK-027): payroll and installment tables (db/e2e/003_e2e_kosipa_structure.sql).
  trans_potongan_bulanan: ['id', SYNTH.small[0], SYNTH.small[1]],
  trans_potongan_matrix: ['id', SYNTH.small[0], SYNTH.small[1]],
  trans_pinjaman_dtl: ['id', SYNTH.small[0], SYNTH.small[1]],
};

/**
 * Console store: revoke every ACTIVE identity link of the synthetic console users (checkpoint 12). Without this, a test process that ended before its own
 * cleanup (crash, kill, early exit) left a link active and the NEXT run's first link creation was refused as CONSOLE_USER_ALREADY_LINKED — the root cause of
 * the checkpoint-11 "Tautan dibuat." timeout. Local staging console store only; links are revoke-only (never deleted), so history is kept.
 */
export async function revokeSyntheticConsoleLinks(db, expectedDb = 'kkisi_console_staging') {
  const who = await db.$queryRawUnsafe('SELECT DATABASE() AS d');
  if (who[0].d !== expectedDb) throw new Error('refusing: not the local staging console store');
  const [lo, hi] = SYNTH.users;
  return num(await db.$executeRawUnsafe("UPDATE console_identity_link SET status = 'revoked', revoked_by = ?, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'e2e cleanup' WHERE status = 'active' AND console_user_id BETWEEN ? AND ?", lo, lo, hi));
}
