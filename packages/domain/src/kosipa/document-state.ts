import { KosipaError } from './errors.ts';

/**
 * Server-side lifecycle of KOSIPA financial documents (spec REQ-031, §5). The client only names an action; the server
 * decides whether it is valid for the current state. Legacy took the target status string from the request.
 */
export const DOCUMENT_STATES = ['DRAFT', 'OPEN', 'APPROVED', 'REJECTED', 'CANCELLED', 'DISBURSED', 'POSTED', 'SETTLED', 'REVERSED'] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];
export type DocumentKind = 'loan' | 'withdrawal' | 'savings' | 'payroll-batch' | 'shu' | 'mobile-request';
export type DocumentAction = 'submit' | 'cancel' | 'approve' | 'reject' | 'disburse' | 'post' | 'settle' | 'reverse';

/** Kinds that pay money out end in DISBURSED; kinds that book money in/allocations end in POSTED. */
const PAYOUT: ReadonlySet<DocumentKind> = new Set(['loan', 'withdrawal']);

type Rule = { from: readonly DocumentState[]; to: DocumentState; kinds?: (k: DocumentKind) => boolean; checker?: boolean; reason?: boolean };
const RULES: Record<DocumentAction, Rule> = {
  submit: { from: ['DRAFT'], to: 'OPEN' },
  cancel: { from: ['DRAFT', 'OPEN'], to: 'CANCELLED' },
  approve: { from: ['OPEN'], to: 'APPROVED', checker: true },
  reject: { from: ['OPEN'], to: 'REJECTED', checker: true, reason: true },
  disburse: { from: ['APPROVED'], to: 'DISBURSED', kinds: (k) => PAYOUT.has(k), checker: true },
  post: { from: ['APPROVED'], to: 'POSTED', kinds: (k) => !PAYOUT.has(k), checker: true },
  settle: { from: ['DISBURSED'], to: 'SETTLED', kinds: (k) => k === 'loan' },
  reverse: { from: ['POSTED', 'DISBURSED'], to: 'REVERSED', checker: true, reason: true },
};

export type DocumentFacts = { kind: DocumentKind; state: DocumentState; makerId: number };
export type TransitionRequest = { action: DocumentAction; actorId: number; reason?: string };

/**
 * Pure transition check. Throws KosipaError:
 * INVALID_TRANSITION (action not allowed from this state/kind), MAKER_CHECKER (creator approving/posting/reversing their
 * own document, spec BR-008), REASON_REQUIRED (reject/reverse without a reason). Terminal states accept nothing.
 */
export function nextDocumentState(doc: DocumentFacts, request: TransitionRequest): DocumentState {
  const rule = RULES[request.action];
  if (!rule || !rule.from.includes(doc.state) || (rule.kinds && !rule.kinds(doc.kind))) throw new KosipaError('INVALID_TRANSITION');
  if (rule.checker && request.actorId === doc.makerId) throw new KosipaError('MAKER_CHECKER');
  if (rule.reason && !(request.reason ?? '').trim()) throw new KosipaError('REASON_REQUIRED');
  return rule.to;
}

/** Approved and later documents are immutable; corrections go through a reversal document (spec BR-009). */
export function isEditable(state: DocumentState): boolean {
  return state === 'DRAFT' || state === 'OPEN';
}
