import type { MemberEligibilityFacts } from '@koperasi/domain/kosipa/savings-eligibility';
import type { ExistingDeduction } from '@koperasi/domain/kosipa/savings-monetary';
import type { ExistingChangeRequest } from '@koperasi/domain/kosipa/savings-lifecycle';
import type { PayrollCalendarFacts } from '@koperasi/domain/kosipa/savings-period';
import type { SubmissionSnapshot } from '@koperasi/domain/kosipa/savings-snapshot';
import type { IdempotencyRequest } from '@koperasi/domain/kosipa/savings-idempotency';

/** Application ports only (T01A policy/clock + T01B contracts below); no provider implementation or submission use case here. */
export interface PublicSavingsPolicySource {
  /** Future trusted application source; metadata still requires inspection and never grants authority. */
  read(policyVersion: string): unknown;
}

export interface PublicSavingsClock {
  nowEpochMs(): number;
}

/*
 * CP1-T01B port contracts (KKISI-PSS-2026-V1 v1.0.0). Types only: adapters (Prisma, crypto, storage, provider) are app-owned and
 * belong to CP1-T02..T07. No port exposes payroll processing, profile/config mutation, generic SQL or deduction approval.
 */

/** Authoritative member facts, read for the SESSION-bound member only (never a member chosen by the caller). */
export interface PublicSavingsMemberFacts {
  /** Mapping is verified by the adapter against operator-approved references; raw public body fields are never evidence. */
  readFormFacts(memberRef: string): Promise<unknown>;
  readEligibilityFacts(memberRef: string): Promise<MemberEligibilityFacts>;
  /** VERIFIED_NONE only when absence is positively verified; a missing row alone is UNKNOWN. */
  readExistingDeduction(memberRef: string): Promise<ExistingDeduction>;
  /** All channels (public, mobile, legacy) mapped to logical B-05 states. */
  readChangeRequests(memberRef: string): Promise<readonly ExistingChangeRequest[]>;
}

export interface PayrollCalendarSource {
  read(): Promise<PayrollCalendarFacts>;
}

/** Current trusted-contact evidence from the member master / verified membership record; never a number typed by the public user. */
export interface ContactVerificationSource {
  currentEvidence(memberRef: string): Promise<{ readonly contactVersion: string; readonly maskedDestination: string; readonly evidenceRef: string } | null>;
}

/** Stages the re-encoded private PNG BEFORE the unit of work; returns an immutable private descriptor (no public URL). */
export interface SignatureStore {
  stage(pngBytes: Uint8Array): Promise<SubmissionSnapshot['signature']>;
}

/** Keyed digests and fingerprints (implementation: Node crypto in the app layer). Plaintext tokens/OTPs are never persisted or logged. */
export interface PublicSavingsDigestPort {
  payloadDigest(canonicalSnapshot: string): Promise<string>;
}

/** Durable intents written in the same transaction; external sends and PDF rendering happen only after commit. */
export type PublicSavingsJobIntent =
  | { readonly kind: 'NOTIFY_OPERATIONS'; readonly branch: string }
  | { readonly kind: 'RENDER_PDF'; readonly snapshotDigest: string };

/** Facts re-read under lock inside the unit of work (shapes validated again by the domain rules). */
export interface LockedSubmissionFacts {
  /** Same readonly reference fields shown during review, re-read from authoritative rows under lock. */
  readonly form: unknown;
  /** Authoritative payroll calendar re-read with the transaction's other facts; precheck output is insufficient. */
  readonly calendar: PayrollCalendarFacts;
  readonly eligibility: MemberEligibilityFacts;
  readonly existing: ExistingDeduction;
  readonly requests: readonly ExistingChangeRequest[];
  readonly branch: string;
  readonly link: unknown;
  readonly proof: unknown;
  readonly contactVersion: string;
}

export interface SubmissionTransaction {
  /** Re-read under lock (member -> link) before any decision; never trust facts read outside the transaction. */
  lockFacts(memberRef: string, linkRef: string): Promise<LockedSubmissionFacts>;
  findReceipt(request: IdempotencyRequest): Promise<{ readonly receiptRef: string; readonly payloadFingerprint: string } | null>;
  appendSubmission(snapshot: SubmissionSnapshot, snapshotDigest: string, intents: readonly PublicSavingsJobIntent[]): Promise<{ readonly submissionRef: string }>;
  consumeLink(linkRef: string, submissionRef: string): Promise<void>;
  saveReceipt(request: IdempotencyRequest, receiptRef: string): Promise<void>;
}

/**
 * One business transaction for request + token consume + audit/outbox. A returned value means the outer unit committed; a thrown
 * error rolls back. When the commit acknowledgement is lost the adapter rejects with an error tagged `commitOutcome: 'UNKNOWN'`.
 */
export interface PublicSavingsUnitOfWork {
  run<T>(work: (tx: SubmissionTransaction) => Promise<T>): Promise<T>;
}

/** Deployment gate for public submission. Closed until U-01 cross-channel prevention and the CP1 integration gates are proven. */
export interface PublicSubmissionActivation {
  publicSubmissionEnabled(): boolean;
}
