import { appEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

/** Liveness for the reverse proxy / process manager. No database call, no configuration detail, no version secret. */
export function GET() {
  let env = 'invalid';
  try { env = appEnv(process.env); } catch { /* reported as invalid */ }
  return Response.json({ status: 'ok', app: 'mobile_kkisi', version: process.env.APP_VERSION ?? null, env }, { headers: { 'Cache-Control': 'no-store' } });
}
