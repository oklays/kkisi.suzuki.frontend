import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleCreateDeposit, handleListDeposits } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";
const deps = () => ({ enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null });

export async function GET(request: Request) { return withServices((services) => handleListDeposits(services, request, deps())); }
export async function POST(request: Request) { return withServices((services) => handleCreateDeposit(services, request, deps())); }
