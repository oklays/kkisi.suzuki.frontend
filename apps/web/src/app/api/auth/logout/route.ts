import { handleLogout } from "@/infrastructure/auth/handlers/logout";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withServices((services) => handleLogout(services, request));
}
