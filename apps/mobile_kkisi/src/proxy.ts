import { NextResponse, type NextRequest } from 'next/server';
import { acceptRequestId } from './lib/observability/request-id.ts';

// Optimistic first gate only (Next docs: never rely on the proxy for authorization). It (1) forwards the requested path so a
// server-side redirect to /masuk can keep the deep link, and (2) sends requests without any session cookie straight to /masuk.
// The real check (valid session row, PIN completed, account still active) runs in requireMember() for every page and read.
const PUBLIC = /^\/(masuk|pin|offline|health|api\/auth\/|manifest\.webmanifest|sw\.js)/;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const path = `${pathname}${search}`.slice(0, 200);
  const hasCookie = request.cookies.has('kkisi_member') || request.cookies.has('__Host-kkisi_member');
  if (!hasCookie && !PUBLIC.test(pathname)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const url = request.nextUrl.clone();
    url.pathname = '/masuk';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set('x-kkisi-path', path);
  // One id per request (nginx $request_id when present): forwarded to the handlers and echoed to the client for support tickets.
  const requestId = acceptRequestId(request.headers.get('x-request-id'), () => crypto.randomUUID());
  headers.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = { matcher: ['/((?!_next/|icons/|images/|favicon|offline.html).*)'] };
