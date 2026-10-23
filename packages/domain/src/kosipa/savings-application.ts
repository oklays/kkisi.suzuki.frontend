/** DOMAIN SPIKE only. Shape inspection cannot authenticate policy approval or authorise submission. */
export type PublicSavingsErrorCode =
  | 'INVALID_INPUT'
  | 'CONTRACT_VERSION_UNSUPPORTED'
  | 'POLICY_UNAPPROVED'
  | 'POLICY_NOT_IMPLEMENTED';

export interface PublicSavingsError {
  readonly code: PublicSavingsErrorCode;
  readonly field?: string;
}

export type PublicSavingsResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PublicSavingsError };

export type PublicSavingsEvaluationResult = PublicSavingsResult<never>;

export interface PublicSavingsSubmissionDraft {
  readonly amountRupiah: string;
  readonly sectionId: string;
  readonly startMonth: string;
  readonly startYear: string;
  readonly consent: boolean;
  readonly consentVersion: string;
  readonly formVersion: string;
  readonly signature: { readonly reference: string; readonly contentHash: string };
}

export type PublicSavingsPolicyApprovalState = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface PublicSavingsPolicyApproval {
  readonly approverRole: string;
  readonly approvedAt: string;
  readonly scope: string;
  readonly evidenceRef: string;
}

export type PublicSavingsPolicyEnvelope = {
  readonly contractVersion: 'public-savings-policy/v1';
  readonly policyVersion: string;
  /** Opaque, untrusted metadata; no business rules are executed in this spike. */
  readonly rules: Readonly<Record<string, unknown>>;
} & (
  | { readonly approvalState: 'APPROVED'; readonly approval: PublicSavingsPolicyApproval }
  | { readonly approvalState: Exclude<PublicSavingsPolicyApprovalState, 'APPROVED'>; readonly approval: null }
);

const SUBMISSION_VERSION = 'public-savings-submission/v1';
const POLICY_VERSION = 'public-savings-policy/v1';
const SUBMISSION_FIELDS = ['amountRupiah', 'sectionId', 'startMonth', 'startYear', 'consent', 'consentVersion', 'formVersion', 'signature'];
const POLICY_FIELDS = ['contractVersion', 'policyVersion', 'approvalState', 'approval', 'rules'];
const APPROVAL_FIELDS = ['approverRole', 'approvedAt', 'scope', 'evidenceRef'];

function reject(code: PublicSavingsErrorCode, field?: string): { readonly ok: false; readonly error: PublicSavingsError } {
  return { ok: false, error: { code, ...(field === undefined ? {} : { field }) } };
}

/** Read own JSON-like data properties without invoking accessors or accepting inherited fields. */
function readRecord(input: unknown): Record<string, unknown> | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  try {
    if (Array.isArray(input)) return undefined;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    // Missing fields must not fall back to unrelated Object.prototype properties.
    const record: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string') return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      Object.defineProperty(record, key, { value: descriptor.value, enumerable: true });
    }
    return record;
  } catch {
    return undefined;
  }
}

function hasOnlyFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(record).every((key) => fields.includes(key));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function digits(value: unknown, minLength: number, maxLength?: number): value is string {
  return typeof value === 'string' && value.length >= minLength
    && (maxLength === undefined || value.length <= maxLength) && !/[^0-9]/u.test(value);
}

/** Structural success is NOT money, consent, signature, identity or calendar validation. */
export function parseSavingsSubmission(input: unknown, contractVersion: unknown): PublicSavingsResult<PublicSavingsSubmissionDraft> {
  if (contractVersion !== SUBMISSION_VERSION) return reject('CONTRACT_VERSION_UNSUPPORTED', 'contractVersion');
  const record = readRecord(input);
  if (!record || !hasOnlyFields(record, SUBMISSION_FIELDS)) return reject('INVALID_INPUT', 'submission');
  const { amountRupiah, sectionId, startMonth, startYear, consent, consentVersion, formVersion } = record;
  if (!digits(amountRupiah, 1)) return reject('INVALID_INPUT', 'amountRupiah');
  if (!text(sectionId)) return reject('INVALID_INPUT', 'sectionId');
  if (!digits(startMonth, 1, 2)) return reject('INVALID_INPUT', 'startMonth');
  if (!digits(startYear, 4, 4)) return reject('INVALID_INPUT', 'startYear');
  if (typeof consent !== 'boolean') return reject('INVALID_INPUT', 'consent');
  if (!text(consentVersion)) return reject('INVALID_INPUT', 'consentVersion');
  if (!text(formVersion)) return reject('INVALID_INPUT', 'formVersion');
  const signature = readRecord(record.signature);
  if (!signature || !hasOnlyFields(signature, ['reference', 'contentHash'])) return reject('INVALID_INPUT', 'signature');
  const { reference, contentHash } = signature;
  if (!text(reference)) return reject('INVALID_INPUT', 'signature.reference');
  if (!text(contentHash)) return reject('INVALID_INPUT', 'signature.contentHash');
  return { ok: true, value: { amountRupiah, sectionId, startMonth, startYear, consent, consentVersion, formVersion, signature: { reference, contentHash } } };
}

/** Latest spike instruction rejects unapproved metadata; APPROVED shape is still not trusted approval. */
export function inspectPublicSavingsPolicy(input: unknown): PublicSavingsResult<PublicSavingsPolicyEnvelope> {
  const record = readRecord(input);
  if (!record || !hasOnlyFields(record, POLICY_FIELDS) || !Object.hasOwn(record, 'contractVersion')) return reject('POLICY_UNAPPROVED', 'policy');
  if (record.contractVersion !== POLICY_VERSION) return reject('CONTRACT_VERSION_UNSUPPORTED', 'contractVersion');
  const { policyVersion } = record;
  if (!text(policyVersion)) return reject('POLICY_UNAPPROVED', 'policyVersion');
  if (record.approvalState !== 'APPROVED') return reject('POLICY_UNAPPROVED', 'approvalState');
  const approval = readRecord(record.approval);
  if (!approval || !hasOnlyFields(approval, APPROVAL_FIELDS)) return reject('POLICY_UNAPPROVED', 'approval');
  const { approverRole, approvedAt, scope, evidenceRef } = approval;
  if (!text(approverRole)) return reject('POLICY_UNAPPROVED', 'approval.approverRole');
  if (!text(approvedAt)) return reject('POLICY_UNAPPROVED', 'approval.approvedAt');
  if (!text(scope)) return reject('POLICY_UNAPPROVED', 'approval.scope');
  if (!text(evidenceRef)) return reject('POLICY_UNAPPROVED', 'approval.evidenceRef');
  const rules = readRecord(record.rules);
  if (!rules) return reject('POLICY_UNAPPROVED', 'rules');
  return { ok: true, value: {
    contractVersion: POLICY_VERSION, policyVersion, approvalState: 'APPROVED',
    approval: { approverRole, approvedAt, scope, evidenceRef }, rules: { ...rules },
  } };
}

/** No successful authorisation path exists, even with apparently approved metadata. */
export function evaluatePublicSavingsSubmission(draft: PublicSavingsSubmissionDraft, policy: unknown): PublicSavingsEvaluationResult {
  const inspected = inspectPublicSavingsPolicy(policy);
  if (!inspected.ok) return inspected;
  const parsed = parseSavingsSubmission(draft, SUBMISSION_VERSION);
  if (!parsed.ok) return parsed;
  return reject('POLICY_NOT_IMPLEMENTED');
}
