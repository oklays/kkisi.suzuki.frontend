#!/usr/bin/env bash
# Provision the Warehouse persistence REHEARSAL store on the LOCAL staging MariaDB container (checkpoint 10). NOT a production migration.
#   database  kkisi_warehouse_rehearsal   (separate from the legacy, auth and console databases)
#   account   kkisi_wh_rehearsal@<detected host>   (MAX_USER_CONNECTIONS 4 locally so concurrent consumers can be tested; never '%')
# The DSN is written to apps/web/.env.warehouse-rehearsal (mode 600, gitignored) and is read ONLY by the opt-in rehearsal tests: the application never loads it.
# DEFAULT IS A DRY RUN. --apply provisions; --verify verifies; --prove-triggers shows (as root, in rolled-back transactions) that triggers alone refuse edits.
# Idempotent. Never touches the legacy, auth or console schemas. Run from apps/web/.   Usage: scripts/setup-warehouse-rehearsal.sh [--apply|--verify|--prove-triggers]
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

WH_DB="kkisi_warehouse_rehearsal"
WH_USER="kkisi_wh_rehearsal"
CONSOLE_DB="kkisi_console_staging"

ensure_password() {
  local pw="${MARIADB_WH_REHEARSAL_PASSWORD:-}"
  if [ -n "$pw" ]; then [[ "$pw" =~ ^[0-9a-f]{48}$ ]] || die "MARIADB_WH_REHEARSAL_PASSWORD in .env.staging has an unexpected format"; else pw="$(openssl rand -hex 24)"; fi
  MARIADB_WH_REHEARSAL_PASSWORD="$pw"
  upsert_env_line .env.staging MARIADB_WH_REHEARSAL_PASSWORD "$pw"
  [ -f .env.warehouse-rehearsal ] || { : > .env.warehouse-rehearsal; chmod 600 .env.warehouse-rehearsal; }
  upsert_env_line .env.warehouse-rehearsal WAREHOUSE_REHEARSAL_URL "\"mysql://${WH_USER}:${pw}@${APP_DB_HOSTPORT}/${WH_DB}?connection_limit=4\""
}

verify() {
  local failed=0 n out
  info "== warehouse rehearsal verification (read-only) =="
  check() { if [ "$2" = "1" ]; then info "PASS $1"; else info "FAIL $1"; failed=$((failed + 1)); fi; }
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${WH_DB}' AND table_type='BASE TABLE'")"; check "11 base tables in ${WH_DB}" "$([ "$n" = "11" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='${WH_DB}'")"; check "append-only / immutability triggers present (>= 19)" "$([ "$n" -ge 19 ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.table_privileges WHERE grantee LIKE '%${WH_USER}%' AND privilege_type IN ('DELETE','DROP','ALTER','CREATE','INDEX','TRIGGER')")"; check "account has no DELETE/DDL/TRIGGER privilege" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee LIKE '%${WH_USER}%'")"; check "account has no schema-level privilege" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(DISTINCT table_schema) FROM information_schema.table_privileges WHERE grantee LIKE '%${WH_USER}%' AND table_schema <> '${WH_DB}'")"; check "account has no right on any other schema" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  n="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}' AND table_name LIKE 'warehouse%'")"; check "no Warehouse table exists in the Console store" "$([ "$n" = "0" ] && echo 1 || echo 0)"
  out="$(node --env-file=.env.warehouse-rehearsal --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const denied = (e) => /1142|1044|denied/i.test(String(e && e.message));
const c = new PrismaClient({ datasourceUrl: process.env.WAREHOUSE_REHEARSAL_URL });
const out = [];
try {
  out.push(["account reads its own tables", (await c.$queryRaw`SELECT COUNT(*) AS n FROM kkisi_warehouse_rehearsal.warehouse_item_map`).length === 1]);
  let a = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_staging.db_users LIMIT 1`; } catch (e) { a = denied(e); }
  out.push(["account is refused SELECT on the business schema", a]);
  let b = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_console_staging.console_audit_event LIMIT 1`; } catch (e) { b = denied(e); }
  out.push(["account is refused SELECT on the console store", b]);
  let d = false; try { await c.$executeRaw`DELETE FROM kkisi_warehouse_rehearsal.warehouse_stock_outbox`; } catch (e) { d = denied(e); }
  out.push(["account is refused DELETE", d]);
} catch (e) { out.push(["app-path checks aborted", false]); }
finally { await c.$disconnect(); }
process.stdout.write(out.map(([n, ok]) => (ok ? "PASS " : "FAIL ") + n).join("\n"));
' 2>/dev/null)" || out="FAIL account checks could not run"
  info "$out"; failed=$((failed + $(printf '%s\n' "$out" | grep -c '^FAIL' || true)))
  [ "$failed" -eq 0 ] || die "$failed check(s) failed"
  info "warehouse rehearsal store verified."
}

prove_triggers() {
  local failed=0 name sql out
  local seed="INSERT INTO ${WH_DB}.warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, enqueued_at) VALUES ('trigger.proof|e|1','trigger:proof:0001','e',1,1,'map:g1:c1:s1',5,'INTERNAL_TRANSFER','2026-01-01T00:00:00Z');
INSERT INTO ${WH_DB}.warehouse_audit_event (occurred_at, actor_user_id, action, subject, request_id) VALUES (NOW(3),1,'trigger.proof','proof','proof');"
  for name in "outbox content" "outbox delete" "audit update" "audit delete"; do
    case "$name" in
      "outbox content") sql="UPDATE ${WH_DB}.warehouse_stock_outbox SET quantity=6 WHERE intent_key='trigger.proof|e|1';" ;;
      "outbox delete") sql="DELETE FROM ${WH_DB}.warehouse_stock_outbox WHERE intent_key='trigger.proof|e|1';" ;;
      "audit update") sql="UPDATE ${WH_DB}.warehouse_audit_event SET action='trigger.other' WHERE subject='proof';" ;;
      "audit delete") sql="DELETE FROM ${WH_DB}.warehouse_audit_event WHERE subject='proof';" ;;
    esac
    out="$(printf 'START TRANSACTION;\n%s\n%s\nROLLBACK;\n' "$seed" "$sql" | root_sql 2>&1 || true)"
    if printf '%s' "$out" | grep -q '1644'; then info "PASS trigger refuses: $name"; else info "FAIL trigger did not refuse: $name"; failed=$((failed + 1)); fi
  done
  [ "$(root_sql -e "SELECT COUNT(*) FROM ${WH_DB}.warehouse_stock_outbox WHERE intent_key LIKE 'trigger.proof%'")" = "0" ] || die "proof rows remained"
  [ "$failed" -eq 0 ] || die "$failed trigger proof(s) failed"
  info "triggers proven (all probes rolled back)."
}

main() {
  local mode="dry-run" arg
  for arg in "$@"; do case "$arg" in --apply) mode="apply";; --verify) mode="verify";; --prove-triggers) mode="prove";; -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; *) die "unknown option: $arg";; esac; done
  info "== warehouse rehearsal provisioning ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  [ "$WH_DB" != "$LEGACY_DB" ] && [ "$WH_DB" != "$AUTH_DB" ] && [ "$WH_DB" != "$CONSOLE_DB" ] || die "warehouse database must differ from the legacy, auth and console databases"
  info "target database : $WH_DB ; account $WH_USER@$AUTH_HOST (detected; never '%')"
  if [ "$mode" = "verify" ]; then verify; return 0; fi
  if [ "$mode" = "prove" ]; then prove_triggers; return 0; fi
  local other_hosts legacy_before auth_before console_before
  other_hosts="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='${WH_USER}' AND Host<>'${AUTH_HOST}'" | tr '\n' ' ')"
  [ -z "${other_hosts// /}" ] || die "account ${WH_USER} already exists at other host(s): ${other_hosts}"
  legacy_before="$(legacy_object_count)"
  auth_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")"
  console_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}'")"
  info "operations: 1) secret + .env.warehouse-rehearsal (mode 600) 2) db/warehouse/001_warehouse_schema.sql 3) db/warehouse/002_warehouse_grants.sql.tpl 4) verification"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed. Re-run with --apply to execute."; return 0; }
  info "[1/4] secret";  ensure_password
  info "[2/4] schema";  root_sql < db/warehouse/001_warehouse_schema.sql
  info "[3/4] grants";  render_template db/warehouse/002_warehouse_grants.sql.tpl "$MARIADB_WH_REHEARSAL_PASSWORD" | root_sql
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")" = "$auth_before" ] || die "auth store changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${CONSOLE_DB}'")" = "$console_before" ] || die "console store changed: STOP and investigate"
  info "[4/4] verification"; verify
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
