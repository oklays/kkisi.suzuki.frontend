import { handleSalePayments } from '@/infrastructure/sales/handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id?: string }> }) {
  const { id } = await params;
  return withServices((services) => handleSalePayments(services, request, id ?? ''));
}
