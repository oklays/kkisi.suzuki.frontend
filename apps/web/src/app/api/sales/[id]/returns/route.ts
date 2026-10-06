import { handleCreateReturn, handleReturnContext } from '@/infrastructure/sales/return-handlers';
import { withServices } from '@/infrastructure/auth/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id?: string }> };
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return withServices((services) => handleReturnContext(services, request, id ?? ''));
}
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return withServices((services) => handleCreateReturn(services, request, id ?? ''));
}
