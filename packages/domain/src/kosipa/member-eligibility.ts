/**
 * Member eligibility for member-credit services (spec prompt E). The rule set is the one the Next.js POS already
 * enforces for Kredit (packages/domain/src/pos/sale.ts memberCredit), extracted so KOSIPA services can reuse the same
 * decision. It never changes member state: deactivation of expired contracts is a separate, owner-approved process
 * (spec BR-012), not a side effect of a read.
 */
export type EligibilityFacts = { nik: string; status: string; employment: string; exitOn: string | null };
export type IneligibleReason = 'NO_NIK' | 'STATUS_NOT_ACTIVE' | 'CONTRACT_EXPIRED';

/** `today` is the Jakarta business date (YYYY-MM-DD), e.g. businessDates(now).day. */
export function evaluateMemberEligibility(member: EligibilityFacts, today: string): { eligible: boolean; reasons: IneligibleReason[] } {
  const reasons: IneligibleReason[] = [];
  if (!member.nik || member.nik === '0') reasons.push('NO_NIK');
  if (member.status !== 'AKTIVE') reasons.push('STATUS_NOT_ACTIVE');
  if (member.employment === 'KONTRAK' && (!member.exitOn || today >= member.exitOn)) reasons.push('CONTRACT_EXPIRED');
  return { eligible: reasons.length === 0, reasons };
}
