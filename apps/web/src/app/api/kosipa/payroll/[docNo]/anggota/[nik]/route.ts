import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handlePayrollMember } from "@/infrastructure/console/payroll-handlers";
import { kosipaServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ docNo: string; nik: string }> }) {
  const { docNo, nik } = await context.params;
  return withServices((services) => handlePayrollMember(services, request, docNo, nik, { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaServices() : null }));
}
