/**
 * CP1-T01B — B-04 payroll period resolution (KKISI-PSS-2026-V1 v1.0.0). No arbitrary cutoff date: the first period that the
 * authoritative KOSIPA/CI2 payroll calendar marks OPEN, at or after both the intended period and the current Asia/Jakarta month.
 * An unverifiable calendar or no eligible period keeps the application pending/staff-handled; a month is never guessed.
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, jakartaParts, plain, type PssResult } from './savings-shared.ts';

export type PeriodErrorCode = PublicSavingsErrorCode | 'PERIOD_UNVERIFIED';
export type PayrollPeriodState = 'OPEN' | 'LOCKED' | 'POSTING' | 'CLOSED';
export interface PayrollPeriod { readonly year: number; readonly month: number }
export interface PayrollCalendarFacts {
  readonly source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR';
  readonly verified: boolean;
  readonly periods: readonly (PayrollPeriod & { readonly state: PayrollPeriodState })[];
}
export interface ResolvedPeriod {
  readonly intendedPeriod: PayrollPeriod;
  readonly requestedPeriod: PayrollPeriod;
  readonly timezone: 'Asia/Jakarta';
  /** Consent captured in the snapshot: first eligible cycle after approval, never retroactive. */
  readonly effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL';
  readonly policyVersion: string;
}

const STATES: readonly string[] = ['OPEN', 'LOCKED', 'POSTING', 'CLOSED'];
const validPeriod = (p: Record<string, unknown> | undefined): p is { year: number; month: number } =>
  !!p && Number.isSafeInteger(p.year) && (p.year as number) >= 2000 && (p.year as number) <= 9999 && Number.isSafeInteger(p.month) && (p.month as number) >= 1 && (p.month as number) <= 12;
const key = (p: PayrollPeriod) => p.year * 12 + (p.month - 1);

export function resolveRequestedPeriod(calendar: unknown, intended: unknown, policy: unknown, nowEpochMs: number): PssResult<ResolvedPeriod, PeriodErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  if (!isEpochMs(nowEpochMs)) return fail('INVALID_INPUT', 'now');
  const want = plain(intended, ['year', 'month']);
  if (!validPeriod(want)) return fail('INVALID_INPUT', 'intendedPeriod');
  const cal = plain(calendar, ['source', 'verified', 'periods']);
  if (!cal || cal.source !== resolved.value.rules.period.calendarSource || cal.verified !== true || !Array.isArray(cal.periods)) return fail('PERIOD_UNVERIFIED');
  const seen = new Set<number>(); const open: PayrollPeriod[] = [];
  for (const raw of cal.periods) {
    const p = plain(raw, ['year', 'month', 'state']);
    const state = p?.state;
    if (!validPeriod(p) || typeof state !== 'string' || !STATES.includes(state) || seen.has(key(p))) return fail('PERIOD_UNVERIFIED', 'calendar');   // malformed or ambiguous calendar
    seen.add(key(p)); if (state === 'OPEN') open.push({ year: p.year, month: p.month });
  }
  const now = jakartaParts(nowEpochMs);
  const floor = Math.max(key(want), key({ year: now.year, month: now.month }));
  const candidate = open.filter((p) => key(p) >= floor).sort((a, b) => key(a) - key(b))[0];
  if (!candidate) return fail('PERIOD_UNVERIFIED');
  return { ok: true, value: { intendedPeriod: { year: want.year, month: want.month }, requestedPeriod: candidate, timezone: 'Asia/Jakarta',
    effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL', policyVersion: resolved.value.policyVersion } };
}
