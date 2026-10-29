# 10 — Form Contract and Business Rules / Checkpoint0

21 Oktober 2026, amended22 Oktober CP0.5. Existing facts reference01/02 and evidence B2/B3/B4/M3/M9. **Final recommendation is not approved business policy.** U-01 mandates preventive cross-channel protection16; manual duplicate/mutation/proof handoff is supplementary only. All unproven business limits below use status NEEDS BUSINESS APPROVAL in13. Exact owner questions15; no production member rows queried to infer rules.

## 1. Form contract

| Field | Classification | Source / wire contract | Mandatory / backend rule | Legacy mapping |
|---|---|---|---|---|
| NIK/member | server-derived/read-only, masked display | link.member_id + current exact m_anggota.nik_kar and versioned MAC; **no public NIK/memberId field** | identity exists/unique/exact binding; leading-zero/case/collation-equivalent ambiguity or changed NIK reject | header nik_kar; no LIKE/numeric coercion |
| Member name | server-derived/read-only | m_anggota.nama_kar, masked public after proof | fit50 encoded chars; no users account required | nama/cd_usr snapshot; audit actor PUBLIC not creator |
| Section/Bagian | server-derived/read-only | current m_anggota.bagian resolves active m_bagian row; client `sectionId` echo only | single authoritative match, status1, label fits request100 and legacy charset; mismatch means staff correct master outside public flow | bagian snapshot; **no profile update** public |
| Savings type | server-derived/read-only | literal SIMPANAN SUKARELA, enabled m_simpanan_mobile.status_pengajuan1 | missing/duplicate/disabled master reject; no client selectable type | jenis_simpanan; do not substitute m_jenis_simpanan dropdown |
| Previous deduction | calculated/read-only | m_simpanan_aktif exact NIK+type/status1 |0only if no active config and owner approves enrollment; ambiguous config reject; nearest-rupiah rounding tested vs B3, hash includes original exact decimal | potongan_old server value, never trusted client field |
| New deduction | user-editable | `amountRupiah` canonical ASCII digits string; UI Rp formatting separate | mandatory; integer-rupiah parser, policy min/max/change rules; scientific/decimal/separator/negative input rejected wire | potongan numeric DB-compatible bind; no float business math |
| Payroll month/year | calculated/read-only | server Jakarta calendar + approved cutoff; client echoes startMonth1..12/startYear4digit | must equal server approved period; recheck at submit; formVersion stale409 | awal_potong_bulan padded2, awal_potong_tahun4 |
| Signature | user-editable canvas | multipart signature PNG | required safe decode/re-encode, ink, ≤512KiB/max2048square; preserve immutable proof | ttd opaque key≤100 + aux hash; not profile foto_ttd replacement |
| Consent | user-editable explicit checkbox | consent=true canonical multipart literal, consentVersion | mandatory true; route converts exact wire literal to boolean; require visible approved authorization statement+review amount/periode | encrypted is_payroll legacy field not copied; aux stores version/time/snapshot binding |
| Phone/contact | server-derived, not editable, not disclosed preproof | approved ContactVerificationSource resolves master contact with evidence | valid existing verified contact required; public cannot supply/replace; invalidate if bound contact changes | header phone optional snapshot according owner policy; contact bytes not security authority unless verified |
| Form version | server-derived echo | MAC/hash bound authoritative old/member/section/period/policy/consent versions | unchanged between review and submit or FORM_CHANGED409; re-consent after changed amount/period/version | auxiliary payload hash/receipt binding |
| Receipt/status/doc_no/timestamps | server-derived | generated/link/DB clock, no public override | successful commit only, OPEN at submission; no “saldo bertambah” message | header+aux; receipt is not public read-any-record capability |
| Mobile PIN/GPS/IMEI/gallery; bank/KTP | NOT APPLICABLE to public form | no mobile session/extra login/device permissions | not required by audited create form; don't invent additional financial input | legacy code/API unchanged |

Backend validation always independent of read-only UI. Request unknown identity/oldAmount/status/docNo/purpose/companyId rejected400. Member proof required before form data; no public member-search endpoint. Section read-only/no profile mutation is a deliberate recommendation requiring D-FORM/G4 sign-off because mobile historically writes section/profile.

## 2. Business policy matrix (resolve/recommend explicitly)

| Policy | Verified existing behavior | Final initial recommendation | Status / prerequisite |
|---|---|---|---|
| Minimum deduction | no positive/min rule in B2; FE only nonempty SUKARELA | positive integer rupiah, minimum Rp1 for enrollment/change; zero-stop request handled by existing assisted process until owner explicitly defines public stop flow | NEEDS BUSINESS APPROVAL D-AMOUNT; Rp1 is proposed validation floor, not existing business rule |
| Maximum deduction | no business maximum proven; DOUBLE18,2 storage not business policy | owner supplies explicit per-member/type maximum or explicitly approves no additional business cap; backend technical ceiling also Number.MAX_SAFE_INTEGER and DB precision with stricter effective cap | NEEDS BUSINESS APPROVAL D-AMOUNT; no invented salary% cap; missing explicit max decision failsclosed |
| Increment/rounding | mobile formats integers; backend sanitizes digits; old GET rounds0decimals | integer Rp1 increments; reject fractions; old display nearest-rupiah parity, preserve exact old config in version hash | NEEDS BUSINESS APPROVAL D-AMOUNT; test half values/large amounts |
| Change deduction | WAJIB-only FE increase rule, none for SUKARELA | allow positive decreases and increases; reject unchanged nominal as no-op; no automatic stop-at-zero | NEEDS BUSINESS APPROVAL D-AMOUNT; never import WAJIB rule |
| Eligibility | B2 auth user only; no robust status gate | unique identified member with status AKTIVE, allowed group list owner-specified; unresolved KONTRAK/LUAR BIASA/PENSIUN/RESIGN handled staff, not public; expired employment failclosed pending explicit policy | NEEDS BUSINESS APPROVAL D-ELIG; credit eligibility helper not automatically applicable |
| Active/inactive member | status checked elsewhere, not B2 | reread eligibility at issue/validate/submit; inactive/changed status stops public path without altering master | NEEDS BUSINESS APPROVAL D-ELIG; no GET deactivation write |
| Permitted period | mobile intends next month but December bug; server validates required only | one next-payroll period calculated server-side Jakarta; no retrospective/manual public month selection | NEEDS BUSINESS APPROVAL D-PERIOD |
| Payroll cutoff | no cutoff proven; L1 existing-master approval updates config immediately and preserves period | owner must supply payroll calendar/cutoff and handling if approved after cutoff; no invented day20/25 cutoff; if period cannot be determined safely reject issue/submit | BLOCKED D-PERIOD; next month input alone does not prove future-effective payroll behavior |
| Existing pending | mobile UI blocks count OPEN/POSTING all types; backend create does not | public issue and submit block any preexisting OPEN/POSTING exact member; later allow terminal history under signed rules | NEEDS BUSINESS APPROVAL D-DUP |
| Duplicate application | no DB business-key unique, parallel mobile allowed by source | owner approves conflict key/status/release policy; shared all-writer prevention16 required by U-01; existing unexpected conflicts preserved for owner resolution, no newest-wins/autoreject | NEEDS BUSINESS APPROVAL D-DUP semantics; technical all-writer guarantee BLOCKED pending mechanism/runtime proof |
| Post-submit edit | mobile B10 edits by doc_no without state/owner predicate | public submissions immutable/no edit endpoint; correction via legacy operator reject + newly issued link, consumed token never reopened | BLOCKED protection against other existing writers D-MUTATION; fingerprint detection is not prevention |
| Initial status | OPEN written by B2 | OPEN; CI2 keeps processing responsibility in CP1/CP2 | VERIFIED contract, runtime staging parity pending |
| Approval/reject outcome | L1 changes config on approve; rejection only status | retain canonical legacy process initially; do not add Next payroll writes | RECOMMENDED architecture D-APPROVAL; actual production route confirmation pending |

**Payroll subtlety:** L1 existing-row branch does not write new period_start/end. A requested next-month start can therefore be nominal metadata while current payroll config changes at approval. Public UX must say “Periode pengajuan yang diminta”, not promise payroll execution date until D-PERIOD has source/payroll-owner verification. Do not silently repair approval in CP1.

## 3. Signature / authorization PDF contract

**VERIFIED:** mobile captures PNG signature [M9], backend requires ttd+consent [B2], no PDF generation in create handler. CI2 L5 generates PDF on demand from its template and **current member profile** foto_ttd/bagian/jabatan/no_telp, hardcoded public smartkkisi storage. Existing request.ttd alone does not make that PDF correct. Required PDF template reference: `L/application/modules/simpanan/views/print_pengajuan_simpanan_pdf.php`, invoked by `simpanan_c::print_pengajuan_pdf` and L3 detail button.

**Recommendation D-PDF:** preserve mandatory signature and available authorization PDF. Public-origin PDF generated after commit from immutable submitted member/type/old/new/requested-period/consent/signature snapshot, using owner-approved layout/content based on L5; template version/hash attached. Blank/non-readable/unsupported signatures rejected before commit; no signature-gallery/public URL reuse. Signature metadata must include all template fields that are actually required; additional profile fields such as job title/contact must be fetched server-side and snapshotted only after owner data-minimization approval, never taken from public input. Record canonical consent data as part of submitted snapshot, not live profile joins.

PDF job failure: application remains OPEN/CONSUMED, status ARTIFACT_PENDING/FAILED shown internally; retry renderer via outbox using submission+template dedupe. Do not emit success “PDF siap” before object/hash stored. Private signature/PDF routes require staff capability and access audit; no raw signed storage URL in public response. Where proof READY is mandatory before processing, U-01 requires enforced routing/readiness, including direct legacy bypass16. Unchanged CI2 cannot enforce it as observed; manual handoff alone is insufficient. B-12/O-06 must resolve this integration before activation.

Compatibility choices:

| Option | Decision / condition |
|---|---|
| Keep CI2 approval, public proof/print via Next snapshot | preferred CP1/CP2; owner approves print ownership, template and enforceable routing/readiness when prerequisite; manual procedure only supplementary; minimal protected PDF API belongs CP1 |
| CI2 PDF unchanged must print every public-origin record correctly | **BLOCKED** under private/no-profile-overwrite design; needs separately approved artifact reader integration or ownership change; do not claim compatibility |
| Put signatures in existing public path/overwrite member photo | rejected default: exposes signature, changes historic/mobile evidence and master ownership |
| Omit signature or PDF to expedite | rejected; signature mandatory by backend; PDF review/print capability preserved even though generation is not part of current submit method |

Retention: link tombstone90d recommendation; financial consent/signature/PDF retention period requires owner policy before destructive cleanup. Disable proof deletion until approved. Object lifecycle must preserve referenced committed evidence across retries/backups/rollback; orphan cleanup only for proven-unreferenced objects after safety delay. No retention duration invented as legal requirement.

## 4. Frozen request contract and validation examples

Public multipart request contains only amountRupiah, sectionId, startMonth, startYear, consent (literal true), consentVersion, formVersion, signature. Headers bearer+X-Public-Proof+Idempotency-Key. Internal identity/contact/old period/type resolved server-side. Backend rejects grouped value `1,000` wire (UI may format it), exponential notation, signed value, unapproved fraction/range, altered section/period, extra NIK and stale form context. Existing old fractional config triggers approved rounding/parity decision, not silent digit-stripping.

Payload hash includes canonical submitted snapshot+signature content hash+consent/template/policy versions; external mutable profile changes after commit do not change proof. Exact retry returns original minimal receipt even proof later expires, without disclosing form/profile. Changed payload/new key with consumed link gives409. Consent revalidated on version/authoritative period/amount change before committing.

Test gate: F-03/04/10/11, I-04/06/07/08/09 and C0-T02/T03/T04 (defined12), including approved-boundary fixtures for min/max/zero/decrease/cutoff and source encoding. All future feature tests remain NOT RUN.
