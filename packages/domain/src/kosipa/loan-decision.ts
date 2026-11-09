import { KosipaError } from './errors.ts';
import { parseIdempotencyKey, parseReason } from './command.ts';

/**
 * Loan decision (Posting / Approve / Reject; legacy F26 `ajax_posting/{doc_no}` in the seven loan product controllers; REQ-119, WI-14 first slice).
 *
 * Legacy contract (pinjaman_c.php:1230 and its six copies):
 *   UPDATE trans_pinjaman SET doc_status = <POST>, cd_usr = <session name> WHERE doc_no = <url>; reject also keterangan_riject = <POST> (kasbon, reguler only)
 *   if pengajuan_mobile = <POST> 1: UPDATE trans_pinjaman_pengajuan SET doc_status (+ keterangan_riject) WHERE doc_no
 *   if APPROVED: every trans_pinjaman_rollover old loan -> status_bayar LUNAS, pelunasan 1, ALL its instalments 'Bayar'
 *   pembiayaan_c only: APPROVED also writes publish = 1 and status/type/tgl_pencairan from the request
 *
 * Native rules (and the legacy defects they correct):
 *   - The server decides the transition; the client only names the action (ANO-K03: legacy accepted any status string, even re-approving).
 *       post     OPEN            -> POSTING   (kosipa.loan.prepare: documents checked by staff)
 *       approve  OPEN | POSTING  -> APPROVED  (kosipa.loan.approve)
 *       reject   OPEN | POSTING  -> REJECTED  (kosipa.loan.approve, reason 5-200 characters, VAL-108; kasbon_c never sent one)
 *   - `cd_usr` stays the maker (ANO-K27; the legacy print labels it "Dibuat"). The decision is stamped in the columns the table already has and
 *     legacy never filled: posting_doc(_usr), approved_doc(_usr), rejected_doc(_usr); ud/ud_usr as usual.
 *   - Maker != checker (BR-105, FD-17 a): whoever posted the loan natively may not approve or reject it. Legacy-posted loans carry no native
 *     identity and may be decided natively (FD-17 c).
 *   - The mobile request is synchronised from the STORED flag (trans_pinjaman.pengajuan_mobile = 1), never from the request.
 *   - Roll-over settlement is NOT an approval effect. Legacy settles the old loans again on disbursement (pinjaman_c::ajax_update with
 *     status_pencairan APPROVED), which is where REQ-120 places it; settling at approval marked old loans LUNAS for a new loan that may never be
 *     disbursed. Disbursement fields are never written by a decision (pembiayaan_c took them from the request).
 *   - Fail closed on records a decision would make worse: a doc_no carried by several headers (legacy updated all of them), a loan already
 *     disbursed or settled while undecided, a loan bound to a PPOB pay-later order (its order/IAK state belongs to the PPOB module), more than
 *     one mobile request with that number; approval also needs a positive principal and one known, not-exited member.
 */
export const LOAN_DECISION_STATUS = { open: 'OPEN', posting: 'POSTING', approved: 'APPROVED', rejected: 'REJECTED' } as const;
export const LOAN_DECISION_ACTIONS = ['post', 'approve', 'reject'] as const;
export type LoanDecisionAction = (typeof LOAN_DECISION_ACTIONS)[number];

const RULES: Record<LoanDecisionAction, { from: readonly string[]; to: string; checker: boolean }> = {
  post: { from: [LOAN_DECISION_STATUS.open], to: LOAN_DECISION_STATUS.posting, checker: false },
  approve: { from: [LOAN_DECISION_STATUS.open, LOAN_DECISION_STATUS.posting], to: LOAN_DECISION_STATUS.approved, checker: true },
  reject: { from: [LOAN_DECISION_STATUS.open, LOAN_DECISION_STATUS.posting], to: LOAN_DECISION_STATUS.rejected, checker: true },
};
/** Members who have left: no new obligation may be approved for them (exit settlement owns their position). */
const EXITED = ['RESIGN', 'PENSIUN'];

export type LoanDecisionFacts = {
  id: number; docNo: string; status: string | null; disbursement: string | null; repayment: string | null;
  /** trans_pinjaman.plan_pinjaman as exact database text. */
  planPrincipal: string; type: string | null; nik: string | null; mobile: boolean;
  /** Headers carrying this doc_no (normally 1). */
  headerCount: number;
};
export type LoanDecisionContext = {
  actorConsoleUserId: number;
  /** Console user who posted this loan natively (from the ledger); null = posted by legacy or never posted. */
  posterConsoleUserId: number | null;
  /** Members whose NIK matches the loan's NIK (all lookup aliases); only read for approval. */
  members: readonly { status: string | null }[];
  /** trans_pinjaman_pengajuan rows with this doc_no (only meaningful when the loan is a mobile loan). */
  mobileRequests: number;
  /** PPOB pay-later orders whose order_code is this doc_no. */
  ppobOrders: number;
};
export type LoanDecisionInput = { expectedVersion: string; reason?: string; idempotencyKey: string };
export type LoanDecisionPlan = {
  action: LoanDecisionAction; from: string; to: string; reason: string | null;
  /** Which legacy stamp columns receive the decision time and the decider's display name. */
  stamp: 'posting' | 'approved' | 'rejected';
  syncMobile: boolean;
};

export function isLoanDecisionAction(raw: string): raw is LoanDecisionAction {
  return (LOAN_DECISION_ACTIONS as readonly string[]).includes(raw);
}

/** Body: { idempotencyKey, expectedVersion, reason } — reason is required for reject and refused for post/approve. */
export function parseLoanDecision(raw: unknown, action: LoanDecisionAction): LoanDecisionInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new KosipaError('INVALID_INPUT');
  const allowed = action === 'reject' ? ['idempotencyKey', 'expectedVersion', 'reason'] : ['idempotencyKey', 'expectedVersion'];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) throw new KosipaError('FIELD_NOT_ALLOWED');
  const b = raw as Record<string, unknown>;
  const idempotencyKey = parseIdempotencyKey(b.idempotencyKey);
  if (typeof b.expectedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(b.expectedVersion)) throw new KosipaError('VERSION_INVALID');
  return { expectedVersion: b.expectedVersion, idempotencyKey, ...(action === 'reject' ? { reason: parseReason(b.reason) } : {}) };
}

/** Exact sign test on stored decimal text: true when the value is a number greater than zero. */
function positive(raw: string): boolean {
  const m = /^\s*(-?)(\d*)(?:\.(\d*))?\s*$/.exec(raw);
  if (!m || (!m[2] && !m[3]) || m[1] === '-') return false;
  return /[1-9]/.test(`${m[2]}${m[3] ?? ''}`);
}

/** Integrity blockers shared by every action, in a fixed order (the first one is reported). */
function assertDecidable(loan: LoanDecisionFacts, ctx: Pick<LoanDecisionContext, 'mobileRequests' | 'ppobOrders'>): void {
  if (loan.headerCount !== 1) throw new KosipaError('LOAN_DUPLICATE_HEADER');
  if (loan.disbursement === 'APPROVED' || loan.repayment === 'LUNAS') throw new KosipaError('LOAN_STATE_INCONSISTENT');
  if (ctx.ppobOrders > 0) throw new KosipaError('LOAN_PPOB_ORDER');
  if (loan.mobile && ctx.mobileRequests > 1) throw new KosipaError('LOAN_MOBILE_REQUEST_CONFLICT');
}

/**
 * Pure decision on facts read under lock. Order: existence, transition, integrity, maker/checker, approval-only member and amount checks.
 * Throws KosipaError: LOAN_NOT_FOUND, LOAN_STATUS_INVALID, LOAN_DUPLICATE_HEADER, LOAN_STATE_INCONSISTENT, LOAN_PPOB_ORDER,
 * LOAN_MOBILE_REQUEST_CONFLICT, LOAN_MAKER_CHECKER, LOAN_AMOUNT_INVALID, LOAN_MEMBER_NOT_FOUND, LOAN_MEMBER_AMBIGUOUS, LOAN_MEMBER_INACTIVE.
 */
export function planLoanDecision(loan: LoanDecisionFacts | null, action: LoanDecisionAction, ctx: LoanDecisionContext, reason?: string): LoanDecisionPlan {
  if (!loan) throw new KosipaError('LOAN_NOT_FOUND');
  const rule = RULES[action];
  if (!rule) throw new KosipaError('INVALID_INPUT');
  if (!rule.from.includes(loan.status ?? '')) throw new KosipaError('LOAN_STATUS_INVALID');
  assertDecidable(loan, ctx);
  if (rule.checker && ctx.posterConsoleUserId !== null && ctx.posterConsoleUserId === ctx.actorConsoleUserId) throw new KosipaError('LOAN_MAKER_CHECKER');
  if (action === 'approve') {
    if (!positive(loan.planPrincipal)) throw new KosipaError('LOAN_AMOUNT_INVALID');
    if (ctx.members.length === 0) throw new KosipaError('LOAN_MEMBER_NOT_FOUND');
    if (ctx.members.length > 1) throw new KosipaError('LOAN_MEMBER_AMBIGUOUS');
    if (EXITED.includes((ctx.members[0].status ?? '').trim().toUpperCase())) throw new KosipaError('LOAN_MEMBER_INACTIVE');
  }
  if (action === 'reject' && !reason) throw new KosipaError('REASON_INVALID');
  return {
    action, from: loan.status as string, to: rule.to, reason: action === 'reject' ? (reason as string) : null,
    stamp: action === 'post' ? 'posting' : action === 'approve' ? 'approved' : 'rejected',
    syncMobile: loan.mobile && ctx.mobileRequests === 1,
  };
}

export type LoanDecisionOption = { action: LoanDecisionAction; allowed: boolean; blocker: string | null };
/**
 * What the detail page may offer, using the same planner (presentation only: the command re-checks everything on locked rows).
 * `capable` = the viewer holds the action's write capability.
 */
export function loanDecisionOptions(loan: LoanDecisionFacts, ctx: LoanDecisionContext, capable: Record<LoanDecisionAction, boolean>): LoanDecisionOption[] {
  return LOAN_DECISION_ACTIONS.map((action) => {
    if (!capable[action]) return { action, allowed: false, blocker: 'FORBIDDEN' };
    try { planLoanDecision(loan, action, ctx, action === 'reject' ? 'presentation' : undefined); return { action, allowed: true, blocker: null }; }
    catch (error) { if (error instanceof KosipaError) return { action, allowed: false, blocker: error.code }; throw error; }
  });
}

/** Ledger before/after: document identity, statuses and the principal; no member identity (OBS-101). */
export function loanDecisionSnapshot(loan: Pick<LoanDecisionFacts, 'id' | 'docNo' | 'status' | 'disbursement' | 'repayment' | 'planPrincipal' | 'type' | 'mobile'>, status: string) {
  return { id: loan.id, doc_no: loan.docNo, doc_status: status, status_pencairan: loan.disbursement ?? '', status_bayar: loan.repayment ?? '', plan_pinjaman: loan.planPrincipal, jenis_pinjaman: loan.type ?? '', mobile: loan.mobile };
}
