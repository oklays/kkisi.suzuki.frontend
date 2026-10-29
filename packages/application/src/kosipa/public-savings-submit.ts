/**
 * CP1-T01B submit orchestration contract (KKISI-PSS-2026-V1 v1.0.0, B-10/B-11). Real adapters (Prisma unit of work, crypto,
 * storage) belong to CP1-T02..T05; until then only fakes exist and the activation gate stays closed (U-01). A SUBMITTED result is
 * an intake receipt for the existing CI2 approval workflow, never an approved or executed deduction.
 */
import { PSS_POLICY_V1_VERSION, resolveApprovedPolicy } from '@koperasi/domain/kosipa/savings-policy';
import { evaluateMembershipEligibility } from '@koperasi/domain/kosipa/savings-eligibility';
import { evaluateDeductionChange } from '@koperasi/domain/kosipa/savings-monetary';
import { evaluateDuplicateConflict } from '@koperasi/domain/kosipa/savings-lifecycle';
import { resolveRequestedPeriod } from '@koperasi/domain/kosipa/savings-period';
import { validateSavingsFormBinding } from '@koperasi/domain/kosipa/savings-form-binding';
import { evaluateLinkState, evaluateVerificationProof, PUBLIC_SAVINGS_LINK_PURPOSE } from '@koperasi/domain/kosipa/savings-link';
import { buildSubmissionSnapshot, canonicalSnapshot, type SubmissionSnapshot } from '@koperasi/domain/kosipa/savings-snapshot';
import { idempotencyDecision, type IdempotencyRequest } from '@koperasi/domain/kosipa/savings-idempotency';
import type { PublicSavingsClock, PublicSavingsDigestPort, PublicSavingsPolicySource, PublicSavingsUnitOfWork, PublicSubmissionActivation, LockedSubmissionFacts } from './public-savings.ts';

export interface SubmitDeps {
  readonly policies: PublicSavingsPolicySource;
  readonly clock: PublicSavingsClock;
  readonly activation: PublicSubmissionActivation;
  readonly digest: PublicSavingsDigestPort;
  readonly uow: PublicSavingsUnitOfWork;
}
export interface SubmitCommand { readonly memberRef: string; readonly linkRef: string; readonly idempotencyKey: string; readonly snapshotInput: unknown }
export type SubmitOutcome = { readonly kind: 'SUBMITTED' | 'REPLAY'; readonly receiptRef: string; readonly submissionAuthorized: false };
export type SubmitResult = { readonly ok: true; readonly value: SubmitOutcome } | { readonly ok: false; readonly error: { readonly code: string; readonly field?: string } };

/** Thrown inside the unit of work so that every buffered write is rolled back; converted to a result outside. */
class Rejection {
  readonly result: SubmitResult;
  constructor(result: SubmitResult) { this.result = result; }
}
const refuse = (r: { ok: false; error: { code: string; field?: string } }): never => { throw new Rejection(r); };
const isUnknownCommit = (e: unknown) => typeof e === 'object' && e !== null && (e as { commitOutcome?: unknown }).commitOutcome === 'UNKNOWN';

function recheck(locked: LockedSubmissionFacts, snapshot: SubmissionSnapshot, command: SubmitCommand, policy: unknown, now: number): void {
  const link = evaluateLinkState(locked.link, { memberRef: command.memberRef, purpose: PUBLIC_SAVINGS_LINK_PURPOSE }, now, policy);
  if (!link.ok) refuse(link);
  const linkExpiry = (locked.link as { expiresAtEpochMs: number }).expiresAtEpochMs;
  const proof = evaluateVerificationProof(locked.proof, { memberRef: command.memberRef, linkRef: command.linkRef, contactVersion: locked.contactVersion, linkExpiresAtEpochMs: linkExpiry }, now, policy);
  if (!proof.ok) refuse(proof);
  if (snapshot.verification.contactVersion !== locked.contactVersion) refuse({ ok: false, error: { code: 'VERIFICATION_REQUIRED', field: 'contactVersion' } });
  const eligibility = evaluateMembershipEligibility(locked.eligibility, policy, now);
  if (!eligibility.ok) refuse(eligibility);
  const binding = validateSavingsFormBinding({ memberRef: snapshot.memberRef, sectionId: snapshot.sectionId, savingsType: snapshot.savingsType,
    formVersion: snapshot.formVersion, consentTextVersion: snapshot.consentTextVersion }, locked.form, command.memberRef, policy);
  if (!binding.ok) refuse(binding);
  // The reviewed authoritative deduction must still be the current one; otherwise renewed review and consent are required.
  const current = locked.existing;
  const reviewedOriginal = current.kind === 'AMOUNT' ? current.value : current.kind === 'VERIFIED_NONE' ? null : undefined;
  if (reviewedOriginal !== snapshot.originalDeduction) refuse({ ok: false, error: { code: 'FORM_CHANGED', field: 'originalDeduction' } });
  const change = evaluateDeductionChange(current, snapshot.requestedAmount, policy);
  if (!change.ok) refuse(change);
  const period = resolveRequestedPeriod(locked.calendar, snapshot.requestedPeriod, policy, now);
  if (!period.ok) return refuse(period);
  if (period.value.requestedPeriod.year !== snapshot.requestedPeriod.year || period.value.requestedPeriod.month !== snapshot.requestedPeriod.month) {
    refuse({ ok: false, error: { code: 'FORM_CHANGED', field: 'requestedPeriod' } });
  }
  const duplicate = evaluateDuplicateConflict(command.memberRef, locked.requests, snapshot.requestedPeriod, policy);
  if (!duplicate.ok) refuse(duplicate);
}

export async function submitPublicSavingsChange(deps: SubmitDeps, command: SubmitCommand): Promise<SubmitResult> {
  if (deps.activation.publicSubmissionEnabled() !== true) return { ok: false, error: { code: 'ACTIVATION_BLOCKED' } };
  let policy: unknown;
  try { policy = deps.policies.read(PSS_POLICY_V1_VERSION); } catch { return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE' } }; }
  const approved = resolveApprovedPolicy(policy);
  if (!approved.ok) return approved;
  const built = buildSubmissionSnapshot(command.snapshotInput, policy);
  if (!built.ok) return built;
  const snapshot = built.value;
  if (snapshot.memberRef !== command.memberRef) return { ok: false, error: { code: 'INVALID_INPUT', field: 'memberRef' } };
  let fingerprint: string;
  try { fingerprint = await deps.digest.payloadDigest(canonicalSnapshot(snapshot)); } catch { return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE' } }; }   // outside the lock
  const request: IdempotencyRequest = { scope: { actorRef: `link:${command.linkRef}`, memberRef: command.memberRef, command: 'SUBMIT' }, key: command.idempotencyKey, payloadFingerprint: fingerprint };
  if (!idempotencyDecision(null, request).ok) return { ok: false, error: { code: 'INVALID_INPUT', field: 'idempotencyKey' } };

  try {
    return await deps.uow.run(async (tx): Promise<SubmitResult> => {
      const found = await tx.findReceipt(request);
      const decision = idempotencyDecision(found ? { ...request, payloadFingerprint: found.payloadFingerprint, receiptRef: found.receiptRef } : null, request);
      if (!decision.ok) return refuse(decision);
      if (decision.value.kind === 'REPLAY') return { ok: true, value: { kind: 'REPLAY', receiptRef: decision.value.receiptRef, submissionAuthorized: false } };
      const locked = await tx.lockFacts(command.memberRef, command.linkRef);
      // Re-read time after lock acquisition: waiting must not extend a link/proof lifetime.
      recheck(locked, snapshot, command, policy, deps.clock.nowEpochMs());
      const { submissionRef } = await tx.appendSubmission(snapshot, fingerprint, [{ kind: 'NOTIFY_OPERATIONS', branch: locked.branch }, { kind: 'RENDER_PDF', snapshotDigest: fingerprint }]);
      await tx.consumeLink(command.linkRef, submissionRef);
      await tx.saveReceipt(request, submissionRef);
      return { ok: true, value: { kind: 'SUBMITTED', receiptRef: submissionRef, submissionAuthorized: false } };
    });
  } catch (error) {
    if (error instanceof Rejection) return error.result;
    if (isUnknownCommit(error)) return { ok: false, error: { code: 'COMMIT_OUTCOME_UNKNOWN' } };   // look up by key before any retry
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE' } };
  }
}
