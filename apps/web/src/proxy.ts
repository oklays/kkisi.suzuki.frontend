import { NextResponse, type NextRequest } from "next/server";

// Optimistic first gate only (Next docs: never rely on the proxy alone). It checks that a session cookie is present and
// sends everyone else to /login. Real validation (session row, user, role, branch, permission) is in every handler/page.
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has("kkisi_sid") || request.cookies.has("__Host-kkisi_sid");
  if (hasCookie) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/pos/:path*", "/api/pos/:path*", "/inventory/:path*", "/api/inventory/:path*"] };
