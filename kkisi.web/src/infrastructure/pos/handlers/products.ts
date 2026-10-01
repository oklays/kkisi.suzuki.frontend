import { findCatalogBarcode, searchCatalog } from '../../../application/pos/catalog.ts';
import type { ReadProductsUseCase } from '../../../application/inventory/use-cases/read-products.usecase.ts';
import { ProductReadError, type ProductReadErrorCode } from '../../../domain/shared/product-read-error.ts';
import { errorResponse, guard, json, type AuthServices } from '../../auth/http.ts';

const STATUS: Record<ProductReadErrorCode, number> = { INVALID_INPUT: 400, NOT_FOUND: 404, DB_UNAVAILABLE: 503, NOT_CONFIGURED: 503, UNEXPECTED: 500 };

/** GET /api/pos/products: catalog read for the SESSION branch. company_id/companyId in the request are never read. */
export async function handleProducts(services: AuthServices, catalog: ReadProductsUseCase, request: Request): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add' });
  if (!g.ok) return g.response;
  const params = new URL(request.url).searchParams;
  const companyId = g.ctx.companyId;
  try {
    const barcode = params.get('barcode');
    const category = params.get('category');
    const products = barcode !== null
      ? await findCatalogBarcode(catalog, { companyId, barcode })
      : await searchCatalog(catalog, { companyId, term: params.get('q') ?? '', ...(category ? { categoryId: Number(category) } : {}) });
    return json(200, { products });
  } catch (error) {
    if (error instanceof ProductReadError) {
      services.deps.log('catalog_read_failed', { code: error.code });
      return json(STATUS[error.code], { error: error.code });
    }
    return errorResponse(services, error);
  }
}
