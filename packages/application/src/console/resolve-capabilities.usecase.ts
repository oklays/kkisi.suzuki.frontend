import { TOKO_PERMISSION_SLUGS, tokoCapabilities, type CapabilitySet } from '@koperasi/domain/console/capabilities';

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
