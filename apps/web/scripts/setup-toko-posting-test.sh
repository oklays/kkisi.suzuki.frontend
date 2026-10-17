#!/usr/bin/env bash
# Provision the TOKO stock-POSTING TEST store on the LOCAL staging MariaDB container (checkpoint 11). NOT a production migration and NOT the TOKO schema.
#   database  kkisi_toko_posting_test   (separate from legacy, auth, console and warehouse-rehearsal databases)
#   account   kkisi_toko_post_test@<detected host>   (MAX_USER_CONNECTIONS 6 locally; never '%'; no DELETE/DDL; no right on any other schema)
# The DSN goes to apps/web/.env.toko-posting-test (mode 600, gitignored), read ONLY by the opt-in cross-database tests: the application never loads it.
# DEFAULT IS A DRY RUN. --apply provisions; --verify verifies. Idempotent. Run from apps/web/.   Usage: scripts/setup-toko-posting-test.sh [--apply|--verify]
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

TK_DB="kkisi_toko_posting_test"
TK_USER="kkisi_toko_post_test"
WH_DB="kkisi_warehouse_rehearsal"
CONSOLE_DB="kkisi_console_staging"

ensure_password() {
  local pw="${MARIADB_TOKO_POSTING_TEST_PASSWORD:-}"
  if [ -n "$pw" ]; then [[ "$pw" =~ ^[0-9a-f]{48}$ ]] || die "MARIADB_TOKO_POSTING_TEST_PASSWORD in .env.staging has an unexpected format"; else pw="$(openssl rand -hex 24)"; fi
  MARIADB_TOKO_POSTING_TEST_PASSWORD="$pw"
  upsert_env_line .env.staging MARIADB_TOKO_POSTING_TEST_PASSWORD "$pw"
  [ -f .env.toko-posting-test ] || { : > .env.toko-posting-test; chmod 600 .env.toko-posting-test; }
  upsert_env_line .env.toko-posting-test TOKO_POSTING_TEST_URL "\"mysql://${TK_USER}:${pw}@${APP_DB_HOSTPORT}/${TK_DB}?connection_limit=4\""
}

verify() {
  local failed=0 n out
  info "== toko posting test store verification (read-only) =="
  check() { if [ "$2" = "1" ]; then info "PASS $1"; else info "FAIL $1"; failed=$((failed + 1)); fi; }
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TK_DB}' AND table_type='BASE TABLE'")"; check "3 base tables + marker in ${TK_DB}" "$([ "$n" = "3" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='${TK_DB}'")"; check "immutability triggers present (3)" "$([ "$n" = "3" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.table_privileges WHERE grantee LIKE '%${TK_USER}%' AND privilege_type IN ('DELETE','DROP','ALTER','CREATE','INDEX','TRIGGER')")"; check "account has no DELETE/DDL/TRIGGER privilege" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee LIKE '%${TK_USER}%'")"; check "account has no schema-level privilege" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(DISTINCT table_schema) FROM information_schema.table_privileges WHERE grantee LIKE '%${TK_USER}%' AND table_schema <> '${TK_DB}'")"; check "account has no right on any other schema" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(DISTINCT table_schema) FROM information_schema.table_privileges WHERE grantee LIKE '%kkisi_wh_rehearsal%' AND table_schema = '${TK_DB}'")"; check "the Warehouse rehearsal account has no right on the TOKO test store" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  out="$(node --env-file=.env.toko-posting-test --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const denied = (e) => /1142|1044|denied/i.test(String(e && e.message));
const c = new PrismaClient({ datasourceUrl: process.env.TOKO_POSTING_TEST_URL });
const out = [];
try {
  out.push(["account reads its own tables", (await c.$queryRaw`SELECT COUNT(*) AS n FROM kkisi_toko_posting_test.toko_test_stock`).length === 1]);
  let a = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_staging.db_users LIMIT 1`; } catch (e) { a = denied(e); }
  out.push(["account is refused SELECT on the business schema", a]);
  let b = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_warehouse_rehearsal.warehouse_stock_outbox LIMIT 1`; } catch (e) { b = denied(e); }
  out.push(["account is refused SELECT on the Warehouse store", b]);
  let d = false; try { await c.$executeRaw`DELETE FROM kkisi_toko_posting_test.toko_test_stock`; } catch (e) { d = denied(e); }
  out.push(["account is refused DELETE", d]);
} catch (e) { out.push(["app-path checks aborted", false]); }
finally { await c.$disconnect(); }
process.stdout.write(out.map(([n, ok]) => (ok ? "PASS " : "FAIL ") + n).join("\n"));
' 2>/dev/null)" || out="FAIL account checks could not run"
  info "$out"; failed=$((failed + $(printf '%s\n' "$out" | grep -c '^FAIL' || true)))
  [ "$failed" -eq 0 ] || die "$failed check(s) failed"
  info "toko posting test store verified."
}

main() {
  local mode="dry-run" arg
  for arg in "$@"; do case "$arg" in --apply) mode="apply";; --verify) mode="verify";; -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; *) die "unknown option: $arg";; esac; done
  info "== toko posting test provisioning ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  [ "$TK_DB" != "$LEGACY_DB" ] && [ "$TK_DB" != "$AUTH_DB" ] && [ "$TK_DB" != "$CONSOLE_DB" ] && [ "$TK_DB" != "$WH_DB" ] || die "test store database must differ from the legacy, auth, console and warehouse databases"
  info "target database : $TK_DB ; account $TK_USER@$AUTH_HOST (detected; never '%')"
  if [ "$mode" = "verify" ]; then verify; return 0; fi
  local other_hosts legacy_before auth_before console_before wh_before
  other_hosts="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='${TK_USER}' AND Host<>'${AUTH_HOST}'" | tr '\n' ' ')"
  [ -z "${other_hosts// /}" ] || die "account ${TK_USER} already exists at other host(s): ${other_hosts}"
  legacy_before="$(legacy_object_count)"
  auth_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")"
  console_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}'")"
  wh_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${WH_DB}'")"
  info "operations: 1) secret + .env.toko-posting-test (mode 600) 2) db/toko-posting-test/001_schema.sql 3) db/toko-posting-test/002_grants.sql.tpl 4) verification"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed. Re-run with --apply to execute."; return 0; }
  info "[1/4] secret";  ensure_password
  info "[2/4] schema";  root_sql < db/toko-posting-test/001_schema.sql
  info "[3/4] grants";  render_template db/toko-posting-test/002_grants.sql.tpl "$MARIADB_TOKO_POSTING_TEST_PASSWORD" | root_sql
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")" = "$auth_before" ] || die "auth store changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}'")" = "$console_before" ] || die "console store changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${WH_DB}'")" = "$wh_before" ] || die "warehouse store changed: STOP and investigate"
  info "[4/4] verification"; verify
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
