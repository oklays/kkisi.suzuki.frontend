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
};
