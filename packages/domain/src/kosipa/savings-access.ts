/**
 * CP1-T01B — B-13 staff role-action matrix and B-14 notification routing/escalation (KKISI-PSS-2026-V1 v1.0.0).
 * Logical roles must be mapped onto the existing console/KOSIPA authorisation (no parallel privileges); that mapping is CP2/O-08.
 * Deduction approval never happens here: it stays with the legacy CI2 workflow until an approved CP3 cutover.
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, isText, jakartaParts, plain, type PssResult } from './savings-shared.ts';

export type AccessErrorCode = PublicSavingsErrorCode | 'FORBIDDEN' | 'REASON_REQUIRED' | 'LEGACY_CI2_ONLY' | 'ALERT_NO_RECIPIENT';
export type PssRole = 'MEMBER' | 'STAFF_VIEWER' | 'STAFF_OPERATOR' | 'MEMBERSHIP_VERIFIER' | 'KOSIPA_SUPERVISOR' | 'LEGACY_APPROVER' | 'SYSTEM_ADMIN' | 'AUDITOR';
export type PssAction = 'VIEW_SUBMISSIONS' | 'ISSUE_LINK' | 'REISSUE_LINK' | 'REVOKE_LINK' | 'VERIFY_CONTACT' | 'REBIND_CONTACT_MAKE' | 'REBIND_CONTACT_CHECK'
  | 'APPROVE_EXCEPTION' | 'VIEW_ESCALATIONS' | 'VIEW_AUDIT' | 'CONFIGURE_SYSTEM' | 'APPROVE_DEDUCTION';

const MATRIX: Readonly<Record<PssRole, readonly PssAction[]>> = {
  MEMBER: [],
  STAFF_VIEWER: ['VIEW_SUBMISSIONS'],
  STAFF_OPERATOR: ['VIEW_SUBMISSIONS', 'ISSUE_LINK', 'REISSUE_LINK', 'REVOKE_LINK'],
  MEMBERSHIP_VERIFIER: ['VIEW_SUBMISSIONS', 'VERIFY_CONTACT', 'REBIND_CONTACT_MAKE', 'REBIND_CONTACT_CHECK'],
  KOSIPA_SUPERVISOR: ['VIEW_SUBMISSIONS', 'REVOKE_LINK', 'APPROVE_EXCEPTION', 'VIEW_ESCALATIONS'],
  LEGACY_APPROVER: [],
  SYSTEM_ADMIN: ['CONFIGURE_SYSTEM'],
  AUDITOR: ['VIEW_AUDIT'],
};
const MAKER_CHECKER: readonly PssAction[] = ['APPROVE_EXCEPTION', 'REBIND_CONTACT_CHECK'];
const NEEDS_REASON: readonly PssAction[] = ['REVOKE_LINK'];

export function canPerform(actor: { actorRef: string; roles: readonly string[]; branches: readonly string[] }, action: PssAction,
  target: { branch: string; makerRef?: string; reason?: string }): PssResult<'ALLOWED', AccessErrorCode> {
  if (action === 'APPROVE_DEDUCTION') return fail('LEGACY_CI2_ONLY');   // no second approval writer, whatever the role
  if (!isText(actor.actorRef, 128) || !Array.isArray(actor.roles) || !Array.isArray(actor.branches)) return fail('FORBIDDEN', 'actor');
  const allowed = actor.roles.some((r) => Object.prototype.hasOwnProperty.call(MATRIX, r) && MATRIX[r as PssRole].includes(action));
  if (!allowed) return fail('FORBIDDEN', 'action');
  if (!isText(target.branch, 64) || !actor.branches.includes(target.branch)) return fail('FORBIDDEN', 'branch');
  if (MAKER_CHECKER.includes(action) && (!isText(target.makerRef, 128) || target.makerRef === actor.actorRef)) return fail('FORBIDDEN', 'makerChecker');
  if (NEEDS_REASON.includes(action) && !isText(target.reason, 500)) return fail('REASON_REQUIRED', 'reason');
  return { ok: true, value: 'ALLOWED' };
}

const LOGICAL_REF = /^[a-z]+:[A-Za-z0-9:_-]{1,120}$/u;

/** Primary = active operations recipients of the branch; backup = supervisor/fallback. Logical references only (no e-mail/phone). */
export function resolveNotificationRecipients(branch: string, directory: unknown): PssResult<{ readonly primary: readonly string[]; readonly backup: readonly string[] }, AccessErrorCode> {
  if (directory === null || typeof directory !== 'object' || Array.isArray(directory)) return fail('INVALID_INPUT', 'directory');
  const entry = Object.prototype.hasOwnProperty.call(directory, branch) ? plain((directory as Record<string, unknown>)[branch], ['primary', 'backup']) : undefined;
  if (!entry) return fail('ALERT_NO_RECIPIENT');
  const refs = (v: unknown) => Array.isArray(v) && v.every((r) => typeof r === 'string' && LOGICAL_REF.test(r));
  if (!refs(entry.primary) || !refs(entry.backup)) return fail('INVALID_INPUT', 'directory');
  const primary = entry.primary as string[]; const backup = entry.backup as string[];
  if (primary.length === 0 && backup.length === 0) return fail('ALERT_NO_RECIPIENT');
  return { ok: true, value: { primary: [...primary], backup: [...backup] } };
}

const DAY = 86400000; const JKT = 7 * 3600000;

/** Pending longer than the approved number of Asia/Jakarta business days (Mon–Fri, configured holidays excluded). */
export function isEscalationDue(submittedAtEpochMs: number, nowEpochMs: number, holidays: readonly string[], policy: unknown): boolean {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok || !isEpochMs(submittedAtEpochMs) || !isEpochMs(nowEpochMs) || !Array.isArray(holidays)) return true;   // fail closed: escalate
  if (nowEpochMs <= submittedAtEpochMs) return false;
  const limit = resolved.value.rules.lifecycle.escalationBusinessDays * DAY;
  let elapsed = 0;
  // Walk Jakarta calendar days from the submission day; bounded so corrupt input cannot loop for long.
  for (let dayStart = Math.floor((submittedAtEpochMs + JKT) / DAY) * DAY - JKT, i = 0; dayStart < nowEpochMs && i < 400; dayStart += DAY, i++) {
    const p = jakartaParts(dayStart);
    const iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    if (p.weekday === 0 || p.weekday === 6 || holidays.includes(iso)) continue;
    elapsed += Math.max(0, Math.min(nowEpochMs, dayStart + DAY) - Math.max(submittedAtEpochMs, dayStart));
    if (elapsed > limit) return true;
  }
  return elapsed > limit;
}
