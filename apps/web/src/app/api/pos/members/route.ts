import { handleMembers } from "@/infrastructure/pos/handlers/members";
import { withServices } from "@/infrastructure/auth/route-helpers";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withServices((services) => handleMembers(services, request));
}
