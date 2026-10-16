import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleCreateIdentityLink } from "@/infrastructure/console/identity-handlers";
import { consoleServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withServices((services) => handleCreateIdentityLink(services, request, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? consoleServices() : null }));
}
