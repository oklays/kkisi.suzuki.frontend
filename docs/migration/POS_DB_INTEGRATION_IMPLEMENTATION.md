# POS database integration implementation

This implements the existing [POS_DB_INTEGRATION_PLAN.md](POS_DB_INTEGRATION_PLAN.md), phases 1, 2B, 2C, 3, 4, 5 and 6, on local staging. It is not a new PRD. The user approved the plan's remaining permissions on 2026-10-02, then confirmed the legacy POS closing rules and 80 mm receipts. The current local activation below supersedes the earlier disabled-configuration and unapproved-proposal snapshots. Remote deployment still requires the missing target/topology facts, not another repetition of the same approval.

## Current local operation — 2026-10-02

The existing local `kkisi-staging` container remains bound to `127.0.0.1:3307`, database `kkisi_staging`. Checkout and native register opening/closing are enabled in the private `apps/web/.env.local`. The Next.js development server runs at `http://127.0.0.1:3000/pos`.

From the repository root:

```sh
pnpm dev
```

Log in with the existing local test cashier. If there is no current session, choose an available cashier register, enter an integer opening balance and click **Buka kasir**. Add goods by name or barcode; **Scan** and scanner Enter both add the matching product. Select Cash and sufficient **Uang bayar**, or select an eligible member and Kredit. Successful checkout provides **Lihat / Cetak struk**. Select 80 mm paper in the printer settings. **Tutup** requires confirmation and shows the saved recap. The test account currently has one owned current-day session open; other users' old sessions were preserved.

A mode-600 SQL gzip backup was created before activation: `apps/web/staging/pos-before-activation-2026-10-02T09-06-20-374Z.sql.gz` (90,110,783 bytes). A private pre-change environment backup also exists. Both are ignored and contain no committed secrets. The backup command completed successfully; a restore rehearsal was not performed. No schema reset, migration, production write, or remote deployment occurred.

Local account boundaries (each restricted to the observed Docker gateway host, without `%`):

| Client | Allowed legacy writes |
|---|---|
| Existing reader | None |
| Existing auth client | None; session/throttle writes only to the existing auth store |
| `DATABASE_URL_WRITE` / `kkisi_pos_runtime` | INSERT sales/items/payments, UPDATE item stock, DELETE owned cart rows |
| `DATABASE_URL_REGISTER_WRITE` / `kkisi_pos_register` | INSERT/UPDATE `db_buka_kasir` only |

Both writers have only the SELECT privileges their repositories need, use different non-root credentials, and target the same explicit staging database as the reader. No existing account privileges were widened. QR secrets were configured locally from the targeted legacy `mysecurity_helper.php` / `security.ini`: AES-256-CBC with the verified PHP HEX-SHA256 passphrase and IV convention. No secret values are in Git, output, or this document. A generated QR using that convention resolved the member; an existing printed legacy card was not available for physical scanning.

Native opening and closing serialize with checkout using company then authenticated user row locks. Opening validates the physical cashier/company, balance and all open sessions belonging to the user; it returns the existing current-day session and uses the inserted ID for its reference. Closing checks ownership before reading totals, preserves Quotations, uses server UTC+7 time and is idempotent. As `Pos::tutup_kasir` derives change as `paid_amount - grand_total`, net Cash equals the saved Final Cash total. All Final sales of the owned session/company count, including historical sales created by another cashier; filtering by the sale creator would omit them. A return or unsupported payment method stops recap calculation rather than inventing a total. Closing is disabled while a payment outcome is uncertain.

Saved receipts are company-scoped and rendered from persisted financial rows. They use `sales_date`, because `created_time` changes when a sale is updated; they show no invented immutable transaction time. Cash change follows saved paid minus total. Unsupported methods/returns are rejected. Store/item labels come from the current company/item master because legacy sale lines do not snapshot those labels; amounts remain saved sale-line amounts.

### Final verification

- `pnpm check`: passed — lint has zero errors and three pre-existing warnings; typecheck passed; **138 tests passed, 31 opt-in database tests skipped, zero failures**.
- `pnpm build`: passed with dynamic register opening/closing, receipt API and saved receipt page. Generated `next-env.d.ts` output is excluded from the change; typecheck is rerun after restoring its existing dev references.
- `POS_REGISTER_RECAP_STAGING_TEST=1 ... --test tests/pos-register-recap-staging.test.mjs`: **1 passed**, all temporary sales rolled back; active session preserved.
- A final isolated browser check confirmed the configured local Cash button enables with a scanned product and sufficient tender, and the corrected saved Cash/Kredit receipts and 80 mm print styles work. It blocked checkout requests so no additional sales were created.
- A separate whole-change review found the historical receipt date/payment/change and recap creator-filter problems; these were corrected and re-reviewed with no remaining Critical/Important findings. No runtime dependencies or lockfile changes were added.

### Local acceptance evidence

The isolated browser tests used the existing dedicated test cashier, company 1, without changing other users' sessions. Backup and explicit target checks preceded writes.

- Native **Buka kasir** created session `4400`; 20 concurrent opening requests returned that same session. Forged client company/user IDs were ignored, closing another user's session returned 403, and negative opening balance returned 400.
- Barcode `8996001350843` added live item 76 through the **Scan** button. Cash tender Rp5,000 enabled checkout: total Rp2,000, change Rp3,000, cart cleared, saved receipt accessible. A foreign-company receipt returned 404 even with a forged company parameter.
- Cash sales `243607` and `243609`, and Kredit sale `243608`, each persisted one Final sale, one matching item and one matching payment. These **three staging test sales are retained**. Item 76 stock changed from 202 to 199. Member 62's current-month remaining limit changed from Rp2,500,000 to Rp2,498,000. Neither member data nor other users' sessions were edited.
- The reported NIK retained its leading zero and resolved correctly; explicit member ID and generated legacy-compatible encrypted QR resolved the same member.
- The final Cash response was deliberately lost after commit. Reload preserved the original payment key and disabled closing; ten simultaneous retries returned the original sale without another stock deduction.
- Native close persisted session `4400` with opening Rp0, ending Cash Rp4,000 and Kredit Rp2,000. Repeated close returned that same recap. Session `4401` / `KRS-202610024401` was left active with opening Rp0 for manual use.
- The saved receipt rendered at 80 mm, hid controls for printing and produced an 80 mm PDF. Desktop 1440×900/674 and mobile 390×844/320×700 had visible cashier controls, no horizontal overflow and no runtime exceptions. A physical printer was not exercised.
- Actual account tests denied five unauthorized zero-row writes. A fault at the opening-reference step rolled back a real register INSERT; no duplicate session persisted.
- The opt-in regression below runs temporary sales entirely inside a forced-rollback transaction. It proves fractional Cash totals/change, sales created by another cashier within the owned session, exclusion of Quotation/foreign-company sales, and preservation of the open empty session. Its reader uses test-only ReadUncommitted to see uncommitted fixtures; the production reader does not. Register UPDATE is captured in this regression because the checkout account cannot write registers; native browser/DB checks above verify the actual UPDATE separately.
- Read-only comparison of 20 closed historical sessions: Cash recap matches 17/20; Kredit matches 19/20. Three stored historical recaps differ from recomputing the current Final sales. They were preserved. This proves the implemented formula and reveals historical-data differences; it does not establish full historical reconciliation or PHP/Next concurrent-writer acceptance.

```sh
# From apps/web; opt-in fixture contains IDs only and must identify an empty owned current session.
POS_REGISTER_RECAP_STAGING_TEST=1 node --env-file=.env.local --experimental-strip-types \
  --test tests/pos-register-recap-staging.test.mjs
```

The private `.e2e-pos-recap.json` fixture holds the approved user/company/register and the two saved source-sale IDs. The test rejects any other host/port/database, root writer, mismatched reader target, missing owned open session or nonempty session. Every temporary sale must roll back; it never resets staging.

PPOB/SALDOPPOB, transfer/QRIS payments, invoice edit, header discounts/tax/order-type changes and void/returns remain outside the selected Cash/Kredit scope (D10/D11). Fractional-Rupiah Kredit is still rejected to avoid rounding in the legacy payment column. Phase 8's load/cutover acceptance and remote DEV/production deployment are not complete.

## Earlier implementation and verification snapshots

The sections below retain the evidence and permission state at their respective checkpoints. Their disabled-local-configuration and unexecuted-proposal statements are historical and superseded by the current local operation above.

## Decisions and execution

- [x] Verify the targeted legacy DDL and establish passing baseline tests.
- [x] Add stock-opname / PPOB guards and exact member lookup, active/contract validation, current-month cross-branch credit calculation, and optional legacy QR decryption.
- [x] Implement authenticated, CSRF-protected checkout with one Prisma transaction, server prices, register ownership/day checks, sorted stock locks, a cross-branch member lock, and rollback/retry checks.
- [x] Wire member selection, Cash/Kredit, paid amount/change, and finalization to the POS UI. Preserve retry keys on uncertain responses and prevent edits during submission.
- [x] Run isolated synthetic MariaDB transaction/concurrency tests, security tests, `pnpm check`, and `pnpm build`; record their results and remaining live-environment gates here.

The existing domain/application/infrastructure boundaries are retained. Prisma 6.12.0 remains pinned. No runtime dependencies are added. Product, sale, payment, inventory and register access use the authenticated active company; global member data and R3 billing deliberately span branches. Global tables do not acquire fictitious company columns.

The write connection is separate (`DATABASE_URL_WRITE`) and disabled unless explicitly enabled for a named local staging database. Read/auth clients remain read-only for legacy tables. Auth session/throttle queries now use their connection's selected database instead of a hardcoded `kkisi_auth_staging` prefix; a regression test and browser login verify this fix. No existing staging, production/DEV provisioning, grants, migrations, private input edits, or snapshot writes were performed. Database checks use a disposable synthetic container with no shared volumes. The user explicitly approved its synthetic auth schema and three gateway-restricted reader/auth/runtime accounts.

Invoice allocation and idempotency use the existing company row as a transaction mutex. The sequence is derived from that company's legacy monthly codes; the retry reference and canonical request digest occupy `reference_no` and `sales_note` on Next-owned sales. No new table or unique constraint is applied to legacy data. This serializes Next checkouts per branch; PHP writers do not take this mutex, so the existing POS writer cutover gate still applies.

The client cart follows D9. Finalization purges only Quotation cart records owned by the active company, cashier user and open register. Cart records without `sales_id` are deleted only when their legacy code identifies one sale globally; ambiguous codes remain untouched. Neither client company IDs nor sale IDs are trusted.

PPOB and SALDOPPOB remain excluded under D11, rather than being processed as inventory sales. Existing legacy cashier sessions are consumed; opening/closing a register remains outside this request's endpoint scope. QR ciphertext requires independently supplied `POS_QR_SECRET_KEY` and `POS_QR_SECRET_IV`; absent configuration fails closed for encrypted QR, while plain NIK/ID-card scans work. No legacy secret is copied.

Amounts are integer sen in application logic and parameterized decimal strings in SQL. Cash tender is whole rupiah because legacy `db_salespayments.payment` is DECIMAL(10,0); fractional Credit totals are rejected with an explicit precision error instead of silently losing money. Cash change retains sen. Taxes/header discounts remain excluded under R8.

## Verification results

Verified on 2026-10-02:

- `pnpm install --offline --frozen-lockfile`: passed, lockfile unchanged; no added runtime dependencies.
- `pnpm db:generate` and `pnpm db:validate`: passed with pinned Prisma 6.12.0. Validation reports the three existing relation-index warnings.
- `pnpm check`: lint and typecheck passed; 118 tests passed, 29 opt-in database tests skipped, zero failures. Database suites are run separately below.
- `pnpm build`: production build passed, including the two new dynamic POS API routes.
- `pnpm test:pos-db` with `POS_CHECKOUT_DB_TEST=1` and the disposable fixture URL: all 12 MariaDB suites passed. Tests cover every checkout write's rollback, exact Cash totals/change, credit/member guards, cart ownership, replay after register closure, retry after transaction conflict, 20 concurrent replays, 50 concurrent distinct sales, and 20 cross-branch Credit requests competing for one member limit.
- `pos-privileges-db.test.mjs` with `POS_PRIVILEGES_DB_TEST=1`: passed using the three approved synthetic accounts. Reader cannot update stock; runtime cannot update users or delete sales; auth cannot read legacy tables.
- `node apps/web/tests/pos-checkout-browser.mjs`: passed against the production build on `127.0.0.1:3126`. Real browser flows cover auth, product search/pack barcode, Cash receipt/change, member ID-card lookup, Credit checkout, encrypted synthetic QR, and response loss after commit followed by reload and replay of the same persisted key. A regression check verifies that subsequent 403/CSRF and 401/login rejection preserve the original key, so authentication failures cannot enable a second payment. No runtime exceptions or horizontal overflow at 1440×900, 1440×674, 390×844, or 320×700.

The opt-in fixture suites require `127.0.0.1:3310/kkisi_pos_staging` and a synthetic marker from `apps/web/tests/fixtures/pos-schema.sql` before resetting fixtures. The browser seed has the same guard. Never point these scripts at existing staging or operational data. The browser runner uses an isolated temporary Chrome profile and synthetic credentials; the test container's storage is disposable tmpfs. Tests establish behavior on the selected DDL with synthetic rows, not historical-data acceptance, encrypted production QR compatibility, PHP writer interoperability, load acceptance, or deployment.

After verification, the synthetic Next.js server was stopped, the disposable container (including its synthetic schemas/accounts) was removed, and the temporary synthetic environment file was deleted. The existing `kkisi-staging` container remains running on local port 3307. Generated `next-env.d.ts` changes were excluded and `pnpm typecheck` passed again.

## Local activation and remaining gates

The project's private environment files were not modified. Checkout remains disabled in the existing local configuration. Once an authorized isolated staging environment is ready, supply these settings using the placeholders in `apps/web/.env.example`:

```dotenv
POS_WRITES_ENABLED=1
POS_WRITE_DATABASE=kkisi_pos_staging
DATABASE_URL=mysql://pos_reader:REPLACE_ME@127.0.0.1:3310/kkisi_pos_staging
DATABASE_URL_WRITE=mysql://pos_runtime:REPLACE_ME@127.0.0.1:3310/kkisi_pos_staging
```

Read/write must target the same explicit local staging database with different non-root writer credentials. The writer needs SELECT plus INSERT on `db_sales`, `db_salesitems`, `db_salespayments`, UPDATE on `db_items`, and DELETE on `db_cart`. Auth uses its own selected auth-store database and credentials. Its account does not need legacy write privileges. Provisioning these privileges on any existing database still follows section 6.17.

Use a valid authenticated cashier and exactly one current-day active `db_buka_kasir` entry owned by that user/company, with an active `db_kasir`. Supply authorized QR secrets separately when encrypted member scans are required. Start the application using the existing root `pnpm dev` command.

Section 6.17's real-environment gates remain unmet: authorized writer cutover, rollback/backup plan, historical-schema/data acceptance, concurrency with external legacy writers, and DEV release approval. No production write or deployment was performed. PPOB and fractional-Rupiah Credit remain rejected as described above; neither is silently treated as a supported payment.

## Follow-up: disabled Cash button and member identity collision (2026-10-02)

Targeted SELECTs and a browser check against the existing local application confirmed two separate issues:

- The local environment has none of `POS_WRITES_ENABLED`, `POS_WRITE_DATABASE`, or `DATABASE_URL_WRITE` configured for checkout. The test cashier in `.e2e-kasirpos.json` is user 18, company 1; this user has no open `db_buka_kasir` session. Cash and sufficient tender alone cannot enable checkout. Old open sessions belonging to a different user are not valid for this cashier and were not changed.
- Member 62 has NIK `04296`. A different imported member has that same string in `id_card`. The old `nik_kar = ? OR id_card = ?` query combined two identifier namespaces and incorrectly reported an ambiguous NIK. This does not establish duplicate NIKs.

The UI now explicitly selects NIK, ID card, member ID, or encrypted QR. NIK remains a string, preserving its leading zero; member ID has separate positive-integer validation. QR resolves as NIK. Compatibility requests without a kind try exact NIK first, then ID card only when no NIK matches. Duplicate matches within the selected namespace still fail closed. Eligibility and cross-branch credit calculation remain unchanged.

The payment button and its displayed blocking reasons now use one shared calculation. It explains unavailable checkout, absent/old/multiple register sessions, empty cart, insufficient Cash tender, and insufficient member credit. No payment guard was removed. Actual staging checkout remains disabled pending its writer and register setup.

Follow-up verification:

- `pnpm check`: lint/typecheck passed; 121 tests passed, 30 opt-in DB tests skipped, zero failures.
- `pnpm build`: passed. Generated `next-env.d.ts` changes were excluded; typecheck passed again.
- `POS_STAGING_DB_TEST=1 node --env-file-if-exists=.env.local --experimental-strip-types --test tests/pos-staging-member.test.mjs tests/pos-checkout-state.test.mjs` (from `apps/web`): the reported lookup and button regressions failed before the fix and passed afterward. The staging test performs SELECTs only; the additional duplicate-namespace regression runs without a database.
- An isolated Chrome check on `127.0.0.1:3000` confirmed a hydrated nonempty cart plus sufficient Cash tender still explains the missing writer/register, and confirmed NIK `04296` and member ID `62` resolve in the UI. Checkout requests were intercepted and blocked throughout. Login uses the normal dedicated auth store; legacy tables received no writes. The user's running development server was preserved.

### Concrete local activation proposal — not executed

The previous approval covered only disposable `kkisi-pos-integration-test`. It did not approve grants, environment changes, or register creation on the existing `kkisi-staging` copy. Section 6.17 requires explicit target/object authorization. To make manual local checkout possible, the proposed changes are:

1. Target only container `kkisi-staging`, loopback port 3307, database `kkisi_staging`. Create `kkisi_pos_runtime` restricted to this container's Docker gateway host, with a new locally generated password. Grant SELECT for the checkout tables (`db_company`, `db_users`, `db_roles`, `db_permissions`, `m_anggota`, `db_sales`, `db_items`, `db_buka_kasir`, `db_kasir`, `db_cart`), INSERT on `db_sales`, `db_salesitems`, `db_salespayments`, UPDATE on `db_items`, and DELETE on `db_cart`. Existing reader/auth accounts keep their privileges.
2. Set only `POS_WRITES_ENABLED=1`, `POS_WRITE_DATABASE=kkisi_staging`, and `DATABASE_URL_WRITE` in the private `apps/web/.env.local`, then restart the local Next.js process to load these settings. Preserve other environment values; never commit credentials.
3. After rechecking that there is still no open session, insert exactly one current-day `db_buka_kasir` row for test user 18, company 1, active register 1 (`KRS01`), opening balance Rp 0 and credit balance Rp 0. Generate its reference locally. Do not close or modify other users' registers.
4. Verify configuration, the owned register and enabled Cash button using reads. This proposal does not authorize submitting a sale, altering any production database, or opening DEV/production release gates. Manual checkout after activation will create real rows in this local staging copy and decrement its stock.

No part of this activation proposal was executed while fixing the lookup and explaining the disabled button.
