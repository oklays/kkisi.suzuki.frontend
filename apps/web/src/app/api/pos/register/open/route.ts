import { withServices } from '@/infrastructure/auth/route-helpers';
import { handleRegisterOpen } from '@/infrastructure/pos/handlers/register-open';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return withServices((services) => handleRegisterOpen(services, request)); }
