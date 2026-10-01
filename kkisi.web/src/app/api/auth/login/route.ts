import { handleLogin } from "@/infrastructure/auth/handlers/login";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withServices((services) => handleLogin(services, request));
}
