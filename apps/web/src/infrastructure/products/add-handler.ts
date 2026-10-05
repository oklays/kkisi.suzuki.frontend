import { AddProducts, type ProductAddRepository } from '@koperasi/application/inventory';
import { ProductEditError, type ProductEditErrorCode } from '@koperasi/domain/inventory';
import { guard, json, readJson, type AuthServices } from '../auth/http.ts';
import { trustedClientIp } from '../auth/client-ip.ts';
import { productAddRepository } from '../repositories/prisma-product-add.repository.ts';
const statuses: Record<ProductEditErrorCode, number> = { INVALID_INPUT: 400, NOT_FOUND: 404, FORBIDDEN: 403, STOCK_LOCKED: 409, PRODUCT_CHANGED: 409, IDENTIFIER_EXISTS: 409, WRITE_NOT_CONFIGURED: 503 };
export async function handleProductAdd(services: AuthServices, request: Request, factory: (write: boolean) => ProductAddRepository = productAddRepository): Promise<Response> {
  const read = request.method === 'GET';
  const g = await guard(services, request, read ? { permission: 'items_add' } : { permission: 'items_add', csrf: true });
  if (!g.ok) return g.response;
  try {
    if (read) return json(200, { options: await new AddProducts(factory(false)).options(g.ctx) });
    const raw = await readJson(request, 20000);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProductEditError('INVALID_INPUT');
    const ip = trustedClientIp(request.headers.get('x-forwarded-for'), services.config.trustedProxyHops) ?? '';
    const result = await new AddProducts(factory(true)).add(g.ctx, raw, { now: services.deps.clock.now(), ip: ip.slice(0, 50) });
    services.deps.log('product_add', { actorId: g.ctx.userId, companyId: g.ctx.companyId, itemId: result.id, stock: result.stock });
    return json(200, result);
  } catch (error) {
    if (error instanceof ProductEditError) return json(statuses[error.code], { error: error.code });
    const e = error as { code?: string; meta?: { code?: string } };
    const invalid = e.code === 'P2010' && ['1366', '1406'].includes(String(e.meta?.code));
    services.deps.log('product_add_failed', { code: invalid ? 'INVALID_INPUT' : 'PRODUCTS_UNAVAILABLE' });
    return json(invalid ? 400 : 503, { error: invalid ? 'INVALID_INPUT' : 'PRODUCTS_UNAVAILABLE' });
  }
}
