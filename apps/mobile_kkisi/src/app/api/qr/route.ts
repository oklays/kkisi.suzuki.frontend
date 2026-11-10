import QRCode from 'qrcode';
import { issueMemberQr } from '@koperasi/application/member-qr/token';
import { currentMember } from '@/lib/auth/session.server';
import { ServiceUnavailableError } from '@/lib/errors/service-errors';
import { log, qrSigningKey } from '@/server/container';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/qr — a fresh signed member QR (P2) for the authenticated member: the token (KQ1…, member id only, valid 60 s, single use at the POS)
 * and its SVG as a data URI. The member is always the session's; nothing in the request selects it. Never cached (also by the service worker).
 */
export async function GET(request: Request) {
  try {
    const member = await currentMember();
    if (!member) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers: NO_STORE });
    const key = qrSigningKey();
    if (!key) return Response.json({ error: 'QR_NOT_CONFIGURED' }, { status: 503, headers: NO_STORE });
    const { token, expiresAt } = issueMemberQr(key, member.memberId);
    const svg = await QRCode.toString(token, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b1b3a', light: '#ffffff' } });
    log('member.qr.issued', { requestId: request.headers.get('x-request-id') ?? null });
    return Response.json({ token, expiresAt, image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ServiceUnavailableError) return Response.json({ error: e.code }, { status: 503, headers: NO_STORE });
    return Response.json({ error: 'UNAVAILABLE' }, { status: 503, headers: NO_STORE });
  }
}
