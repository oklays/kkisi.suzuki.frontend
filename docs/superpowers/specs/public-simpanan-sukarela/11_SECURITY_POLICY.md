# 11 — Token lifecycle decision record and security policy

**Implemented local security boundary29 October2026:** Registered approved Policy v1.0.0 is used unchanged. Opaque token256bit/48h, HMAC token/code/proof digests, OTP6digits/5m/5failures, shared member/link resend limits and15m proof are persisted. Contact version also binds actual destination; readonly reference, canonical deduction and payroll calendar are rechecked under locks. A client-echoed review fingerprint prevents another tab from silently replacing the member-reviewed facts. AES-GCM binds immutable evidence/artifacts to opaque references; PNG is decoded/re-encoded and PDF uses snapshot-only input. Capture provider and operator key are LOCAL_SYNTHETIC only; all nonlocal HTTP/database activation is rejected. No independent-factor/MFA claim is made for same-contact link+OTP. Production role/provider/storage/edge configuration remains unavailable, not implicitly accepted through local tests.


21 Oktober2026, amended22 Oktober CP0.5. Architecture RECOMMENDED; business/operational defaults below **NEEDS BUSINESS APPROVAL**, not approved settings. U-01 now requires tested preventive cross-channel controls16; no operational exception substitute. B-07/09/10 in15 explicitly require TTL/contact/proof-assurance decisions. This supersedes04's24h/max72h proposal with48h initial recommendation. Reference [OWASP token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): random tokens, expiry, protected storage and single use; detailed KOSIPA limits below are proposals, not OWASP mandates.

## 1. Token policy decision table

| Item | Final recommendation | Status / enforcement |
|---|---|---|
| Generation | Node randomBytes32→canonical43char base64url; unique SHA256 digest of raw32bytes | RECOMMENDED technical decision; no Node crypto in domain |
| URL | configured HTTPS origin `/pengajuan/simpanan-sukarela#t=<opaque>`; no NIK/name/memberid | RECOMMENDED; scrub fragment after memory capture, no token in RSC props/storage/cookie |
| At rest | token digest only, stable member PK+purpose+versioned exact-NIK HMAC; no plaintext raw secret | RECOMMENDED; encrypted volumes/backups, scoped DB access; NIK still legacy-owned protected data |
| Expiry | default 48h, shortening allowed1..48h; no extension on open/OTP/retry | NEEDS BUSINESS APPROVAL D-TTL. Two-calendar-day sharing window vs longer leak window; no weekend/business-day extension; more conservative24h alternative if owner wants; no auto max72h |
| Purpose | fixed SAVINGS_DEDUCTION_SUKARELA | verified purpose need, proposed constant; reject other purpose context |
| ACTIVE capacity | one public ACTIVE member+purpose; not global business NIK unique | RECOMMENDED public-channel constraint only |
| Revoke | explicit authorised operator, reason code; terminal; no application deletion | RECOMMENDED; repeated revoke idempotent; CONSUMED conflict |
| Opened | not consumed, not promoted/downgraded; no business state OPENED | RECOMMENDED; opt-in non-PII access telemetry never source of lifecycle/identity |
| Consumed | request/notif/audit/outbox+conditional consume commit atomically | RECOMMENDED; no consume on GET/HEAD/validate/OTP/file staging |
| Replay | saved receipt for exact key+normalized payload; different key/payload→409 | RECOMMENDED; original token still authenticates minimal receipt, not identity/form |
| Retention | tombstone90d proposal; financial proof retention separate owner decision | NEEDS BUSINESS APPROVAL D-RETENTION; financial deletion jobs OFF |

CREATED only transient secret generation before commit; persisted lifecycle ACTIVE→CONSUMED/EXPIRED/REVOKED. Deadline EXPIRED can be effective without GET DB mutation. CONSUMED wins over later expiry; revocation cannot unconsume; technical failure before commit keeps ACTIVE unless deadline passed/revocation won race. Reissued link is new random record; never reactivate old link.

## 2. Contact trust and existing infrastructure findings

**VERIFIED source C0-OTP1:** `B/app/Http/Controllers/api/v1/auth/PhoneVerificationController.php::{check_phone,verify_phone,verify_phone_new}` sends OTP to request phone after temporary-token user lookup; successful verification sets `users.phone` and `is_phone_verified=1`. This proves a code path exists, not that the flag is current authoritative KYC. Audited methods use4digit rand code and lack an explicit expiry/attempt check on lookup; no contact-verification timestamp/provenance field in local users schema. Do not copy this lifecycle or invoke these mobile endpoints.

**VERIFIED C0-OTP2:** `B/app/CPU/sms_module.php::send` has configurable Twilio/Nexmo/2factor/msg91/releans branches; `two_factor` actually calls Fonnte HTTP endpoint, so a configuration label does not identify delivery provider reliably. Source has unbounded cURL timeout in that branch. Configuration values, active branch, provider contract/sender/template, quotas, secrets and live delivery **not inspected/verified**. `ForgotPassword` reset OTP handlers are password/PIN-reset-specific; not a safe public-payroll identity service.

**Final trust recommendation D-CONTACT:** member master identity = stable m_anggota PK/exact NIK; contact candidate = existing m_anggota.no_telp resolved server-side. A **separate verifiable owner-approved current contact confirmation** is mandatory before link activation (e.g. existing reviewed KYC record or supervised identity check with reference). Link metadata binds contact MAC, evidence ref, method/version, timestamp and verifier staff identity. No assumed existing KYC table/API: the proof source/workflow must be provided and reviewed. `users.phone/is_phone_verified` may be supporting evidence only after exact unique identity/contact match and currency verification; no default trust from the boolean alone.

Operator confirmation without approved/verifiable reference cannot set VERIFIED automatically. Missing/invalid contact, mismatch with source, missing provenance or changed bound contact → failclosed, no OTP/form PII. Staff corrects/verifies contact through existing authorised membership process, then issues new link. Public opener cannot enter another number; no date-of-birth/NIK knowledge shortcut. This design supports members without mobile accounts once contact evidence exists.

**Provider recommendation D-PROVIDER:** reuse the actually approved existing provider account/sender if owner confirms capability and sandbox delivery; implement a narrow server-side Next adapter calling provider directly with scoped credentials/timeouts. No Laravel submit/OTP proxy, no copying mobile keys/session tokens, no new provider spend assumed. Without suitable account/provider evidence, verification remains BLOCKED.

Alternatives explicitly requiring approval: pre-enrolled independent authenticator, or assisted staff verification before issue with attributable evidence and a separately reviewed submission-authorisation mechanism. Neither is silent fallback; no bearer-only downgrade. Link+OTP both over same WhatsApp account are **not independent MFA**. SMS to same phone also has correlated device/SIM risk; stronger independence needs a separately enrolled factor/process. See [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

## 3. OTP/proof lifecycle and delivery recovery

| Control | Proposed value / behavior |
|---|---|
| OTP |6digits from secure random, TTL5m capped link deadline; HMAC(code+link+challengeid) with versioned secret, never plaintext DB/log |
| Attempts |5/challenge; atomic failed-attempt counter, fixed challenge TTL; lock challenge, not consume main link |
| Resend | ≥60s; ≤3/15min/link and ≤5/member/hour + IP/global quota; new challenge invalidates previous; verified proof cannot be silently revoked by unauthorised repeated resend |
| Proof | random256bit, digest at rest, expires min15m/link deadline; bound link+contact version; header X-Public-Proof, memory only |
| Request | explicit human action, token valid; no OTP from link-preview GET/JS validate; no arbitrary recipient |
| Verification | bearer+challenge+code, Origin+quota; code compare constant-time; challenges single use and purpose scoped |
| Successful submit | proof checked under final transaction/deadline; consume clears OTP/proof secrets; immutable receipt remains |

Challenge request: bounded quota → create challenge+MAC in short transaction → commit → send code from memory outside DB lock with5s provider timeout and challenge delivery idempotency key if supported. Success response202contains challenge metadata only. **No plaintext OTP in notification outbox.** Definite provider failure invalidates challenge under guard, returns503 and main link remains ACTIVE; quota/resend boundaries remain enforced. Ambiguous timeout retains challenge until TTL and returns delivery-pending metadata if known, never claims delivered; explicit resend creates new code after cooldown. Process death/response loss needs metadata lookup by request idempotency key then user-driven resend; never promise durable automatic delivery retry when code was not persisted. If durable OTP resend is later required, separately review encrypted short-lived payload/key management; not silently store plaintext.

Business notification/PDF outbox has durable payload references and may retry after commit; unlike OTP code it contains no short-lived secret. External delivery may be at-least-once unless provider idempotency guarantees checked; duplicate business requests are still prevented per token.

## 4. Threat model

| Threat / asset | Trust boundary / control | Residual risk / gate |
|---|---|---|
| Forwarded/leaked link | fragment, redaction, short expiry, secondary verified contact proof | recipient can forward OTP/device shared; D-CONTACT/D-PROVIDER and residual acceptance |
| Identity manipulation/NIK enumeration | bind PK/exact NIK MAC+purpose server-side, strict body allowlist, no public member lookup | ambiguous legacy identities block; no numeric/LIKE resolution |
| Contact flag stale/weak registration | provenance before activation, current-value MAC rechecked on issue/verify/submit | no existing trusted verifier confirmed; mandatory blocker |
| Token replay/concurrent use | real InnoDB row lock+unique link receipt+conditional consume | tests across processes needed; no in-memory mutex claims |
| Cross-channel duplicate/edit/cancel/process | approved business key/state rules + tested all-writer preventive controls before first effect and coherent whole-command transaction16; pending check/monitoring supplementary | U-01 mandatory; mechanism/runtime proof absent, D-DUP/D-MUTATION BLOCKED; no operational exception |
| CSRF internal | existing session+Origin+CSRF guard, explicit action grants | view/menu alone insufficient; no superuser shortcut |
| CSRF public | nonambient bearer/proof headers, exact Origin/FetchMetadata, no CORS; multipart capped | stolen bearer+proof not stopped by CSRF; private device advice doesn't replace controls |
| SQL/XSS/file attack | parameterized queries/fixed identifiers, escaped UI, safe PNG decoder+reencode+pixel/byte limits | decoder/dependency/storage choice must pass security tests |
| Preview/scanner | GET/HEAD generic shell, validate read-only, no automatic OTP/consume | JS scanner may validate but cannot cause business write |
| Token/PII logs/cache | no-store/no-referrer/noindex, CSP self, no third-party analytics/remote resources; ingress/APM/header redaction | chat provider/browser can see original message; document residual risk |
| Insider misuse | active identity link+legacy menu upper bound+explicit approved action policy; one-time secret display; audited proof access | production role/policy not approved; separate staff authority for contact verification if owner requires |
| Partial commit/lost response | atomic business set + saved receipt, bounded whole-tx retry, authoritative outcome lookup | external storage/mail/PDF separate; never reopen link on timeout |
| OTP flood/rate bypass | shared atomic counters/HMAC IP keys, trusted proxy IP only | not per-process memory; provider budget and abuse monitoring required |

## 5. Endpoint rates, headers and logging

Proposed quotas: validate30/IP/min, public submit5/link/min+20/IP/min; internal generate20/operator/hour, revoke30/operator/hour; operator reads/search60/operator/min; OTP request/verify limits above plus provider/global ceiling. Verify also ≤20/IP/min. CP3 transitions10/operator/min (proposed). Exact rate values require business/operations approval and multi-instance test; counters survive restart. Request sizes public JSON2KiB/internal4KiB, multipart640KiB total/signature512KiB. Limit streamed bytes even missing/fake Content-Length.

Every page/API/error/receipt/private artifact response: Cache-Control no-store/private, Referrer-Policy no-referrer, noindex/noarchive, nosniff; HTTPS canonical origin, HSTS after domain readiness, CSP frame/object/base restriction and local resources only. No mobile/geolocation permissions. Token/proof/OTP absent in logs/traces/analytics, query strings, browser storage, audit or screenshots. Error stable code/requestId no DB/stack/member fields; preproof no masked contact that permits enumeration.

Audit actors STAFF/PUBLIC/SYSTEM explicit; success insert co-located transaction; denied attempts sanitized separately. Legacy status polling can append `legacy.status.observed` with observed_at, not invented legacy approver/approved_at. No real OTP/provider dispatch performed in checkpoint0.

Recovery: clock deadlines checked DB UTC, business period Jakarta; rotation versioned keys, retain verification keys only approved active-link/proof horizon; failclosed missing key, revoke/reissue securely. Restore backup preserves consumed tombstones and evidence. Disable new issue/submit/OTP during rollback while maintaining primary-authoritative receipt lookup. Do not expose full member/form again from consumed token.
