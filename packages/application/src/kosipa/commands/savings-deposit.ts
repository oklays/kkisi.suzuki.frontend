import { KosipaError } from '@koperasi/domain/kosipa';
import { businessDates } from '@koperasi/domain/pos/sale';
import { parseDepositCreate, parseDepositDecision, type DepositCreate } from '@koperasi/domain/kosipa/savings-deposit';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { hasWriteCapability, runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';
import type { LegacyFenceState } from './master.ts';

/**
 * Voluntary-savings deposit commands (FA-03C T07; REQ-114 first slice; FD-35/36/37). Feature `savings.deposit`, fenced against legacy simpanan/sim_setor_c.
 *   create  (kosipa.savings.prepare): POSTING header + one kredit_cash line, numbered TFCSH via the registry, in ONE transaction.
 *   approve (kosipa.savings.approve): header + lines APPROVED, lines tgl_cair = approval date; the approver may not be the native maker (FD-35).
 *   reject  (kosipa.savings.approve): header + lines REJECTED with a mandatory reason (FD-37); rows are never deleted.
 * Amounts, member identity and statuses are never taken from the client beyond the validated input (SEC-109).
 */
export const SAVINGS_DEPOSIT_FEATURE = 'savings.deposit';
export type DepositResult = { id: number; docNo: string; status: string; version: string };
export type DepositDecision = { expectedVersion: string; reason?: string; idempotencyKey: string };

export type DepositRow = {
  id: number; docNo: string; docDate: string; status: string; paymentType: string; amount: string; remarks: string;
  member: { nik: string; name: string; group: string | null }; createdBy: string; makerConsoleUserId: number | null; native: boolean; version: string;
};
export type DepositListFilter = { status: 'POSTING' | 'APPROVED' | 'REJECTED' | 'ALL'; month: string };
export type DepositMemberFacts = { id: number; nik: string; name: string; group: string | null; status: string | null; balance: string };

export interface SavingsDepositRepository {
  /** ONE transaction: fence, lock member + product, ledger replay, allocate TFCSH, insert header + line, verify, ledger row. */
  create(envelope: CommandEnvelope, input: DepositCreate): Promise<CommandOutcome<DepositResult>>;
  /** ONE transaction: fence, lock header + lines, version check, maker (from the ledger) != approver, plan, update, verify, ledger row with maker/checker. */
  decide(envelope: CommandEnvelope, id: number, kind: 'approve' | 'reject', decision: DepositDecision): Promise<CommandOutcome<DepositResult>>;
  list(filter: DepositListFilter): Promise<DepositRow[]>;
  /** Member facts for the form: identity and the APPROVED voluntary-savings balance (header-status rule of the legacy views). */
  member(nik: string): Promise<DepositMemberFacts | null>;
  fenceState(): Promise<LegacyFenceState>;
}
export type SavingsDepositPorts = CommandPorts & { deposits: SavingsDepositRepository };

function documentId(raw: string): number {
  if (!/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > 2_147_483_647) throw new KosipaError('SAVINGS_DOC_ID_INVALID');
  return Number(raw);
}

export async function createSavingsDeposit(ports: SavingsDepositPorts, actor: CommandActor, body: unknown): Promise<CommandOutcome<DepositResult>> {
  const spec: CommandSpec<DepositCreate, DepositResult> = {
    command: 'savings.deposit.create', feature: SAVINGS_DEPOSIT_FEATURE, capability: 'kosipa.savings.prepare', audit: 'kosipa.savings.deposit.create',
    parse(raw) {
      const input = parseDepositCreate(raw, businessDates(ports.now()).day);
      return { input, subject: { type: 'savings.deposit', ref: 'new' }, payload: input };
    },
    execute: (envelope, input) => ports.deposits.create(envelope, input),
  };
  return runKosipaCommand(ports, actor, spec, body, 'savings.deposit:new');
}

async function decide(ports: SavingsDepositPorts, actor: CommandActor, rawId: string, body: unknown, kind: 'approve' | 'reject'): Promise<CommandOutcome<DepositResult>> {
  const spec: CommandSpec<{ id: number; decision: DepositDecision }, DepositResult> = {
    command: `savings.deposit.${kind}`, feature: SAVINGS_DEPOSIT_FEATURE, capability: 'kosipa.savings.approve', audit: kind === 'approve' ? 'kosipa.savings.deposit.approve' : 'kosipa.savings.deposit.reject',
    parse(raw) {
      const id = documentId(rawId); const decision = parseDepositDecision(raw, kind === 'reject');
      return { input: { id, decision }, subject: { type: 'savings.deposit', ref: String(id) }, payload: decision };
    },
    execute: (envelope, i) => ports.deposits.decide(envelope, i.id, kind, i.decision),
  };
  return runKosipaCommand(ports, actor, spec, body, 'savings.deposit:route');
}
export const approveSavingsDeposit = (ports: SavingsDepositPorts, actor: CommandActor, rawId: string, body: unknown) => decide(ports, actor, rawId, body, 'approve');
export const rejectSavingsDeposit = (ports: SavingsDepositPorts, actor: CommandActor, rawId: string, body: unknown) => decide(ports, actor, rawId, body, 'reject');

type Reader = { capabilities: CapabilitySet; kosipaUserId: number | null; userId: number };
const canRead = (actor: Reader) => actor.capabilities.has('kosipa.savings.view') && actor.capabilities.has('kosipa.member.view');

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Read side of the deposit page: needs savings + member view. `canApprove` per row already applies FD-35 for the viewer. */
export async function listSavingsDeposits(ports: Pick<SavingsDepositPorts, 'deposits' | 'ownership' | 'now'>, actor: Reader, raw: { status?: string; month?: string }) {
  if (!canRead(actor)) throw new KosipaError('FORBIDDEN');
  const status = (['POSTING', 'APPROVED', 'REJECTED', 'ALL'] as const).find((s) => s === raw.status) ?? 'POSTING';
  const month = raw.month && MONTH.test(raw.month) ? raw.month : businessDates(ports.now()).day.slice(0, 7);
  const [rows, legacy] = await Promise.all([ports.deposits.list({ status, month }), ports.deposits.fenceState()]);
  const canPrepare = hasWriteCapability(actor, 'kosipa.savings.prepare'), canDecide = hasWriteCapability(actor, 'kosipa.savings.approve');
  return {
    filter: { status, month }, legacy, canPrepare, canDecide,
    writable: ports.ownership.owns(SAVINGS_DEPOSIT_FEATURE) && legacy === 'fenced',
    rows: rows.map((r) => ({ ...r, canApprove: canDecide && r.status === 'POSTING' && r.makerConsoleUserId !== actor.userId, canReject: canDecide && r.status === 'POSTING' })),
  };
}

/** Member lookup for the deposit form (savings + member view, and the prepare grant: it exists only to prepare a deposit). */
export async function lookupDepositMember(ports: Pick<SavingsDepositPorts, 'deposits'>, actor: Reader, rawNik: unknown): Promise<DepositMemberFacts> {
  if (!canRead(actor) || !hasWriteCapability(actor, 'kosipa.savings.prepare')) throw new KosipaError('FORBIDDEN');
  if (typeof rawNik !== 'string' || !/^[0-9A-Za-z]{1,20}$/.test(rawNik.trim())) throw new KosipaError('NIK_INVALID');
  const found = await ports.deposits.member(rawNik.trim());
  if (!found) throw new KosipaError('MEMBER_NOT_FOUND');
  return found;
}
