# Change-impact analysis

Rincian gap dan keputusan: [03](03_CROSS_SYSTEM_GAP_ANALYSIS.md). Semua perubahan di bawah **proposal**, bukan implementasi.

| Area | Dampak | Risiko / kontrol |
|---|---|---|
| Frontend | internal link list/detail dan form public sibling console | no console/member login; shared visual tokens, sensitive data gated OTP |
| Backend | thin route → app use case → port → adapter, new submission | tidak memanggil mobile API; validation authoritative dan strict |
| Database | existing request/notification + aux token/audit/outbox co-located | same connection InnoDB; current DDL gate; no duplicate business tables |
| Identity/RBAC | add mobile request view/create/revoke/process caps | active identity link + menu upper bound + explicit action policy; view ≠ write |
| Tenant | cooperative-wide KOSIPA | no request companyId; same cooperative configured server-side, NIK exact |
| Queue/worker | durable mail outbox pada event table, delivery retry | no external call dalam business transaction; configured recipient; no provider needed just to commit |
| Security | bearer + OTP + signatures + PII URL/log threats | digest; no analytics; CSRF split by auth model; private immutable proof |
| Legacy/mobile | new origin/namespace, single approval processor | global mobile autocode parity; no mobile/API edits; ownership review G2/G3 |
| Mock/synthetic | E2E fixtures belum request/master lengkap | add schema-equivalent sanitized fixtures after approval; mock belum live integration |
| Infra/deploy | private storage, optional provider adapter, writer pool, log controls | pool budget guard, flag OFF, no rollout as part audit |
| Observability | link/business transitions + success/denied/failure, outbox lag | audit without NIK/token/signature/phone; public actor separate from staff |

Blast radius dibatasi Pengajuan Potongan SUKARELA. Tidak ada refactor loans/POS/payroll generation/master membership. Tidak ada asumsi existing mock/live adapter dapat menulis. Rollback disables writes and preserves submitted business records/consumed tombstones; approved payroll change tidak boleh dihapus otomatis.

Checkpoint0 refinements:08–13 split rollout into3phases. CP1/CP2 impact excludes native payroll writer; CP3 separate privileged account/cutover. New source risks include mobile edit/cancel overriding public rows and weak/undated phone-verification provenance. Private immutable encrypted proof snapshot and public PDF compatibility are required artifacts, not omitted scope. Live local schema evidence differs in indexes from snapshot and has strict SQL mode; no production equivalence asserted.
