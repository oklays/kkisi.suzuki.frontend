import { createDecipheriv, createHash } from 'node:crypto';
import { PosError } from '@koperasi/domain/pos/sale';
import { MemberQrReplayGuard, isDynamicMemberQr, parseMemberQrVerifyKeys, verifyMemberQr } from '@koperasi/application/member-qr/token';

/** PHP openssl_decrypt(options=0) consumes base64; its passphrase is the HEX SHA256 truncated to AES key length. */
export function decodeMemberIdentifier(value: string, kind: 'identifier' | 'nik' | 'card' | 'id' | 'qr', env: Record<string, string | undefined> = process.env): string {
  const identifier = value.trim();
  if (!identifier || identifier.length > 512) throw new PosError('INVALID_INPUT');
  if (kind !== 'qr') {
    if (identifier.length > 50 || identifier === '0') throw new PosError('INVALID_INPUT');
    if (kind === 'id' && (!/^[1-9]\d{0,9}$/.test(identifier) || Number(identifier) > 2147483647)) throw new PosError('INVALID_INPUT');
    return identifier;
  }
  const secret = env.POS_QR_SECRET_KEY;
  const secretIv = env.POS_QR_SECRET_IV;
  const cipher = env.POS_QR_CIPHER ?? 'aes-256-cbc';
  if (!secret || !secretIv || !['aes-256-cbc', 'aes-128-cbc'].includes(cipher)) throw new PosError('QR_NOT_CONFIGURED');
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(identifier)) throw new Error('invalid encoding');
    const key = Buffer.from(createHash('sha256').update(secret).digest('hex').slice(0, cipher === 'aes-256-cbc' ? 32 : 16));
    const iv = Buffer.from(createHash('sha256').update(secretIv).digest('hex').slice(0, 16));
    const decipher = createDecipheriv(cipher, key, iv);
    const plain = Buffer.concat([decipher.update(Buffer.from(identifier, 'base64')), decipher.final()]).toString('utf8');
    if (!plain || plain.length > 50 || plain === '0' || /[\x00-\x1f\ufffd]/.test(plain)) throw new Error('invalid identifier');
    return plain;
  } catch { throw new PosError('INVALID_QR'); }
}

const holder = globalThis as typeof globalThis & { kkisiMemberQrReplay?: MemberQrReplayGuard };

/**
 * A scanned member QR -> what the member lookup needs (P2). Two formats:
 *   dynamic  KQ1.… from the PWA Anggota: Ed25519 signature (MEMBER_QR_VERIFY_KEYS), 60 s lifetime, single use in this process -> m_anggota.id
 *   legacy   AES-CBC of the NIK (printed cards; decodeMemberIdentifier above)                                               -> NIK
 * A dynamic token never falls back to the legacy decoder, and an expired or reused one is refused with its own code so the cashier can ask for
 * the member's current QR.
 */
export function resolveMemberQr(value: string, env: Record<string, string | undefined> = process.env, now: Date = new Date(), replay: MemberQrReplayGuard = (holder.kkisiMemberQrReplay ??= new MemberQrReplayGuard())): { identifier: string; kind: 'id' | 'nik' } {
  const raw = value.trim();
  if (!isDynamicMemberQr(raw)) return { identifier: decodeMemberIdentifier(raw, 'qr', env), kind: 'nik' };
  let keys;
  try { keys = parseMemberQrVerifyKeys(env.MEMBER_QR_VERIFY_KEYS); } catch { throw new PosError('QR_NOT_CONFIGURED'); }
  const r = verifyMemberQr(keys, raw, now, replay);
  if (r.ok) return { identifier: String(r.claims.memberId), kind: 'id' };
  if (r.reason === 'EXPIRED' || r.reason === 'NOT_YET_VALID') throw new PosError('QR_EXPIRED');
  if (r.reason === 'REPLAYED') throw new PosError('QR_ALREADY_USED');
  throw new PosError('INVALID_QR');
}
