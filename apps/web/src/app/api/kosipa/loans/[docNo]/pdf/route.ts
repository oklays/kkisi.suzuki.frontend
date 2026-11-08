import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { handleLoanCardPdfExport } from "@/infrastructure/console/document-pdf-handlers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { kosipaServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ docNo: string }> }) {
  const { docNo } = await context.params;
  return withServices((services) =>
    handleLoanCardPdfExport(
      services,
      request,
      { enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaServices() : null },
      { docNo },
    ),
  );
}
