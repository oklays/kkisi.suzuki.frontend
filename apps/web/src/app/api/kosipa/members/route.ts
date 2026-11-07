import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleRegisterMember } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withServices((services) => handleRegisterMember(services, request, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null }));
}
