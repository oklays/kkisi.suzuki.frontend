# POS database integration implementation

This implements the existing [POS_DB_INTEGRATION_PLAN.md](POS_DB_INTEGRATION_PLAN.md), phases 1, 3, 4 and 5. It is not a new PRD. Code implementation is authorized by the current POS integration request. Section 6.17 provisioning and release gates remain unchanged.

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
