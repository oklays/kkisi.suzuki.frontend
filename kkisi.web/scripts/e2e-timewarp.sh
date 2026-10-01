#!/usr/bin/env bash
# Gate A helper: move the deadlines of SYNTHETIC sessions (user_id 900001-900007) into the past, so idle / absolute expiry can be
# tested without waiting 2 / 12 hours. Root inside the local staging container; refuses anything but the pinned container.
#   scripts/e2e-timewarp.sh idle|absolute [user_id]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
kind="${1:-}"; uid="${2:-}"
[ "$kind" = "idle" ] || [ "$kind" = "absolute" ] || die "usage: scripts/e2e-timewarp.sh idle|absolute [user_id]"
where="user_id BETWEEN 900001 AND 900007 AND revoked_at IS NULL"
if [ -n "$uid" ]; then [[ "$uid" =~ ^90000[1-7]$ ]] || die "user_id must be 900001-900007"; where="user_id = $uid AND revoked_at IS NULL"; fi
load_root_env; assert_local_container
if [ "$kind" = "idle" ]; then   # everything 3 h into the past: idle (2 h) is over, the absolute 12 h deadline is not
  sql="UPDATE ${AUTH_DB}.auth_session SET created_at = created_at - INTERVAL 3 HOUR, last_seen_at = last_seen_at - INTERVAL 3 HOUR, idle_expires_at = idle_expires_at - INTERVAL 3 HOUR, abs_expires_at = abs_expires_at - INTERVAL 3 HOUR WHERE $where"
else                             # created 13 h ago: the 12 h absolute deadline is over while idle is still in the future
  sql="UPDATE ${AUTH_DB}.auth_session SET created_at = created_at - INTERVAL 13 HOUR, abs_expires_at = abs_expires_at - INTERVAL 13 HOUR WHERE $where"
fi
root_sql -e "$sql; SELECT ROW_COUNT()"
