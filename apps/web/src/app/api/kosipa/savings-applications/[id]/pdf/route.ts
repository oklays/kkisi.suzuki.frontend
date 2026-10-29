import { handlePublicSavingsRequest } from '@/infrastructure/public-savings/http';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePublicSavingsRequest(request, 'application-pdf', id);
}
