# Requirements — Public Secure Link Simpanan Sukarela

Business objective: anggota dapat mengajukan potongan SUKARELA melalui browser tanpa login mobile, dengan identity/data integrity dan approval existing. Roles: operator generator/revoker, processor, viewer, public member, system dispatcher. Non-goals: refactor KOSIPA/POS/payroll generator, mengubah mobile/API, atau rollout produksi pada audit ini.

**Semua SHALL fitur berikut adalah target desain, belum implementation; audit/readiness requirements divalidasi pada checkpoint0.** Current facts ada di dokumen 01/02. Policy usulan dan metadata produksi harus ditutup melalui G1–G9.

| ID | EARS / rule | Design | Task | Scenario |
|---|---|---|---|---|
| REQ-001 | WHEN desain dibuat, THE SYSTEM SHALL memetakan semua field/API/backend/approval berdasarkan actual evidence dan menandai unknown. | 01,02,evidence | P0-01 | DOC-01 |
| REQ-002 | WHEN operator authorised memilih anggota eligible, THE SYSTEM SHALL membuat satu ACTIVE link berexpiry, binding identity dan URL random sekali tampil. | 05 §3,§6.1 | CP1-T03 | F-01 |
| REQ-003 | WHEN browser membuka link, THE SYSTEM SHALL memvalidasi state/purpose/deadline/member tanpa consume dan tanpa login mobile. | 04 §1–4;05 §3 | CP1-T03 | F-02,S-01 |
| REQ-004 | WHEN proof valid, THE SYSTEM SHALL menyajikan identity masked, bagian/jenis/old/periode authoritative, nominal/signature/consent sesuai audit. | 01 §2;05 §7 | CP1-T01,CP1-T06,CP2-T01 | F-03,F-04 |
| REQ-005 | WHEN public form submitted, THE SYSTEM SHALL memakai handler Next.js baru dan existing business table tanpa memanggil API mobile. | 05 §1,§3,§5.1 | CP1-T05 | F-05,I-01 |
| REQ-006 | WHEN submission commits, THE SYSTEM SHALL atomically persist application/required notification/audit dan consume token tepat sekali. | 04 §5;05 §5.3 | CP1-T02,CP1-T05 | S-04,I-02 |
| REQ-007 | WHEN concurrent/ambiguous retry occurs, THE SYSTEM SHALL membuat maksimal satu application per link dan memberi receipt untuk exact retry. | 04 §5–6 | CP1-T05 | S-04,S-05,I-03 |
| REQ-008 | WHEN operator membaca pengajuan, THE SYSTEM SHALL menampilkan existing application, origin dan history dengan permission server-side. | 05 §2–3,§7 | CP2-T02,CP3-T02,CP1-T06,CP2-T01 | F-06,S-07 |
| REQ-009 | CP3 only: WHEN processor approve/reject, THE SYSTEM SHALL mempertahankan outcome konfigurasi legacy dalam guarded lifecycle tanpa processor paralel. | 02 §2–3;05 §2 | CP2-T02,CP3-T02 | F-07,I-04 |
| REQ-010 | WHEN authorised revoke/history requested, THE SYSTEM SHALL enforce terminal states dan menyajikan metadata tanpa secret. | 04 §4;05 §3 | CP1-T03,CP1-T06,CP2-T01 | F-08,S-07 |
| REQ-011 | WHEN lifecycle/business transition succeeds, THE SYSTEM SHALL record attributable audit dan durable operator notification intent tanpa leaking PII. | 04 §9;05 §5 | CP1-T05,CP1-T07 | I-05,S-09 |
| REQ-012 | WHEN form enters validating/ready/invalid/expired/used/revoked/submitting/success/error, THE SYSTEM SHALL menampilkan state mobile-first accessible yang sesuai. | 05 §7 | CP1-T06,CP2-T01 | U-01,U-02 |
| REQ-013 | WHEN pemegang link membuktikan kontak existing, THE SYSTEM SHALL mengizinkan scoped submission tanpa akun/session/PIN mobile. | 04 §3;05 §3 | CP1-T04 | F-09,S-10 |
| REQ-014 | WHEN submission baru dibuat, THE SYSTEM SHALL tetap dapat dibaca workflow legacy dan Next.js tanpa breaking existing mobile. | 03 §4;05 §2,§5.1 | CP1-T05,CP2-T02,CP3-T02,CP1-T08,CP2-T04,CP3-T04 | I-01,I-04,R-01 |
| REQ-015 | WHEN desain diserahkan, THE SYSTEM SHALL menyediakan backlog, traceability, enam diagram, tests dan rollout gates tanpa implementasi. | README;06;07 | P0-01,CP1-T08,CP2-T04,CP3-T04 | DOC-01,DOC-02 |
| BR-001 | WHEN public link digunakan, identity SHALL berasal dari member PK/exact NIK binding; ambiguous/collision/changed binding SHALL ditolak. | 04 §1;05 §5 | CP1-T01,CP1-T03,CP1-T05 | S-03,F-10 |
| BR-002 | WHEN create requested, purpose/jenis SHALL fixed SUKARELA, old/section/periode SHALL authoritative, tanpa implicit master/profile/saldo writes. | 05 §2,§5.1 | CP1-T01,CP1-T05 | F-03,I-06 |
| BR-003 | WHEN pending OPEN/POSTING exists, public create SHALL reject; global mobile concurrency SHALL tidak diklaim selesai tanpa koordinasi writer. | 04 §5;03 G6 | CP1-T01,CP1-T05,CP1-T08,CP2-T04,CP3-T04 | F-10,I-07 |
| BR-004 | WHEN APPROVE occurs, payroll config SHALL berubah sesuai L1; REJECT SHALL tidak mengubah config; ambiguity SHALL block. | 02 §2;05 §2 | CP2-T02,CP3-T02 | F-07,I-04 |
| BR-005 | WHEN policy belum disahkan, zero/decrease/max/eligibility/cutoff SHALL fail closed, tanpa meniru rule WAJIB untuk SUKARELA. | 03 G6;05 §1 | P0-01,CP1-T01 | F-11 |
| VAL-001 | WHEN request parsed, strict types/unknown fields/size/content SHALL enforced; amount canonical integer rupiah dan policy range valid. | 04 §7;05 §3 | CP1-T01,CP1-T05 | F-04,S-08 |
| VAL-002 | WHEN period computed, Jakarta calendar SHALL handle Desember/leap/day rollover; stale context SHALL require refresh. | 01 §2;05 §5.1 | CP1-T01,CP1-T05 | F-11 |
| VAL-003 | WHEN signature/consent submitted, decoded safe PNG, mandatory ink, affirmative consent/version SHALL verified backend. | 04 §7;05 §3 | CP1-T05,CP1-T06,CP2-T01 | F-04,S-08 |
| SEC-001 | WHEN token issued/stored, CSPRNG256+unique digest SHALL digunakan, no raw NIK URL payload/readable-JWT encryption claim. | 04 §1,§8 | CP1-T03 | S-02 |
| SEC-002 | WHEN internal command occurs, active identity link+menu upper bound+explicit action grant+CSRF SHALL enforced server-side. | 05 §3 | CP1-T03,CP2-T02,CP3-T02 | S-07 |
| SEC-003 | WHEN public POST occurs, bearer/proof per state, exact Origin/no CORS, purpose dan field binding SHALL checked. | 04 §3,§7 | CP1-T04,CP1-T05 | S-03,S-06 |
| SEC-004 | WHEN abuse/OTP failures occur, shared quotas dan safe errors SHALL apply tanpa enumeration/link consumption. | 04 §3,§7 | CP1-T02,CP1-T04 | S-01,S-10,S-11 |
| SEC-005 | WHEN public assets/responses/logs processed, no-store/no-referrer/HTTPS/token redaction/no third-party/no preview consume SHALL enforced. | 04 §2,§7 | CP1-T03,CP1-T06,CP2-T01,CP1-T07 | S-09,S-12 |
| SEC-006 | WHEN proof file stored/accessed, immutable private object SHALL dibuat sebelum commit; authenticated view only; old signatures never deleted. | 05 §5.2;04 §5 | CP1-T05,CP2-T02,CP3-T02 | S-08,I-08 |
| NFR-001 | WHEN scale/retry/failure tested, one-link invariant SHALL hold across processes dengan bounded locks/retries dan durable controls. | 04 §5;05 §5.3 | CP1-T05,CP1-T08,CP2-T04,CP3-T04 | S-04,I-02 |
| NFR-002 | WHEN DB client enabled, startup guard SHALL validate dedicated grants/target/pool measured budget dan approved transport/storage. | 05 §5,§8;03 G7 | CP1-T02,CP1-T07 | O-01 |
| OBS-001 | WHEN audit appended, PUBLIC/STAFF/SYSTEM attribution SHALL explicit; success audit SHALL transactional tanpa NIK/token/amount. | 04 §9;05 §5 | CP1-T02,CP1-T05,CP2-T02,CP3-T02 | S-09,I-05 |
| OBS-002 | WHEN delivery/DB ambiguity fails, metrics/alerts/requestId dan durable retry SHALL tersedia tanpa repeating business submission. | 04 §9;05 §8 | CP1-T07 | I-03,I-05,O-02 |
| MIG-001 | WHEN schema proposed, only aux lifecycle/event/throttle dan reviewed indexes SHALL planned; no duplicate business tables/auto production schema writes. | 05 §5 | CP1-T02 | O-01,DOC-02 |
| MIG-002 | WHEN native process enabled, scoped single-writer cutover dan mobile compatibility SHALL proven; ownership refinement SHALL signed. | 03 §4;05 §2 | P0-01,CP2-T02,CP3-T02,CP1-T08,CP2-T04,CP3-T04 | I-04,R-01,O-03 |
| MIG-003 | WHEN rollback occurs, writes SHALL stop while committed requests/consumed evidence remain, no production deletion/automatic financial reversal. | 05 §8;06 | CP1-T07,CP1-T08,CP2-T04,CP3-T04 | O-03 |
| REQ-016 | WHEN initial public capability planned, THE SYSTEM SHALL keep CI2 as sole approval/payroll writer in CP1/CP2 and defer native migration to CP3. |08 ownership;12 phase/API | CP1-T08,CP2-T04,CP3-T03 | C0-T07,C0-T08 |
| REQ-017 | WHEN database readiness reported, THE SYSTEM SHALL distinguish local metadata, snapshot/source and production evidence, require effective writer/trigger/capacity verification. |09 report/09A;13 decisions | P0-01,CP1-T02 | C0-T01 |
| REQ-018 | WHEN link/verification policy finalised, THE SYSTEM SHALL mark48h/OTP defaults unapproved until accepted and require verifiable current contact provenance/provider readiness. |11 policy;13 | P0-03,P0-04,CP1-T04 | C0-T05 |
| REQ-019 | WHEN public signature/PDF handed to unchanged CI2, THE SYSTEM SHALL preserve immutable proof, approved template and explicit print-compatibility controls. |10 §3;09 amendments;12 | P0-05,CP1-T07,CP2-T02 | C0-T04 |
| REQ-020 | WHEN checkpoint readiness evaluated, THE SYSTEM SHALL issue independent Go/No-Go with owners/clearance actions and no assumed approval of mandatory decisions. |12 §7;13 register | P0-07,CP1-T08,CP2-T04,CP3-T04 | DOC-03 |

Enforcement: BR/VAL/SEC pada application/domain dan infrastructure trust boundary; DB constraints/locks enforce one-link invariant. UI validation hanya kenyamanan. Tidak ada fabricated tenant_id: KOSIPA cooperative-wide, deployment binding server-side, client companyId ditolak.

Implementation approval, source-schema equivalence, signed policy, ownership dan production enable merupakan gate terpisah. Menutup audit tidak berarti menutup gate tersebut.
