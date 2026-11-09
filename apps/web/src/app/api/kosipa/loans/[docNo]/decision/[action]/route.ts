import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleLoanDecision } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";
const deps = () => ({ enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null });

export async function POST(request: Request, { params }: { params: Promise<{ docNo: string; action: string }> }) {
  const { docNo, action } = await params;
  return withServices((services) => handleLoanDecision(services, request, docNo, action, deps()));
}
