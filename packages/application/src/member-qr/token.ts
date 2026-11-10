import { createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Dynamic member QR (P2). The PWA Anggota shows a short-lived token that the POS cashier scans; the POS verifies it OFFLINE with a public key.
 *
 *   token   KQ1.<kid>.<payload b64url>.<signature b64url>      (Ed25519 over "KQ1.<kid>.<payload>")
 *   payload {"m":<m_anggota.id>,"i":<issued, unix s>,"e":<expires, unix s>,"j":<16-byte random id>}
 *
 * Why this shape:
 *   - Ed25519, not a shared secret: the POS holds only public keys, so a leaked POS configuration cannot mint member QRs.
 *   - No NIK, name or amount inside: a screenshot reveals nothing but an opaque member id, and expires in seconds.
 *   - `j` is single-use at the POS (replayed scans are refused), `e - i` is at most 120 s, and a small clock skew is tolerated.
 * The legacy static QR (AES-CBC of the NIK, apps/web/src/infrastructure/pos/member-qr.ts) stays accepted for printed cards only.
 */
export const MEMBER_QR_PREFIX = 'KQ1';
export const MEMBER_QR_TTL_S = 60;
export const MEMBER_QR_MAX_TTL_S = 120;
export const MEMBER_QR_SKEW_S = 30;

export type MemberQrSigningKey = { kid: string; key: KeyObject };
export type MemberQrVerifyKey = { kid: string; key: KeyObject };
export type MemberQrClaims = { memberId: number; issuedAt: number; expiresAt: number; jti: string; kid: string };

export class MemberQrKeyError extends Error { constructor() { super('MEMBER_QR_KEYS_INVALID'); } }

const KID = /^[a-z0-9]{1,16}$/;
const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function entries(raw: string | undefined): { kid: string; der: Buffer }[] {
  if (!raw || raw.length > 4000) throw new MemberQrKeyError();
  const seen = new Set<string>();
  return raw.split(',').map((part) => {
    const i = part.indexOf(':');
    const kid = part.slice(0, i).trim(), b64 = part.slice(i + 1).trim();
    if (i < 1 || !KID.test(kid) || seen.has(kid) || !B64.test(b64)) throw new MemberQrKeyError();
    seen.add(kid);
    return { kid, der: Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64') };
  });
}

/** MEMBER_QR_SIGNING_KEY = "kid:base64(PKCS#8 DER of an Ed25519 private key)". Exactly one key signs. */
export function parseMemberQrSigningKey(raw: string | undefined): MemberQrSigningKey {
  const list = entries(raw);
  if (list.length !== 1) throw new MemberQrKeyError();
  try {
    const key = createPrivateKey({ key: list[0].der, format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new MemberQrKeyError();
    return { kid: list[0].kid, key };
  } catch { throw new MemberQrKeyError(); }
}

/** MEMBER_QR_VERIFY_KEYS = "kid:base64(SPKI DER of an Ed25519 public key)[,…]" — several during a rotation. */
export function parseMemberQrVerifyKeys(raw: string | undefined): MemberQrVerifyKey[] {
  const list = entries(raw);
  if (!list.length) throw new MemberQrKeyError();
  return list.map(({ kid, der }) => {
    try {
      const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
      if (key.asymmetricKeyType !== 'ed25519') throw new MemberQrKeyError();
      return { kid, key };
    } catch { throw new MemberQrKeyError(); }
  });
}

export function issueMemberQr(signing: MemberQrSigningKey, memberId: number, now: Date = new Date(), ttlS = MEMBER_QR_TTL_S): { token: string; expiresAt: number } {
  if (!Number.isSafeInteger(memberId) || memberId <= 0 || memberId > 2_147_483_647) throw new RangeError('MEMBER_ID_INVALID');
  if (!Number.isInteger(ttlS) || ttlS < 10 || ttlS > MEMBER_QR_MAX_TTL_S) throw new RangeError('TTL_INVALID');
  const i = Math.floor(now.getTime() / 1000);
  const payload = b64url(JSON.stringify({ m: memberId, i, e: i + ttlS, j: randomBytes(16).toString('base64url') }));
  const head = `${MEMBER_QR_PREFIX}.${signing.kid}.${payload}`;
  return { token: `${head}.${sign(null, Buffer.from(head), signing.key).toString('base64url')}`, expiresAt: i + ttlS };
}

export type MemberQrVerification =
  | { ok: true; claims: MemberQrClaims }
  | { ok: false; reason: 'NOT_DYNAMIC' | 'MALFORMED' | 'UNKNOWN_KEY' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NOT_YET_VALID' | 'REPLAYED' };

/** Remembers used token ids until they expire (single process; the short lifetime bounds its size). */
export class MemberQrReplayGuard {
  private readonly used = new Map<string, number>();
  private readonly max: number;
  constructor(max = 50_000) { this.max = max; }
  /** false when this id was already accepted. `until` = token expiry (unix s). */
  claim(jti: string, until: number, nowS: number): boolean {
    for (const [k, exp] of this.used) { if (exp >= nowS) break; this.used.delete(k); }
    if (this.used.has(jti)) return false;
    if (this.used.size >= this.max) this.used.delete(this.used.keys().next().value as string);
    this.used.set(jti, until + MEMBER_QR_SKEW_S);
    return true;
  }
}

export const isDynamicMemberQr = (value: string) => value.startsWith(`${MEMBER_QR_PREFIX}.`);

export function verifyMemberQr(keys: readonly MemberQrVerifyKey[], value: string, now: Date = new Date(), replay?: MemberQrReplayGuard): MemberQrVerification {
  const token = value.trim();
  if (!isDynamicMemberQr(token)) return { ok: false, reason: 'NOT_DYNAMIC' };
  if (token.length > 400) return { ok: false, reason: 'MALFORMED' };
  const parts = token.split('.');
  if (parts.length !== 4 || !KID.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2]) || !/^[A-Za-z0-9_-]{86}$/.test(parts[3])) return { ok: false, reason: 'MALFORMED' };
  const key = keys.find((k) => k.kid === parts[1]);
  if (!key) return { ok: false, reason: 'UNKNOWN_KEY' };
  if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}.${parts[2]}`), key.key, Buffer.from(parts[3], 'base64url'))) return { ok: false, reason: 'BAD_SIGNATURE' };
  let p: Record<string, unknown>;
  try { p = JSON.parse(Buffer.from(parts[2], 'base64url').toString('utf8')) as Record<string, unknown>; } catch { return { ok: false, reason: 'MALFORMED' }; }
  const { m, i, e, j } = p;
  if (!Number.isSafeInteger(m) || (m as number) <= 0 || !Number.isSafeInteger(i) || !Number.isSafeInteger(e) || typeof j !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(j)
    || (e as number) <= (i as number) || (e as number) - (i as number) > MEMBER_QR_MAX_TTL_S) return { ok: false, reason: 'MALFORMED' };
  const nowS = Math.floor(now.getTime() / 1000);
  if ((i as number) > nowS + MEMBER_QR_SKEW_S) return { ok: false, reason: 'NOT_YET_VALID' };
  if (nowS > (e as number) + MEMBER_QR_SKEW_S) return { ok: false, reason: 'EXPIRED' };
  if (replay && !replay.claim(j, e as number, nowS)) return { ok: false, reason: 'REPLAYED' };
  return { ok: true, claims: { memberId: m as number, issuedAt: i as number, expiresAt: e as number, jti: j, kid: parts[1] } };
}
