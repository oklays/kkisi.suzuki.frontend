export const dynamic = "force-dynamic";

/** Liveness: the Next.js process answers. No database access. */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
