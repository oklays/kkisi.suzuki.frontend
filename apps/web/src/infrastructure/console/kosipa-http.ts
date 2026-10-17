import { randomUUID } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { resolveConsoleAccess, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import { errorResponse, guard, json, type AuthServices } from '../auth/http.ts';

/**
 * Shared gate for the read-only KOSIPA API (payroll, loans, ...). Order: feature flag -> session -> services present -> server-side
 * capabilities. Use cases then re-check, audit BEFORE reading, and read bounded pages. Failures are code-only.
 */
export type KosipaApiBase = Pick<IdentityPorts, 'links' | 'kosipa' | 'audit' | 'now'>;
export type KosipaApiDeps<P extends KosipaApiBase> = { enabled: boolean; permissions: PermissionSetSource; ports: P | null };
export type KosipaActor = { userId: number; capabilities: CapabilitySet; requestId: string };

const STATUS: Record<string, number> = { FORBIDDEN: 403, PERIOD_INVALID: 400, FILTER_INVALID: 400, CURSOR_INVALID: 400, DOC_NO_INVALID: 400, NIK_INVALID: 400, MEMBER_ID_INVALID: 400, AMOUNT_INVALID: 502 };

export async function kosipaActor<P extends KosipaApiBase>(services: AuthServices, request: Request, deps: KosipaApiDeps<P>): Promise<{ response: Response } | { actor: KosipaActor; ports: P }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request);            // GET: session required, no CSRF token (nothing is written)
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'KOSIPA_UNAVAILABLE' }) };
  const { links, kosipa } = deps.ports;
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: { links, kosipa } }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  return { actor: { userId: g.ctx.userId, capabilities: access.capabilities, requestId: randomUUID() }, ports: deps.ports };
}

export function kosipaFailure(services: AuthServices, event: string, error: unknown): Response {
  if (error instanceof KosipaError) return json(STATUS[error.code] ?? 400, { error: error.code });
  if (error instanceof Error && error.name !== 'AuthError') { services.deps.log(event, {}); return json(503, { error: 'KOSIPA_UNAVAILABLE' }); }
  return errorResponse(services, error);
}

export const queryParams = (request: Request): Record<string, string> => { const q: Record<string, string> = {}; for (const [k, v] of new URL(request.url).searchParams) if (!(k in q)) q[k] = v; return q; };
export const notFound = (): Response => json(404, { error: 'NOT_FOUND' });
