/**
 * Console <-> KOSIPA identity link rules (spec REQ-020). A link is created by an administrator for ANOTHER console user,
 * only to an active KOSIPA account that actually has access groups, and never by matching names/e-mails/NIKs.
 */
export class ConsoleError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ConsoleError'; this.code = code; }
}

export type LinkFacts = {
  actorUserId: number;
  consoleUser: { id: number; active: boolean } | null;
  kosipaUser: { id: number; active: boolean; activeGroups: number } | null;
  consoleUserAlreadyLinked: boolean;
  kosipaUserAlreadyLinked: boolean;
};

export function assertIdentityLinkAllowed(f: LinkFacts): void {
  if (!f.consoleUser) throw new ConsoleError('CONSOLE_USER_NOT_FOUND');
  if (f.consoleUser.id === f.actorUserId) throw new ConsoleError('SELF_LINK');
  if (!f.consoleUser.active) throw new ConsoleError('CONSOLE_USER_INACTIVE');
  if (!f.kosipaUser) throw new ConsoleError('KOSIPA_USER_NOT_FOUND');
  if (!f.kosipaUser.active) throw new ConsoleError('KOSIPA_USER_INACTIVE');
  if (f.kosipaUser.activeGroups < 1) throw new ConsoleError('KOSIPA_USER_NO_ACCESS');
  if (f.consoleUserAlreadyLinked) throw new ConsoleError('CONSOLE_USER_ALREADY_LINKED');
  if (f.kosipaUserAlreadyLinked) throw new ConsoleError('KOSIPA_USER_ALREADY_LINKED');
}

export const REVOKE_REASON_MAX = 200;
export function assertRevocationAllowed(link: { status: 'active' | 'revoked' } | null, reason: string): string {
  if (!link) throw new ConsoleError('LINK_NOT_FOUND');
  if (link.status !== 'active') throw new ConsoleError('LINK_NOT_ACTIVE');
  const clean = reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (clean.length < 3 || clean.length > REVOKE_REASON_MAX) throw new ConsoleError('REASON_REQUIRED');
  return clean;
}

const KEY = /^[a-z][A-Za-z0-9_]{0,31}$/;
const SENSITIVE_KEY = /pass|pwd|token|secret|cookie|session|sid|nik|nama|name|phone|telp|hp|email|alamat|address|rek|ktp|gaji|salary/i;
const SAFE_TEXT = /^[\w .:/@#-]{0,64}$/;

/**
 * Audit detail is an allow-listed, flat, small object: safe identifiers and codes only. Keys that could carry
 * credentials or personal data are dropped even if a caller passes them; free text and nested values are dropped.
 */
export function sanitizeAuditDetail(detail: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> | null {
  if (!detail) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail).slice(0, 12)) {
    if (!KEY.test(key) || SENSITIVE_KEY.test(key)) continue;
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) out[key] = value;
    else if (typeof value === 'string' && SAFE_TEXT.test(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export const AUDIT_ACTIONS = ['identity_link.create', 'identity_link.revoke', 'identity_link.denied', 'kosipa.member.view', 'kosipa.payroll.list.view', 'kosipa.payroll.batch.view', 'kosipa.payroll.member.view', 'kosipa.payroll.reconcile', 'kosipa.loan.list.view', 'kosipa.loan.detail.view', 'kosipa.savings.view', 'kosipa.report.loan.view', 'kosipa.report.payroll.view', 'kosipa.report.quality.view', 'kosipa.report.export', 'kosipa.report.membership.view', 'kosipa.report.savings.view',
  // KOSIPA native writes (kosipa-full-access FA-01): committed commands, refusals, and write-capability grants.
  'kosipa.master.create', 'kosipa.master.update', 'kosipa.master.deactivate', 'kosipa.master.reactivate', 'kosipa.command.denied', 'kosipa.command.failed',
  'kosipa.grant.request', 'kosipa.grant.approve', 'kosipa.grant.reject', 'kosipa.grant.revoke', 'kosipa.grant.denied'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
