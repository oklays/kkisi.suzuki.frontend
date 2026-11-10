import { serviceWorkerSource } from '@/lib/pwa/service-worker-source';

export const dynamic = 'force-static';

/** The service worker, served from the root scope and never cached by the browser HTTP cache (updates are always seen). */
export function GET() {
  return new Response(serviceWorkerSource(process.env.APP_BUILD ?? 'dev'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'",
    },
  });
}
