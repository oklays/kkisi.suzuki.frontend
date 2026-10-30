#!/usr/bin/env bash
# B1 — metadata-only export of the KOSIPA business database for financial parity (kosipa-full-access 12 B1, TASK-102, MIG-103).
# For an AUTHORIZED PRODUCTION OPERATOR. Exports DEFINITIONS ONLY: table DDL, view bodies, procedures/functions, triggers, events,
# indexes and server settings. NO table rows are read or written (mariadb-dump --no-data; information_schema only).
#
#   scripts/kosipa-b1-schema-export.sh --database <db> --defaults-file <option file> --out <dir> [--run]
#
#   --defaults-file  a MySQL option file (mode 600) with [client] user/password/host of a READ-ONLY account. Credentials never go on
#                    the command line and are never printed. Required privileges: SELECT and SHOW VIEW on <db>, TRIGGER (to see trigger
#                    bodies), and SHOW CREATE ROUTINE (MariaDB >= 11.3) or SELECT on mysql.proc (older) for procedure bodies. Scheduled events are
#                    only visible with the EVENT privilege (the script says so when it sees none). Rehearsed: apps/web/tests/kosipa-b1-export-db.test.mjs.
#   default          DRY RUN: prints the exact commands; nothing is executed.
# Scheduled events are listed (digest) from information_schema only: dumping their bodies needs the EVENT privilege, and the legacy
# application uses none (08-background-jobs). An empty EVENT list from an account without that privilege is reported as such.
# Output (<dir>, mode 700): schema.sql (DEFINER and AUTO_INCREMENT counters stripped), objects.tsv, indexes.tsv, server.tsv, SHA256SUMS.
# The script refuses to finish if schema.sql contains any INSERT/REPLACE statement (i.e. data). Hand the folder over as-is; the
# engineering side compares view/procedure bodies with the local copy (which only has stubs) before any parity claim.
# Rehearsal on the FA-01 synthetic container (no host client needed):
#   DUMP="docker exec -i kkisi-kosipa-fa01 mariadb-dump" CLIENT="docker exec -i kkisi-kosipa-fa01 mariadb" \
#     scripts/kosipa-b1-schema-export.sh --database kkisi_kfa_synthetic --defaults-file /tmp/kfa-b1.cnf --out /tmp/kfa-b1 --run
set -euo pipefail
umask 077

DB=""; CNF=""; OUT=""; RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --database) DB="${2:-}"; shift 2 ;;
    --defaults-file) CNF="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --run) RUN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ "$DB" =~ ^[A-Za-z0-9_]{1,64}$ ]] || { echo "--database is required (letters, digits, underscore)" >&2; exit 2; }
[ -n "$CNF" ] || { echo "--defaults-file is required" >&2; exit 2; }
[ -n "$OUT" ] || { echo "--out is required" >&2; exit 2; }
DUMP="${DUMP:-mariadb-dump}"; CLIENT="${CLIENT:-mariadb}"
if [ -z "${DUMP##mariadb-dump}" ] && [ -f "$CNF" ] && [ "$(stat -f '%Lp' "$CNF" 2>/dev/null || stat -c '%a' "$CNF")" != "600" ]; then echo "$CNF must be mode 600" >&2; exit 2; fi

DUMP_ARGS=(--defaults-extra-file="$CNF" --no-data --routines --triggers --skip-events --skip-dump-date --skip-comments --single-transaction --no-tablespaces --skip-add-drop-table "$DB")
q() { $CLIENT --defaults-extra-file="$CNF" -N -B -e "$1"; }
OBJECTS="SELECT 'VIEW', TABLE_NAME, SHA2(VIEW_DEFINITION,256) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$DB'
 UNION ALL SELECT ROUTINE_TYPE, ROUTINE_NAME, SHA2(COALESCE(ROUTINE_DEFINITION,''),256) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='$DB'
 UNION ALL SELECT 'TRIGGER', TRIGGER_NAME, SHA2(ACTION_STATEMENT,256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$DB'
 UNION ALL SELECT 'EVENT', EVENT_NAME, SHA2(EVENT_DEFINITION,256) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='$DB' ORDER BY 1,2"
INDEXES="SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$DB' ORDER BY 1,2,4"
SERVER="SELECT @@version, @@sql_mode, @@character_set_server, @@collation_server, @@tx_isolation, @@innodb_lock_wait_timeout, @@time_zone"

echo "B1 export plan for database '$DB' -> $OUT (definitions only, no rows)"
echo "  1. $DUMP --defaults-extra-file=<file> --no-data --routines --triggers --skip-events ... $DB > schema.sql (DEFINER, AUTO_INCREMENT stripped)"
echo "  2. information_schema object digests > objects.tsv ; 3. indexes > indexes.tsv ; 4. server settings > server.tsv ; 5. SHA256SUMS"
[ "$RUN" = 1 ] || { echo "DRY RUN: nothing executed. Re-run with --run."; exit 0; }

mkdir -p "$OUT"; chmod 700 "$OUT"
trap 'rc=$?; [ $rc -eq 0 ] || { rm -f "$OUT"/schema.sql "$OUT"/objects.tsv "$OUT"/indexes.tsv "$OUT"/server.tsv "$OUT"/SHA256SUMS; echo "FAILED: partial output removed" >&2; }' EXIT
$DUMP "${DUMP_ARGS[@]}" \
  | sed -E -e 's/ AUTO_INCREMENT=[0-9]+//' -e 's#DEFINER=`[^`]*`@`[^`]*`#DEFINER=CURRENT_USER#g' > "$OUT/schema.sql"
if grep -Eiq '^[[:space:]]*(INSERT|REPLACE)[[:space:]]+INTO' "$OUT/schema.sql"; then rm -f "$OUT/schema.sql"; echo "REFUSED: the dump contained data statements; nothing kept" >&2; exit 1; fi
q "$OBJECTS" > "$OUT/objects.tsv"
q "$INDEXES" > "$OUT/indexes.tsv"
q "$SERVER" > "$OUT/server.tsv"
( cd "$OUT" && shasum -a 256 schema.sql objects.tsv indexes.tsv server.tsv 2>/dev/null > SHA256SUMS || sha256sum schema.sql objects.tsv indexes.tsv server.tsv > SHA256SUMS )
grep -q '^EVENT' "$OUT/objects.tsv" || echo "NOTE: no scheduled event is visible. Without the EVENT privilege none would be: confirm with the cPanel owner account (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='$DB') and report the number."
echo "done: $(grep -c 'CREATE TABLE' "$OUT/schema.sql") tables, $(grep -c '^VIEW' "$OUT/objects.tsv" || true) views, $(grep -Ec '^(PROCEDURE|FUNCTION)' "$OUT/objects.tsv" || true) routines, $(grep -c '^TRIGGER' "$OUT/objects.tsv" || true) triggers"
