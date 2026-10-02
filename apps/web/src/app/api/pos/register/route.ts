import { handleRegister } from "@/infrastructure/pos/handlers/register";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withServices((services) => handleRegister(services, request));
}
