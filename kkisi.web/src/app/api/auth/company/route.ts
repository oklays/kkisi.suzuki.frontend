import { handleCompany } from "@/infrastructure/auth/handlers/company";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withServices((services) => handleCompany(services, request));
}
