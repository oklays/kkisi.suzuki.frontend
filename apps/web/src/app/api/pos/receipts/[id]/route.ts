import { withServices } from '@/infrastructure/auth/route-helpers';
import { handleReceipt } from '@/infrastructure/pos/handlers/receipt';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withServices((services) => handleReceipt(services, request, id));
}
