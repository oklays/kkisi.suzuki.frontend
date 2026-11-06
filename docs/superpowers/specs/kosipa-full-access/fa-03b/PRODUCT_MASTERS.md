# FA-03B T06 — product masters (WI-06 / F52 remainder)

Date: 2026-11-06. Branch `feat/kosipa-remaining-masters` (from `master` 205e8cd0). **Synthetic stack only**; no production writer, grant, fence or deployment. Evidence base: [REMAINING_MASTERS_CONTRACT.md](REMAINING_MASTERS_CONTRACT.md); owner decisions FD-32, FD-33, FD-34.

## Disposition of the 12 outstanding masters

| Master | Disposition | Where |
|---|---|---|
| Jenis Simpanan, Jenis Pinjaman, Jenis Pembiayaan | **Native** (FD-32) | `packages/domain/src/kosipa/product-master.ts` |
| Suku Bunga | **Native** (FD-34) | same |
| Divisi, Jabatan, Master Surat, Cabang | **Retired** (FD-33): no native writer; legacy controllers stay fenced/unlisted | master index lists them as retired |
| Daftar Pajak, Mata Uang, Kategori Beban, Jenis Pembayaran | **Retired from KOSIPA** (FD-33); the `db_*` tables stay owned by TOKO | same |

The retired controllers are not native features, so `kosipa-legacy-fence.mjs` does not generate SQL for them; keeping their `ref_menu` rows disabled is an operator check at cutover (they are not in the production menu today, per the contract §1).

## Implementation

| Layer | Path |
|---|---|
| Domain (typed fields, COA derivation, financing/parent rules, FD-32 reason) | `packages/domain/src/kosipa/product-master.ts`; row version `product-master-version.ts` |
| Application (create/update/status/list; capability `kosipa.master.manage`; feature `master.<key>`) | `packages/application/src/kosipa/commands/product-master.ts` |
| Repository (unit of work, table lock, share-locked COA/financing facts, reference counts, legacy stamps, post-condition) | `apps/web/src/infrastructure/repositories/kosipa-product-master.repository.ts` |
| Grants (master writer, column level, generated from the domain) | `apps/web/db/kosipa/002_master_writer_grants.sql.tpl` (block "product masters"); review-only `docs/migration/sql/kosipa-product-master-writer-production.sql` |
| HTTP | existing `/api/kosipa/master/[type]` routes dispatch product types; field errors return `{ error, field }` |
| UI (console standard of the member redesign: PageBreadcrumbs tail, ContextNotice, FinancialTable, `mform` form + rail) | `src/app/console/kosipa/master/product-pages.tsx`, `[type]/baru`, `[type]/[id]/ubah`; `components/console/kosipa/ProductMaster*.tsx` |
| Synthetic fixtures (structure-only DDL from the production capture + invented rows + fenced menus) | `integration/kosipa-full-access/fixtures/product-master-{tables,seed}.sql`; `local-stack.mjs product-masters`, `master-writer` |

Rules: codes unique (case-insensitive); Jenis Simpanan code fixed at creation (literals in legacy code); Pinjaman/Pembiayaan codes frozen once referenced (`trans_pinjaman.jenis_pinjaman/jenis_potongan/bank_pembiaya`, `trans_pinjaman.pembiayaan_code`, `m_jenis_pinjaman.jenis_pembiayaan`); exact decimals per column scale (biaya_jasa 4 places on Pembiayaan; VARCHAR `biaya_bunga` on Pinjaman validated to 4); COA descriptions derived from `m_acc_coa` and **rejected, never truncated**, when wider than the column (50 / 200); loan-type parent = 0 or an existing root, fixed legacy roots 1/2/3/4/28 stay roots, a row with children cannot get a parent, a referenced row cannot move; financing must be active; Suku Bunga keyed by `field` (only `tgl_tempo`, unique, fixed) with a day value 1–31; legacy-only columns (`dd`, `dd_usr`, `is_payroll`, `doc_no`, `doc_date`, `status_perorangan`) are read for the version but never written; no hard delete.

## Decisions taken by the implementer (owner review requested)

1. **Reason scope.** FD-32 names rates, fees, COA accounts and `lock_1angsuran`. The reason is required for every non-label field (also `jenis_bunga`, `tgl_tempo`, `max_angsuran`, `max_pinjaman`, financing, tarik-deposito flag, Suku Bunga value). Label-only edits (name, remarks, a still-unreferenced code) need none.
2. **COA group accounts** may be selected (legacy parity); the picker marks them "(kelompok)".
3. **Optional COA pairs** left empty are stored as `''` (what the legacy form posts), not NULL.
4. **Version** = SHA-256 of every column read (product parameters are not personal data, no secret needed).
5. **Product masters reuse the master writer** (`kosipa_master_w`, flag `KOSIPA_MASTER_WRITES_ENABLED`, one ownership feature per controller) rather than a new account.

## Open before production

- **FD-34 precondition not met:** the read-only production `COUNT(*)` of `m_suku_bunga` (and its `field` values) has not been taken; it is an operator step.
- Production grants, guard extension, fence and ownership per product are separate, owner-approved cutover steps; owner UAT on real data.

## Evidence (6 Nov 2026)

Domain 6 (RED 0/6 first) + application 3; product DB suite 8/8 on the synthetic stack (create/edit/status for all four, reference freezes, hierarchy, FD-32 reasons in the ledger, STALE after a legacy write to a legacy-only column, replay/conflict, rollback, LEGACY_ACTIVE, least privilege, production SQL = template); HTTP 3 (gates, field errors, reasons, retired types 404); console/navigation/breadcrumb regressions green. **Browser E2E (`tests/kosipa-product-master-browser.mjs`) written but not yet run** — see the run note in the T06 report.
