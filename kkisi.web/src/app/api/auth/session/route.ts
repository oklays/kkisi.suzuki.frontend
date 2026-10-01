import { handleSession } from "@/infrastructure/auth/handlers/session";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withServices((services) => handleSession(services, request));
}
