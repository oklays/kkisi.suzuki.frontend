import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleChangeMemberStatus } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withServices((services) => handleChangeMemberStatus(services, request, id, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null }));
}
