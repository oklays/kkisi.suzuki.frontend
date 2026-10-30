# FA-03A — Document numbering (TASK-109; REQ-107, BR-116, R-02)

Date: 30 October 2026. Status: **implemented and tested as a reusable service. No document command uses it yet.** It is first used by membership (REG, see [NEXT_IMPLEMENTATION_PLAN](NEXT_IMPLEMENTATION_PLAN.md)) and by the savings and loan commands later. Nothing is enabled in any deployment.

## 1. Verified legacy conventions (no rule invented)

Each generator was re-read in the local KOSIPA source in FA-03A.

| Prefix | Document | Legacy generator | Legacy `n` | Period |
|---|---|---|---|---|
| `REG` | member registration (`m_anggota.doc_no`) | `master/models/anggota_m.php:160-185` | count of members created this month + 1, 4-digit pattern `000n`/`00n`/`0n` | server month |
| `DBT` | savings withdrawal (`trans_simpanan.doc_no`, DEBIT) | `simpanan/models/simpanan_m.php:290-312` | count of DEBIT documents this month + 1, same 4-digit pattern | server month |
| `PIN` | loan (`trans_pinjaman.doc_no`) | `pinjaman/models/pinjaman_m.php:551-573` | last id among this month's loans + 1, or 1 when there are none; `str_pad(…, 5)` | server month |
| `KAS` | savings deposit (`trans_simpanan.doc_no`) | `simpanan/models/simpanan_m.php:194-212` | last id of the table + 1 (no month filter); 5 digits | server month |
| `POT` | payroll batch (`trans_potongan_bulanan.doc_no`) | `payroll/controllers/matrix_c.php:443-458` | last id of the table + 1 (no month filter); 5 digits | **payroll period** of the batch |

The common shape is `PREFIX + YYYY + MM + n`. The native formatter left-pads to a minimum width and never truncates. Legacy PIN/KAS/POT use `str_pad`; legacy REG/DBT use hand-written branches that emit an extra leading zero for `n >= 1000` (`REG20261101000` versus native `REG2026111000`). PIN also resets its basis to 1 when a month has no loans, whereas native uses the new row id. These recovered implementation deviations require FD-23 approval and consumer characterization; exact identifier equivalence is not claimed. The month is Asia/Jakarta.

## 2. Policy (derived from the specs)

| Topic | Rule | Source |
|---|---|---|
| Uniqueness | Unique per document type, in the legacy format | BR-116, REQ-107 |
| Allocation | Inside the creating transaction, verified unique before commit | REQ-107, R-02 |
| Committed numbers | Never issued again: documents are cancelled, voided or reversed, never deleted | REQ-123, FD-14 |
| Gaps | Allowed. Legacy has them (global AUTO_INCREMENT basis, hard deletes); no rule asks for gap-free numbering | R-02 (legacy evidence) |
| Rolled-back transaction | Its number was never committed and may be issued again | consequence of "allocated inside the transaction" |
| Cancelled document | Keeps its number (status change, no delete); numbering continues above it | REQ-123 |
| Existing duplicates | 7 legacy duplicate loan `doc_no` groups stay as they are (no historical correction); the allocator never issues a number that exists in the table | VF-05; FA-03A rule "no historical financial data correction" |

## 3. Design

### Strategies

| Strategy | Families | Native `n` | Why |
|---|---|---|---|
| `period-sequence` | REG, DBT | 1 + the maximum of every number of that scheme and period found in the legacy table **and** in the native registry | Legacy counts the month's rows. Native takes the maximum, which equals count + 1 when there are no gaps and never collides when there are gaps |
| `row-id` | PIN, KAS, POT | the id of the business row the same transaction just inserted | Legacy's basis is the table's id. If native used a per-period counter, legacy would issue the same numbers after a rollback to legacy (MAX(id) + 1 vs counter) |

### Code

| Layer | File | Content |
|---|---|---|
| Domain (pure) | `packages/domain/src/kosipa/document-number.ts` | `DOCUMENT_NUMBER_SCHEMES` (5 schemes, each with legacy source line), Jakarta `numberingPeriod`, `formatDocumentNumber` (pad, never truncate, max 30 characters), `parseDocumentSequence` (`PINREG…` never parses as `PIN…`), `nextPeriodSequence`, `resolveNumberingPeriod` (clock vs document period) |
| Application | `packages/application/src/kosipa/document-numbering.ts` | `DocumentNumberRepository<Tx>` port and `DocumentNumberingService<Tx>`. Before any I/O the service checks the scheme, the **explicit scope** (the business table must be the scheme's table), the period and the row id. Export `@koperasi/application/kosipa/document-numbering` |
| Infrastructure | `apps/web/src/infrastructure/repositories/kosipa-document-number.ts` | `PrismaDocumentNumberRepository`, running inside the caller's InnoDB transaction (from `runCommandTransaction`) |
| Registry DDL | `apps/web/db/kosipa/005_document_number_registry.sql.tpl` and `.rollback.sql.tpl` | `<ledger db>.kosipa_document_number`: `UNIQUE (scheme, period, seq)`, `UNIQUE (doc_no)`, CHECKs on period and shape; append-only by privilege (`SELECT, INSERT`) |
| HTTP | `kosipa-command-http.ts` | `DOCUMENT_NUMBER_CONFLICT` → 409 |

### Concurrency protection

R-02 proposed "a named lock". The implementation uses the registry's **unique key as the lock** instead.

1. Two transactions that compute the same `n` both INSERT the same `(scheme, period, seq)`.
2. InnoDB makes the second INSERT wait for the first transaction's record lock.
3. When the first transaction **commits**, the second INSERT gets 1062 and the allocator tries `n + 1`. The probe loop is bounded at 50; past that it returns `BUSY_RETRY`.
4. When the first transaction **rolls back**, the second INSERT succeeds with `n`.
5. A deadlock among three or more waiters (1213) is retried by the unit of work.

`GET_LOCK` was rejected: it is held by the connection, not the transaction, so with pooled connections it can outlive a rollback or be released before commit. A 1062 does not abort the InnoDB transaction (statement-level rollback).

### Compatibility with existing identifiers

- Every candidate is checked against the legacy table's numbered column (`SELECT doc_no … WHERE doc_no = ?`) as well as the registry.
- A row-id number that already exists is **refused** (`DOCUMENT_NUMBER_CONFLICT`), never silently renumbered.
- The numbering writer needs only `SELECT(doc_no)` on the numbered tables and `SELECT, INSERT` on the ledger database. The test account `kfa_numbering_w` proves this is enough, and that it can read no other column.

## 4. Tests (executed)

| Suite | Command | Result |
|---|---|---|
| Domain | `cd packages/domain && node --experimental-strip-types --test tests/kosipa-document-number.test.mjs` | **7/7** (continuation rerun): schemes match legacy; Jakarta month boundary (`2026-10-31T17:00Z` → 202611); POT uses the payroll period; padding without truncation (`PIN2026111234567`); 30-character limit; parse isolation; legacy floor including 13–16 digit safe integers; impossible months and invalid clock dates rejected |
| Application | `cd packages/application && node --experimental-strip-types --test tests/kosipa-document-numbering.test.mjs` | **2/2**: transaction, scheme and period passed through; 8 refusals (unknown scheme, foreign table, row id missing, zero, fractional or forbidden, forbidden or invalid period) with the repository never called |
| DB (synthetic stack) | `cd apps/web && KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-document-number-db.test.mjs` | **7/7**, freshly rerun in the complete final 40-test sequence and the 22-test foundation/numbering sequence. See the list below |
| Migration | `… tests/kosipa-migrations-rollback-db.test.mjs` | **2/2**: registry forward (idempotent), duplicate seq / duplicate doc_no / lower-case / month 13 refused by the database, rollback **retires** the registry (rows kept), forward again |

The DB suite proves:

- **Append-only:** the writer cannot UPDATE or DELETE the registry (1142).
- **Least privilege:** the writer cannot read other columns or update `m_anggota`.
- **Legacy floor:** seeded legacy `REG2026100007` / `REG2026100003` → native `REG2026100008`.
- **Concurrency:** **20 simultaneous allocations** through `runCommandTransaction` → numbers 1…20, distinct and consecutive, all in the registry.
- **Rollback:** an allocation in a rolled-back transaction leaves nothing, and the same number is then issued. Committed numbers continue 2, 3. A direct INSERT of a committed number is refused (1062), also under another scheme (`doc_no` unique).
- **Idempotent retry:** a replay with the same key returns the stored number and allocates nothing; the next command gets n + 1.
- **Row-id:** `PIN<period><id>`. The same id again is refused, and so is legacy `PIN20261000777` (seed). POT takes the document period.
- **Explicit scope:** refusals happen before any database access.

## 5. Known limits and risks

1. **Rollback to legacy for REG/DBT.** Legacy uses count + 1. If the month has gaps (legacy hard-deleted a member, or numbers were skipped), legacy can issue a number that already exists, native or legacy. This is a **pre-existing legacy defect** (it happens without native writes too). Native never issues an existing number. Mitigation: a unique index on `m_anggota.doc_no` (FD-02 scope) or rollback only at a month boundary.
2. **Registry re-forward.** After rollback (retire) and a new forward, the new registry starts empty. Numbers committed earlier still exist in the business tables, which the allocator checks, so they are not reissued. The operator should rename the retired table back instead of re-creating it (preserves the evidence in one place).
3. **Legacy writing concurrently with native in the same family.** Legacy does not use the registry, so a legacy and a native allocation racing in the same family and period could collide. This is excluded by ownership: the legacy controller of that document family is fenced (and FD-22-guarded) before native numbering starts.
4. **`doc_no` consumers (G-10, A-05).** These are still to be confirmed by characterization. The prefix/period shape is retained; padding and PIN basis deviations above mean consumer compatibility cannot be assumed.
5. **Decision FD-23 (new, below).** The owner or finance should confirm the per-family strategy before the first document command goes live.

## 6. Decision needed: FD-23

| Option | Description |
|---|---|
| (a) **legacy basis** (implemented) | REG/DBT period-sequence, PIN/KAS/POT row-id |
| (b) R-02 as written | Per-period counter for every family. Collides with legacy after a rollback |

**Recommendation:** (a). It blocks the first document command.

## 7. Continuation review (30 October 2026)

The existing registry, repository, application port and unit of work were retained. Two domain defects were reproduced with failing tests and repaired: the parser's 12-digit limit ignored valid formatter output when computing the legacy floor; and direct formatting accepted month 00/13 while invalid clock dates reached persistence. Parsing now accepts positive safe integers, matching formatting, and periods fail before I/O.

Fresh continuation verification: `node --experimental-strip-types --test packages/domain/tests/kosipa-document-number.test.mjs packages/application/tests/kosipa-document-numbering.test.mjs` — **9 passed, 0 failed, 0 skipped**. The coordinating continuation run also reran the DB and migration tests in section 4; complete commands and evidence are in [CHECKPOINT_REPORT](CHECKPOINT_REPORT.md).

Integration contracts remain mandatory: call allocation inside `steps.run` after the unit of work's replay check; insert the business document and its registry claim in that same transaction; retain claims when cancelling a committed document; and fence every competing writer before activating a family. Calling the service twice directly is two allocations, not an idempotent command replay. The existing cancellation test demonstrates retention by allocating the next claim; there is no document cancellation command yet. Deadlocks/lock waits retry the complete transaction, while the 50-probe bound returns `BUSY_RETRY` for caller resubmission.
