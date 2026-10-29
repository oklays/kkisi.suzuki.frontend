import { handlePublicSavingsRequest } from '@/infrastructure/public-savings/http';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePublicSavingsRequest(request, 'links-revoke', id);
}
