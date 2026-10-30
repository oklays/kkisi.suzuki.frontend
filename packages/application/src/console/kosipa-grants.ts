import { ConsoleError, sanitizeAuditDetail, type AuditAction } from '@koperasi/domain/console/identity-link';
import {
  GRANT_REQUEST_TTL_MS, assertGrantDecisionAllowed, assertGrantRequestAllowed, assertGrantRevocable, parseGrantableCapability, parseGrantReason, type GrantStatus,
} from '@koperasi/domain/console/kosipa-grants';
import { IAM_PERMISSION_SLUGS, iamCapabilities, type CapabilitySet } from '@koperasi/domain/console/capabilities';
import { canChooseBranch } from '../auth/validate-session.usecase.ts';
import type { PermissionSetSource } from './resolve-capabilities.usecase.ts';
import type { AuditLog, ConsoleUserDirectory, IdentityLinkStore } from './identity-links.ts';

/**
 * KOSIPA write-capability grants with two-administrator confirmation (kosipa-full-access FD-16, REQ-130, TASK-110; FA-01.5).
 * Stored in the console store next to the identity links; managed only by `iam.kosipa.grant` holders; every request, decision,
 * revocation and refusal is audited. The store's conditional UPDATEs make a second (concurrent) decision affect 0 rows.
 */
export type KosipaGrant = {
  id: number; consoleUserId: number; capability: string; status: GrantStatus;
  requestedBy: number; requestedAt: Date; reason: string; expiresAt: Date;
  decidedBy: number | null; decidedAt: Date | null; revokedBy: number | null; revokedAt: Date | null;
};

/** Console store. Failures must throw; they are never read as "no grant" by callers that authorize (they fail closed). */
export interface KosipaGrantStore {
  activeCapabilities(consoleUserId: number): Promise<string[]>;
  find(id: number): Promise<KosipaGrant | null>;
  /** Marks pending requests of this user + capability whose expiry has passed as `expired`, then returns the open one (pending or active), if any. */
  openFor(consoleUserId: number, capability: string, now: Date): Promise<KosipaGrant | null>;
  listOpen(): Promise<KosipaGrant[]>;
  /** New pending request. A concurrent duplicate surfaces as ConsoleError('ALREADY_GRANTED') (unique open key); a self-request as 'SELF_GRANT' (CHECK). */
  request(r: { consoleUserId: number; capability: string; requestedBy: number; requestedAt: Date; expiresAt: Date; reason: string }): Promise<number>;
  /** pending -> active|rejected, only if still pending (and, for approval, unexpired and decided by someone else). False when 0 rows changed. */
  decide(id: number, to: 'active' | 'rejected', by: number, at: Date, note: string | null): Promise<boolean>;
  /** active -> revoked only; false when it was no longer active. */
  revoke(id: number, by: number, at: Date, reason: string): Promise<boolean>;
}

export type GrantActor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type GrantPorts = {
  grants: KosipaGrantStore; links: Pick<IdentityLinkStore, 'activeForConsoleUser'>; consoleUsers: ConsoleUserDirectory; audit: AuditLog; now: () => Date;
  /** Deployment allow-list of grant administrators; re-checked for the requester when a request is approved. */
  grantAdmins: ReadonlySet<number>;
  /** Legacy role permissions, re-read at approval: the requester must STILL hold iam.link.manage (users_edit AND role <= 2). */
  permissions: PermissionSetSource;
};

/**
 * Is the requester of a pending grant still a grant administrator NOW (FA-03A, grant staleness)? Same rule as resolveConsoleAccess, from
 * current data: active user, on the allow-list, current role a branch chooser, and that role still has users_edit. A request made by an
 * administrator who has since lost any of these can no longer be approved (GRANT_REQUEST_STALE); unknown role -> not an administrator.
 */
async function requesterStillGrantAdmin(ports: GrantPorts, requester: { active: boolean; roleId?: number } | null, requestedBy: number): Promise<boolean> {
  if (!requester?.active || !ports.grantAdmins.has(requestedBy) || !Number.isSafeInteger(requester.roleId)) return false;
  const roleId = requester.roleId as number;
  const granted = await ports.permissions.grantedAmong(roleId, IAM_PERMISSION_SLUGS);
  return iamCapabilities(granted, canChooseBranch(roleId)).has('iam.link.manage');
}

const requireGrantAdmin = (actor: Pick<GrantActor, 'capabilities'>) => { if (!actor.capabilities.has('iam.kosipa.grant')) throw new ConsoleError('FORBIDDEN'); };

async function audited<T>(ports: GrantPorts, actor: GrantActor, action: AuditAction, subjectId: string, detail: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    await ports.audit.append({ actorUserId: actor.userId, action, subjectType: 'kosipa_grant', subjectId, outcome: 'success', requestId: actor.requestId, detail: sanitizeAuditDetail(detail) ?? undefined, occurredAt: ports.now() });
    return result;
  } catch (error) {
    if (error instanceof ConsoleError) {
      await ports.audit.append({ actorUserId: actor.userId, action: 'kosipa.grant.denied', subjectType: 'kosipa_grant', subjectId, outcome: 'denied', requestId: actor.requestId, detail: sanitizeAuditDetail({ ...detail, code: error.code }) ?? undefined, occurredAt: ports.now() }).catch(() => undefined);
    }
    throw error;
  }
}

/** Step 1 of 2: an administrator asks for a write capability for ANOTHER, linked console user. Nothing is granted yet. */
export async function requestKosipaGrant(ports: GrantPorts, actor: GrantActor, input: { consoleUserId: number; capability: unknown; reason: unknown }): Promise<{ id: number; status: 'pending' }> {
  const subject = `console:${input.consoleUserId}`;
  return audited(ports, actor, 'kosipa.grant.request', subject, { consoleUserId: input.consoleUserId, capability: typeof input.capability === 'string' ? input.capability : null }, async () => {
    requireGrantAdmin(actor);
    const capability = parseGrantableCapability(input.capability);
    const reason = parseGrantReason(input.reason);
    const now = ports.now();
    const [target, link, open] = await Promise.all([
      ports.consoleUsers.consoleUser(input.consoleUserId), ports.links.activeForConsoleUser(input.consoleUserId), ports.grants.openFor(input.consoleUserId, capability, now),
    ]);
    assertGrantRequestAllowed({ actorUserId: actor.userId, target, targetLinked: link !== null, alreadyOpen: open !== null });
    const id = await ports.grants.request({ consoleUserId: input.consoleUserId, capability, requestedBy: actor.userId, requestedAt: now, expiresAt: new Date(now.getTime() + GRANT_REQUEST_TTL_MS), reason });
    return { id, status: 'pending' as const };
  });
}

/** Step 2 of 2: a DIFFERENT administrator approves (facts re-checked now) or any administrator but the beneficiary rejects. */
export async function decideKosipaGrant(ports: GrantPorts, actor: GrantActor, input: { grantId: number; decision: 'approve' | 'reject'; note?: unknown }): Promise<{ id: number; status: 'active' | 'rejected' }> {
  const approve = input.decision === 'approve';
  return audited(ports, actor, approve ? 'kosipa.grant.approve' : 'kosipa.grant.reject', `grant:${input.grantId}`, { grantId: input.grantId }, async () => {
    requireGrantAdmin(actor);
    const note = approve ? null : parseGrantReason(input.note);
    const request = await ports.grants.find(input.grantId);
    const now = ports.now();
    const [target, link, requester] = request && approve
      ? await Promise.all([ports.consoleUsers.consoleUser(request.consoleUserId), ports.links.activeForConsoleUser(request.consoleUserId), ports.consoleUsers.consoleUser(request.requestedBy)])
      : [null, null, null];
    assertGrantDecisionAllowed({
      actorUserId: actor.userId, request, now, target, targetLinked: link !== null,
      requesterStillAdmin: !!request && approve && await requesterStillGrantAdmin(ports, requester, request.requestedBy),
    }, input.decision);
    // The store re-checks pending / unexpired / not-self in the same UPDATE: a concurrent second decision changes nothing.
    if (!(await ports.grants.decide(input.grantId, approve ? 'active' : 'rejected', actor.userId, now, note))) throw new ConsoleError('GRANT_NOT_PENDING');
    return { id: input.grantId, status: approve ? 'active' as const : 'rejected' as const };
  });
}

export async function revokeKosipaGrant(ports: GrantPorts, actor: GrantActor, input: { grantId: number; reason: unknown }): Promise<void> {
  return audited(ports, actor, 'kosipa.grant.revoke', `grant:${input.grantId}`, { grantId: input.grantId }, async () => {
    requireGrantAdmin(actor);
    const reason = parseGrantReason(input.reason);
    assertGrantRevocable(await ports.grants.find(input.grantId));
    if (!(await ports.grants.revoke(input.grantId, actor.userId, ports.now(), reason))) throw new ConsoleError('GRANT_NOT_ACTIVE');
  });
}

/** Pending requests and active grants (what the administration page shows). */
export async function listKosipaGrants(ports: Pick<GrantPorts, 'grants'>, actor: Pick<GrantActor, 'capabilities'>): Promise<KosipaGrant[]> {
  requireGrantAdmin(actor);
  return ports.grants.listOpen();
}
