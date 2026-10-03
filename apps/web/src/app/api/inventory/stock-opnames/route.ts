import { handleStockOpnames } from '@/infrastructure/inventory/handlers';
import { handleReadStockOpnames } from '@/infrastructure/inventory/read-handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return withServices((services) => handleReadStockOpnames(services, request)); }
export async function POST(request: Request) { return withServices((services) => handleStockOpnames(services, request)); }
