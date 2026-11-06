import { KosipaError } from '@koperasi/domain/kosipa';
import { businessDates } from '@koperasi/domain/pos/sale';
import { MEMBER_REGISTRATION_FIELDS, parseMemberRegistration, parseMemberProfile, parseMemberStatus, type MemberRegistration, type MemberProfile, type MemberStatusChange } from '@koperasi/domain/kosipa/member-command';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import type { LegacyFenceState } from './master.ts';
import { hasWriteCapability, runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';

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
  /** Stored editable fields (database text rendering, see MemberStoredFields) plus the opaque version; plain read. */
  detail(id: number): Promise<{ id: number; fields: Record<string, string | number | null>; version: string } | null>;
  /** 'legacy-active' while ANY of the member controllers' ref_menu rows is enabled (plain read; every command re-checks under lock). */
  fenceState(): Promise<LegacyFenceState>;
  create(envelope: CommandEnvelope, input: MemberRegistration): Promise<CommandOutcome<MemberResult>>;
  update(envelope: CommandEnvelope, id: number, input: MemberProfile): Promise<CommandOutcome<MemberResult>>;
  /**
   * Status (REQ-110, FD-30, FD-31). Same single-transaction obligations as update, plus: plan with planMemberStatus on the locked row; to non-AKTIVE write
   * status_anggota and zero limit_toko/limit_ppob/gaji_minus, and for an EXISTING users row (identified from the locked member's NIK) revoke all and only its
   * oauth tokens by user_id and write the disabled mobile mirror once (is_active 0, is_delete 1, admin_verifikasi 0, temporary_token '', wallet 0/0);
   * to AKTIVE write status_anggota only. Never touch deduction config, savings, profile fields or credentials. The mandatory reason goes to the ledger only.
   */
  changeStatus(envelope: CommandEnvelope, id: number, input: MemberStatusChange): Promise<CommandOutcome<MemberResult>>;
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

export function changeMemberStatus(ports: MemberPorts, actor: CommandActor, rawId: string, body: unknown): Promise<CommandOutcome<MemberResult>> {
  const spec: CommandSpec<{ id: number; input: MemberStatusChange }, MemberResult> = {
    command: 'member.change_status', feature: 'member', capability: 'kosipa.member.status', audit: 'kosipa.member.changeStatus',
    parse(raw) {
      const id = memberId(rawId); const input = parseMemberStatus(raw);
      return { input: { id, input }, subject: { type: 'member', ref: String(id) }, payload: input };
    },
    execute: (envelope, value) => ports.members.changeStatus(envelope, value.id, value.input),
  };
  return runKosipaCommand(ports, actor, spec, body, 'member:route');
}

/** Edit-form payload: the identity and the profile/employment/bank/salary fields, never credentials, photos, ceilings or deduction configuration. */
export const MEMBER_EDIT_FIELDS = [...MEMBER_REGISTRATION_FIELDS, 'doc_no', 'no_anggota'] as const;
export type MemberEditView = { id: number; fields: Record<string, string | null>; version: string; canUpdate: boolean; canChangeStatus: boolean; writable: boolean; legacy: LegacyFenceState };

/**
 * Read side of the member edit page. The record carries PII beyond the read model's summary (bank, NPWP, salary), so it is returned only to an operator who
 * holds the view capability AND at least one member write capability. `writable` = owned by Next.js AND every legacy member controller fenced.
 */
export async function getMemberForEdit(ports: Pick<MemberPorts, 'members' | 'ownership'>, actor: { capabilities: CapabilitySet; kosipaUserId: number | null }, rawId: string): Promise<MemberEditView> {
  if (!actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const canUpdate = hasWriteCapability(actor, 'kosipa.member.update'), canChangeStatus = hasWriteCapability(actor, 'kosipa.member.status');
  if (!canUpdate && !canChangeStatus) throw new KosipaError('FORBIDDEN');
  const id = memberId(rawId);
  const [found, legacy] = await Promise.all([ports.members.detail(id), ports.members.fenceState()]);
  if (!found) throw new KosipaError('MEMBER_NOT_FOUND');
  const fields = Object.fromEntries(MEMBER_EDIT_FIELDS.map((key) => [key, found.fields[key] == null ? null : String(found.fields[key])]));
  return { id, fields, version: found.version, canUpdate, canChangeStatus, writable: ports.ownership.owns('member') && legacy === 'fenced', legacy };
}
