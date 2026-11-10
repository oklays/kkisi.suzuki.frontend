import { createHash } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import { commandFingerprint, parseIdempotencyKey } from '@koperasi/domain/kosipa/command';
import { KOSIPA_WRITE_REQUIRES, type CapabilitySet, type KosipaWriteCapability } from '@koperasi/domain/console/capabilities';
import { sanitizeAuditDetail, type AuditAction } from '@koperasi/domain/console/identity-link';
import type { AuditLog } from '../../console/identity-links.ts';

/**
 * The single write pipeline every native KOSIPA command runs through (kosipa-full-access 07 §4, REQ-105, TASK-108):
 *   ownership/flag -> authorize -> parse + validate -> request hash -> ONE business transaction (repository: locks, idempotency
 *   lookup, re-check on locked rows, legacy-compatible write, ledger row, commit) -> console audit.
 * Authorization runs BEFORE parsing so an unauthorized caller learns nothing about the target or the validation rules.
 * The ledger row (business DB, same transaction) is the audit of record; the console audit event is the access trail and is
 * best-effort after a commit (a lost event never turns a committed command into a reported failure).
 */
export type CommandActor = { userId: number; kosipaUserId: number | null; capabilities: CapabilitySet; requestId: string };

export type CommandEnvelope = {
  /** A console write capability, or the member channel's own scope (runMemberIntakeCommand). */
  command: string; capability: KosipaWriteCapability | 'member.intake'; idempotencyKey: string; requestHash: string; requestId: string;
  actorConsoleUserId: number; actorKosipaUserId: number; subjectType: string; subjectRef: string;
};
export type CommandOutcome<R> = { result: R; replayed: boolean; ledgerId: number };

/** REQ-103/REQ-140: a feature accepts commands only while Next.js owns it (ownership N) and its flag is on. */
export interface WriteOwnership { owns(feature: string): boolean }

export type CommandPorts = { ownership: WriteOwnership; audit: AuditLog; now: () => Date; log?: (event: string, fields: Record<string, string | number>) => void };

export type CommandSpec<I, R> = {
  command: string;
  feature: string;
  capability: KosipaWriteCapability;
  audit: AuditAction;
  /** Parses the body (and route ids captured by the caller). Unknown body fields are refused, never ignored. */
  parse(body: Record<string, unknown>): { input: I; subject: { type: string; ref: string }; payload: unknown };
  execute(envelope: CommandEnvelope, input: I): Promise<CommandOutcome<R>>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** Strict body shape: the listed fields (+ idempotencyKey) only. Forged extras such as `status` or `id` are an error. */
export function onlyFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) if (key !== 'idempotencyKey' && !allowed.includes(key)) throw new KosipaError('FIELD_NOT_ALLOWED');
}

export function hasWriteCapability(actor: Pick<CommandActor, 'capabilities' | 'kosipaUserId'>, capability: KosipaWriteCapability): boolean {
  return actor.kosipaUserId !== null && actor.capabilities.has(capability) && actor.capabilities.has(KOSIPA_WRITE_REQUIRES[capability]);
}

export async function runKosipaCommand<I, R>(ports: CommandPorts, actor: CommandActor, spec: CommandSpec<I, R>, body: unknown, subjectHint: string): Promise<CommandOutcome<R>> {
  if (!ports.ownership.owns(spec.feature)) throw new KosipaError('WRITE_DISABLED');
  const event = (action: AuditAction, outcome: 'success' | 'denied' | 'failed', subjectId: string, detail: Record<string, unknown>) =>
    ports.audit.append({ actorUserId: actor.userId, action, subjectType: 'kosipa_command', subjectId, outcome, requestId: actor.requestId, detail: sanitizeAuditDetail(detail) ?? undefined, occurredAt: ports.now() })
      .catch(() => ports.log?.('kosipa_audit_append_failed', { action }));

  if (!hasWriteCapability(actor, spec.capability)) {
    await event('kosipa.command.denied', 'denied', subjectHint, { command: spec.command, code: 'FORBIDDEN' });
    throw new KosipaError('FORBIDDEN');
  }
  let subjectId = subjectHint;
  try {
    if (!isPlainObject(body)) throw new KosipaError('INVALID_INPUT');
    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);
    const { input, subject, payload } = spec.parse(body);
    subjectId = `${subject.type}:${subject.ref}`;
    const requestHash = createHash('sha256').update(commandFingerprint(spec.command, subject, payload)).digest('hex');
    const outcome = await spec.execute({
      command: spec.command, capability: spec.capability, idempotencyKey, requestHash, requestId: actor.requestId,
      actorConsoleUserId: actor.userId, actorKosipaUserId: actor.kosipaUserId as number, subjectType: subject.type, subjectRef: subject.ref,
    }, input);
    // A replay changes nothing and already has its ledger row and audit event: no second event for the same committed operation.
    if (!outcome.replayed) await event(spec.audit, 'success', subjectId, { command: spec.command, ledgerId: outcome.ledgerId });
    return outcome;
  } catch (error) {
    const code = error instanceof KosipaError ? error.code : 'UNAVAILABLE';
    await event('kosipa.command.failed', 'failed', subjectId, { command: spec.command, code });
    throw error;
  }
}

/**
 * Member channel (P1 member requests): the PWA Anggota submits on behalf of an authenticated member, verified by a signed internal
 * request, not a console session. There is no console actor and no console capability: the channel itself is the authority, and the
 * ledger row records actor 0 / 0 with capability `member.intake`. Same order as runKosipaCommand otherwise: ownership -> parse ->
 * request hash -> ONE business transaction (repository). Refusals are logged (code only); the ledger row is the audit of record.
 */
export const MEMBER_CHANNEL_ACTOR = 0;
export const MEMBER_CHANNEL_CAPABILITY = 'member.intake' as const;
export type MemberChannelPorts = { ownership: WriteOwnership; now: () => Date; log?: (event: string, fields: Record<string, string | number>) => void };
export type MemberIntakeSpec<I, R> = {
  command: string;
  feature: string;
  parse(body: unknown): { input: I; idempotencyKey: string; subject: { type: string; ref: string }; payload: unknown };
  execute(envelope: CommandEnvelope, input: I): Promise<CommandOutcome<R>>;
};

export async function runMemberIntakeCommand<I, R>(ports: MemberChannelPorts, requestId: string, spec: MemberIntakeSpec<I, R>, body: unknown): Promise<CommandOutcome<R>> {
  if (!ports.ownership.owns(spec.feature)) throw new KosipaError('WRITE_DISABLED');
  try {
    const { input, idempotencyKey, subject, payload } = spec.parse(body);
    const requestHash = createHash('sha256').update(commandFingerprint(spec.command, subject, payload)).digest('hex');
    return await spec.execute({
      command: spec.command, capability: MEMBER_CHANNEL_CAPABILITY, idempotencyKey, requestHash, requestId,
      actorConsoleUserId: MEMBER_CHANNEL_ACTOR, actorKosipaUserId: MEMBER_CHANNEL_ACTOR, subjectType: subject.type, subjectRef: subject.ref,
    }, input);
  } catch (error) {
    ports.log?.('member_intake_refused', { command: spec.command, code: error instanceof KosipaError ? error.code : 'UNAVAILABLE' });
    throw error;
  }
}
