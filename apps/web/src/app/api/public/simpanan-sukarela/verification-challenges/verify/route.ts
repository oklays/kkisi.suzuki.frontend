import { handlePublicSavingsRequest } from '@/infrastructure/public-savings/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handlePublicSavingsRequest(request, 'verify');
}
