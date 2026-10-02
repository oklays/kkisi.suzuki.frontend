#!/usr/bin/env bash
# TEARDOWN of the auth store (drops kkisi_auth_staging and the kkisi_auth account). Separate from setup on purpose.
# Needs the target spelled out EXACTLY, and --execute; without --execute it only reports what it would drop.
#   scripts/teardown-auth-store.sh --container kkisi-staging --database kkisi_auth_staging \
#       --user kkisi_auth --host <client ip> --confirm "DROP kkisi_auth_staging ON kkisi-staging" [--execute]
# It can never touch kkisi_staging: the database name must be exactly kkisi_auth_staging.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; }

main() {
  local c="" d="" u="" h="" confirm="" execute=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --container) c="${2:-}"; shift 2 ;;
      --database)  d="${2:-}"; shift 2 ;;
      --user)      u="${2:-}"; shift 2 ;;
      --host)      h="${2:-}"; shift 2 ;;
      --confirm)   confirm="${2:-}"; shift 2 ;;
      --execute)   execute=1; shift ;;
      -h|--help)   usage; exit 0 ;;
      *) usage >&2; die "unknown option: $1" ;;
    esac
  done
  [ "$d" = "$AUTH_DB" ]   || die "--database must be exactly '$AUTH_DB' (refusing anything else, including the legacy schema)"
  [ "$u" = "$AUTH_USER" ] || die "--user must be exactly '$AUTH_USER'"
  [ -n "$c" ]             || die "--container is required"
  is_ipv4 "$h"            || die "--host must be the account's exact IPv4 host (never a wildcard)"
  [ "$confirm" = "DROP $AUTH_DB ON $c" ] || die "--confirm must be exactly: DROP $AUTH_DB ON $c"
  CONTAINER="$c"
  load_root_env
  assert_local_container

  local acct db_exists rows_s rows_t legacy_before
  acct="$(root_sql -e "SELECT COUNT(*) FROM mysql.global_priv WHERE User='${AUTH_USER}' AND Host='${h}'")"
  db_exists="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${AUTH_DB}'")"
  legacy_before="$(legacy_object_count)"
  local any_acct; any_acct="$(root_sql -e "SELECT COUNT(*) FROM mysql.global_priv WHERE User='${AUTH_USER}'")"
  if [ "$acct" = "0" ] && [ "$any_acct" != "0" ]; then die "account ${AUTH_USER} exists, but not at host ${h}: wrong --host, refusing to drop anything"; fi
  info "== auth store teardown ($([ "$execute" -eq 1 ] && echo EXECUTE || echo 'dry run')) =="
  info "container=$CONTAINER database=$AUTH_DB (exists=$db_exists) account=$AUTH_USER@$h (exists=$acct) ; legacy objects=$legacy_before"
  if [ "$db_exists" = "1" ]; then
    rows_s="$(root_sql -e "SELECT COUNT(*) FROM \`${AUTH_DB}\`.auth_session")"
    rows_t="$(root_sql -e "SELECT COUNT(*) FROM \`${AUTH_DB}\`.auth_throttle")"
    info "would delete: auth_session rows=$rows_s, auth_throttle rows=$rows_t (sessions => every user must log in again)"
  fi
  if [ "$execute" -ne 1 ]; then info "DRY RUN: nothing was changed. Add --execute to drop."; return 0; fi

  root_sql -e "DROP DATABASE IF EXISTS \`${AUTH_DB}\`"
  root_sql -e "DROP USER IF EXISTS '${AUTH_USER}'@'${h}'"
  remove_env_line .env.staging MARIADB_AUTH_PASSWORD
  remove_env_line .env.local DATABASE_URL_AUTH
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
  info "dropped $AUTH_DB and $AUTH_USER@$h; removed the two secret lines from .env.staging/.env.local. Legacy unchanged ($legacy_before)."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
