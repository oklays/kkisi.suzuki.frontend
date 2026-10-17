import { readMemberSavings, type SavingsReader } from '@koperasi/application/kosipa/savings';
import type { KosipaMemberReader } from '@koperasi/application/kosipa/member-360';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, notFound, queryParams, type KosipaApiBase, type KosipaApiDeps } from './kosipa-http.ts';

/** Read-only member savings API (spec REQ-023, TASK-025 read side). GET only. An official balance is never part of any response. */
export type SavingsApiPorts = KosipaApiBase & { savings: SavingsReader; members: Pick<KosipaMemberReader, 'member'> };
export type SavingsApiDeps = KosipaApiDeps<SavingsApiPorts>;

/** GET /api/kosipa/savings/{memberId}?jenis=<type>&after=<movement id> */
export async function handleMemberSavings(services: AuthServices, request: Request, memberId: string, deps: SavingsApiDeps): Promise<Response> {
  try {
    const a = await kosipaActor(services, request, deps); if ('response' in a) return a.response;
    const result = await readMemberSavings({ savings: a.ports.savings, members: a.ports.members, audit: a.ports.audit, now: a.ports.now }, a.actor, { memberId, params: queryParams(request) });
    return result ? json(200, result) : notFound();
  } catch (error) { return kosipaFailure(services, 'kosipa_savings_failed', error); }
}
