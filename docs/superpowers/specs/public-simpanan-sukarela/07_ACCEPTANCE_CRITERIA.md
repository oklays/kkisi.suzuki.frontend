# 07 — Acceptance criteria and detailed test strategy

Status semua feature scenarios: **PLANNED / NOT RUN**. Tidak ada application implementation pada audit ini. **PASS dokumentasi tidak berarti PASS runtime/production**. Traceability semua41 requirement ada di [verification](verification.md).

## 1. Safe test environment dan fixtures

- Local/DEV/staging terisolasi dengan schema-equivalent InnoDB/SQL mode/triggers dan restricted accounts; metadata produksi melalui operator, **tidak ada production write-test**. Guard test harus menolak nonloopback/production sebelum connection atau DDL.
- Anggota sintetis A eligible dengan tepat satu exact NIK dan satu active SUKARELA config; B eligible tanpa `users` mobile row; C ineligible sesuai policy; D duplicate NIK/leading-zero collision; E missing verified contact; F duplicate/conflicting active master; G NIK melebihi varchar10 active master. Tidak memakai real NIK/token/phone, bahkan screenshot.
- Actor staff generator, revoker, processor, view-only, cashier no KOSIPA link, disabled KOSIPA user/group/menu, linked tanpa explicit action grant. Authorization diuji server langsung, bukan hanya tombol hilang.
- Waktu injected Jakarta/UTC boundaries, ACTIVE/expired/revoked/consumed links, OTP/proof valid/expired/wrong, file PNG blank/valid/polyglot/oversize/decode-bomb; provider sandbox fake and private storage fault adapter.
- Freeze baseline row counts/hashes untuk request/notif/config/profile/saldo dan snapshot log/network yang disanitasi. Invariant checks pakai business PK/link id, bukan print member data. DB-backed tests harus terpisah opt-in; ordinary unit tests no network/prod.

## 2. Functional scenarios

| ID | Setup / action | Expected criteria / evidence |
|---|---|---|
| F-01 | staff create eligible A, repeat same generation key; create another key while ACTIVE | first201 URL once; digest only DB; repeated200 metadata secretAvailable false; second active409; audit create exactly1; lifetime within approved policy |
| F-02 | open valid link GET/HEAD, POST validate repeatedly before/after proof | no member login redirect; no consume/challenge on page open; preproof no identity; postproof READY fixed type/section/old/periode; no extra application |
| F-03 | compare complete rendered form to inventory01 and authoritative masters | masked NIK/name, section/jenis/old/periode read-only; new amount/signature/consent editable; section from m_bagian active, type from m_simpanan_mobile enabled; no bank/KTP invented fields |
| F-04 | bypass UI: empty/zero/negative/decimal/scientific/overflow/grouped amount, missing section/signature/consent/version, unknown keys | strict policy-specific422/400/415/413, field errors no PII; no partial DB writes/consume; frontend error focus and backend enforcement independently proven |
| F-05 | submit valid proof+payload once via new Next endpoint |201 receipt, single OPEN request correct NIK/old/new/section/periode/signature/is_mobile/source, notif required fields; token CONSUMED at same commit; no balance/profile update |
| F-06 | operator list/detail after F-05, compare legacy list | same business PK/doc_no/status; row under Pengajuan, not substituted ledger; origin PUBLIC; safe audit timeline; legacy row visible under allowed filters |
| F-07 | native approve A with existing master, B with no master; separate reject request | approved config potongan_payroll/status/doc_no and member sim_sukarela match L1; existing periods preserved, new periods per approved L1; reject only header/audit/reason; no saldo/mutasi/journal; pending-only transitions |
| F-08 | revoke ACTIVE by revoker; repeat revoke, then attempt consume; revoke CONSUMED | terminal REVOKED, audit once, subsequent410; repeated revoke200; consumed409 and request unchanged; no secret in list/history |
| F-09 | member B without mobile account completes verified public flow | no users/mobile session/PIN/API requirement, no auto-created account; bound member gets OPEN request; missing contact E follows assisted path without identity leakage |
| F-10 | pending OPEN or POSTING any savings type; changed NIK, duplicate identity, duplicate master, overlength master NIK | public create/submit rejects with safe conflict/ineligibility; no new business write. Exact identity never resolves via LIKE/unsigned cast |
| F-11 | approved policy variants zero/decrease/max, current Jan31/Feb29/Dec31 and payroll cutoff; old/master/period changes between load+submit | correct Jakarta next month/year, no month13/date parse defect; server policy authoritative; formVersion stale409 with retained ACTIVE token; owner-reviewed SUKARELA policy distinct WAJIB |

## 3. Security scenarios

| ID | Action | Expected |
|---|---|---|
| S-01 | missing/malformed/random/tampered token, wrong purpose, exact expiry deadline, revoked, consumed, used after expiry | generic invalid without identity; expired/revoked distinguish only for valid bearer; consumed remains ALREADY_SUBMITTED even after expiry; no form reopened/no writes |
| S-02 | source inspect token generator, controlled collision injection, DB/log/history/query search | CSPRNG32 bytes→43chars; unique digest rejects collision safely; URL no NIK; plaintext secret absent at rest and internal reads; no JWT/Base64-as-encryption claim |
| S-03 | add/modify `nik`, memberId, name, phone, purpose, companyId, oldAmount, status, docNo; swap proof from different link | unknown fields400, wrong proof403, no identity override; exact server-bound member only; request cannot select OTP phone |
| S-04 | barrier20 simultaneous submits on two independent app processes/DB clients: same key, then mixed keys | exactly request1/notif1/CONSUMED1/submit audit1; exact same key retries200 saved receipt; other keys409; test not satisfied by same-process JS mutex |
| S-05 | consumed token reuse same payload/key, different payload/key/signature; retry after deadline | only exact replay minimal receipt; all others used/conflict; no second insert/config change; no full identity/amount disclosure in receipt |
| S-06 | cross-origin/missing Origin/null Origin/simple HTML form, hostile CORS preflight, forged staff cookie without public bearer, proof absent | reject; cookie alone no public identity; bearer/proof only grant scoped flow; legitimate WhatsApp origin path succeeds under approved policy |
| S-07 | unauth/unlinked/inactive/menu missing/view-only/action-grant missing calling create/revoke/process/detail/signature directly |401/403 or safe404, zero unauthorised secret/PII/data writes; missing CSRF on internal POST403; no admin magic bypass |
| S-08 | signature SVG/HTML/polyglot/fake MIME/too big/truncated/huge dimensions/blank, request streaming beyond cap, SQL/XSS strings |415/413/422 before business commit; parser bounded; nonexecutable raster only; SQL parameterized, escaped messages; old signature never deleted |
| S-09 | inspect page/API/error/receipt/signature headers, access/proxy/CDN/APM/browser network logs and audit |no-store/private/no-referrer/noindex/nosniff/CSP, no third-party calls; no token/proof/NIK/OTP/phone/amount/signature/raw URL in audit/logs; actor PUBLIC attributable by opaque link |
| S-10 | forward link to unverified party, request OTP to arbitrary supplied phone, wrong/replayed/expired challenge,5 failures, contact version changes | no member details/submit before verified contact; recipient never overridden; attempts/TTL enforced; challenge failure no link consume; residual shared-channel risk documented |
| S-11 | repeated validate/submit/generate/revoke/OTP requests across two processes, restart process, forge X-Forwarded-For | shared quotas survive restart, atomic allowed-count bound;429 Retry-After; trusted proxy-derived IP; throttle unavailable503 fail-closed; no member lockout caused solely GET |
| S-12 | WhatsApp/link-preview scanner GET/HEAD and JS validate, browser prerender/prefetch/back/reopen | no consume/OTP/submit before explicit interaction; generic preview title; URL fragment scrubbed; no persisted token client storage; original link still usable |

### UI/browser scenarios

| ID | Action | Expected |
|---|---|---|
| U-01 | Render seluruh sembilan state dengan controlled API fixtures, lalu jalankan valid submission/error/retry lewat browser | field/source/read-only sesuai01; status/submission copy akurat, tanpa login; validasi inline dan error focus; retry key/payload tetap; confirmation menunggu approval, bukan saldo bertambah |
| U-02 | Staff create/copy/share/revoke/view/process sesuai role; public pada320/390/768/1440px, zoom200%, keyboard/screen reader, Android/iOS WhatsApp, rotate/background/network drop | tombol sesuai capability, API tetap protected; no layout overlap; touch signature/clear usable; busy/error announced; clipboard fallback; no token persistence/third-party calls; real-device results dicatat terpisah dari synthetic browser |

## 4. Integration and data integrity

| ID | Protocol | Expected |
|---|---|---|
| I-01 | block all egress to mobile host during new submission; separate existing mobile create on sanitized environment | new route succeeds through own DB adapter, no mobile dependency; original mobile request contract/behavior unchanged; same table readable legacy/Next |
| I-02 | fail injection after header insert, notif insert, audit insert, consume update, before commit; deadlock/timeout | rollback all required writes; token ACTIVE unless existing terminal; signature orphan allowed but private/cleanup; retry succeeds exactly once; no partial header/notif/audit |
| I-03 | commit succeeds then HTTP socket drops/process killed; retry same body/key; transient writer read outage | eventual200 same opaque receipt; never second insert; if DB unavailable503/uncertain copy prompts same retry; no new key/link automatically |
| I-04 | source-equivalent L1 behavior on isolated fixture compared native: existing/new/duplicate master, approve/reject, repeated/conflicting state, fault midway | business config parity where approved, intentional guard improvement documented; full rollback native; consumed remains terminal even REJECTED; legacy process controls disabled for native test phase |
| I-05 | conditional mail enabled/disabled, provider down/slow/ambiguous ack, worker crash/lease expiry | request commit independent from mail; db_notifikasi valid; durable event PENDING/RETRY/DEAD; retry only notification; audit envelope unchanged; no repeat application |
| I-06 | compare profile/master/ledger before-after submit, then compare after approve/reject | submit preserves m_anggota/ users bagian/foto_ttd and saldo/mutasi; explicit approved deviation G4; approve only approved config fields; reject no config changes |
| I-07 | simultaneous mobile create and public submit same member; inspect pending statuses | document actual cross-channel race (not globally solved by public lock); pending precheck blocks preexisting request, processor/operator detects conflict per signed policy; no false global uniqueness claim |
| I-08 | private object stage fails, succeeds then DB rolls back, DB commits then storage/dispatcher restarts; old profile signature exists | failure pre-stage no business write; orphan cleanup respects reference/lease/unknown commit; committed signature retrievable authorised and immutable; old profile signature untouched; public-origin PDF snapshot matches consent |
| I-09 | mobile autocode MAX RIGHT5 before/after SP+32hex+00000 row at month/date/counter boundaries | unchanged numeric maximum/next mobile numbering contribution; unique public doc_no <=50; urls fit varchar100; all consumers accept public namespace/is_mobile0. If fails G3 blocks release |

## 5. Regression suite

| ID | Coverage | Gate |
|---|---|---|
| R-01 | existing Pengajuan Potongan mobile including WAJIB, KOSIPA legacy list/filter/detail/approve/reject/print for mobile origin; native stage without parallel legacy writes | contract/schema/API code unchanged; new constraints do not break mobile writes. Legacy **public-origin** print handled per G4, not silently treated equivalent |
| R-02 | Next membership/savings ledger/loans/payroll/report reads, auth session/CSRF/identity links, role/menu visibility, POS behavior | existing automated suite, no changed permissions/defaults/reader grants; local/synthetic vs live read evidence separated |
| R-03 | key/flag rollback, unavailable console/auth/provider/storage, refresh/back, no mobile account | existing modules still usable under their flags; public fails closed; receipt-only recovery retained; no financial loss or actor impersonation |

## 6. Operational and documentation acceptance

| ID | Criteria | Evidence required |
|---|---|---|
| O-01 | approved metadata/DDL/engine/CHECK+trigger enforcement/grants/pool/origin/private storage readiness | actual staging schema-equivalent results; no source snapshot-only claim; app account cannot update audit business columns or master/profile on public submit |
| O-02 | metrics/alerts/request-id, outbox backlog/deadletter, unknown commit, storage recovery, audit retention and key rotation rehearsed | sanitized failure drill with recovery times; no secrets logged; ownership of alert response recorded |
| O-03 | G1–G9 signed; legacy/native processing mutually exclusive; rollback stops writes and preserves committed data | staged switch+rollback rehearsal; no production activation by test; consumed tombstones/financial evidence retained |
| DOC-01 | 13numbered core deliverables plus local metadata appendix, complete field/backend/DB/approval/Next mapping; facts/assumptions/risks/recommendations distinguished | evidence root/symbol/line/hash, request phase mapping below, gaps explicit |
| DOC-02 | documentation-only task diff, all41 requirements mapped design/tasks/tests, six mandatory diagrams, no real credentials/NIK/tokens | spec validator+all-family/link/whitespace checks and source/Git scope review |

## 7. Concurrency/fault protocol (required runnable implementation tests)

Implementation DB harness must use two **separate** clients/processes. Establish known fixture counts. Synchronize20 submissions at a barrier so all pass candidate pre-read before transaction. Run same-key cohort then different-key cohort on new links. Assert SQL counts by link/submission references and payload hashes, not just HTTP201 count. Check consumed row references the only business PK, terminal audit once, notification once, no profile/config mutations on submission. Repeat at revoke-vs-submit and expiry boundary; exactly one valid terminal outcome. Rollback test must fail an actual DB statement/trigger, not simulate rollback with an in-memory repository.

Unknown-commit test: allow DB COMMIT then drop response socket. Retry exact normalized payload/signature bytes with same key; expect200 same receipt. Simulate DB connection loss during COMMIT: resolve from authoritative writer before judging failure, no reissue/new logical request. Record deadlock/lock-timeout behavior and bounded retry counts. Header/table all transactions engines verified; no network calls while locks held.

Rate tests count permitted operations from two app instances and inspect shared quota record. Independent mobile/public race I-07 is **separate** from one-token race S-04; mark unresolved global constraint as release policy issue rather than passing because one browser button is disabled.

## 8. Commands planned after approval (not executed for this audit)

```sh
node --experimental-strip-types --test packages/domain/tests/public-savings-policy.test.mjs packages/application/tests/public-savings.test.mjs
node --experimental-strip-types --test apps/web/tests/public-savings-http.test.mjs apps/web/tests/public-savings-rbac.test.mjs
# Only after new tests implement strict loopback/staging target guard:
KOSIPA_PUBLIC_SUBMISSION_STAGING_TEST=1 pnpm --filter @koperasi/web exec node --experimental-strip-types --test tests/public-savings-db.test.mjs
pnpm --filter @koperasi/web exec node tests/public-savings-browser.mjs
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

No deploy/migration/prod-test command included. Capture exit0 plus scenario-level evidence, skips/failures explicit. Browser test needs isolated controlled server and synthetic accounts provisioned through approved fixture workflow; do not read/print `.env.dev-local-accounts.json` into reports. No new test account authorised by this audit.

## 9. Request coverage and audit-stage definition of done

| User request area | Documentation coverage | Audit outcome |
|---|---|---|
| Phase0 docs first / targeted audit | README/evidence D1–D8 | baseline consulted; no full legacy re-audit |
| Phase1 mobile locate/fields/frontend-vs-backend/API trace/parity |01/evidence M/B | traced through available remote backend; defects and missing rules explicit |
| Phase2 approval/status/DB/side effects/Next compatibility |02/03 | both legacy variants, config vs saldo distinction, Next read-only verified |
| Phase3 token/identity/race/idempotency/security/scanners |04 | lifecycle/transaction/control proposal complete; runtime gates open |
| Phase4 Next layers/contracts/DB ownership |05/03 | new own handler, existing business row, separate aux proposal; no mobile API use |
| Phase5 internal/public UX, field source,9 states |05 §7 | layout/interaction/permission/state specification, no application code |
| Phase6 functional/security/integration/regression/operational tests |07 + verification | detailed plan complete; implementation tests not run |
| Deliverables01–07 / implementation backlog |README/06 | files created; all implementation tasks unchecked |
| Six mandatory diagrams |01 mobile sequence;02 legacy sequence+ER;04 state;05 issue+submit sequence | all six supplied in Mermaid; additional architecture/dependency diagrams |
| Constraints1–4: audit first/docs/targeted/no mobile edits |README/evidence | docs only; mobile hashes recorded |
| Constraints5–10: mobile API unchanged/new own handler/preserve business/no duplicate tables |01–06 | future design bounded; parity deviations require owner decision |
| Constraints11–14: no production changes/breaks/fabricated contracts/source evidence |02/03/evidence | no DB connection/write; snapshot distinct from current; gaps explicit |
| Constraints15–17: labels/security/privacy |README/03/04/evidence | classified findings; no real member tokens/NIK |
| Constraints18–20: no push/deploy/merge, docs only, no unrelated refactor |verification/Git scope | unchanged app/migration/PHP/mobile; no publication actions |

Audit-stage DoD: mapped mobile fields/validation and actual submission as far source permits; understood both approval variants; relevant DDL mapped; integration/security/atomicity/backlog/tests designed; unknowns listed with decisions. **Implementation-stage DoD remains unfulfilled** until approved design, G1–G9 closure and tests above. This stage stops at documentation, awaiting explicit user approval before application/migration changes.

## 10. Checkpoint0 acceptance additions and phase scope

CP1/CP2 use existing legacy approval; F-07 native processor/I-04 native parity run only at CP3. Initial CP1 compatibility test uses the chosen existing processor on authorised staging. No native payroll writer/code introduced merely to complete public intake. Phase gates12/13 supersede earlier all-at-once rollout interpretation. Existing42cases are retained;8 targeted cases below and1documentation case add51total referenced acceptance scenarios. All feature tests NOT RUN at CP0; metadata inspection is separate evidence.

| ID | Scenario | Phase / expected |
|---|---|---|
| C0-T01 | source-equivalent strict schema/charset/defaults/grants/transitive transaction effects | CP1 schema/denial tests, not snapshot-only readiness |
| C0-T02 | cross-channel duplicates vs token-one-use, approved business key/status rules | CP1/2 all-writer prevention required U-01/XC-02; no permanent NIK-only unique or false global guarantee |
| C0-T03 | owner cutoff/effective payroll period vs L1 immediate config update and retained old periods | CP1 compatibility/CP3 parity, no invented cutoff |
| C0-T04 | immutable public signature/PDF and stale legacy profile-print control | CP1 artifact compatibility, CP2 staff handoff |
| C0-T05 | verified flag insufficient, current contact provenance/provider timeout/resend/recovery | CP1 failclosed no silent identity downgrade |
| C0-T06 | mobile doc_no-based edit/cancel vs public body/proof and competing transitions | CP1/2 tested all-writer prevention before effects, coherent config/header/proof, no operational exception; XC-03..06 |
| C0-T07 | CP1/2 no payroll UPDATE privilege, independent flags, receipt recovery | CP1/2 rollback preserves legacy operation/evidence |
| C0-T08 | actual production canonical evidence distinct from staging menu and source preference | CP2 operational handoff, mandatory CP3 cutover gate |
| DOC-03 | A–Gworkstreams, documents08–13,3phases, independent readiness, owner actions, no code/write/publication | CP0 documentation validators/read-only evidence pass, not permission to start CP1 |

Full protocol, endpoint/file contracts and exact gate clearances12/13. Requirement traceability updated to41 IDs; all recommended business defaults remain unapproved until recorded owner decision.

## 11. CP0.5 preventive cross-channel acceptance

22 Oktober2026 U-01 supersedes operational exceptions/manual-only acceptance. [16 XC-01..10](16_CROSS_CHANNEL_CONSISTENCY_STRATEGY.md) defines10 additional runtime cases,61 total scenario IDs including prior51. Actual source-equivalent runtime tests **NOT RUN**.14A abstract interleaving experiment is separate evidence and not a feature acceptance pass. Initial protected legacy processor requires XC-04/05/06 staging proof; this does not implement the separate CP3 native processor. No bypass through L4/direct mutation/print routes may invalidate the agreed protected scope. Required first-side-effect/whole-command controls need separately approved change scope if unavailable in existing systems.
