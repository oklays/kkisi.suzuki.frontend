import { KosipaError } from '@koperasi/domain/kosipa';
import {
  MEMBER_REQUEST, intakeLedgerKey, isMemberRequestType, isRequestDecisionAction, parseMemberIntake, parseRequestDecision, parseRequestDocNo,
  type DeductionIntake, type LoanIntake, type MemberRequestType, type RequestDecision, type RequestDecisionAction,
} from '@koperasi/domain/kosipa/member-request';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import {
  hasWriteCapability, runKosipaCommand, runMemberIntakeCommand,
  type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec, type MemberChannelPorts,
} from './pipeline.ts';
import type { LegacyFenceState } from './master.ts';

/**
 * Member requests (P1; rules in @koperasi/domain/kosipa/member-request).
 *   intake  (member channel, signed internal request)  feature `member.intake`     loan / deduction request OPEN
 *   reject  loan request       (kosipa.request.decide)  feature `request.loan`      shared with legacy mobile/pinjaman_mobile_c (F47 stays legacy)
 *   approve / reject deduction (kosipa.request.decide)  feature `request.deduction` fenced against mobile/pengajuan_mobile_c (or owner-approved shared)
 */
export const MEMBER_INTAKE_FEATURE = 'member.intake';
export const REQUEST_FEATURE: Record<MemberRequestType, string> = { loan: 'request.loan', deduction: 'request.deduction' };

export type IntakeResult = { docNo: string; status: string; type: MemberRequestType; summary: Record<string, string | number> };
export type RequestDecisionResult = { docNo: string; status: string; version: string };

export type MemberRequestRow = {
  type: MemberRequestType; id: number; docNo: string; docDate: string | null; status: string | null; channel: 'pwa' | 'public-link' | 'smartkkisi';
  member: { nik: string; name: string; section: string | null };
  /** loan: product + amount + tenor + purpose; deduction: savings type + previous -> requested + effective month. */
  detail: { product?: string | null; amount?: string | null; months?: number | null; purpose?: string | null; savingsType?: string | null; previous?: string | null; requested?: string | null; effective?: string | null; rejection?: string | null };
  version: string;
};
export type MemberRequestFilter = { type: MemberRequestType; status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'ALL'; month: string };

export interface MemberRequestRepository {
  /** ONE transaction: lock the member row, ledger replay, re-check member + rules on locked data, insert OPEN request, verify, ledger row. */
  intakeLoan(envelope: CommandEnvelope, input: LoanIntake): Promise<CommandOutcome<IntakeResult>>;
  intakeDeduction(envelope: CommandEnvelope, input: DeductionIntake): Promise<CommandOutcome<IntakeResult>>;
  /** ONE transaction: (fence) lock request (+ member + active deduction rows), version check, plan, guarded UPDATE/INSERT, verify, ledger row. */
  decide(envelope: CommandEnvelope, type: MemberRequestType, docNo: string, action: RequestDecisionAction, decision: RequestDecision): Promise<CommandOutcome<RequestDecisionResult>>;
  list(filter: MemberRequestFilter): Promise<MemberRequestRow[]>;
  fenceState(type: MemberRequestType): Promise<LegacyFenceState>;
  /** Legacy screens stay open for this type (loan: always while F47 is legacy; deduction: owner-approved UAT coexistence). */
  sharedWithLegacy(type: MemberRequestType): boolean;
}

// ----------------------------------------------------------------------------------------------------------------- intake
export type MemberIntakePorts = MemberChannelPorts & { requests: MemberRequestRepository };

/** Body = the strict intake shape (parseMemberIntake). The member identity in it is re-verified by the repository under lock. */
export function submitMemberIntake(ports: MemberIntakePorts, requestId: string, body: unknown): Promise<CommandOutcome<IntakeResult>> {
  return runMemberIntakeCommand(ports, requestId, {
    command: 'member.request.submit',
    feature: MEMBER_INTAKE_FEATURE,
    parse(raw) {
      const input = parseMemberIntake(raw);
      const { clientKey, ...payload } = input;
      return { input, idempotencyKey: intakeLedgerKey(input.member.memberId, clientKey), subject: { type: `request.${input.kind}`, ref: `member:${input.member.memberId}` }, payload };
    },
    // The ledger names the concrete command; the request hash (spec command + subject + payload) already binds the type.
    execute: (envelope, input) => (input.kind === 'loan'
      ? ports.requests.intakeLoan({ ...envelope, command: 'member.request.loan.submit' }, input)
      : ports.requests.intakeDeduction({ ...envelope, command: 'member.request.deduction.submit' }, input)),
  }, body);
}

// ------------------------------------------------------------------------------------------------------------- decisions
export type MemberRequestPorts = CommandPorts & { requests: MemberRequestRepository };

export async function decideMemberRequest(ports: MemberRequestPorts, actor: CommandActor, rawType: string, rawDocNo: string, rawAction: string, body: unknown): Promise<CommandOutcome<RequestDecisionResult>> {
  if (!isMemberRequestType(rawType) || !isRequestDecisionAction(rawAction)) throw new KosipaError('NOT_FOUND');
  const type = rawType, action = rawAction;
  if (type === 'loan' && action === 'approve') throw new KosipaError('REQUEST_TYPE_UNSUPPORTED');   // conversion into a loan is legacy F47
  const spec: CommandSpec<{ docNo: string; decision: RequestDecision }, RequestDecisionResult> = {
    command: `request.${type}.${action}`, feature: REQUEST_FEATURE[type], capability: 'kosipa.request.decide', audit: action === 'approve' ? 'kosipa.request.approve' : 'kosipa.request.reject',
    parse(raw) {
      const docNo = parseRequestDocNo(rawDocNo);
      const decision = parseRequestDecision(raw, action);
      return { input: { docNo, decision }, subject: { type: `request.${type}`, ref: docNo }, payload: decision };
    },
    execute: (envelope, i) => ports.requests.decide(envelope, type, i.docNo, action, i.decision),
  };
  return runKosipaCommand(ports, actor, spec, body, `request.${type}:route`);
}

type Reader = { capabilities: CapabilitySet; kosipaUserId: number | null; userId: number };
const VIEW: Record<MemberRequestType, 'kosipa.loan.view' | 'kosipa.savings.view'> = { loan: 'kosipa.loan.view', deduction: 'kosipa.savings.view' };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export type MemberRequestList = {
  filter: MemberRequestFilter; rows: (MemberRequestRow & { canApprove: boolean; canReject: boolean })[];
  legacy: LegacyFenceState; shared: boolean; owned: boolean; writable: boolean; canDecide: boolean;
};

/** Read side (kosipa.loan.view / kosipa.savings.view + kosipa.member.view). Buttons are decided here, never by the page. */
export async function listMemberRequests(ports: Pick<MemberRequestPorts, 'requests' | 'ownership' | 'now'>, actor: Reader, raw: { type?: string; status?: string; month?: string }): Promise<MemberRequestList> {
  const type: MemberRequestType = isMemberRequestType(raw.type) ? raw.type : 'loan';
  if (!actor.capabilities.has(VIEW[type]) || !actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const status = (['OPEN', 'APPROVED', 'REJECTED', 'ALL'] as const).find((s) => s === raw.status) ?? 'OPEN';
  const jkt = new Date(ports.now().getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
  const month = raw.month && MONTH.test(raw.month) ? raw.month : jkt;
  const filter = { type, status, month };
  const [rows, legacy] = await Promise.all([ports.requests.list(filter), ports.requests.fenceState(type)]);
  const shared = ports.requests.sharedWithLegacy(type);
  const owned = ports.ownership.owns(REQUEST_FEATURE[type]);
  const writable = owned && (shared || legacy === 'fenced');
  const canDecide = writable && hasWriteCapability(actor, 'kosipa.request.decide');
  return {
    filter, legacy, shared, owned, writable, canDecide,
    rows: rows.map((r) => {
      const open = r.status === MEMBER_REQUEST.open && r.channel !== 'public-link';
      return { ...r, canApprove: canDecide && open && type === 'deduction', canReject: canDecide && open };
    }),
  };
}
