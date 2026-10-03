import { handleInventoryItems } from '@/infrastructure/inventory/read-handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices((services) => handleInventoryItems(services, request)); }
