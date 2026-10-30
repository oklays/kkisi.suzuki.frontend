# 11 — Cutover and rollback plan

Status: **PLAN ONLY.** No production deployment, production write access or production data change is authorised by this spec (PRD §11.1, §13).

## 1. Principles
1. Gradual, per feature group (rows of [04 §4](04_DATABASE_WRITE_MAPPING.md#4-write-ownership-matrix-per-feature)), never per user or per branch.
2. Exactly one writer per feature at any time (BR-117). The switch is two-sided: legacy controller off (FD-03 data switch) **and** Next.js flag on — in that order; rollback in reverse order.
3. Next.js writes legacy-compatible rows (REQ-142), so rollback never needs data conversion.
4. A passing build is not readiness. Each feature passes the eight gates below.

## 2. The eight activation gates (PRD §11.1)

| # | Gate | Evidence required |
|---|---|---|
| 1 | Functional parity | characterization + E2E green; every legacy write path of the feature covered (02A rows) |
| 2 | Financial invariants | domain/repository tests for INV-xx of the feature; reconciliation report class (b)/(c) = 0 |
| 3 | Permissions tested | security matrix (08 §6) green for the feature's commands; real grants prepared (FD-16) |
| 4 | Database compatibility | staging with production definitions (B1); legacy pages + procedure read Next.js rows (compatibility tests) |
| 5 | Write ownership established | owner approves the switch for this feature group; legacy switch SQL reviewed; TOKO/smartkkisi dependants informed |
| 6 | Coexistence safe | OPEN legacy documents of the feature either finished in legacy before the switch or explicitly adopted (FD-17 rule) — drain list produced |
| 7 | Reconciliation criteria met | finance sign-off of the parity report |
| 8 | Rollback demonstrably possible | rehearsal on staging: switch → Next.js writes → rollback → legacy continues on the same rows |

Cross-cutting preconditions: B5/B8 capacity decision, B6 console store in production, FD-01 ledger table, writer accounts created by reviewed SQL, login hotfix S1 released (existing register).

## 3. Proposed order (dependency + risk)

| Step | Feature group (controllers switched off together) | Main decisions/blockers |
|---|---|---|
| C-1 | Reference masters (`master/jenis_*_c`, `suku_bunga_c`, `periode_angsuran_c`, `rekening_bank_c`, `bagian_c`, `lokasi_c`) | FD-03, FD-16 |
| C-2 | Members (`master/anggota_c`, `anggota/anggota_c`, `mobile/users_c`) + TOKO legacy Member menu off | FD-07, FD-08, D3 |
| C-3 | Deduction config + savings change requests (`simpanan/master_payroll_c`, `mobile/pengajuan_mobile_c`) | public-savings CP3 alignment |
| C-4 | Savings incl. withdrawals (`simpanan/simpanan_c`, `sim_payroll_c`, `sim_setor_c`, `penarikan_simpanan_c`, `kas_anggota_c`, `mobile/penarikan_mobile_c`) | B1, D2, FD-12, FD-14 |
| C-5 | Lending (7 product controllers, `pelunasan_pinjaman_c`, `over_kredit_c`, `kartu_aktif_c`, `mobile/pinjaman_mobile_c`) | B1, D1, D6, FD-04/05/06/11 |
| C-6 | Payroll lifecycle (`payroll/matrix_c`, `ppob/tagihan_c`) with legacy procedure for generation | D4, D5, FD-20 |
| C-7 | Native payroll generator replaces procedure call | B1 parity sign-off (MIG-107) |
| C-8 | Exit settlement (`simpanan/hak_kewajiban_c`) | FD-13 |
| C-9 | SHU (`shu/shu_c`) | FD-10 |

Reports/prints (read) and dashboard can ship anytime after their parity; they do not need a switch.

## 4. Cutover runbook (per step)

1. **T−5 days:** freeze scope; publish drain list of OPEN legacy documents for the group; operator receives generated switch SQL + rollback SQL (`apps/web/scripts/kosipa-legacy-switch.mjs`), verification queries (expected `ref_menu` rows by URL, before/after `status`).
2. **T−1 day:** backup verification (operator confirms latest DB backup restorable); staging rehearsal re-run on the release build.
3. **T0 (outside office hours, payroll-free window):**
   1. Announce read-only window for the group (legacy pages show nothing new).
   2. Operator runs switch SQL (`ref_menu.status = 0` for the group's URLs) → verification query shows 0 active rows; a test account confirms legacy redirects to the error page.
   3. Deploy/enable `KOSIPA_<CTX>_WRITES_ENABLED=true` + ownership `N`.
   4. Smoke: one synthetic-safe command per type on a designated test member agreed by finance (or skip in favour of the first real operator action under observation).
   5. Reconciliation snapshot (counts/sums) recorded as the baseline for the first day.
4. **T+1…T+5:** daily reconciliation report (OBS-104); monitor refusals, lock waits, failures; owner review.
5. **Exit:** owner signs the step; legacy rows for the group stay readable; legacy controllers stay disabled.

## 5. Rollback

| Trigger | Action | Data |
|---|---|---|
| Unexplained reconciliation difference, failed invariant, repeated failures, owner request | (1) Next.js flag off (immediate; API 503), (2) operator runs rollback SQL (`ref_menu.status = 1`), (3) legacy resumes | Rows written by Next.js remain valid legacy rows (REQ-142); ledger keeps the history; no conversion |
| Partial command failure | none needed — transaction rollback guarantees no partial state | — |
| Defective committed data (logic bug) | correct via reversal documents in the owning system (Next.js if still owner; legacy edit if rolled back), never by direct SQL without finance approval | MIG-102 |
| DDL (FD-01/FD-02) needs removal | `DROP TABLE kosipa_command_ledger` (no legacy reader); `DROP INDEX …` | Reviewed SQL |

Rollback time objective: ≤ 15 minutes from decision to legacy usable (flag + one SQL statement set).

## 6. Coexistence risks and mitigations

| Risk | Mitigation |
|---|---|
| Staff keep using a legacy page via bookmark | switch denies the controller for everyone (VF-03) |
| OPEN legacy documents at switch time | drain list; adopt rule FD-17(c) |
| smartkkisi creates requests during switch | requests are intake only; decisions move with the group |
| Legacy payroll procedure reads Next.js rows wrongly | compatibility tests gate 4; procedure stays until C-7 |
| Connection exhaustion with PHP | B5/B8 decision; writer pools ≤ 2; only enabled writers counted |
| Ungated legacy print controllers show Next.js data | read-only; acceptable; retired with legacy (private register) |
| TOKO legacy `Member_model` still writes `m_anggota` | TOKO owner disables that menu at C-2 (UCKW:BR001) |
| Double payroll settlement around C-6 | C-6 executed between payroll periods; batch approval refused if the batch was approved in legacy |
