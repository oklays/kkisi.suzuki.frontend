import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError } from '@koperasi/domain/auth/errors';
import { safeNextPath } from '@koperasi/domain/auth/redirect';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { validateSession, type AuthContext } from '@koperasi/application/auth/validate-session';
import { resolveConsoleCapabilities } from '@koperasi/application/console/capabilities';
import { getContainer } from './container.ts';
import type { AuthServices } from './http.ts';

export type PageAuth =
  | { kind: 'ok'; ctx: AuthContext; services: AuthServices; catalog: ReturnType<typeof getContainer>['catalog'] }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' };

/**
 * Server-component guard for pages. No session -> redirect to /login; missing permission -> 'forbidden';
 * any database/config failure -> 'unavailable' (never rendered as logged in). Pages must call this before reading data.
 */
export async function requirePagePermission(permission: string | readonly string[]): Promise<PageAuth> {
  let container: ReturnType<typeof getContainer>;
  let outcome: PageAuth | 'login';
  try {
    container = getContainer();
    const jar = await cookies();
    const ctx = await validateSession(container.services.deps, jar.get(container.services.config.cookieName)?.value ?? null);
    const permissions = Array.isArray(permission) ? permission : [permission];
    let allowed = false;
    for (const slug of permissions) if (await ctx.hasPermission(slug)) { allowed = true; break; }
    if (!allowed) throw new AuthError('FORBIDDEN');
    outcome = { kind: 'ok', ctx, services: container.services, catalog: container.catalog };
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') outcome = 'login';
    else if (error instanceof AuthError && error.code === 'FORBIDDEN') outcome = { kind: 'forbidden' };
    else outcome = { kind: 'unavailable' };
  }
  if (outcome === 'login') redirect('/login');
  return outcome;
}

export type ConsoleAuth =
  | { kind: 'ok'; ctx: AuthContext; services: AuthServices; capabilities: CapabilitySet }
  | { kind: 'unavailable' };

/** One validation + capability resolution per request, shared by the console layout and its page. */
const loadConsoleSession = cache(async (): Promise<ConsoleAuth | 'login'> => {
  try {
    const container = getContainer();
    const jar = await cookies();
    const ctx = await validateSession(container.services.deps, jar.get(container.services.config.cookieName)?.value ?? null);
    const capabilities = await resolveConsoleCapabilities(container.capabilities, { roleId: ctx.roleId, canSwitchBranch: ctx.canSwitchBranch });
    return { kind: 'ok', ctx, services: container.services, capabilities };
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') return 'login';
    return { kind: 'unavailable' };
  }
});

/**
 * Server-component guard for /console: a valid, active session is enough to enter (spec REQ-010; it deliberately does
 * NOT inherit sales_add). What the user sees comes from the returned capabilities. No session -> /login with a safe
 * `next`; any store failure -> 'unavailable' (never rendered as logged in). Pages must call this before reading data.
 */
export async function requireConsoleSession(options: { next: string }): Promise<ConsoleAuth> {
  const outcome = await loadConsoleSession();
  if (outcome === 'login') redirect(`/login?next=${encodeURIComponent(safeNextPath(options.next, '/console'))}`);
  return outcome;
}
