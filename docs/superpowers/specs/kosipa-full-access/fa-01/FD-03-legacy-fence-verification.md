# FD-03 — Does `ref_menu.status = 0` fence a legacy KOSIPA write path?

Date: 30 October 2026 (FA-01). Scope: the proposed legacy switch of [12 FD-03](../12_DECISION_REGISTER.md), checked for the first feature that could move (Master Lokasi, `master/lokasi_c` → `m_lokasi`). Evidence: the local copy of the legacy source (`kosipa/`), read-only aggregate queries on the 30 Sep staging copy, and a rehearsal on the isolated FA-01 synthetic stack. Nothing was changed in legacy code or in any non-synthetic database.

**Verdict.** For a controller that calls the gate, `ref_menu.status = 0` blocks every one of its methods for every user, existing sessions included, from the next request. It is a sound fence **per controller**, under three conditions:

1. The feature's table has no other writer.
2. Every `ref_menu` row matching the URL is switched.
3. Nobody re-enables the row through the legacy menu administration.

For `m_lokasi`, all three can be met. Each later feature needs the same check, because conditions 1 and 3 differ per feature.

## Findings

Legend for the **Result** column:

- **Protected:** the fence blocks this route.
- **Not applicable:** this route does not exist for `m_lokasi`.
- **Gap:** this route can undo or bypass the fence.
- **Unknown:** no evidence is available.

| Question (FA-01 prompt) | Evidence | Result |
|---|---|---|
| Direct controller access | Every gated controller runs `user_m::cekstatushakakses($this->module . get_class($this), id_user)` in its constructor before any method (`lokasi_c.php:27`, `models/user_m.php:379-390`). A failure triggers `redirect('error/adm_error_c')`, and CI 2.1.4 `redirect()` ends with `exit` (`system/helpers/url_helper.php:545`). | **Protected** |
| Alternative routes | HMVC routes `/master/lokasi_c/<method>` to the same class, so any URL form reaches the same constructor. The 02A scan finds no other controller that writes `m_lokasi` and no `modules::run` call into `lokasi_m`. The model alone has no route. | **Protected** |
| AJAX endpoints | `ajax_add`, `ajax_update` and `ajax_delete` are methods of the same class, so the same constructor gate applies. | **Protected** |
| Background jobs | The legacy application has no cron jobs or queues ([08-background-jobs](../../../../legacy-reference/08-background-jobs.md)). The staging copy has 0 scheduled events, but a dump may omit events, so production events are listed by the B1 export (`objects.tsv`). | **Not applicable** for the application; production events are unconfirmed until B1. |
| Existing sessions | The gate reads `ref_menu` with SQL on every request and keeps no session cache. The rehearsal confirms that a logged-in user is refused on the next request. | **Protected** |
| Batch operations | There are no imports or bulk endpoints for `m_lokasi`. | **Not applicable** |
| Administrative write paths | `admin/adm_menu_c` (with `adm_menu_m` and `adm_group_m`) **can edit `ref_menu`**, so a legacy administrator can set the status back to 1. | **Gap:** the fence runbook re-runs its VERIFY block after any legacy admin session, until `adm_menu_c` itself is fenced or retired. |
| Other applications | The TOKO CI3 source and the Next.js code do not reference `m_lokasi`. smartkkisi reads `users.lokasi` but its writes to `m_lokasi` are unknown (no source, G-02). | **Unknown** for smartkkisi; the operator should confirm when `m_lokasi` was last written (UCKW B4). |
| Duplicate menu rows | The gate compares `upper(a.url) = upper('<module>/<Class>')` and accepts any matching row with `status = 1`. On staging, exactly one row matches `master/lokasi_c` (status 1), and no URL has surrounding spaces. | The fence SQL switches **every** case-insensitive match and asserts none is left open. |
| "Public" user id | The gate also accepts the configured public user id (private `ANO-K49`), but `a.status = 1` applies to every row the gate counts. | Not a bypass of the fence. |

The legacy gate authorises per controller, not per method (`ANO-K02`). That is exactly why the fence is per controller: it cannot leave the delete path of `lokasi_c` open while closing edit.

## Rehearsal (executed)

`apps/web/tests/kosipa-legacy-fence-db.test.mjs` runs on the FA-01 synthetic stack with `KOSIPA_FA01=1`. It uses the **exact** gate SQL, with values bound, and runs the generator's fence statements as written:

| Step | Result |
|---|---|
| Before the fence | All four synthetic KOSIPA users are allowed. |
| After the fence | All four are refused, including one already logged in. |
| VERIFY block | Reports 0 open rows. |
| Rollback (restores the recorded ids) | All four are allowed again. |
| Other controllers | `master/anggota_c` is untouched. |

The test passed on 30 Oct 2026.

## Native side (separate from the fence)

Next.js accepts a command only when two things hold: the feature flag is exactly `true` (`KOSIPA_MASTER_WRITES_ENABLED`), and the feature is listed in `KOSIPA_WRITE_OWNERSHIP` (`apps/web/src/infrastructure/console/kosipa-ownership.ts`). Otherwise it returns 503 `WRITE_DISABLED` before any authorization, parsing or database access. This is tested in `kosipa-master-http.test.mjs`.

The fence and the native ownership are separate operator steps. Order at cutover: fence → verify → native ownership on. For rollback: native ownership off → restore the fence. No production fence or ownership change was made in FA-01.

Fence SQL generator (prints SQL only): `node --experimental-strip-types apps/web/scripts/kosipa-legacy-fence.mjs master.lokasi --database <db>`.

## FA-01.5 — Closing the `adm_menu_c` gap: native writes fail closed

### How the legacy admin can reopen a fence

Evidence: `kosipa/application/modules/admin/models/adm_menu_m.php`. The controller is gated (`adm_menu_c.php:16`), but every value comes from `$_GET` and is concatenated into SQL. A legacy administrator can make a fenced controller pass the gate again in three ways:

1. `updateRecords` sets `status = 1` on the row, by id.
2. `insertRecords` adds a **new** row with the same URL and `status = 1`.
3. `updateRecords` **renames** another row's `url` to the fenced controller.

Changing legacy code is out of scope, so the defence sits on the native side. It does not trust the fence; it checks the fence inside every command.

### The mechanism

`apps/web/src/infrastructure/db/kosipa-unit-of-work.ts`, step 2:

- **What is checked.** Inside every native command transaction, every `ref_menu` row is read where `UPPER(url)` matches the feature's legacy controller. This is the same expression the legacy gate uses.
- **How it is locked.** The read is `LOCK IN SHARE MODE` and covers every matching row, whatever its status.
- **Fail closed.** If any matching row has `status = 1`, the command stops with **503 `LEGACY_ACTIVE`**. Nothing is written, and the refusal is audited (`kosipa.command.failed`).
- **Race protection.**
  - A re-enabling UPDATE of a locked row waits until the native transaction ends.
  - Under REPEATABLE READ, the unindexed scan's next-key locks also hold back an INSERT of a duplicate row.
  - So a legacy re-enable can never land in the middle of a native command.
  - Once it has committed, the next native command refuses.
- **What users see.** The page reads the same state: a reopened legacy menu turns the master page read-only, with an explanation.
- **Result.** Mutual exclusion: at any instant either legacy (fence open) or native (fence closed, ownership on) can write a master, never both.

### Rehearsal (isolated synthetic stack; `KOSIPA_FA01=1`, all passing on 30 Oct 2026)

| Test | Proves |
|---|---|
| `kosipa-foundation-db` "re-enabling the legacy controller in any way adm_menu_c can…" | Each of the three paths (status by id, duplicate URL row with different case, renamed row) gives `LEGACY_ACTIVE`. A whitespace-padded URL, which the legacy gate also ignores, does not block. Re-fencing resumes native writes |
| `kosipa-foundation-db` "a legacy re-enable racing a native command waits for it" | The admin UPDATE stays blocked about 1.5 s until the native command commits; the next native command is refused |
| `kosipa-masters-db` "every FA-02 master answers LEGACY_ACTIVE while its own legacy controller is enabled" | Per-feature scope: reopening `rekening_bank_c` blocks only Rekening Bank |
| `kosipa-master-browser` E7 | In the console, a reopened `bagian_c` makes the Bagian page read-only |
| `kosipa-legacy-fence-db` | The generator's fence SQL closes and reopens the legacy gate exactly |

### Other write paths, per master

| Path | Finding |
|---|---|
| Direct routes, alternative routes, AJAX | Protected by the constructor gate (above). Each master has exactly one legacy writer controller. 02A rows 23–25 (`bagian_c`), 41–43 (`jenis_dokumen_c`), 62–64 (`lokasi_c`), 71–73 (`periode_angsuran_c`) and 74–76 (`rekening_bank_c`) are the **only** 15 rows of the whole index that write these five tables. No other KOSIPA controller, model or `modules::run` writes them |
| Background operations | None in the application; scheduled events are confirmed by B1 |
| Other applications | See [SHARED_WRITER_OWNERSHIP](../fa-01.5/SHARED_WRITER_OWNERSHIP.md). No writer was found outside KOSIPA's own master controllers. smartkkisi's full source is unavailable, so its web admin panel stays an open item for the operator |

**Residual risk:** a legacy request that passed the gate *before* the native side took ownership, and is still running, finishes on legacy. The cutover runbook therefore drains before switching ownership (11 §3, gate 6).
