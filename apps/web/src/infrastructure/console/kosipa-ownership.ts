import { MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
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
/** Reference masters (FA-01 Lokasi, FA-02 Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran): one feature per legacy controller. */
export const KOSIPA_WRITE_FEATURES: Readonly<Record<string, KosipaWriteFeatureConfig>> = Object.fromEntries(
  Object.values(MASTER_DEFINITIONS).map((d) => [`master.${d.key}`, { flag: 'KOSIPA_MASTER_WRITES_ENABLED', legacyControllers: [d.legacyController] }]),
);

export function kosipaWriteOwnership(env: Record<string, string | undefined> = process.env): WriteOwnership {
  const owned = new Set((env.KOSIPA_WRITE_OWNERSHIP ?? '').split(',').map((f) => f.trim()).filter(Boolean));
  return {
    owns(feature: string): boolean {
      if (!Object.prototype.hasOwnProperty.call(KOSIPA_WRITE_FEATURES, feature)) return false;
      return env[KOSIPA_WRITE_FEATURES[feature].flag] === 'true' && owned.has(feature);
    },
  };
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
