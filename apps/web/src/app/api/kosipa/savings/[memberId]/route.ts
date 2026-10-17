import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleMemberSavings } from "@/infrastructure/console/savings-handlers";
import { kosipaServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await context.params;
  return withServices((services) => handleMemberSavings(services, request, memberId, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaServices() : null }));
}
