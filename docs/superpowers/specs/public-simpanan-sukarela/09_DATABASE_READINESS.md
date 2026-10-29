# 09 — Database readiness / Checkpoint0

**Implementation update29 October2026:** Dedicated MariaDB11.4 local synthetic staging on127.0.0.1:3318 is implemented with separate restricted public/legacy credentials and installation sentinel. [schema/migration/setup/preflight](../../../../integration/public-savings/README.md) distinguish disposable fixture DDL from additive migration001. Actual transaction/concurrency/rollback/commit-ack-loss tests run against this database. No production DB metadata is inferred from these results. Actual deployed writer grants, historical duplicate data, table signatures and hosting capacity remain external verification prerequisites.


21 Oktober2026 historical metadata; CP0.5 update22 Oktober: **current local reader connection UNAVAILABLE/P1001**, no metadata refresh; production schema/grants/transaction writes NOT VERIFIED. [14 technical verification](14_CP05_TECHNICAL_VERIFICATION.md) records the current attempt. No migrations, DDL/DML, write tests, provider calls or production DB queries performed. No member rows/phone values read. [09A](09A_LOCAL_SCHEMA_METADATA.md) preserves actual historical9-table/219-column/17-index-entry local evidence, not a surrogate production verification.

## 1. Evidence boundary and observed metadata

C0-DB1: Node direct Prisma client loaded local environment internally (no credential output), refused nonloopback/nonstaging/nonreader-named target, one connection, SELECT information_schema + safe server variables, SHOW GRANTS sanitized before output, bounded ref_menu URL/status only. No application container/use case invoked, no credentials sourced in shell. Authentication grants observed USAGE+SELECT; not a future public writer. Trigger names query empty under reader **does not prove no triggers** because reader lacks TRIGGER visibility. Full trigger/routine definitions need privileged **metadata** account via operator handoff; not a writer test.

| Attribute | Observed LOCAL STAGING | Production / interpretation |
|---|---|---|
| Version | MariaDB11.4.13-MariaDB-ubu2404 | production version unknown; don't infer CHECK/generated-column support there |
| Engines | all 9 scoped tables InnoDB | supported substrate locally, not actual new UoW proof |
| SQL mode | STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION | production unknown; missing NOT NULL/default values must be explicit |
| Session/global timezone | SYSTEM / SYSTEM | actual system offset not captured; use explicit UTC security time/Jakarta business calendar |
| max_user_connections |0 server setting | local default, no statement about hosting limits or effective per-account quota |
| wait_timeout |28800seconds | production baseline reported20s; current production not checked |
| PK | each scoped table id AUTO_INCREMENT | no business uniqueness inferred |
| Unique indexes | users.nik, users.email, composite ktp+phone (plus PKs) | no UNIQUE request.doc_no or member NIK or active-master business key observed |
| Local additional indexes | m_anggota idx_anggota_idcard/idx_anggota_nik/idx_anggota_status | differ from original dump-only baseline; may be staging setup additions, not production indexes |
| FK | no foreign-reference rows for scoped tables | implicit relations; production unknown |
| Trigger metadata |0visible rows, reader SELECT-only | unknown; operator full visibility required |
| Menu config | one matching active mobile/pengajuan_mobile_c row; no matching simpanan variant row returned | source snapshot-derived staging config, NOT proof of active production workflow |

## 2. Table compatibility summary (actual local metadata)

All types/nullability/defaults/charset/extra properties are listed in09A. Business relationships and side effects remain02.

| Table | Confirmed columns/constraints most relevant | Risk / write requirement |
|---|---|---|
| trans_simpanan_pengajuan | doc_no varchar50 nullable, nik_kar varchar50 nullable; type/status varchar50, default OPEN; potongan_old/potongan double18,2; period strings50; ttd100; is_mobile nullable; status_notif NOT NULL no declared default; only PK | explicit status_notif0 and timestamp conventions; strict precision parser; no assumed doc_no uniqueness |
| m_simpanan_aktif | nik_kar varchar10; potongan_old NOT NULL no default, is_mobile NOT NULL no default; payroll double18,2; status; periods; only PK | CP1/2 SELECT only. Native writer must resolve required values/ambiguity before CP3; no string truncation |
| m_anggota | nik_kar varchar50 nullable, nonunique local nik index; no_telp/no_telp1 nullable; foto_ttd nullable; sim_sukarela double18,2 | public write prohibited; identity collision and contact provenance need rules |
| users | nik UNIQUE, phone varchar25 NOT NULL, is_phone_verified tinyint NOT NULL default0; no phone_verified_at present; foto_ttd; timestamps | mobile account optional for public. Flag not sufficient proof of current/KYC contact; no raw row reads |
| m_bagian | name_bagian255 nullable, status nullable, only PK | request bagian100: validate encoded length/no truncation; active unique label resolution |
| m_simpanan_mobile | jenis_simpanan50, status_pengajuan NOT NULL no declared default; only PK | use submission-enabled SUKARELA record; duplicate/disabled master fails closed |
| m_jenis_simpanan | jenis_simpanan_code/name50, is_active; only PK | finance reference, not replacement mobile dropdown |
| db_notifikasi | required bagian/email/title/mess/url/status_alert/status/cd/cd_date/doc_no_sim; url100, title50; only PK | explicit all required columns; configured recipient/bagian not guessed; public transaction notif once |
| ref_menu | url/status metadata queried bounded | menu config evidence separate from actual staff access/production use |

Most business strings latin1_swedish_ci; users utf8mb4_unicode_ci. Validate representability and length **before insert**, preserve exact source NIK (not numeric coercion), no global charset/collation change. New aux token/digest IDs use binary; string metadata prefer utf8mb4_bin subject to version review. Do not silently normalize public identity into a different legacy member key.

## 3. Transaction feasibility and boundaries

**Recommended supported design, not executed guarantee:** one dedicated Next public writer connection, same business database/server, all participating tables verified InnoDB, explicit transaction; lock member PK→link row, authoritative purpose/identity/proof/pending/formVersion reread, INSERT existing request + db_notifikasi + immutable audit/outbox event, conditional consume with receipt refs, COMMIT then respond. Auxiliary unique link→submission ref plus locking gives one-token idempotency. No tx split across consolePrisma/authPrisma/reader/writer. New writer target guard must pin actual server identity and forbid prod on staging tests.

DB atomic set = request/token/audit/outbox/required database notification. **Excluded:** signature upload, PDF rendering/object write, OTP delivery, external email/WhatsApp, legacy later approval/payroll update. [MariaDB FOR UPDATE guidance](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update) requires an enclosing transaction for locks to be meaningful.

Signature durable stage before DB commit, immutable keyed/hash proof; rollback may leave private orphan (cleanup after reference recheck and safety delay), never consumed token without committed request. Aftercommit worker produces PDF/notification delivery with durable identity/lease/backoff. PDF failure cannot undo request or reopen link; show artifact-pending. Where proof readiness is mandatory, D-PDF must provide enforced processing/print prerequisite16; unchanged CI2 has no such guard as observed. Manual handoff alone does not meet U-01.

OTP dispatch runs outside business submission transaction, see11: short challenge commit then bounded provider call; no plaintext OTP in outbox. Provider timeout semantics/delivery-key support tested separately. Never claim external exactly-once delivery without provider proof.

No actual DB writes/rollback/concurrency tests performed here. CP0.5 abstract model14A is not DB runtime proof. Intended writer validation must confirm locking-read privileges on the actual target version (SELECT FOR UPDATE) without granting broad member/profile UPDATE; local engine metadata alone does not prove this contract. Runtime atomicity requires authorised staging fault tests. Production triggers may write other/nontransactional tables: inspect transitive effects. U-01 requires all-writer prevention16; a guard on CI2's last header statement does not guarantee rollback of earlier config statements C05-ORDER1. No guards/grants are created in CP0.5.

## 4. Grants / permissions assessment

| Account / phase | Actual or requested | Status |
|---|---|---|
| current local reader | observed USAGE+SELECT; cannot INSERT/UPDATE/CREATE/TRIGGER | VERIFIED restricted reader; not feature writer |
| production reader | no restricted production credential/target used in this checkpoint | BLOCKED verification, do not borrow legacy/root account |
| CP1/CP2 public writer (new) | SELECT minimum master/member/request/aux; INSERT request/notif/link/event; UPDATE only link lifecycle/challenge/proof/artifact fields and event delivery columns; throttle mutations | PROPOSED, not provisioned; no member/profile/config/saldo UPDATE or request edit/delete privileges |
| artifact/notification worker | SELECT approved refs; UPDATE artifact/delivery state only; append bounded system audit | PROPOSED; can share same physical capped client if privilege scope audited; worker concurrency budget included |
| CP3 processor | additional narrow UPDATE request status/time and member.sim_sukarela; I/U active master | deferred; not provisioned in CP1/CP2 |

No DDL grants to application account. Operator owns schema/grant changes. SHOW GRANTS output identity/auth clauses never copied into docs. Verify cPanel column grants feasibility; if database-level grants only, triggers/isolated routines/account design must be reviewed rather than treating broad writer as least privilege. Existing app accounts are not assumed suitable for new features.

## 5. Proposed schema/index amendments (documentation only)

05 §5 contains conceptual DDL for3new aux tables. Additional **proposed fields**, not verified existing columns:

- Link contact evidence: `contact_basis_code`, `contact_verified_at`, `contact_verifier_id`, `contact_evidence_ref`, versioned `contact_value_mac` (reference/HMAC, no phone in URL/log). Generate requires approved proof source; caller checkbox alone not evidence. Bind existing stable member/contact, invalidate on change.
- Immutable proof snapshot: proposed `proof_snapshot_ciphertext` (bounded encrypted envelope), `proof_key_version`, and `proof_snapshot_mac`. Snapshot contains only owner-approved member/template/consent fields needed for public proof, encrypted server-side before UoW with AEAD nonce/tag in envelope; Node crypto in infrastructure, key outside DB. Do not reconstruct historic proof from live master/profile. This is new auxiliary metadata, not an existing column or duplicate application entity.
- Link artifact metadata: `pdf_key`, `pdf_sha256`, `pdf_status` (`PENDING/READY/FAILED`), `pdf_template_version`, `pdf_generated_at`. Lifecycle terminal guard permits only audited artifact-field updates after consume; cannot reactivate/reassign identity or submission. No new business table for PDF.
- Event: distinguish audit actions `submission.created`, `submission.pdf.requested`, `submission.operator_notification.requested`; durable dedupe keys per submission/template/action. Existing proposed delivery columns can carry bounded dispatch lease; audit envelope immutable. Never store raw OTP/provider tokens.
- Candidate legacy indexes `(nik_kar,doc_status)` request and `(nik_kar,jenis_simpanan,status)` active master after production metadata+EXPLAIN/staging measurements. Not NIK-only unique, not period uniqueness without D-DUP approval. `doc_no` uniqueness cleanup is separate; no broad corrective migration.

Aux isolation: proposed unique token_digest, active public member+purpose, generation command key, one submission per link; no source-enforced global business uniqueness claim. Legacy cannot be granted arbitrary aux mutation. All SQL migrations remain future review artifacts, no `.sql` files generated now.

## 6. Zero-downtime and rollback proposal

1. Operator capture source schema/version/sql_mode/triggers/grants/capacity; compare normalized metadata against09A by semantic differences, not assume equality.
2. Review aux DDL/guards and explicit values against strict mode; rehearse create/apply/backup/recovery on sanitized staging using restricted users. Generated columns/CHECK/trigger syntax must match source version.
3. Add aux structures with flags OFF. Creating new tables is additive; legacy index DDL can block/lock depending version/algorithm/table size, so require measured rehearsal, bounded lock and approved maintenance window. No promise online DDL or zero interruption without evidence.
4. Provision restricted writer/pool only after capacity fits; avoid adding unbudgeted clients. Validate source protocol defaults/numbering and public-origin mutation controls without changing mobile API contract.
5. CP1 staging acceptance then CP2 management acceptance; initial production activation is a separate permission. CI2 payroll ownership stays unchanged.
6. Rollback intake: stop issue/submit flags, retain receipt lookup+proof/status reads, stop/recover jobs through leases, leave committed requests/notif/aux intact. Do not drop tables or auto-reverse payroll. Returning to old app does not unconsume links.

## 7. Outstanding production evidence / operator request

No live production schema/grants were queried: available local profiles targeted loopback staging, and remote source SSH does not establish restricted database metadata access. Existing operator handoff `docs/migration/operator-handoff-schema-evidence.md` is baseline; request only scoped tables/trigger effects/grants needed here, not full database/member export.

Required metadata-only results: production version; scoped table columns+PK/unique/index/FK/engine/charset/defaults; trigger/routine **definitions with privilege visibility proven**; SQL mode and effective app-session timezone; planned writer effective grants without secrets; limits per account vs hosting-wide, measured PHP peak and current pool counts/instances. For canonical workflow also active production menu route and operator confirmation. Credentials remain operator-owned; no real member data required.

**Readiness:** schema locally mapped; source-schema production equivalence, intended writer grants, transitive transactional effects, capacity and apply/rollback behavior remain BLOCKED. This does not require replacing existing payroll generator for CP1; only verify compatibility of the unchanged approval handoff.
