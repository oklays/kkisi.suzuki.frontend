import { MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
import { PRODUCT_MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/product-master';
import type { WriteOwnership } from '@koperasi/application/kosipa/commands/pipeline';

/**
 * Feature write ownership (kosipa-full-access REQ-103, REQ-140, BR-117; 11 §1). A KOSIPA feature accepts native commands only
 * when ALL hold:
 *   - its own flag is exactly "true"                                  (kill switch: off -> 503 WRITE_DISABLED on the next request)
 *   - KOSIPA_WRITE_OWNERSHIP lists it                                  (ownership state N recorded by the operator at cutover)
 * Legacy fencing is a SEPARATE, verified operator step (ref_menu.status of `legacyControllers`, reviewed SQL). It is ALSO enforced
 * fail-closed inside every command transaction (kosipa-unit-of-work.ts): if any matching ref_menu row is enabled again, e.g. through
 * legacy admin/adm_menu_c, the command answers 503 LEGACY_ACTIVE, so the two applications can never write the same master at once
 * (docs/superpowers/specs/kosipa-full-access/fa-01/FD-03-legacy-fence-verification.md, FA-01.5 section).
 */
export type KosipaWriteFeatureConfig = { flag: string; legacyControllers: readonly string[] };
/** Shared with the loan writer's fence (kosipa-loan-decision.repository.ts) and the fenced VIEW urls (pinjaman/pinjaman_c also grants kosipa.loan.view). */
export const LOAN_DECISION_LEGACY_CONTROLLERS = [
  'pinjaman/pinjaman_c', 'pinjaman/pinjaman_reguler_c', 'pinjaman/pinjaman_bank_c', 'pinjaman/kasbon_c', 'pinjaman/pembiayaan_c', 'pinjaman/gaji_minus_c', 'pinjaman/kpr_btn_c',
  'mobile/pinjaman_mobile_c',
] as const;
/** Legacy screens that decide deduction-change requests (F45): the menu one and its unlisted duplicate (F48). */
export const DEDUCTION_REQUEST_LEGACY_CONTROLLERS = ['mobile/pengajuan_mobile_c', 'simpanan/pengajuan_mobile_c'] as const;
/** The legacy screen that converts mobile loan requests into loans (F47); it stays open while F47 is legacy-owned. */
export const LOAN_REQUEST_LEGACY_CONTROLLERS = ['mobile/pinjaman_mobile_c'] as const;
/** Reference masters (FA-01 Lokasi, FA-02 Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran): one feature per legacy controller. */
export const KOSIPA_WRITE_FEATURES: Readonly<Record<string, KosipaWriteFeatureConfig>> = {
  ...Object.fromEntries(Object.values(MASTER_DEFINITIONS).map((d) => [`master.${d.key}`, { flag: 'KOSIPA_MASTER_WRITES_ENABLED', legacyControllers: [d.legacyController] }])),
  /** Product masters (FA-03B T06; FD-32/FD-34): same master writer and flag, one feature per legacy controller. */
  ...Object.fromEntries(Object.values(PRODUCT_MASTER_DEFINITIONS).map((d) => [`master.${d.key}`, { flag: 'KOSIPA_MASTER_WRITES_ENABLED', legacyControllers: d.legacyWriter === false ? [] : [d.legacyController] }])),
  /** Members (FA-03B): every legacy controller that writes m_anggota / member deduction config must be fenced (MC01-MC11). */
  member: { flag: 'KOSIPA_MEMBER_WRITES_ENABLED', legacyControllers: ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c'] },
  /** Voluntary-savings deposits (FA-03C T07): the legacy Setor Simpanan screen. Other legacy savings screens stay legacy-owned until their own cutover. */
  'savings.deposit': { flag: 'KOSIPA_SAVINGS_WRITES_ENABLED', legacyControllers: ['simpanan/sim_setor_c'] },
  /**
   * Loan decision (FA-04, REQ-119): every legacy controller whose `ajax_posting` / `ajax_posting_all` writes trans_pinjaman.doc_status, plus the mobile
   * loan screen that converts requests into POSTING loans. Legacy writes those statuses blindly, so both applications must never decide loans at once.
   */
  'loan.decision': { flag: 'KOSIPA_LOAN_WRITES_ENABLED', legacyControllers: LOAN_DECISION_LEGACY_CONTROLLERS },
  /**
   * Member requests (P1). `member.intake`: the PWA Anggota creates OPEN requests through the signed internal endpoint; no legacy screen creates
   * PWA requests, so nothing is fenced. `request.loan`: rejecting a mobile loan request; legacy mobile/pinjaman_mobile_c keeps converting requests
   * into loans (F47 is not native), so it is never fenced and the command always runs shared (row lock + status guard + version).
   * `request.deduction`: deduction-change approval/rejection (F45), fenced against both legacy request screens unless the owner approves coexistence.
   */
  'member.intake': { flag: 'KOSIPA_MEMBER_INTAKE_ENABLED', legacyControllers: [] },
  'request.loan': { flag: 'KOSIPA_REQUEST_WRITES_ENABLED', legacyControllers: [] },
  'request.deduction': { flag: 'KOSIPA_REQUEST_WRITES_ENABLED', legacyControllers: DEDUCTION_REQUEST_LEGACY_CONTROLLERS },
};

export function kosipaWriteOwnership(env: Record<string, string | undefined> = process.env): WriteOwnership {
  const owned = new Set((env.KOSIPA_WRITE_OWNERSHIP ?? '').split(',').map((f) => f.trim()).filter(Boolean));
  return {
    owns(feature: string): boolean {
      if (!Object.prototype.hasOwnProperty.call(KOSIPA_WRITE_FEATURES, feature)) return false;
      return env[KOSIPA_WRITE_FEATURES[feature].flag] === 'true' && owned.has(feature);
    },
  };
}

/**
 * FA-04 coexistence (owner decision 9 Nov 2026, UAT period): the loan decision runs while the legacy loan screens stay OPEN, so legacy keeps
 * application, editing and disbursement. Only when this is exactly "true": the `loan.decision` fence is neither required by the command nor
 * applied by the local setup script. Native commands still lock the rows, check the version and guard the status; a STALE legacy page can still
 * overwrite a native decision (legacy writes blindly), which the owner accepted for UAT. Turn it off (strict fence) before production cutover.
 */
export function kosipaLoanDecisionShared(env: Record<string, string | undefined> = process.env): boolean {
  return env.KOSIPA_LOAN_DECISION_LEGACY_SHARED === 'true';
}
/**
 * Deduction-request coexistence (P1): only when this is exactly "true", legacy mobile/pengajuan_mobile_c stays open while the console decides
 * deduction requests (guarded UPDATEs, row locks and the version remain the protection). Off = strict fence.
 */
export function kosipaDeductionRequestShared(env: Record<string, string | undefined> = process.env): boolean {
  return env.KOSIPA_DEDUCTION_REQUEST_LEGACY_SHARED === 'true';
}
/** Features whose legacy controllers must NOT be fenced in this environment (coexistence). */
export function kosipaSharedFeatures(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  return new Set([...(kosipaLoanDecisionShared(env) ? ['loan.decision'] : []), ...(kosipaDeductionRequestShared(env) ? ['request.deduction'] : [])]);
}

/** Grants table usage is opt-in so environments whose console store predates db/console/004 keep their read-only behaviour. */
export function kosipaWriteGrantsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.KOSIPA_WRITE_GRANTS_ENABLED === 'true';
}

/** Explicit allow-list of console user ids who may manage KOSIPA write grants (on top of iam.link.manage). */
export function kosipaGrantAdmins(env: Record<string, string | undefined> = process.env): ReadonlySet<number> {
  const ids = (env.KOSIPA_GRANT_ADMIN_USER_IDS ?? '').split(',').map((v) => v.trim()).filter((v) => /^[1-9]\d{0,9}$/.test(v)).map(Number);
  return new Set(ids);
}
