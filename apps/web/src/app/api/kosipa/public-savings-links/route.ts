import { handlePublicSavingsRequest } from '@/infrastructure/public-savings/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handlePublicSavingsRequest(request, 'links-list');
}

export async function POST(request: Request) {
  return handlePublicSavingsRequest(request, 'links-create');
}
