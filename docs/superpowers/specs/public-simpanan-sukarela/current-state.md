# Current state — public-simpanan-sukarela

**VERIFIED FACT:** mobile Flutter → Laravel smartkkisi creates OPEN request + profile/signature/notification; KOSIPA CI2 processes it into payroll configuration. TOKO lokal bukan approval implementation. Next.js KOSIPA read-only, belum pengajuan/process/public endpoints.

Detail current flow, roles, fields, database, mail/file dependency, defects dan source references: [01 mobile](01_AUDIT_EXISTING_MOBILE_FLOW.md), [02 legacy](02_AUDIT_LEGACY_KOSIPA_FLOW.md), [evidence](evidence.md). Tidak ada queue/outbox eksplisit pada handler existing; mail synchronous. DDL snapshot InnoDB, runtime schema/trigger unknown. Source cache/hash dicatat tanpa member records atau secrets.

Business requests menggunakan OPEN/POSTING/APPROVED/REJECTED strings (bukan DB enum); lifecycle tidak sama dengan token lifecycle. Tidak ada bukti handler menambah saldo/mutasi; konfigurasi potongan dan ledger terpisah. Domain helper credit eligibility dan generic document-state tidak boleh dianggap policy simpanan.

Checkpoint0 current evidence21 Oktober 2026: actual local SELECT-only metadata09A (not production), preferred L1 supported by source+staging menu but production canonical unverified. Newly targeted evidence reveals phone verification/provider code exists and mobile edit/cancel writes by doc_no; see evidence C0-* and13 blockers. CP1/2 ownership leaves all approval/payroll writes legacy; native approval is CP3 only. No application changes.
