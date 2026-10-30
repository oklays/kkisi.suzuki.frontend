import { IAM_PERMISSION_SLUGS, TOKO_PERMISSION_SLUGS, iamCapabilities, tokoCapabilities, type Capability, type CapabilitySet } from '@koperasi/domain/console/capabilities';
import { writeCapabilitiesFromGrants } from '@koperasi/domain/console/kosipa-grants';
import { resolveKosipaCapabilities, type IdentityPorts } from './identity-links.ts';
import type { KosipaGrantStore } from './kosipa-grants.ts';

/** Read port: which of the given slugs the role holds, answered in one query. A store failure must throw (never "none"). */
export interface PermissionSetSource {
  grantedAmong(roleId: number, slugs: readonly string[]): Promise<ReadonlySet<string>>;
}

export type CapabilitySubject = { roleId: number; canSwitchBranch: boolean };

/**
 * Server-authoritative capability set for one validated session. Callers obtain the subject from validateSession(),
 * never from the client. Navigation is derived from the result; every page/API still enforces its own gate.
 */
export async function resolveConsoleCapabilities(source: PermissionSetSource, subject: CapabilitySubject): Promise<CapabilitySet> {
  const granted = await source.grantedAmong(subject.roleId, TOKO_PERMISSION_SLUGS);
  return tokoCapabilities(granted, subject.canSwitchBranch);
}

/** Deployment policy for the risky export action (never read from the browser or the console store). */
export type ExportPolicy = { enabled: boolean; allowedUserIds: ReadonlySet<number> };

export type KosipaAccessState = 'disabled' | 'unlinked' | 'linked' | 'unavailable';
/** `kosipaUserId` = the active KOSIPA account behind the link (the actor id written to the command ledger); null when none. */
export type ConsoleAccess = { capabilities: CapabilitySet; kosipa: KosipaAccessState; kosipaUserId: number | null };

/**
 * KOSIPA write grants (FD-16). `grants` = the console-store grant table; `grantAdmins` = explicit deployment allow-list of console user
 * ids who may manage grants (on top of iam.link.manage). Both absent -> no write capability and no grant administration.
 */
export type KosipaWriteSources = { grants?: Pick<KosipaGrantStore, 'activeCapabilities'>; grantAdmins?: ReadonlySet<number> };

/**
 * Full console access: TOKO + administration from the legacy permission table (one query) and, when KOSIPA reading is
 * enabled, KOSIPA view capabilities from the identity link. A failing console store or KOSIPA read removes ONLY the KOSIPA
 * part (state 'unavailable'); TOKO access stays available because it does not depend on the console database.
 */
export async function resolveConsoleAccess(
  sources: { permissions: PermissionSetSource; kosipa: (Pick<IdentityPorts, 'links' | 'kosipa'> & { exportPolicy?: ExportPolicy } & KosipaWriteSources) | null; features?: { warehousePreview?: boolean } },
  subject: CapabilitySubject & { userId: number },
): Promise<ConsoleAccess> {
  const granted = await sources.permissions.grantedAmong(subject.roleId, [...TOKO_PERMISSION_SLUGS, ...IAM_PERMISSION_SLUGS]);
  const capabilities = new Set<Capability>([...tokoCapabilities(granted, subject.canSwitchBranch), ...iamCapabilities(granted, subject.canSwitchBranch)]);
  // The SYNTHETIC Warehouse preview: deployment flag AND the existing global-warehouse capability; independent of KOSIPA and the console store.
  if (sources.features?.warehousePreview && capabilities.has('toko.inventory.warehouse')) capabilities.add('warehouse.preview.view');
  if (!sources.kosipa) return { capabilities, kosipa: 'disabled', kosipaUserId: null };
  // Grant administration is a console-store feature: iam.link.manage AND the explicit allow-list, never a role alone.
  if (sources.kosipa.grants && capabilities.has('iam.link.manage') && sources.kosipa.grantAdmins?.has(subject.userId)) capabilities.add('iam.kosipa.grant');
  try {
    const kosipa = await resolveKosipaCapabilities(sources.kosipa, subject.userId);
    for (const cap of kosipa.capabilities) capabilities.add(cap);
    // Export is an explicit, per-user deployment grant on top of a linked KOSIPA account; it never follows from a view capability.
    const policy = sources.kosipa.exportPolicy;
    if (kosipa.linked && policy?.enabled && policy.allowedUserIds.has(subject.userId) && kosipa.capabilities.size > 0) capabilities.add('kosipa.report.export');
    // Write capabilities: explicit grants only, for a live link with the matching view capability (never from the link or menus).
    if (kosipa.kosipaUserId !== null && sources.kosipa.grants) {
      for (const cap of writeCapabilitiesFromGrants(await sources.kosipa.grants.activeCapabilities(subject.userId), kosipa.capabilities)) capabilities.add(cap);
    }
    return { capabilities, kosipa: kosipa.linked ? 'linked' : 'unlinked', kosipaUserId: kosipa.kosipaUserId };
  } catch {
    // Fail closed: a store failure removes every KOSIPA capability resolved so far, write capabilities included.
    for (const cap of [...capabilities]) if (cap.startsWith('kosipa.')) capabilities.delete(cap);
    return { capabilities, kosipa: 'unavailable', kosipaUserId: null };
  }
}
