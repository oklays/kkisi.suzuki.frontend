#!/usr/bin/env bash
# DEV LOCAL environment for hands-on owner testing (checkpoint 14). LOCAL staging container ONLY; synthetic data ONLY.
#   database kkisi_devlocal_staging = STRUCTURE of the local legacy copy (CREATE TABLE ... LIKE, no rows copied from it)
#                                   + ROWS of the seeded synthetic schema kkisi_e2e_legacy (synth_* users, SYNTH branches/items/members)
#                                   + TEST-ONLY persona grants and a TEST-ONLY KOSIPA staff account (clearly named SYNTH)
#   accounts devlocal_read (SELECT) and one writer per TOKO module, whose grants are the EXISTING local writer grant sets re-targeted to
#            this database (POS, register, returns, products) and the documented inventory-writer set (POS_INVENTORY_ENHANCEMENT_IMPLEMENTATION.md).
# Writes apps/web/.env.dev-local (mode 600, gitignored). Never touches kkisi_staging rows, production, legacy PHP, or any database it did not create.
# A rebuild drops ONLY kkisi_devlocal_staging and only when it carries the DEV LOCAL marker.
#   scripts/setup-dev-local.sh [--apply]      (default: dry run)
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
DL_DB="kkisi_devlocal_staging"; SRC_STRUCTURE="kkisi_staging"; SRC_ROWS="kkisi_e2e_legacy"
# bash 3.2 (macOS): no associative arrays
copy_source() { case "$1" in devlocal_pos) echo kkisi_pos_runtime;; devlocal_register) echo kkisi_pos_register;; devlocal_return) echo kkisi_pos_return;; devlocal_product) echo kkisi_product_write;; esac; }
ACCOUNTS="devlocal_read devlocal_pos devlocal_register devlocal_return devlocal_product devlocal_inventory devlocal_console"
pw_of() { eval "printf '%s' \"\${PW_$1}\""; }

main() {
  local mode="dry-run"; [ "${1:-}" = "--apply" ] && mode="apply"
  info "== DEV LOCAL provisioning ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  [[ "$DL_DB" =~ ^kkisi_devlocal_staging$ ]] || die "unexpected target name"
  [ "$(root_sql -e "SELECT COUNT(*) FROM ${SRC_ROWS}._e2e_marker WHERE purpose='synthetic-only'" 2>/dev/null || echo 0)" = "1" ] || die "${SRC_ROWS} is not the marked synthetic schema: run scripts/e2e-setup.sh --apply and the e2e seed first"
  [ "$(root_sql -e "SELECT COUNT(*) FROM ${SRC_ROWS}.db_users WHERE id BETWEEN 900001 AND 900007")" -ge 1 ] || die "synthetic users missing: run scripts/e2e-seed.mjs first"
  local exists marker; exists="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${DL_DB}'")"
  if [ "$exists" = "1" ]; then
    marker="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DL_DB}' AND table_name='_devlocal_marker'")"
    [ "$marker" = "1" ] || die "${DL_DB} exists WITHOUT the DEV LOCAL marker: refusing to touch it"
  fi
  info "target ${DL_DB} (local, synthetic) ; structure from ${SRC_STRUCTURE} (no rows) ; rows from ${SRC_ROWS} ; accounts @${AUTH_HOST}"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing changed. Re-run with --apply."; return 0; }
  local legacy_before; legacy_before="$(legacy_object_count)"

  # 1. database (rebuild only our own marked database)
  [ "$exists" = "1" ] && root_sql -e "DROP DATABASE \`${DL_DB}\`"
  root_sql -e "CREATE DATABASE \`${DL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE TABLE \`${DL_DB}\`._devlocal_marker (purpose VARCHAR(40) PRIMARY KEY); INSERT INTO \`${DL_DB}\`._devlocal_marker VALUES ('dev-local-synthetic-only')"
  # 2. structure: every base table of the legacy copy (no rows), plus synthetic-only tables
  local t
  for t in $(root_sql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${SRC_STRUCTURE}' AND table_type='BASE TABLE'"); do
    root_sql -e "CREATE TABLE \`${DL_DB}\`.\`${t}\` LIKE \`${SRC_STRUCTURE}\`.\`${t}\`"
  done
  for t in $(root_sql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${SRC_ROWS}' AND table_type='BASE TABLE' AND table_name NOT IN (SELECT table_name FROM information_schema.tables WHERE table_schema='${DL_DB}') AND table_name <> '_e2e_marker'"); do
    root_sql -e "CREATE TABLE \`${DL_DB}\`.\`${t}\` LIKE \`${SRC_ROWS}\`.\`${t}\`"
  done
  # 3. rows: synthetic rows only, common columns
  local cols n copied=0
  for t in $(root_sql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${SRC_ROWS}' AND table_type='BASE TABLE' AND table_name <> '_e2e_marker'"); do
    n="$(root_sql -e "SELECT COUNT(*) FROM \`${SRC_ROWS}\`.\`${t}\`")"; [ "$n" = "0" ] && continue
    cols="$(root_sql -e "SELECT GROUP_CONCAT(CONCAT('\`', s.column_name, '\`') ORDER BY s.ordinal_position) FROM information_schema.columns s JOIN information_schema.columns d ON d.table_schema='${DL_DB}' AND d.table_name=s.table_name AND d.column_name=s.column_name WHERE s.table_schema='${SRC_ROWS}' AND s.table_name='${t}' AND s.extra NOT LIKE '%GENERATED%'")"
    root_sql -e "SET SESSION sql_mode=''; INSERT INTO \`${DL_DB}\`.\`${t}\` (${cols}) SELECT ${cols} FROM \`${SRC_ROWS}\`.\`${t}\`"; copied=$((copied + n))
  done
  info "synthetic rows copied: ${copied}"
  # the copied users carry the hashes of THIS seed's passwords: snapshot them for DEV LOCAL, because every later e2e seed (e.g. scripts/uat-run.sh) writes NEW ones
  [ -f .e2e-fixture.json ] || die ".e2e-fixture.json missing: run the e2e seed first"
  cp .e2e-fixture.json .env.dev-local-accounts.json && chmod 600 .env.dev-local-accounts.json
  # 4. TEST-ONLY persona grants (synthetic roles in this database only; NOT production permissions)
  root_sql -e "SET SESSION sql_mode=''; USE \`${DL_DB}\`;
    INSERT INTO db_permissions (role_id, permissions) SELECT r, p FROM (
      SELECT 1 r, 'users_edit' p UNION ALL SELECT 1,'sales_view' UNION ALL SELECT 1,'sales_payment_view' UNION ALL SELECT 1,'sales_return_view' UNION ALL SELECT 1,'sales_return_add'
      UNION ALL SELECT 1,'items_view' UNION ALL SELECT 1,'items_add' UNION ALL SELECT 1,'items_edit' UNION ALL SELECT 1,'inventory_view' UNION ALL SELECT 1,'inventory_so'
      UNION ALL SELECT 2,'sales_view' UNION ALL SELECT 2,'items_view'
      UNION ALL SELECT 3,'sales_view' UNION ALL SELECT 3,'sales_payment_view' UNION ALL SELECT 3,'sales_return_view' UNION ALL SELECT 3,'sales_return_add' UNION ALL SELECT 3,'items_view' UNION ALL SELECT 3,'items_edit' UNION ALL SELECT 3,'inventory_so'
    ) g WHERE NOT EXISTS (SELECT 1 FROM db_permissions x WHERE x.role_id = g.r AND x.permissions = g.p);
    UPDATE db_roles SET status = 1 WHERE id = 3;
    UPDATE db_company SET sales_return_init = CONCAT('RS', id) WHERE id BETWEEN 9001 AND 9004 AND COALESCE(sales_return_init, '') = '';   -- return numbering prefix for the synthetic branches
    INSERT IGNORE INTO db_kasir (id, company_id, no_kasir, status, cd, cd_usr, description) VALUES (9003, 9001, 'KRS02', 1, 0, '', 'SYNTH kasir kedua (DEV LOCAL): supervisor membuka sesi untuk retur');   -- the synthetic seed keeps role 3 INACTIVE as a negative case; DEV LOCAL activates it for the TOKO supervisor persona
    INSERT IGNORE INTO ref_menu (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9005,'SYNTH Payroll','payroll/matrix_c',1,0,'WEB','PRIVATE');
    INSERT IGNORE INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9005,9005,9001,1,0,0,0,0,0);
    INSERT IGNORE INTO ref_users (id_ref_user, username, nama_lengkap, status, password, email, otp, token) VALUES (9004,'synth_ksp_staff','SYNTH STAF KOSIPA (BACA)',1,'x','',0,'');
    INSERT IGNORE INTO ref_group (id, nama_group, status) VALUES (9003,'SYNTH KOSIPA STAF',1);
    INSERT IGNORE INTO ref_group_akses (id, id_user, id_group, status) VALUES (9004,9004,9003,1);
    INSERT IGNORE INTO ref_menu_akses (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9011,9001,9003,1,0,0,0,0,0),(9012,9002,9003,1,0,0,0,0,0),(9013,9003,9003,1,0,0,0,0,0);"
  # 5. accounts
  local pwfile=.env.dev-local acct src pw lines
  [ -f "$pwfile" ] || { : > "$pwfile"; chmod 600 "$pwfile"; }
  for acct in $ACCOUNTS; do
    pw="$(grep -E "^#pw:${acct}=" "$pwfile" 2>/dev/null | cut -d= -f2 || true)"; [[ "$pw" =~ ^[0-9a-f]{40}$ ]] || pw="$(openssl rand -hex 20)"; eval "PW_${acct}=$pw"
    root_sql -e "CREATE USER IF NOT EXISTS '${acct}'@'${AUTH_HOST}' IDENTIFIED BY '${pw}' WITH MAX_USER_CONNECTIONS 10; ALTER USER '${acct}'@'${AUTH_HOST}' IDENTIFIED BY '${pw}' WITH MAX_USER_CONNECTIONS 10; REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${acct}'@'${AUTH_HOST}'"
  done
  root_sql -e "GRANT SELECT ON \`${DL_DB}\`.* TO 'devlocal_read'@'${AUTH_HOST}'"
  # console store: a DEV LOCAL account with the SAME grants as the local console account, so DEV LOCAL never competes for kkisi_console's small connection cap
  local chost clines; chost="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='kkisi_console' LIMIT 1")"; [ -n "$chost" ] || die "kkisi_console account not found (run scripts/setup-console-store.sh)"
  clines="$(root_sql -e "SHOW GRANTS FOR 'kkisi_console'@'${chost}'" | grep -v '^GRANT USAGE' | grep '`kkisi_console_staging`')"
  printf '%s\n' "$clines" | sed -e "s/ TO \`kkisi_console\`@\`[^\`]*\`/ TO 'devlocal_console'@'${AUTH_HOST}'/" -e 's/$/;/' | root_sql
  for acct in devlocal_pos devlocal_register devlocal_return devlocal_product; do
    src="$(copy_source "$acct")"
    local host; host="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='${src}' LIMIT 1")"; [ -n "$host" ] || die "source grant account ${src} not found"
    lines="$(root_sql -e "SHOW GRANTS FOR '${src}'@'${host}'" | grep -v '^GRANT USAGE' | grep "\`${SRC_STRUCTURE}\`" || true)"
    [ -n "$lines" ] || die "no grants to copy from ${src}"
    printf '%s\n' "$lines" | sed -e "s/\`${SRC_STRUCTURE}\`/\`${DL_DB}\`/g" -e "s/ TO \`${src}\`@\`[^\`]*\`/ TO '${acct}'@'${AUTH_HOST}'/" -e 's/$/;/' | root_sql
  done
  root_sql -e "GRANT SELECT ON \`${DL_DB}\`.* TO 'devlocal_inventory'@'${AUTH_HOST}';
    GRANT INSERT, UPDATE ON \`${DL_DB}\`.db_warehouse TO 'devlocal_inventory'@'${AUTH_HOST}';
    GRANT INSERT, UPDATE, DELETE ON \`${DL_DB}\`.db_inventory_so TO 'devlocal_inventory'@'${AUTH_HOST}';
    GRANT INSERT, UPDATE, DELETE ON \`${DL_DB}\`.db_inventory_so_dtl TO 'devlocal_inventory'@'${AUTH_HOST}';
    GRANT UPDATE ON \`${DL_DB}\`.db_items TO 'devlocal_inventory'@'${AUTH_HOST}';
    GRANT INSERT ON \`${DL_DB}\`.db_stockentry TO 'devlocal_inventory'@'${AUTH_HOST}'; FLUSH PRIVILEGES"
  # 6. environment profile (secrets only in this ignored file)
  set -a; . ./.env.local; set +a
  local hp="${APP_DB_HOSTPORT}" dsn
  dsn() { printf 'mysql://%s:%s@%s/%s?connection_limit=%s' "$1" "$(pw_of "$1")" "$hp" "$DL_DB" "$2"; }
  {
    echo "# DEV LOCAL profile (generated by scripts/setup-dev-local.sh; synthetic data only; never commit)"
    for acct in $ACCOUNTS; do echo "#pw:${acct}=$(pw_of "$acct")"; done
    echo "APP_ORIGIN=\"http://127.0.0.1:3200\""
    echo "AUTH_SECRETS=\"${AUTH_SECRETS}\""
    echo "DATABASE_URL=\"$(dsn devlocal_read 3)\""
    echo "DATABASE_URL_AUTH=\"${DATABASE_URL_AUTH%%\?*}?connection_limit=2\""
    echo "DATABASE_URL_CONSOLE=\"mysql://devlocal_console:$(pw_of devlocal_console)@${hp}/kkisi_console_staging?connection_limit=1\""
    echo "POS_WRITE_DATABASE=\"${DL_DB}\""
    echo "POS_WRITES_ENABLED=1"
    echo "DATABASE_URL_WRITE=\"$(dsn devlocal_pos 2)\""
    echo "DATABASE_URL_REGISTER_WRITE=\"$(dsn devlocal_register 1)\""
    echo "SALES_RETURN_WRITES_ENABLED=1"
    echo "DATABASE_URL_RETURN_WRITE=\"$(dsn devlocal_return 1)\""
    echo "PRODUCTS_WRITES_ENABLED=1"
    echo "DATABASE_URL_PRODUCT_WRITE=\"$(dsn devlocal_product 1)\""
    echo "INVENTORY_WRITES_ENABLED=1"
    echo "DATABASE_URL_INVENTORY_WRITE=\"$(dsn devlocal_inventory 1)\""
    echo "CONSOLE_ENABLED=true"
    echo "KOSIPA_READ_ENABLED=true"
    echo "WAREHOUSE_PREVIEW_ENABLED=true"
    echo "KOSIPA_EXPORT_ENABLED=true"
    echo "KOSIPA_EXPORT_USER_IDS=900002"
    echo "CONSOLE_LANDING_ROLES="
    echo "KOSIPA_STORE_COLUMN_MAP="
  } > "$pwfile"
  chmod 600 "$pwfile"
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  info "DEV LOCAL database ready: $(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DL_DB}'") tables; profile written to apps/web/${pwfile} (mode 600)"
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
