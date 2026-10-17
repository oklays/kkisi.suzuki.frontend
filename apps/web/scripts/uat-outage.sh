#!/usr/bin/env bash
# UAT helper: simulates a KOSIPA reader outage on the SYNTHETIC schema kkisi_e2e_legacy by RENAMING three synthetic tables (and back).
# It acts only on the local staging container, refuses unless the synthetic marker exists, never touches kkisi_staging, and `restore` is idempotent.
# Usage: scripts/uat-outage.sh break | restore | status
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
load_root_env; assert_local_container
marker="$(root_sql -e "SELECT COUNT(*) FROM kkisi_e2e_legacy._e2e_marker WHERE purpose='synthetic-only'" 2>/dev/null || echo 0)"
[ "$marker" = "1" ] || die "synthetic marker missing: refusing"
TABLES="trans_pinjaman_dtl trans_potongan_matrix trans_simpanan_dtl"
exists() { [ "$(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='kkisi_e2e_legacy' AND table_name='$1'")" = "1" ]; }
case "${1:-status}" in
  break)   for t in $TABLES; do exists "$t" && root_sql -e "RENAME TABLE kkisi_e2e_legacy.\`$t\` TO kkisi_e2e_legacy.\`_outage_$t\`"; done; info "outage simulated (synthetic tables renamed)";;
  restore) for t in $TABLES; do exists "_outage_$t" && root_sql -e "RENAME TABLE kkisi_e2e_legacy.\`_outage_$t\` TO kkisi_e2e_legacy.\`$t\`"; done; info "restored";;
  status)  for t in $TABLES; do printf '%s: %s\n' "$t" "$(exists "$t" && echo present || echo MISSING)"; done;;
  *) die "usage: $0 break|restore|status";;
esac
exit 0
