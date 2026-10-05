import { handleSalesHistory } from '@/infrastructure/sales/handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices((services) => handleSalesHistory(services, request)); }
