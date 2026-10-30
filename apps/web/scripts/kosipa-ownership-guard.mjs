/**
 * KOSIPA write-ownership guard generator (FA-03A; PROPOSED as FD-22 — an exception to the PRD "no triggers on the business database" rule
 * that needs owner approval and, on cPanel, the TRIGGER privilege). PRINTS SQL only; never connects anywhere. Applied in FA-03A ONLY to the
 * isolated synthetic stack (apps/web/tests/kosipa-legacy-runtime.test.mjs).
 *
 * Why: the ref_menu fence closes ONE legacy controller, but a table can have many legacy writers (m_anggota: 42 legacy methods in ~20
 * controllers, TOKO POS/member screens, smartkkisi) plus direct SQL. The guard decides in the database, for every INSERT/UPDATE/DELETE of an
 * owned object, by the AUTHENTICATED login name of the session (USER(); CURRENT_USER() would be the trigger definer):
 *   owner LEGACY  -> nothing changes (legacy and everyone else write as today)
 *   owner NATIVE  -> only the listed native writer account may write; everyone else gets SIGNAL 'KOSIPA_NATIVE_OWNED:<object>'
 * Ownership rows live in the ledger database (operator-controlled; the application writer has no UPDATE there). Column groups guard only the
 * listed columns (UPDATE only), for tables that other applications legitimately co-write (m_anggota).
 *   node --experimental-strip-types scripts/kosipa-ownership-guard.mjs --database <business db> --ledger <ledger db> [--drop]
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DB = opt('--database', '__KOSIPA_DB__');
const LEDGER = opt('--ledger', '__LEDGER_DB__');
for (const name of [DB, LEDGER]) if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) { console.error('invalid database name'); process.exit(1); }

/** Whole-table objects: the five native reference masters. Column groups: member profile columns (preparation for membership, FA-03B). */
export const GUARDED_TABLES = ['m_lokasi', 'm_bagian', 'm_jenis_dokumen', 'm_rekening', 'm_jangka_waktu'];
export const COLUMN_GROUPS = { 'm_anggota.profile': { table: 'm_anggota', columns: ['nama_kar', 'email', 'no_telp', 'bagian', 'lokasi'] } };

const refuse = (object) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'KOSIPA_NATIVE_OWNED:${object}'`;
const owned = (object) => `EXISTS (SELECT 1 FROM \`${LEDGER}\`.kosipa_write_owner o WHERE o.object = '${object}' AND o.owner = 'NATIVE' AND BINARY o.native_account <> BINARY SUBSTRING_INDEX(USER(), '@', 1))`;

const out = [];
if (args.includes('--drop')) {
  for (const t of GUARDED_TABLES) for (const e of ['bi', 'bu', 'bd']) out.push(`DROP TRIGGER IF EXISTS \`${DB}\`.\`kfa_own_${t}_${e}\`;`);
  for (const g of Object.values(COLUMN_GROUPS)) out.push(`DROP TRIGGER IF EXISTS \`${DB}\`.\`kfa_own_${g.table}_profile_bu\`;`);
  console.log(out.join('\n'));
  process.exit(0);
}
out.push(`-- KOSIPA write-ownership guard (FD-22, PROPOSED). Business database ${DB}, ownership registry in ${LEDGER}. Review before use.
CREATE TABLE IF NOT EXISTS \`${LEDGER}\`.\`kosipa_write_owner\` (
  \`object\`         VARCHAR(64)  NOT NULL COMMENT 'table, or table.group for a column group',
  \`owner\`          ENUM('LEGACY','NATIVE') NOT NULL DEFAULT 'LEGACY',
  \`native_account\` VARCHAR(80)  NOT NULL COMMENT 'login name of the only account allowed to write while NATIVE',
  \`changed_by\`     VARCHAR(80)  NOT NULL,
  \`changed_at\`     DATETIME     NOT NULL,
  \`reason\`         VARCHAR(200) NOT NULL,
  PRIMARY KEY (\`object\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
DELIMITER //`);
for (const t of GUARDED_TABLES) {
  for (const [e, when] of [['bi', 'INSERT'], ['bu', 'UPDATE'], ['bd', 'DELETE']]) {
    out.push(`CREATE OR REPLACE TRIGGER \`${DB}\`.\`kfa_own_${t}_${e}\` BEFORE ${when} ON \`${DB}\`.\`${t}\` FOR EACH ROW
BEGIN IF ${owned(t)} THEN ${refuse(t)}; END IF; END//`);
  }
}
for (const [object, g] of Object.entries(COLUMN_GROUPS)) {
  const changed = g.columns.map((c) => `NOT (NEW.\`${c}\` <=> OLD.\`${c}\`)`).join(' OR ');
  out.push(`CREATE OR REPLACE TRIGGER \`${DB}\`.\`kfa_own_${g.table}_profile_bu\` BEFORE UPDATE ON \`${DB}\`.\`${g.table}\` FOR EACH ROW
BEGIN IF (${changed}) AND ${owned(object)} THEN ${refuse(object)}; END IF; END//`);
}
out.push('DELIMITER ;');
console.log(out.join('\n'));
