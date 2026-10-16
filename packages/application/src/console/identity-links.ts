import {
  ConsoleError, assertIdentityLinkAllowed, assertRevocationAllowed, sanitizeAuditDetail, type AuditAction,
} from '@koperasi/domain/console/identity-link';
import { kosipaCapabilitiesFromMenus } from '@koperasi/domain/console/kosipa-access';
import type { Capability, CapabilitySet } from '@koperasi/domain/console/capabilities';

export type IdentityLink = { id: number; consoleUserId: number; externalUserId: number; status: 'active' | 'revoked'; linkedBy: number; linkedAt: Date; revokedBy: number | null; revokedAt: Date | null };

/** Console store (separate console database). Store failures must throw; they are never read as "no link". */
export interface IdentityLinkStore {
  activeForConsoleUser(consoleUserId: number): Promise<IdentityLink | null>;
  activeForKosipaUser(kosipaUserId: number): Promise<IdentityLink | null>;
  find(id: number): Promise<IdentityLink | null>;
  listActive(): Promise<IdentityLink[]>;
  /** Inserts an active link; a concurrent duplicate surfaces as ConsoleError('ALREADY_LINKED') from the unique keys. */
  create(link: { consoleUserId: number; externalUserId: number; linkedBy: number; linkedAt: Date }): Promise<number>;
  /** active -> revoked only; returns false when the row was no longer active. */
  revoke(id: number, by: number, at: Date, reason: string): Promise<boolean>;
}
export type AuditEvent = { actorUserId: number; action: AuditAction; subjectType: string; subjectId: string; outcome: 'success' | 'denied' | 'failed'; requestId: string; detail?: Record<string, unknown> };
export interface AuditLog { append(event: AuditEvent & { occurredAt: Date }): Promise<void>; }

/** Legacy reads (SELECT-only business-database reader). */
export interface KosipaDirectory {
  kosipaUser(id: number): Promise<{ id: number; username: string; fullName: string; active: boolean; activeGroups: number } | null>;
  allowedMenuUrls(kosipaUserId: number): Promise<string[]>;
}
export interface ConsoleUserDirectory { consoleUser(id: number): Promise<{ id: number; active: boolean } | null>; }

export type Actor = { userId: number; capabilities: CapabilitySet; requestId: string };
export type IdentityPorts = { links: IdentityLinkStore; audit: AuditLog; kosipa: KosipaDirectory; consoleUsers: ConsoleUserDirectory; now: () => Date };

async function audited<T>(ports: IdentityPorts, actor: Actor, action: AuditAction, subjectId: string, detail: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    await ports.audit.append({ actorUserId: actor.userId, action, subjectType: 'identity_link', subjectId, outcome: 'success', requestId: actor.requestId, detail: sanitizeAuditDetail(detail) ?? undefined, occurredAt: ports.now() });
    return result;
  } catch (error) {
    if (error instanceof ConsoleError) {
      // A refused attempt is evidence too; if recording it fails the original refusal still stands.
      await ports.audit.append({ actorUserId: actor.userId, action: 'identity_link.denied', subjectType: 'identity_link', subjectId, outcome: 'denied', requestId: actor.requestId, detail: sanitizeAuditDetail({ ...detail, code: error.code }) ?? undefined, occurredAt: ports.now() }).catch(() => undefined);
    }
    throw error;
  }
}

const requireManager = (actor: Actor) => { if (!actor.capabilities.has('iam.link.manage')) throw new ConsoleError('FORBIDDEN'); };

/** Link an existing console account to an existing, active KOSIPA account. Never inferred from names, e-mails or NIKs. */
export async function linkIdentity(ports: IdentityPorts, actor: Actor, input: { consoleUserId: number; kosipaUserId: number }): Promise<{ id: number }> {
  requireManager(actor);
  const subject = `console:${input.consoleUserId}`;
  return audited(ports, actor, 'identity_link.create', subject, { consoleUserId: input.consoleUserId, kosipaUserId: input.kosipaUserId }, async () => {
    const [consoleUser, kosipaUser, byConsole, byKosipa] = await Promise.all([
      ports.consoleUsers.consoleUser(input.consoleUserId),
      ports.kosipa.kosipaUser(input.kosipaUserId),
      ports.links.activeForConsoleUser(input.consoleUserId),
      ports.links.activeForKosipaUser(input.kosipaUserId),
    ]);
    assertIdentityLinkAllowed({ actorUserId: actor.userId, consoleUser, kosipaUser, consoleUserAlreadyLinked: byConsole !== null, kosipaUserAlreadyLinked: byKosipa !== null });
    const id = await ports.links.create({ consoleUserId: input.consoleUserId, externalUserId: input.kosipaUserId, linkedBy: actor.userId, linkedAt: ports.now() });
    return { id };
  });
}

export async function revokeIdentityLink(ports: IdentityPorts, actor: Actor, input: { linkId: number; reason: string }): Promise<void> {
  requireManager(actor);
  return audited(ports, actor, 'identity_link.revoke', `link:${input.linkId}`, { linkId: input.linkId }, async () => {
    const link = await ports.links.find(input.linkId);
    const reason = assertRevocationAllowed(link, input.reason);
    if (!(await ports.links.revoke(input.linkId, actor.userId, ports.now(), reason))) throw new ConsoleError('LINK_NOT_ACTIVE');
  });
}

export async function listIdentityLinks(ports: Pick<IdentityPorts, 'links'>, actor: Pick<Actor, 'capabilities'>): Promise<IdentityLink[]> {
  if (!actor.capabilities.has('iam.link.manage')) throw new ConsoleError('FORBIDDEN');
  return ports.links.listActive();
}

/**
 * KOSIPA capabilities of one console user: active link -> active KOSIPA account -> controllers it may open -> view
 * capabilities. Anything missing yields no KOSIPA access; store/reader failures propagate (callers fail closed).
 */
export async function resolveKosipaCapabilities(ports: Pick<IdentityPorts, 'links' | 'kosipa'>, consoleUserId: number): Promise<{ linked: boolean; capabilities: Set<Capability> }> {
  const link = await ports.links.activeForConsoleUser(consoleUserId);
  if (!link) return { linked: false, capabilities: new Set() };
  const user = await ports.kosipa.kosipaUser(link.externalUserId);
  if (!user?.active || user.activeGroups < 1) return { linked: true, capabilities: new Set() };
  return { linked: true, capabilities: kosipaCapabilitiesFromMenus(await ports.kosipa.allowedMenuUrls(user.id)) };
}
