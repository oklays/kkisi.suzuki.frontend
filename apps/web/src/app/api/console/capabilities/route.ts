import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { handleConsoleCapabilities } from "@/infrastructure/console/handlers";
import { consoleEnabled } from "@/infrastructure/console/flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withServices((services) => handleConsoleCapabilities(services, request, getContainer().capabilities, consoleEnabled()));
}
