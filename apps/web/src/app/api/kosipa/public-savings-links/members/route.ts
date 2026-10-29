import { handlePublicSavingsRequest } from '@/infrastructure/public-savings/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handlePublicSavingsRequest(request, 'members');
}
