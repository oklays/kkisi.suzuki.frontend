import { checkReadiness } from "@/infrastructure/db/startup-check";

export const dynamic = "force-dynamic";

/** Readiness: configuration valid and both databases answer `SELECT 1`. Component booleans only; never hosts or errors. */
export async function GET() {
  const { ready, checks } = await checkReadiness();
  return Response.json({ status: ready ? "ready" : "unavailable", checks }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
