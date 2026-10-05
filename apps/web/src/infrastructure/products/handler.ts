import { ReadMasterProducts, type MasterProductRepository } from '@koperasi/application/inventory';
import { ProductReadError, type MasterProductQuery } from '@koperasi/domain/inventory';
import { guard, json, type AuthServices } from '../auth/http.ts';
import { PrismaMasterProductRepository } from '../repositories/prisma-master-product.repository.ts';

export async function handleMasterProducts(services: AuthServices, request: Request, factory: () => MasterProductRepository = () => new PrismaMasterProductRepository()): Promise<Response> {
  const g = await guard(services, request, { permission: 'items_view' });
  if (!g.ok) return g.response;
  const params = new URL(request.url).searchParams;
  try {
    const data = await new ReadMasterProducts(factory()).list({
      companyId: g.ctx.companyId, term: params.get('q') ?? '',
      page: Number(params.get('page') ?? '1'), pageSize: Number(params.get('pageSize') ?? '25'),
      ...(params.has('category') ? { categoryId: Number(params.get('category')) } : {}),
      ...(params.has('brand') ? { brandId: Number(params.get('brand')) } : {}),
      status: (params.get('status') ?? 'all') as MasterProductQuery['status'],
      stock: (params.get('stock') ?? 'all') as MasterProductQuery['stock'],
      sort: (params.get('sort') ?? 'newest') as MasterProductQuery['sort'],
    });
    return json(200, data);
  } catch (error) {
    if (error instanceof ProductReadError && error.code === 'INVALID_INPUT') return json(400, { error: 'INVALID_INPUT' });
    services.deps.log('master_products_read_failed', { code: 'PRODUCTS_UNAVAILABLE' });
    return json(503, { error: 'PRODUCTS_UNAVAILABLE' });
  }
}
