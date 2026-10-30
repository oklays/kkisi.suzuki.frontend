# POS cart UX impact

Frontend: shared quantity validation, local draft, recent-add display metadata and
monotonic action IDs. Metadata survives localStorage without changing checkout
payloads. Existing saved carts without metadata retain their sequence.

Domain: introduce validated absolute quantity updates and make +/- use the same
validation. Preserve minus-at-one removal and existing projection replacement.

Backend/database/auth/workers: no changes. Current adapters remain authoritative;
synthetic fixtures exercise UI and HTTP contracts without pretending to be live DB
acceptance. No mock-to-live adapter transition is assumed.

Concurrency risks: late barcode results, draft overwriting scan increments, blur
before button click, and obsolete scans after clear/checkout. Verify each directly.
Keyboard scanners are keyboard events: a fast Enter-terminated burst longer than
four characters cannot be a valid POS quantity (maximum 9999) and can be routed to
barcode lookup. Short codes cannot be reliably distinguished from manually typed
quantities; the explicit barcode field supports every existing identifier.

Deployment: recheck actual branch, clean server tree, readiness, disk space,
image rollback, unchanged environment hash and unrelated containers before release.
Initial SSH attempt timed out while public HTTPS health returned 200; retry before
declaring deployment blocked. Do not weaken host-key checking.
