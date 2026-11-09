import { KosipaError, parseLoanDocNo } from '@koperasi/domain/kosipa';
import {
  isLoanDecisionAction, loanDecisionOptions, parseLoanDecision,
  type LoanDecisionAction, type LoanDecisionContext, type LoanDecisionFacts, type LoanDecisionInput, type LoanDecisionOption,
} from '@koperasi/domain/kosipa/loan-decision';
import type { KosipaWriteCapability } from '@koperasi/domain/console/capabilities';
import type { AuditAction } from '@koperasi/domain/console/identity-link';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { hasWriteCapability, runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';
import type { LegacyFenceState } from './master.ts';

/**
 * Loan decision commands (REQ-119; WI-14 first slice; legacy F26). Feature `loan.decision`, fenced against every legacy controller that writes
 * trans_pinjaman.doc_status (kosipa-ownership.ts). Rules live in @koperasi/domain/kosipa/loan-decision.
 *   post    (kosipa.loan.prepare)  OPEN -> POSTING
 *   approve (kosipa.loan.approve)  OPEN|POSTING -> APPROVED, checker != native poster
 *   reject  (kosipa.loan.approve)  OPEN|POSTING -> REJECTED with a reason, checker != native poster
 */
export const LOAN_DECISION_FEATURE = 'loan.decision';
const CAPABILITY: Record<LoanDecisionAction, KosipaWriteCapability> = { post: 'kosipa.loan.prepare', approve: 'kosipa.loan.approve', reject: 'kosipa.loan.approve' };
const AUDIT: Record<LoanDecisionAction, AuditAction> = { post: 'kosipa.loan.post', approve: 'kosipa.loan.approve', reject: 'kosipa.loan.reject' };

export type LoanDecisionResult = { id: number; docNo: string; status: string; version: string };
export type LoanDecisionRecord = {
  facts: LoanDecisionFacts;
  context: Omit<LoanDecisionContext, 'actorConsoleUserId'>;
  /** Opaque optimistic version of the header and the mobile request(s). */
  version: string;
  /** Decision stamps already on the header (display names as legacy stores them). */
  stamps: { postedAt: string | null; postedBy: string | null; approvedAt: string | null; approvedBy: string | null; rejectedAt: string | null; rejectedBy: string | null; rejectReason: string | null };
};

export interface LoanDecisionRepository {
  /** ONE transaction: fence, lock header(s) + mobile request(s), version check, poster from the ledger, plan, guarded UPDATEs, verify, ledger row. */
  decide(envelope: CommandEnvelope, docNo: string, action: LoanDecisionAction, input: LoanDecisionInput): Promise<CommandOutcome<LoanDecisionResult>>;
  /** Unlocked read of the same facts for the detail page; null when no header carries the number. */
  read(docNo: string): Promise<LoanDecisionRecord | null>;
  fenceState(): Promise<LegacyFenceState>;
  /** Owner-approved coexistence (UAT): legacy loan screens stay open and the fence is not required. */
  readonly sharedWithLegacy: boolean;
}
export type LoanDecisionPorts = CommandPorts & { loanDecisions: LoanDecisionRepository };

export async function decideLoan(ports: LoanDecisionPorts, actor: CommandActor, rawDocNo: string, rawAction: string, body: unknown): Promise<CommandOutcome<LoanDecisionResult>> {
  if (!isLoanDecisionAction(rawAction)) throw new KosipaError('NOT_FOUND');
  const action = rawAction;
  const spec: CommandSpec<{ docNo: string; input: LoanDecisionInput }, LoanDecisionResult> = {
    command: `loan.${action}`, feature: LOAN_DECISION_FEATURE, capability: CAPABILITY[action], audit: AUDIT[action],
    parse(raw) {
      const docNo = parseLoanDocNo(rawDocNo);
      const input = parseLoanDecision(raw, action);
      return { input: { docNo, input }, subject: { type: 'loan', ref: docNo }, payload: input };
    },
    execute: (envelope, i) => ports.loanDecisions.decide(envelope, i.docNo, action, i.input),
  };
  return runKosipaCommand(ports, actor, spec, body, 'loan:route');
}

export type LoanDecisionState = {
  docNo: string; status: string | null; version: string; mobile: boolean;
  /** Legacy fence and ownership: false = the panel explains why nothing can be decided here. */
  writable: boolean; legacy: LegacyFenceState; owned: boolean;
  /** Coexistence mode: decisions allowed while legacy loan screens are open (the panel warns about it). */
  shared: boolean;
  options: LoanDecisionOption[];
  /** The viewer posted this loan natively, so maker != checker forbids their approval/rejection. */
  postedByViewer: boolean;
  stamps: LoanDecisionRecord['stamps'];
};
type Reader = { capabilities: CapabilitySet; kosipaUserId: number | null; userId: number };

/** Decision panel state (kosipa.loan.view). Never throws for "cannot decide": blockers are reported per action. */
export async function readLoanDecision(ports: Pick<LoanDecisionPorts, 'loanDecisions' | 'ownership'>, actor: Reader, rawDocNo: string): Promise<LoanDecisionState | null> {
  if (!actor.capabilities.has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN');
  const docNo = parseLoanDocNo(rawDocNo);
  const record = await ports.loanDecisions.read(docNo);
  if (!record) return null;
  const owned = ports.ownership.owns(LOAN_DECISION_FEATURE);
  const legacy = await ports.loanDecisions.fenceState();
  const shared = ports.loanDecisions.sharedWithLegacy;
  const writable = owned && (legacy === 'fenced' || shared);
  const capable = { post: hasWriteCapability(actor, CAPABILITY.post), approve: hasWriteCapability(actor, CAPABILITY.approve), reject: hasWriteCapability(actor, CAPABILITY.reject) };
  const options = loanDecisionOptions(record.facts, { ...record.context, actorConsoleUserId: actor.userId }, capable)
    .map((o) => (o.allowed && !writable ? { ...o, allowed: false, blocker: owned ? 'LEGACY_ACTIVE' : 'WRITE_DISABLED' } : o));
  return {
    docNo: record.facts.docNo, status: record.facts.status, version: record.version, mobile: record.facts.mobile, writable, legacy, owned, shared, options,
    postedByViewer: record.context.posterConsoleUserId !== null && record.context.posterConsoleUserId === actor.userId, stamps: record.stamps,
  };
}
