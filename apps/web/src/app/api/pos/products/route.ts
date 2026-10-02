import { handleProducts } from "@/infrastructure/pos/handlers/products";
import { withServices } from "@/infrastructure/auth/route-helpers";

export const dynamic = "force-dynamic";

/** Read-only catalog: ?q=&category= searches; ?barcode= is an exact scanner lookup. The branch is the session's. */
export async function GET(request: Request) {
  return withServices((services, catalog) => handleProducts(services, catalog, request));
}
