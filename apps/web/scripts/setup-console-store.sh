#!/usr/bin/env bash
# Provision the console store (identity links + audit) on the LOCAL staging MariaDB container.
#   database  kkisi_console_staging          (separate from the legacy kkisi_staging AND the auth kkisi_auth_staging)
#   account   kkisi_console@<detected host>  (MAX_USER_CONNECTIONS 2; never '%')
# DEFAULT IS A DRY RUN: read-only checks only, prints the plan. --apply provisions; --verify only verifies;
# --prove-triggers shows (as root, inside a transaction that is always rolled back) that the triggers alone refuse edits.
# Idempotent. Never touches the legacy or auth schemas. Production uses docs/migration/sql/console-store-production.sql.
# Run from apps/web/.   Usage:  scripts/setup-console-store.sh [--apply|--verify|--prove-triggers]
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

CONSOLE_DB="kkisi_console_staging"
CONSOLE_USER="kkisi_console"

ensure_console_password() {
  if [ -n "${MARIADB_CONSOLE_PASSWORD:-}" ]; then
    [[ "$MARIADB_CONSOLE_PASSWORD" =~ ^[0-9a-f]{48}$ ]] || die "MARIADB_CONSOLE_PASSWORD in .env.staging has an unexpected format"
  else
    MARIADB_CONSOLE_PASSWORD="$(openssl rand -hex 24)"
  fi
  upsert_env_line .env.staging MARIADB_CONSOLE_PASSWORD "$MARIADB_CONSOLE_PASSWORD"
  upsert_env_line .env.local DATABASE_URL_CONSOLE "\"mysql://${CONSOLE_USER}:${MARIADB_CONSOLE_PASSWORD}@${APP_DB_HOSTPORT}/${CONSOLE_DB}?connection_limit=1\""
}

verify() {
  local failed=0 line
  info "== console store verification (read-only) =="
  while IFS=$'\t' read -r name ok; do
    [ -n "$name" ] || continue
    if [ "$ok" = "1" ]; then info "PASS $name"; else info "FAIL $name"; failed=$((failed + 1)); fi
  done < <(render_template db/console/003_verify.sql.tpl | root_sql)
  line="$(node --env-file=.env.local --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const denied = (e) => /1142|denied/i.test(String(e && e.message));
const c = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_CONSOLE });
const out = [];
try {
  out.push(["console account reads its own tables", (await c.$queryRaw`SELECT COUNT(*) AS n FROM kkisi_console_staging.console_identity_link`).length === 1]);
  let a = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_staging.db_users LIMIT 1`; } catch (e) { a = denied(e); }
  out.push(["console account is refused SELECT on the business schema", a]);
  let b = false; try { await c.$queryRaw`SELECT 1 FROM kkisi_auth_staging.auth_session LIMIT 1`; } catch (e) { b = denied(e); }
  out.push(["console account is refused SELECT on the auth schema", b]);
} catch (e) { out.push(["app-path checks aborted", false]); }
finally { await c.$disconnect(); }
process.stdout.write(out.map(([n, ok]) => (ok ? "PASS " : "FAIL ") + n).join("\n"));
' 2>/dev/null)" || line="FAIL app-path checks could not run"
  info "$line"
  failed=$((failed + $(printf '%s\n' "$line" | grep -c '^FAIL' || true)))
  [ "$failed" -eq 0 ] || die "$failed check(s) failed"
  info "console store verified."
}

# Root bypasses grants, so any refusal here comes from the triggers. Each probe runs in its own rolled-back transaction.
prove_triggers() {
  local failed=0 name sql out
  local seed="INSERT INTO kkisi_console_staging.console_audit_event (occurred_at, actor_user_id, action, subject_type, subject_id, outcome, request_id) VALUES (NOW(3), 4294967295, 'trigger.proof', 'proof', 'proof', 'success', 'proof');
INSERT INTO kkisi_console_staging.console_identity_link (console_user_id, system, external_user_id, linked_by, linked_at) VALUES (4294967295, 'kosipa', 4294967295, 4294967294, NOW());"
  for name in "audit UPDATE" "audit DELETE" "link identity rewrite" "link DELETE"; do
    case "$name" in
      "audit UPDATE") sql="UPDATE kkisi_console_staging.console_audit_event SET outcome='denied' WHERE action='trigger.proof';" ;;
      "audit DELETE") sql="DELETE FROM kkisi_console_staging.console_audit_event WHERE action='trigger.proof';" ;;
      "link identity rewrite") sql="UPDATE kkisi_console_staging.console_identity_link SET external_user_id=1 WHERE console_user_id=4294967295;" ;;
      "link DELETE") sql="DELETE FROM kkisi_console_staging.console_identity_link WHERE console_user_id=4294967295;" ;;
    esac
    out="$(printf 'START TRANSACTION;\n%s\n%s\nROLLBACK;\n' "$seed" "$sql" | root_sql 2>&1 || true)"
    if printf '%s' "$out" | grep -q '1644'; then info "PASS trigger refuses: $name"; else info "FAIL trigger did not refuse: $name"; failed=$((failed + 1)); fi
  done
  [ "$(root_sql -e "SELECT COUNT(*) FROM kkisi_console_staging.console_audit_event WHERE action='trigger.proof'")" = "0" ] || die "proof rows remained"
  [ "$failed" -eq 0 ] || die "$failed trigger proof(s) failed"
  info "triggers proven (all probes rolled back)."
}

main() {
  local mode="dry-run" arg
  for arg in "$@"; do
    case "$arg" in
      --apply) mode="apply" ;;
      --verify) mode="verify" ;;
      --prove-triggers) mode="prove" ;;
      -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
      *) die "unknown option: $arg" ;;
    esac
  done
  info "== console store provisioning ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  [ "$CONSOLE_DB" != "$LEGACY_DB" ] && [ "$CONSOLE_DB" != "$AUTH_DB" ] || die "console database must differ from the legacy and auth databases"
  info "target database : $CONSOLE_DB ; account $CONSOLE_USER@$AUTH_HOST (detected; never '%')"
  if [ "$mode" = "verify" ]; then verify; return 0; fi
  if [ "$mode" = "prove" ]; then prove_triggers; return 0; fi
  local other_hosts legacy_before auth_before
  other_hosts="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='${CONSOLE_USER}' AND Host<>'${AUTH_HOST}'" | tr '\n' ' ')"
  [ -z "${other_hosts// /}" ] || die "account ${CONSOLE_USER} already exists at other host(s): ${other_hosts}"
  legacy_before="$(legacy_object_count)"
  auth_before="$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")"
  info "operations: 1) secret + DATABASE_URL_CONSOLE in .env.local (mode 600, never printed) 2) db/console/001_console_schema.sql 3) db/console/002_console_grants.sql.tpl 4) verification"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed. Re-run with --apply to execute."; return 0; }
  info "[1/4] secret";   ensure_console_password
  info "[2/4] schema";   root_sql < db/console/001_console_schema.sql
  info "[3/4] grants";   render_template db/console/002_console_grants.sql.tpl "$MARIADB_CONSOLE_PASSWORD" | root_sql
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${AUTH_DB}'")" = "$auth_before" ] || die "auth store changed: STOP and investigate"
  info "[4/4] verification"; verify
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
