import { handleCheckout } from "@/infrastructure/pos/handlers/checkout";
import { withServices } from "@/infrastructure/auth/route-helpers";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return withServices((services) => handleCheckout(services, request));
}
