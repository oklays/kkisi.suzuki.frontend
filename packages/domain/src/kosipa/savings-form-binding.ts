/** B-06/B-10 readonly form binding. Facts come from a trusted read port, never the public payload.
 * Validation of these injected facts does not attest actual legacy mapping (O-02/O-05/O-06 remain external gates).
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isText, plain, type PssResult } from './savings-shared.ts';

export const PUBLIC_SAVINGS_TYPE = 'SIMPANAN SUKARELA';
export type FormBindingError = PublicSavingsErrorCode | 'AUTHORITATIVE_FORM_UNVERIFIED' | 'FORM_CHANGED';

export interface ReviewedSavingsForm {
  readonly memberRef: string;
  readonly sectionId: string;
  readonly savingsType: typeof PUBLIC_SAVINGS_TYPE;
  readonly formVersion: string;
  readonly consentTextVersion: string;
}
export interface AuthoritativeSavingsForm extends ReviewedSavingsForm {
  readonly contractVersion: 'pss-form-facts/v1';
  readonly referenceStatus: 'VERIFIED';
  /** Controlled mapping/evidence reference, populated by a future verified adapter; not a caller assertion. */
  readonly sourceEvidenceRef: string;
}

const FIELDS = ['memberRef', 'sectionId', 'savingsType', 'formVersion', 'consentTextVersion'] as const;

export function resolveSavingsFormFacts(input: unknown, memberRef: string, policy: unknown): PssResult<AuthoritativeSavingsForm, FormBindingError> {
  const approved = resolveApprovedPolicy(policy);
  if (!approved.ok) return approved;
  if (!isText(memberRef, 128)) return fail('INVALID_INPUT', 'memberRef');
  const f = plain(input, ['contractVersion', 'referenceStatus', 'sourceEvidenceRef', ...FIELDS]);
  if (!f || f.contractVersion !== 'pss-form-facts/v1' || f.referenceStatus !== 'VERIFIED' || !isText(f.sourceEvidenceRef, 256)
    || f.memberRef !== memberRef || !isText(f.sectionId, 128) || f.savingsType !== PUBLIC_SAVINGS_TYPE
    || !isText(f.formVersion, 64) || !isText(f.consentTextVersion, 64)) return fail('AUTHORITATIVE_FORM_UNVERIFIED');
  return { ok: true, value: Object.freeze({ contractVersion: 'pss-form-facts/v1', referenceStatus: 'VERIFIED', sourceEvidenceRef: f.sourceEvidenceRef,
    memberRef, sectionId: f.sectionId, savingsType: PUBLIC_SAVINGS_TYPE, formVersion: f.formVersion, consentTextVersion: f.consentTextVersion }) };
}

export function validateSavingsFormBinding(reviewed: unknown, current: unknown, memberRef: string, policy: unknown): PssResult<AuthoritativeSavingsForm, FormBindingError> {
  const resolved = resolveSavingsFormFacts(current, memberRef, policy);
  if (!resolved.ok) return resolved;
  const echo = plain(reviewed, FIELDS);
  if (!echo || FIELDS.some((field) => !isText(echo[field], 128))) return fail('INVALID_INPUT', 'form');
  for (const field of FIELDS) if (echo[field] !== resolved.value[field]) return fail('FORM_CHANGED', field);
  return resolved;
}
