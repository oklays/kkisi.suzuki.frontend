#!/usr/bin/env bash
# validate-spec-coverage.sh
# Validates that a spec directory under docs/superpowers/specs/<feature-slug> contains all required document files
# and that all REQ-* identifiers are traceable across requirements, design, tasks, and verification.

set -euo pipefail

SPEC_DIR="${1:-}"

if [[ -z "$SPEC_DIR" ]]; then
  echo "Usage: $0 docs/superpowers/specs/<feature-slug>"
  exit 1
fi

if [[ ! -d "$SPEC_DIR" ]]; then
  echo "Error: Directory '$SPEC_DIR' does not exist."
  exit 1
fi

echo "==============================================="
echo " Validating Spec Directory: $SPEC_DIR"
echo "==============================================="

REQUIRED_FILES=(
  "current-state.md"
  "impact-analysis.md"
  "requirements.md"
  "design.md"
  "tasks.md"
  "verification.md"
)

MISSING=0
for file in "${REQUIRED_FILES[@]}"; do
  if [[ -f "$SPEC_DIR/$file" ]]; then
    echo "  [OK] Found $file"
  else
    echo "  [MISSING] $file"
    MISSING=1
  fi
done

if [[ $MISSING -eq 1 ]]; then
  echo "-----------------------------------------------"
  echo " Error: One or more required spec files are missing."
  exit 1
fi

# Check REQ requirement IDs traceability
echo "-----------------------------------------------"
echo " Checking Traceability of REQ identifiers..."

REQ_IDS=$(grep -oE 'REQ-[0-9]+' "$SPEC_DIR/requirements.md" | sort -u || true)

if [[ -z "$REQ_IDS" ]]; then
  echo "  [WARNING] No REQ-* identifiers found in requirements.md"
else
  UNCOVERED=0
  for req in $REQ_IDS; do
    in_design=$(grep -c "$req" "$SPEC_DIR/design.md" || true)
    in_tasks=$(grep -c "$req" "$SPEC_DIR/tasks.md" || true)
    in_verify=$(grep -c "$req" "$SPEC_DIR/verification.md" || true)

    if [[ $in_tasks -eq 0 || $in_verify -eq 0 ]]; then
      echo "  [UNCOVERED] $req is missing from tasks.md or verification.md"
      UNCOVERED=1
    else
      echo "  [COVERED] $req -> design:$in_design, tasks:$in_tasks, verify:$in_verify"
    fi
  done

  if [[ $UNCOVERED -eq 1 ]]; then
    echo "-----------------------------------------------"
    echo " Error: Some requirements lack full traceability."
    exit 1
  fi
fi

echo "==============================================="
echo " Specification Validation Passed Successfully!"
echo "==============================================="
exit 0
