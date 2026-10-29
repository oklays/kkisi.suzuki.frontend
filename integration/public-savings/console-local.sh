#!/usr/bin/env bash
# LOCAL ONLY. Serves the KOSIPA console with public savings management enabled:
#   console login, console store and KOSIPA reads  -> DEV LOCAL profile (127.0.0.1:3307, kkisi-staging container)
#   public savings data                            -> LOCAL_SYNTHETIC staging (127.0.0.1:3318, pnpm pss:setup)
# Requires a prior `pnpm build`. Never point DEVLOCAL_ENV at a non-local profile: the DEV LOCAL preflight refuses it.
#
#   integration/public-savings/console-local.sh            start on http://127.0.0.1:3204
#   PSS_CONSOLE_PORT=3205 integration/public-savings/console-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
PORT="${PSS_CONSOLE_PORT:-3204}"
DEVLOCAL_DIR="${DEVLOCAL_DIR:-$MAIN/apps/web}"
LOCAL="$ROOT/.local/public-savings"
POLICY="$LOCAL/operator-policy.json"
die() { echo "console-local: $*" >&2; exit 1; }

[ -f "$DEVLOCAL_DIR/.env.dev-local" ] || die "no DEV LOCAL profile in $DEVLOCAL_DIR (run apps/web/scripts/dev-local.sh reset in the main checkout)"
docker inspect -f '{{.State.Running}}' kkisi-staging 2>/dev/null | grep -q true || die "kkisi-staging is not running: docker start kkisi-staging"
[ -f "$LOCAL/config.json" ] || die "no public savings staging: pnpm pss:setup"
[ -d "$ROOT/apps/web/.next" ] || die "no build: pnpm build"
[ -z "$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)" ] || die "port $PORT is in use"
(cd "$DEVLOCAL_DIR" && node scripts/lib/dev-local-preflight.mjs >/dev/null) || die "DEV LOCAL preflight refused the profile"
(cd "$ROOT" && node integration/public-savings/staging.mjs status >/dev/null) || die "public savings staging sentinel check failed"

# Synthetic mapping for the DEV LOCAL personas only:
#   role 2 (synth_koperasi, KOSIPA-linked)   -> STAFF_OPERATOR on company 9001, which holds the synthetic members
#   role 4 (synth_kasir2, read-only link)    -> STAFF_VIEWER on company 9002, which has no members (branch scoping check)
if [ ! -f "$POLICY" ]; then
  umask 077
  cat > "$POLICY" <<'JSON'
{"branchesByCompanyId":{"9001":"SYNTHETIC BRANCH","9002":"SYNTH BRANCH 2"},"rolesByRoleId":{"2":["STAFF_OPERATOR"],"4":["STAFF_VIEWER"]},"capabilitiesByAction":{"VIEW_SUBMISSIONS":["kosipa.savings.view"],"ISSUE_LINK":["kosipa.savings.view"],"REVOKE_LINK":["kosipa.savings.view"]}}
JSON
fi
chmod 600 "$POLICY"

set -a; . "$DEVLOCAL_DIR/.env.dev-local"; set +a
export APP_ORIGIN="http://127.0.0.1:$PORT" PSS_LOCAL_STAGING=1 PSS_OPERATOR_AUTH=CONSOLE PSS_OPERATOR_POLICY_FILE="$POLICY" PSS_LOCAL_DIRECTORY="$LOCAL"
cd "$ROOT/apps/web"
echo "console-local: http://127.0.0.1:$PORT/console/kosipa/simpanan-sukarela (sign in as synth_koperasi)"
exec pnpm exec next start -H 127.0.0.1 -p "$PORT"
