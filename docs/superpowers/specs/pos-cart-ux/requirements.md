# POS cart UX requirements

- REQ-001: WHEN a product is successfully added/scanned, THE SYSTEM SHALL show it
  first and aggregate by the existing product-ID identity. Rejected adds do not
  reorder; manual edits/buttons/removals retain remaining display order.
- REQ-002: WHEN lookups finish out of order, THE SYSTEM SHALL retain accepted
  action order and all valid increments, reject obsolete cart generations, and
  preserve newer search text. Restoration preserves the display sequence.
- REQ-003: WHEN a cashier edits quantity, THE SYSTEM SHALL permit a local empty
  draft and commit only on Enter/blur through shared quantity validation.
  Invalid commits restore the current valid value with a concise message;
  buttons remain usable and invalid input never deletes an item.
- REQ-004: WHEN a scan arrives during editing, THE SYSTEM SHALL preserve current
  canonical state and handle Enter-terminated scanner bursts without committing
  a barcode as a quantity. Controls remain compact, labeled, centered, responsive
  and locked during uncertain checkout.
- REQ-005: THE SYSTEM SHALL pass lint, typecheck, unit/regression tests, production
  build and browser scenarios, integrate master → master-dev and deploy using
  verified infrastructure with a retained rollback image and safe smoke checks.

BR-001: Existing product-ID aggregation, stock validation, discounted integer-sen
totals, server checkout ID sorting, payment retry locks and RBAC remain intact.
VAL-001: Whole safe integers 1–9999 and no greater than available stock. Reject
empty, negative, zero, exponent, fractional, alphabetic and unsafe input on commit.
SEC-001: Preserve user/company/register storage scope and all server permissions.
NFR-001: No per-keystroke requests, dependency additions, unstable keys or CSS reversal.
OBS-001: Accessible localized validation and explicit local/live evidence boundaries.
MIG-001: No schema/data migration, real test sale, DB/service restart or unrelated edits.
