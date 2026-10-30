import { GRANTABLE_KOSIPA_CAPABILITIES, KOSIPA_WRITE_CAPABILITIES, KOSIPA_WRITE_REQUIRES, type Capability, type KosipaWriteCapability } from './capabilities.ts';
import { ConsoleError } from './identity-link.ts';

/**
 * KOSIPA write-capability grants (kosipa-full-access FD-16 option b, REQ-130, SEC-102) with TWO-ADMINISTRATOR confirmation (FA-01.5):
 *   request (administrator A, for another console user B with an active KOSIPA link)  ->  pending, expires after GRANT_REQUEST_TTL_MS
 *   approve (administrator C: C != A, C != B; A still an administrator; B still active and linked)  ->  active
 *   reject  (any administrator except B, including A withdrawing it)  ->  rejected
 *   revoke  (any administrator; removing access never needs a second person)  ->  revoked
 * A grant only counts while `active`. Nothing is inferred from roles, legacy menus or the identity link itself.
 */
export const GRANT_REASON_MIN = 5;
export const GRANT_REASON_MAX = 200;
export const GRANT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export type GrantStatus = 'pending' | 'active' | 'rejected' | 'expired' | 'revoked';

export function parseGrantReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < GRANT_REASON_MIN || reason.length > GRANT_REASON_MAX || /[\u0000-\u001f\u007f]/.test(reason)) throw new ConsoleError('REASON_REQUIRED');
  return reason;
}

export function parseGrantableCapability(raw: unknown): KosipaWriteCapability {
  if (typeof raw !== 'string' || !(GRANTABLE_KOSIPA_CAPABILITIES as readonly string[]).includes(raw)) throw new ConsoleError('CAPABILITY_NOT_GRANTABLE');
  return raw as KosipaWriteCapability;
}

export type GrantRequestFacts = {
  actorUserId: number;
  target: { id: number; active: boolean } | null;
  targetLinked: boolean;
  /** An active grant OR a still-valid pending request exists for the same user + capability. */
  alreadyOpen: boolean;
};

export function assertGrantRequestAllowed(f: GrantRequestFacts): void {
  if (!f.target) throw new ConsoleError('CONSOLE_USER_NOT_FOUND');
  if (f.target.id === f.actorUserId) throw new ConsoleError('SELF_GRANT');
  if (!f.target.active) throw new ConsoleError('CONSOLE_USER_INACTIVE');
  if (!f.targetLinked) throw new ConsoleError('NOT_LINKED');
  if (f.alreadyOpen) throw new ConsoleError('ALREADY_GRANTED');
}

export type GrantDecisionFacts = {
  actorUserId: number;
  request: { status: GrantStatus; consoleUserId: number; requestedBy: number; expiresAt: Date } | null;
  now: Date;
  /** Re-checked at decision time: the requester is still a grant administrator; the target is still active and linked. */
  requesterStillAdmin: boolean;
  target: { active: boolean } | null;
  targetLinked: boolean;
};

export function assertGrantDecisionAllowed(f: GrantDecisionFacts, decision: 'approve' | 'reject'): void {
  const r = f.request;
  if (!r) throw new ConsoleError('GRANT_NOT_FOUND');
  if (r.status !== 'pending') throw new ConsoleError('GRANT_NOT_PENDING');           // covers a second (duplicate) approval
  if (r.consoleUserId === f.actorUserId) throw new ConsoleError('SELF_GRANT');        // nobody decides on their own access
  if (decision === 'reject') return;                                                   // refusing access is always allowed otherwise
  if (r.expiresAt.getTime() <= f.now.getTime()) throw new ConsoleError('GRANT_REQUEST_EXPIRED');
  if (r.requestedBy === f.actorUserId) throw new ConsoleError('SELF_APPROVAL');
  if (!f.requesterStillAdmin || !f.target?.active || !f.targetLinked) throw new ConsoleError('GRANT_REQUEST_STALE');
}

/** Revoking only ever removes access, so one administrator suffices (including for a grant of their own). */
export function assertGrantRevocable(grant: { status: GrantStatus } | null): void {
  if (!grant) throw new ConsoleError('GRANT_NOT_FOUND');
  if (grant.status !== 'active') throw new ConsoleError('GRANT_NOT_ACTIVE');
}

/**
 * Effective write capabilities: an ACTIVE grant counts only when it names a known write capability AND the user currently holds the view
 * capability it requires (from the live identity link). Unknown or stale capability names in the store grant nothing.
 */
export function writeCapabilitiesFromGrants(granted: readonly string[], held: ReadonlySet<Capability>): Set<Capability> {
  const out = new Set<Capability>();
  for (const name of granted) {
    if (!(KOSIPA_WRITE_CAPABILITIES as readonly string[]).includes(name)) continue;
    const capability = name as KosipaWriteCapability;
    if (held.has(KOSIPA_WRITE_REQUIRES[capability])) out.add(capability);
  }
  return out;
}
