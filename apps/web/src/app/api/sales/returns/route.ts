import { handleReturnList } from '@/infrastructure/sales/return-handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices((services) => handleReturnList(services, request)); }
