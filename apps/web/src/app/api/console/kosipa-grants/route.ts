import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleCreateKosipaGrant, handleListKosipaGrants } from "@/infrastructure/console/kosipa-grant-handlers";
import { kosipaGrantServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

const deps = () => ({ enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaGrantServices() : null });

export async function GET(request: Request) {
  return withServices((services) => handleListKosipaGrants(services, request, deps()));
}

export async function POST(request: Request) {
  return withServices((services) => handleCreateKosipaGrant(services, request, deps()));
}
