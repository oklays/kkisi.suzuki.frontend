#!/usr/bin/env bash
# Provision the auth store for Stage 2A on the LOCAL staging MariaDB container.
#   database  kkisi_auth_staging          (separate from the legacy kkisi_staging)
#   account   kkisi_auth@<detected host>  (host = what MariaDB sees for the application's own connection path)
# DEFAULT IS A DRY RUN: read-only checks only, prints the plan. Nothing changes unless you pass --apply.
# Idempotent. There is deliberately NO drop/cleanup option here: teardown is scripts/teardown-auth-store.sh.
# Run from apps/web/.   Usage:  scripts/setup-auth-store.sh [--apply]
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }

ensure_auth_password() {
  if [ -n "${MARIADB_AUTH_PASSWORD:-}" ]; then
    [[ "$MARIADB_AUTH_PASSWORD" =~ ^[0-9a-f]{48}$ ]] || die "MARIADB_AUTH_PASSWORD in .env.staging has an unexpected format"
  else
    MARIADB_AUTH_PASSWORD="$(openssl rand -hex 24)"
  fi
  # Persist BEFORE touching the database so a partial run can be re-run (the password is re-applied with ALTER USER).
  upsert_env_line .env.staging MARIADB_AUTH_PASSWORD "$MARIADB_AUTH_PASSWORD"
  upsert_env_line .env.local DATABASE_URL_AUTH "\"mysql://${AUTH_USER}:${MARIADB_AUTH_PASSWORD}@${APP_DB_HOSTPORT}/${AUTH_DB}?connection_limit=8\""
}

main() {
  local mode="dry-run" arg
  for arg in "$@"; do
    case "$arg" in
      --apply) mode="apply" ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "unknown option: $arg" ;;
    esac
  done

  info "== auth store provisioning ($mode) =="
  load_root_env
  assert_local_container
  assert_app_path_is_loopback
  resolve_auth_host
  info "target container : $CONTAINER (3306/tcp published on loopback only)"
  info "target database  : $AUTH_DB  (legacy $LEGACY_DB is never written)"
  info "target account   : $AUTH_USER@$AUTH_HOST  (detected from the application's connection path; never '%')"

  local other_hosts legacy_before db_exists
  other_hosts="$(root_sql -e "SELECT Host FROM mysql.global_priv WHERE User='${AUTH_USER}' AND Host<>'${AUTH_HOST}'" | tr '\n' ' ')"
  [ -z "${other_hosts// /}" ] || die "account ${AUTH_USER} already exists at other host(s): ${other_hosts}- resolve with scripts/teardown-auth-store.sh first"
  db_exists="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${AUTH_DB}'")"
  legacy_before="$(legacy_object_count)"
  info "current state    : database exists=$db_exists ; legacy objects=$legacy_before"

  info "operations (in order):"
  info "  1. write MARIADB_AUTH_PASSWORD to .env.staging and DATABASE_URL_AUTH to .env.local (mode 600; value never printed)"
  info "  2. run db/auth/001_auth_schema.sql   (CREATE DATABASE/TABLE IF NOT EXISTS, fully qualified)"
  info "  3. run db/auth/002_auth_grants.sql.tpl (CREATE/ALTER USER, REVOKE ALL, GRANT minimum set) as ${AUTH_USER}@${AUTH_HOST}"
  info "  4. run scripts/verify-auth-store.sh   (read-only)"
  if [ "$mode" != "apply" ]; then
    info "DRY RUN: nothing was changed. Re-run with --apply to execute."
    return 0
  fi

  info "[1/4] secrets";  ensure_auth_password
  info "[2/4] schema";   root_sql < db/auth/001_auth_schema.sql
  info "[3/4] account and grants"; render_template db/auth/002_auth_grants.sql.tpl "$MARIADB_AUTH_PASSWORD" | root_sql
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed during provisioning: STOP and investigate"
  info "[4/4] verification"
  LEGACY_OBJECTS_BEFORE="$legacy_before" bash scripts/verify-auth-store.sh
  info "done. Legacy schema object count unchanged ($legacy_before)."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
