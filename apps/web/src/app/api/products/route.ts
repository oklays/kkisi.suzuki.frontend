import { withServices } from '@/infrastructure/auth/route-helpers';
import { handleMasterProducts } from '@/infrastructure/products/handler';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices(services => handleMasterProducts(services, request)); }
