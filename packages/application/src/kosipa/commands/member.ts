import { KosipaError } from '@koperasi/domain/kosipa';
import { businessDates } from '@koperasi/domain/pos/sale';
import { parseMemberRegistration, parseMemberProfile, type MemberRegistration, type MemberProfile } from '@koperasi/domain/kosipa/member-command';
import { runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';

/** PII-free response persisted as the ledger result. Version is a server HMAC SHA256, never a client-computed row hash. */
export type MemberResult = { id: number; version: string };

/**
 * Each method MUST use ONE business transaction: enforce member ownership/legacy fence again, resolve replay by actor/key
 * BEFORE stale checks, lock the member and relevant master/uniqueness/numbering rows, call the domain planner on verified facts,
 * write only changed fields, append safe before/after presence/change summaries and this PII-free result to the ledger, commit.
 * Failure rolls everything back. Matching retries return the stored result; another fingerprint conflicts.
 *
 * Create: serialize canonical numeric + ASCII-case-folded NIK uniqueness (including existing legacy aliases); allocate the
 * member/REG numbers using the approved numbering policy; supply explicit strict-mode zero financial/server defaults and actor
 * attribution; write member plus positive initial deduction configs atomically (explicit potongan_old/is_mobile defaults,
 * exact legacy savings types, no balances/opening entries). Positive config NIK must fit VARCHAR(10). No mobile account creation.
 * Deduction contract: set m_anggota.sim_pokok/sim_wajib/sim_sukarela to input.initialDeductions.pokok/wajib/sukarela exactly
 * (including "0"), and insert m_simpanan_aktif config rows ONLY for the positive amounts (none for "0").
 *
 * Update: lock by record id, verify expectedVersion with server HMAC SHA256 over the authoritative editable row, and recheck
 * actual bank changes with parseReason via planMemberProfile (stored values compared tolerantly: NULL = '', non-canonical
 * stored gaji counts as changed). Derive linked users identity only from that locked member.
 * Mirror exactly ktp/name/phone/email/street_address when an existing account is present, validating the actual users unique
 * email, nik and (ktp,phone) constraints under locks. No account creation, bank/group/location or wallet mirror; no status,
 * credit limits, deductions, credential/file writes. Preserve omitted fields and historical unchanged master references.
 * Canonical input may contain PII for hashing, but ledger summaries, result, subjects and console audit MUST NOT contain it.
 * These are infrastructure obligations, not implemented or proved by this application port.
 */
export interface MemberRepository {
  create(envelope: CommandEnvelope, input: MemberRegistration): Promise<CommandOutcome<MemberResult>>;
  update(envelope: CommandEnvelope, id: number, input: MemberProfile): Promise<CommandOutcome<MemberResult>>;
}
export type MemberPorts = CommandPorts & { members: MemberRepository };

function memberId(raw: string): number {
  if (!/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > 2_147_483_647) throw new KosipaError('MEMBER_ID_INVALID');
  return Number(raw);
}

export function registerMember(ports: MemberPorts, actor: CommandActor, body: unknown): Promise<CommandOutcome<MemberResult>> {
  const spec: CommandSpec<MemberRegistration, MemberResult> = {
    command: 'member.register', feature: 'member', capability: 'kosipa.member.create', audit: 'kosipa.member.register',
    parse(raw) {
      const input = parseMemberRegistration(raw, businessDates(ports.now()).day);
      return { input, subject: { type: 'member', ref: 'new' }, payload: input };
    },
    execute: (envelope, input) => ports.members.create(envelope, input),
  };
  return runKosipaCommand(ports, actor, spec, body, 'member:new');
}

export function updateMemberProfile(ports: MemberPorts, actor: CommandActor, rawId: string, body: unknown): Promise<CommandOutcome<MemberResult>> {
  const spec: CommandSpec<{ id: number; input: MemberProfile }, MemberResult> = {
    command: 'member.update_profile', feature: 'member', capability: 'kosipa.member.update', audit: 'kosipa.member.updateProfile',
    parse(raw) {
      const id = memberId(rawId); const input = parseMemberProfile(raw);
      return { input: { id, input }, subject: { type: 'member', ref: String(id) }, payload: input };
    },
    execute: (envelope, value) => ports.members.update(envelope, value.id, value.input),
  };
  // Never include an unvalidated route value (which could be a NIK/name) in denial/failure subjects.
  return runKosipaCommand(ports, actor, spec, body, 'member:route');
}
