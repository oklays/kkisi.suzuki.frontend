import { withServices } from '@/infrastructure/auth/route-helpers';
import { handleRegisterClose } from '@/infrastructure/pos/handlers/register-close';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return withServices((services) => handleRegisterClose(services,request)); }
