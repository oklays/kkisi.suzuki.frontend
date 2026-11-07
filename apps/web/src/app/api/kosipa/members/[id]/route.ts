import { getContainer } from "@/infrastructure/auth/container";
import { withServices } from "@/infrastructure/auth/route-helpers";
import { consoleEnabled } from "@/infrastructure/console/flags";
import { handleGetMemberForEdit, handleUpdateMemberProfile } from "@/infrastructure/console/kosipa-command-http";
import { kosipaCommandServices } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

const deps = () => ({ enabled: consoleEnabled(), permissions: getContainer().capabilities, ports: consoleEnabled() ? kosipaCommandServices() : null });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withServices((services) => handleGetMemberForEdit(services, request, id, deps()));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withServices((services) => handleUpdateMemberProfile(services, request, id, deps()));
}
