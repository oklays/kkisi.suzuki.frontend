import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConfigError } from '../config/env.ts';
import { authDeps } from '../../server/container.ts';
import { pendingPinSession, resolveMember, type ActiveSession } from '../../server/auth/auth-service.ts';
import { StoreUnavailableError } from '../../server/db/mysql.ts';
import { ServiceUnavailableError } from '../errors/service-errors.ts';

// cookies() is read FIRST: it marks the request dynamic even when configuration is missing, so no member screen can ever be
// prerendered as a static page (e.g. in an image build without runtime environment).
async function sid(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(authDeps().settings.cookieName)?.value ?? null;
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) {
    if (e instanceof ConfigError) throw new ServiceUnavailableError('NOT_CONFIGURED');
    if (e instanceof StoreUnavailableError) throw new ServiceUnavailableError('STORE_UNAVAILABLE');
    throw e;
  }
};

/** The authenticated member of THIS request (memoised per request). Every protected page and data read starts here. */
export const currentMember = cache(async (): Promise<ActiveSession | null> => wrap(async () => resolveMember(authDeps(), await sid())));

/** Redirects to /masuk (keeping the deep link) when there is no authenticated member. */
export async function requireMember(): Promise<ActiveSession> {
  const member = await currentMember();
  if (!member) {
    const path = (await headers()).get('x-kkisi-path') ?? '/beranda';
    redirect(`/masuk?next=${encodeURIComponent(path)}`);
  }
  return member;
}

export const currentPinSession = cache(async () => wrap(async () => pendingPinSession(authDeps(), await sid())));
