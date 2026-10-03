import { handleWarehouses } from '@/infrastructure/inventory/handlers';
import { handleReadWarehouses } from '@/infrastructure/inventory/read-handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices((services) => handleReadWarehouses(services, request)); }
export async function POST(request: Request) { return withServices((services) => handleWarehouses(services, request)); }
