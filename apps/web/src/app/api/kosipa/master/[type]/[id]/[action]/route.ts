import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleMasterStatus } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ type: string; id: string; action: string }> }) {
  const { type, id, action } = await params;
  return withServices((services) => handleMasterStatus(services, request, type, id, action, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null }));
}
