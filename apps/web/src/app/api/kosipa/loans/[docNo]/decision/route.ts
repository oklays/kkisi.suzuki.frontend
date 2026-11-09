import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleLoanDecisionState } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";
const deps = () => ({ enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null });

export async function GET(request: Request, { params }: { params: Promise<{ docNo: string }> }) {
  const { docNo } = await params;
  return withServices((services) => handleLoanDecisionState(services, request, docNo, deps()));
}
