import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleKosipaGrantAction } from "@/infrastructure/console/kosipa-grant-handlers";
import { kosipaGrantServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  return withServices((services) => handleKosipaGrantAction(services, request, id, action, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaGrantServices() : null }));
}
