import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleRevokeIdentityLink } from "@/infrastructure/console/identity-handlers";
import { consoleServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withServices((services) => handleRevokeIdentityLink(services, request, id, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? consoleServices() : null }));
}
