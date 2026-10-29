# 08 — Architecture Decision Record / Checkpoint0

Tanggal21 Oktober 2026, CP0; amended22 Oktober CP0.5. Status: **RECOMMENDED architecture; implementation not started**. Dokumen08–13 menstabilkan audit01–07; fakta historis tidak diubah menjadi hasil produksi. Canonical registry keputusan ada di13; policy akhir usulan di10/11. **U-01 requires preventive cross-channel controls before activation;16 supersedes operational exception/manual-only release alternatives.** Safe isolated work follows scoped gate17. Urutan rilis tetap **public submission → management integration → optional native approval migration**.

## 1. Selected architecture dan trade-offs

| ADR | Recommendation | Options/trade-off | Evidence / approval |
|---|---|---|---|
| A01 | Next.js memiliki channel PUBLIC CREATE; Laravel tetap MOBILE CREATE; CI2 tetap APPROVE/REJECT dan payroll config pada CP1/CP2 | Full native approval segera menambah risiko payroll/cutover yang tidak diperlukan untuk public intake | audit01/02; user checkpoint0 workstreamsA/B/G; command-level ownership adalah desain yang diminta, grants/operational sign-off belum diberikan |
| A02 | `trans_simpanan_pengajuan` satu business source of truth, aux security state bukan tabel bisnis baru | tabel pengajuan bayangan/saga ke mobile API ditolak: status/atomicity divergen | B2/L1/L2; tidak memanggil API mobile |
| A03 | Opaque256bit + digest + member PK/exact NIK binding; link48h usulan, OTP5m; consume hanya pada atomic commit | encrypted NIK/JWT tidak menghilangkan server lifecycle; readable JWT/Base64 bukan encryption |04,11;48h adalah **NEEDS BUSINESS APPROVAL**, bukan approved default |
| A04 | Request+token+database notification+audit+outbox satu business-schema InnoDB connection | console audit client/database terpisah tidak digunakan sebagai satu-satunya success audit | N6; local metadata C0-DB1; production boundary unverified |
| A05 | Owner defines duplicate key/status scope, then all-writer prevention required; public-only precheck and operator review supplementary | strict global protection requires every writer to participate; permanent NIK-only unique blocks legitimate history | U-01;16; D-DUP business semantics still pending |
| A06 | Signature immutable private, consent snapshot; public-origin authorization PDF from Next snapshot, CI2 processor; enforced proof/print prerequisite when required | overwrite profile/public storage rejected; manual handoff alone cannot satisfy U-01 prerequisite enforcement | L5/B7; D-PDF B-12/O-06 pending |
| A07 | Verifikasi ke kontak master dengan provenance owner-verified; reuse provider account melalui adapter Next.js bila active/suitable dibuktikan | `users.is_phone_verified=1` sendiri belum cukup; mobile OTP endpoint tidak di-reuse | C0-OTP1/2; no provider activation or messages sent |
| A08 | Native process routes/capabilities/writer hanya CP3, OFF sepanjang CP1/CP2 | proxy approval CI2 dari Next tanpa validasi payroll tidak dipilih; human handoff yang authenticated | L1/L4 parity+production operational reference belum final |

Arsitektur komponen/API/file graph final ada di12, form/policy di10, token/threat model di11. Existing domain/application/web layering tetap; tidak membuat service/microservice baru. Proposal `nx_public_submission_link/event/throttle` pada05 masih review-only, membutuhkan amendments09 (contact provenance dan PDF metadata). Seluruh nama `nx_*`, capability dan flag baru **PROPOSED**, bukan tabel/perilaku existing.

## 2. Explicit writer ownership matrix

`R` read, `I` insert, `U` update, `X` external artifact. Semua Next write di bawah future proposal; saat checkpoint0 belum ada writer fitur ini.

| Operation | Current owner | CP1/CP2 proposed owner | Tables / responsibility | Conflict / dependency / compatibility | CP3 transition |
|---|---|---|---|---|---|
| Create application MOBILE | Laravel B2 | tetap Laravel | I `trans_simpanan_pengajuan` OPEN; mobile profile/file/notif side effects tetap | no shared lock/pending enforcement; mobile API unchanged; doc_no namespace compatibility I-09 | tetap Laravel create |
| Create application PUBLIC | belum ada | Next new route | I existing request OPEN + aux consume/event + db_notifikasi | no client NIK, no profile/config writes; schema/grants/policy prerequisite | tetap Next create |
| Read/list/detail application | CI2 L1/L2,L4; mobile API own list | CI2/mobile tetap, Next R adapter ditambah | R request+member; join origin via aux PK | legacy listing tanpa filter is_mobile menerima candidate public row; proof source compatible belum runtime verified | Next R tetap |
| Edit application | Laravel `update_pengajuan_simpanan_mobile` B10 | existing mobile behavior stays; **no public edit endpoint after commit** | U jenis/old/new/month/year by doc_no (limit1) | handler tidak membatasi own NIK/status/origin; public body fingerprint mismatch harus detected; cross-channel write protection prerequisite | review legacy edit ownership before native process; no hidden takeover |
| Cancel application | Laravel `delete_pengajuan_simpanan_mobile_detail` B10; CI2 reject/delete | existing paths tetap untuk origin lama; public cancel via operator legacy decision, bukan token reopen | U request.doc_status=REJECTED; L4 can physicalDELETE | source lacks origin/status/identity boundary in B10; no claim public immutable globally; D-MUTATION mandatory | managed reject only after scoped transition approved |
| Approve application | CI2 L1/L4 | **CI2 only**, chosen operator workflow | U request.status, U/I active master, U member.sim_sukarela | both variants must not race on same request; canonical operational usage evidence pending | one Next processor after parity+disable conflicting legacy paths/config writers |
| Reject application | CI2 L1/L4 | **CI2 only** | primary L1 status only; no payroll config update | no Next transition route enabled; audit observed external state is not exact legacy actor audit | one Next processor after CP3 |
| Update payroll config | CI2 approval/manual configuration | **legacy only** | `m_simpanan_aktif`, `m_anggota.sim_sukarela` | no Next grant UPDATE on these fields at CP1/CP2; future payroll cutoff issue remains | narrowly scoped approved Next process grants; other master ownership must be coordinated |
| Create database notification | Laravel B2; dashboard reads legacy | Laravel mobile + Next public by command | I `db_notifikasi`, recipient/config server-owned | explicit mandatory columns, no duplicate public notif on retry, title/url widths | unchanged intake ownership |
| Send mail/OTP | legacy synchronous provider calls | legacy unchanged; Next own adapter/outbox | external provider; no business DB atomicity claim | provider contract/credentials/verified contact gate; no calls to Laravel OTP/submit APIs | no dependency on native approval |
| Signature/PDF | mobile PNG public disk/profile; CI2 on-demand PDF current member image | mobile existing unchanged; Next public private PNG+snapshot PDF | X storage; aux reference/hash; no master photo/profile U | legacy public-origin Print would be wrong without approved routing/control; mandatory D-PDF gate | use immutable public proof; preserve mobile print behavior until explicitly migrated |
| Audit history | legacy incomplete, console read audit separate | Next transactional PUBLIC/STAFF/SYSTEM audit; legacy status observations labeled | I aux events; console log best-effort mirror after commit only | no fabricated legacy approver identity/time from mere status poll | native process writes exact attributable transition events |

**Canonical source of truth:** business state = existing request row by PK, payroll config = legacy-owned master; token receipt/origin/consent/signature = auxiliary immutable references; derived Next timeline never rewrites legacy history or invents events.

## 3. Concurrency / duplicate policy selected for approval

Token invariant: at most1 committed application per token, regardless multi-process retries, via row lock+unique aux submission reference. Public channel additionally1ACTIVE link/member/purpose; expired materialization occurs on mutation/worker, GET never consumes.

Business duplicate D-DUP: owner must sign the pending scope/conflict key and terminal release rules B-05. Proposal blocks OPEN/POSTING all types consistent with mobile UI, but this scope is not yet approved. U-01 now requires preventive coordination across all affected writers16; public prechecks and manual conflict reconciliation alone cannot clear activation. No newest-wins, automatic rejection or permanent NIK-only UNIQUE. If unexpected duplicates exist, preserve evidence and stop the affected process for owner resolution, not an automatic cleanup.

If business requires hard global prevention of duplicate intake, Next-only locking cannot meet it. Requires separately reviewed shared DB guard or all-writer coordination. A shared guard must use a verified business key, tolerate periods/edits/rejection, and pass mobile regression; never install speculative trigger/unique constraint. No such guard created now.

Additional mutation risk C0-MUT1: mobile edit/cancel selects decrypted doc_no without ownership/origin/current-status checks in audited handler. Unpredictable public doc_no is not authorization. Read-only fingerprint reconciliation can **detect**, not prevent mutation. **U-01 selects mandatory prevention and excludes operational handling as release substitute.** Controls must cover all writers before the first side effect and preserve whole-command config/header integrity; a late header guard is insufficient C05-ORDER1. Do not disable mobile routes globally. Mechanism not proven; activation BLOCKED, isolated work only under17.

## 4. Approval compatibility matrix and canonical evidence

| Concern | L1 mobile variant | L4 simpanan variant | Required CP1/CP2 behavior | CP3 reference / tests |
|---|---|---|---|---|
| Operational path | mobile API notif URLs point to L1; staging active menu L1 | source exists; no matching staging menu row observed | preferred integration L1; production usage NOT VERIFIED, obsolete NOT PROVEN | operator production menu/config confirmation + dated walkthrough evidence |
| Authorization | staff session + `mobile/Pengajuan_mobile_c` menu | session + `simpanan/Pengajuan_mobile_c` menu | retain actual processor gate; new generator action grant separate | exact permission mapping negative cases S-07; no privilege inheritance from view |
| Status | OPEN/POSTING shown, UI approve/reject, handler arbitrary else status | explicit POSTING, then APPROVED/else; harddelete method | OPEN row; human canonical workflow remains owner | validate pending→APPROVED/REJECTED, guard replay; I-04 |
| Existing master | matches NIK+jenis all statuses, updates all matching doc_no/payroll/status | query active, array comparison branch, update nominal | public submit never changes config | choose signed L1 business outcome; ambiguity blocked, no blind bulk update |
| New master | doc_no/member/group/payroll/start1st month/endDec/status1 | missing doc_no/period in branch | remain legacy responsibility; strict-default issue operator knows | mandatory fields explicit, period parity tests |
| Member config | sim_sukarela (WAJIB sim_wajib) | same | legacy only | correct field updates; no ledger writes |
| Reject | only request status; ajax_delete soft reject | status; ajax_delete harddelete | do not implement competing rejection | status-only + attributable audit; no implicit reversal |
| Transaction/audit | absent explicit tx; truthy-array success defect | absent explicit tx | no claim legacy becomes atomic merely new submit is atomic | new native UoW rollback after every side effect; exact actor and timestamps |
| Listing compatibility | generic existing table, no origin/is_mobile predicate | same entity, behavior differs | candidate public OPEN row readable, tests required | compare same PK/detail/period/amount/print on staging |
| Signature/PDF | detail opens L5 print uses current member foto_ttd | related legacy print dependency | dedicated public snapshot proof handoff required | immutable evidence and approved template; no current-profile substitution |

**Canonical decision:** L1 is the **preferred integration/reference**, supported by routing+staging menu evidence. **Active production canonical is not yet verified; L4 is not declared obsolete.** Production operator must confirm controller/menu/procedure; if they identify L4 as active, return to delta compatibility review, not automatic L1 migration. This blocks native migration; initial production release also needs confirmed handoff workflow, while isolated staging can test preferred L1 without claiming production parity.

## 5. Approval transition and rollback

CP1/CP2 leave CI2 approvals/payroll writers operating. Next links to allowlisted legacy detail URL by server-owned doc_no, opens separate authenticated legacy session; no bearer token in URL and no SSO/session impersonation, no backend approval proxy. Legacy URL cannot carry substitute private signature; public PDF handled separately under D-PDF.

CP3 only: drain pending/inflight approval operations → capture configuration baseline and reconcile source PKs → block both conflicting CI2 process/delete and manual-config paths for migrated scope through approved controls → enable one Next processor → verify side effects and monitoring. No automatic switch in CP1/CP2. Rollback native processor OFF first, reconcile last committed effects, then explicitly authorize legacy ownership restoration. Never erase business rows/consumed links or automatically reverse deductions. Rollback public intake leaves legacy operational and preserves all submitted requests/proof/retry receipts.
