import { getContainer } from './container.ts';
import { json, type AuthServices } from './http.ts';
import type { ReadProductsUseCase } from '@koperasi/application/inventory';

/** Builds the services for a route; a missing/unsafe configuration is a plain 503 (never a default, never a 500 with details). */
export async function withServices(run: (services: AuthServices, catalog: ReadProductsUseCase) => Promise<Response>): Promise<Response> {
  let container: ReturnType<typeof getContainer>;
  try { container = getContainer(); }
  catch { console.error('[auth] not_configured'); return json(503, { error: 'AUTH_UNAVAILABLE' }); }
  return run(container.services, container.catalog);
}
