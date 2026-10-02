#!/usr/bin/env bash
# READ-ONLY verification of the auth store. Only SELECT statements are ever sent (grants are inspected through
# information_schema; forbidden actions are NOT attempted with write statements). Prints PASS/FAIL lines only.
# Run from apps/web/.   Usage: scripts/verify-auth-store.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

app_path_checks() {
  EXPECT_HOST="$AUTH_HOST" node --env-file=.env.local --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const expect = process.env.EXPECT_HOST;
let failed = 0;
const ok = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) failed++; };
const denied = (e) => /1142|denied/i.test(String(e && e.message));
const auth = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_AUTH });
const read = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
try {
  const who = await auth.$queryRaw`SELECT USER() AS u, CURRENT_USER() AS m`;
  ok("auth connection: server sees the detected host and matches the host-restricted account (not %)",
     String(who[0].u) === "kkisi_auth@" + expect && String(who[0].m) === "kkisi_auth@" + expect);
  ok("auth account can read its own tables", (await auth.$queryRaw`SELECT COUNT(*) AS n FROM kkisi_auth_staging.auth_session`).length === 1);
  let d1 = false; try { await auth.$queryRaw`SELECT 1 FROM kkisi_staging.db_users LIMIT 1`; } catch (e) { d1 = denied(e); }
  ok("auth account is refused SELECT on the legacy schema", d1);
  let d2 = false; try { await read.$queryRaw`SELECT 1 FROM kkisi_auth_staging.auth_session LIMIT 1`; } catch (e) { d2 = denied(e); }
  ok("kkisi_read is refused SELECT on the auth schema", d2);
  ok("kkisi_read still reads the legacy schema", (await read.$queryRaw`SELECT COUNT(*) AS n FROM kkisi_staging.db_roles`).length === 1);
} catch (e) { console.log("FAIL app-path checks aborted: " + String(e && e.message).split("\n")[0].slice(0, 120)); failed++; }
finally { await auth.$disconnect(); await read.$disconnect(); }
process.exit(failed ? 1 : 0);
' 2>&1 | grep -v "ExperimentalWarning\|trace-warnings"
}

EXPECTED_CHECKS=15   # number of SELECTs in db/auth/003_verify.sql.tpl; fewer rows means the query itself failed

main() {
  local failed=0 line legacy_now sql_out n=0
  load_root_env
  assert_local_container
  assert_app_path_is_loopback
  resolve_auth_host
  info "== verify auth store: $AUTH_DB, account $AUTH_USER@$AUTH_HOST =="
  sql_out="$(render_template db/auth/003_verify.sql.tpl | root_sql)" || die "verification query failed to run (nothing was verified)"
  while IFS=$'\t' read -r line; do
    [ -n "$line" ] || continue
    n=$((n + 1))
    case "$line" in
      *$'\t'1) info "PASS ${line%$'\t'*}" ;;
      *)       info "FAIL ${line%$'\t'*}"; failed=1 ;;
    esac
  done <<< "$sql_out"
  [ "$n" -eq "$EXPECTED_CHECKS" ] || { info "FAIL expected $EXPECTED_CHECKS checks, got $n"; failed=1; }
  legacy_now="$(legacy_object_count)"
  if [ -n "${LEGACY_OBJECTS_BEFORE:-}" ]; then
    if [ "$legacy_now" = "$LEGACY_OBJECTS_BEFORE" ]; then info "PASS legacy object count unchanged ($legacy_now)"; else info "FAIL legacy object count changed ($LEGACY_OBJECTS_BEFORE -> $legacy_now)"; failed=1; fi
  else
    info "INFO legacy object count = $legacy_now (compare with the value printed before provisioning)"
  fi
  app_path_checks || failed=1
  [ "$failed" -eq 0 ] && info "ALL CHECKS PASSED" || { info "VERIFICATION FAILED"; exit 1; }
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
