import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError } from '@koperasi/domain/auth/errors';
import { validateSession, type AuthContext } from '@koperasi/application/auth/validate-session';
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
