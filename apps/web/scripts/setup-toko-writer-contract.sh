#!/usr/bin/env bash
# Provision the TOKO stock-writer CONTRACT database on the LOCAL staging container (checkpoint 12). NOT production, NOT the TOKO schema.
#   database kkisi_toko_writer_contract: db_items and db_stockentry created from the EXACT DDL of the local legacy copy (SHOW CREATE TABLE, no data),
#            the proposed nx_stock_posting idempotency table, and SYNTHETIC items only (ids 990001-990020, company 9001).
#   account  kkisi_toko_writer_ct@<detected host>: SELECT + UPDATE(stock) on db_items, SELECT/INSERT on db_stockentry and nx_stock_posting.
# The DSN goes to apps/web/.env.toko-writer-contract (mode 600, gitignored), read only by tests/toko-writer-contract-db.test.mjs.
# DEFAULT IS A DRY RUN. --apply provisions (idempotent; the synthetic items are reset to their opening stock). Run from apps/web/.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
CT_DB="kkisi_toko_writer_contract"; CT_USER="kkisi_toko_writer_ct"
main() {
  local mode="dry-run" arg; for arg in "$@"; do case "$arg" in --apply) mode="apply";; *) die "unknown option: $arg";; esac; done
  info "== toko writer contract provisioning ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  [ "$CT_DB" != "$LEGACY_DB" ] || die "contract database must differ from the legacy copy"
  info "source DDL: ${LEGACY_DB}.db_items, ${LEGACY_DB}.db_stockentry (structure only) ; target ${CT_DB} ; account ${CT_USER}@${AUTH_HOST}"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed. Re-run with --apply."; return 0; }
  local legacy_before; legacy_before="$(legacy_object_count)"
  local pw="${MARIADB_TOKO_WRITER_CT_PASSWORD:-}"; [ -n "$pw" ] || pw="$(openssl rand -hex 24)"
  upsert_env_line .env.staging MARIADB_TOKO_WRITER_CT_PASSWORD "$pw"
  [ -f .env.toko-writer-contract ] || { : > .env.toko-writer-contract; chmod 600 .env.toko-writer-contract; }
  upsert_env_line .env.toko-writer-contract TOKO_WRITER_CONTRACT_URL "\"mysql://${CT_USER}:${pw}@${APP_DB_HOSTPORT}/${CT_DB}?connection_limit=4\""
  root_sql -e "CREATE DATABASE IF NOT EXISTS \`${CT_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  local t ddl
  for t in db_items db_stockentry; do
    if [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CT_DB}' AND table_name='${t}'")" = "0" ]; then
      ddl="$(root_sql -e "SHOW CREATE TABLE \`${LEGACY_DB}\`.\`${t}\`" | cut -f2-)"
      printf 'USE `%s`;\n%b;\n' "$CT_DB" "$ddl" | root_sql
    fi
  done
  root_sql < db/toko-writer-contract/002_nx_stock_posting.sql
  render_template db/toko-writer-contract/003_grants.sql.tpl "$pw" | root_sql
  # synthetic items: opening stock 100 each, booked as a 'Stok Awal' entry so that the legacy recompute formula and the cache agree from the start
  root_sql -e "USE \`${CT_DB}\`; SET SESSION sql_mode=''; INSERT INTO \`${CT_DB}\`.db_items (id, item_code, item_name, company_id, stock, status, status_so) SELECT 990000 + seq, CONCAT('CT', seq), CONCAT('SYNTH CONTRACT ', seq), 9001, 0, 1, IF(seq = 20, 1, 0) FROM seq_1_to_20 ON DUPLICATE KEY UPDATE status_so = VALUES(status_so)"
  root_sql -e "SET SESSION sql_mode=''; INSERT INTO \`${CT_DB}\`.db_stockentry (entry_date, item_id, qty, company_id, status, note) SELECT NOW(), id, 100, 9001, 1, 'Stok Awal' FROM \`${CT_DB}\`.db_items i WHERE id BETWEEN 990001 AND 990020 AND NOT EXISTS (SELECT 1 FROM \`${CT_DB}\`.db_stockentry s WHERE s.item_id = i.id AND s.note = 'Stok Awal')"
  root_sql -e "UPDATE \`${CT_DB}\`.db_items i SET stock = (SELECT COALESCE(SUM(qty),0) FROM \`${CT_DB}\`.db_stockentry s WHERE s.item_id = i.id AND s.status = 1) WHERE id BETWEEN 990001 AND 990020"
  local tb a b
  for tb in db_items db_stockentry; do   # schema equivalence: column names, types, nullability, defaults and indexes must equal the legacy copy
    a="$(root_sql -e "SELECT GROUP_CONCAT(CONCAT_WS(':', COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'~')) ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${LEGACY_DB}' AND TABLE_NAME='${tb}'")"
    b="$(root_sql -e "SELECT GROUP_CONCAT(CONCAT_WS(':', COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'~')) ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${CT_DB}' AND TABLE_NAME='${tb}'")"
    [ "$a" = "$b" ] || die "${tb}: contract columns differ from the legacy copy"
    a="$(root_sql -e "SELECT GROUP_CONCAT(CONCAT_WS(':', INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME) ORDER BY INDEX_NAME, SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${LEGACY_DB}' AND TABLE_NAME='${tb}'")"
    b="$(root_sql -e "SELECT GROUP_CONCAT(CONCAT_WS(':', INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME) ORDER BY INDEX_NAME, SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${CT_DB}' AND TABLE_NAME='${tb}'")"
    [ "$a" = "$b" ] || die "${tb}: contract indexes differ from the legacy copy"
    info "PASS ${tb}: columns and indexes equal to ${LEGACY_DB}.${tb}"
  done
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  info "contract database ready: $(root_sql -e "SELECT COUNT(*) FROM ${CT_DB}.db_items") synthetic items; legacy copy untouched"
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
