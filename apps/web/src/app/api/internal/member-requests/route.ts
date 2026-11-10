import { handleMemberIntake, intakeDepsFromEnv } from "@/infrastructure/member-intake/http";
import { kosipaWriteOwnership } from "@/infrastructure/console/kosipa-ownership";
import { memberRequestRepository } from "@/infrastructure/console/services";

export const dynamic = "force-dynamic";

/** Signed internal intake from the PWA Anggota BFF (P1). Never reachable through the public proxy; see infrastructure/member-intake/http.ts. */
export async function POST(request: Request) {
  return handleMemberIntake(request, intakeDepsFromEnv(process.env, () => ({
    ownership: kosipaWriteOwnership(process.env),
    requests: memberRequestRepository(process.env),
    now: () => new Date(),
    log: (event, fields = {}) => console.info(JSON.stringify({ at: new Date().toISOString(), app: "web", event, ...fields })),
  })));
}
