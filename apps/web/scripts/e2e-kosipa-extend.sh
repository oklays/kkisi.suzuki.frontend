#!/usr/bin/env bash
# Adds the KOSIPA-shaped STRUCTURE-ONLY tables (db/e2e/003_e2e_kosipa_structure.sql) to an EXISTING synthetic schema
# kkisi_e2e_legacy on the local staging container. Refuses unless the synthetic marker exists. Never touches kkisi_staging.
# DEFAULT IS A DRY RUN.   Usage: scripts/e2e-kosipa-extend.sh [--apply]
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
mode="dry-run"; [ "${1:-}" = "--apply" ] && mode="apply"
load_root_env; assert_local_container
marker="$(root_sql -e "SELECT COUNT(*) FROM kkisi_e2e_legacy._e2e_marker WHERE purpose='synthetic-only'" 2>/dev/null || echo 0)"
[ "$marker" = "1" ] || die "synthetic marker missing: kkisi_e2e_legacy is not the synthetic e2e schema (run scripts/e2e-setup.sh first)"
legacy_before="$(legacy_object_count)"
info "target: kkisi_e2e_legacy (synthetic). Adds 14 structure-only tables if missing. Mode: $mode"
[ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed."; exit 0; }
root_sql < db/e2e/003_e2e_kosipa_structure.sql
[ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP and investigate"
info "done: $(root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='kkisi_e2e_legacy'") tables in kkisi_e2e_legacy; kkisi_staging unchanged ($legacy_before objects)."
