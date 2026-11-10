import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed internal requests from the PWA Anggota BFF to apps/web (P1 member intake). Shared by both apps so the contract is tested once.
 *
 *   header  x-kkisi-intake: kid=<kid>,ts=<unix seconds>,nonce=<32 hex>,sig=<base64url HMAC-SHA256>
 *   signed  "kkisi-intake:v1\n" + METHOD + "\n" + path + "\n" + ts + "\n" + nonce + "\n" + hex(SHA-256(body))
 *
 * The key ring is "kid:base64" entries (>= 32 bytes each); the first entry signs, every entry verifies (rotation). A request is accepted
 * within ±60 s of the verifier's clock and each nonce once per process (replay inside the window); business idempotency is the ledger's.
 */
export const INTAKE_HEADER = 'x-kkisi-intake';
export const INTAKE_WINDOW_S = 60;

export type IntakeKey = { kid: string; key: Buffer };

export class IntakeKeyError extends Error { constructor() { super('INTAKE_KEYS_INVALID'); } }

/** Parses MEMBER_INTAKE_KEYS ("k1:base64,k2:base64"). Throws on anything short, duplicated or malformed (fail closed). */
export function parseIntakeKeys(raw: string | undefined): IntakeKey[] {
  if (!raw || raw.length > 2000) throw new IntakeKeyError();
  const seen = new Set<string>();
  const out: IntakeKey[] = [];
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    const kid = part.slice(0, i).trim(), b64 = part.slice(i + 1).trim();
    if (i < 1 || !/^[a-z0-9]{1,16}$/.test(kid) || seen.has(kid) || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new IntakeKeyError();
    const key = Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64');
    if (key.length < 32) throw new IntakeKeyError();
    seen.add(kid);
    out.push({ kid, key });
  }
  if (!out.length) throw new IntakeKeyError();
  return out;
}

const canonical = (method: string, path: string, ts: number, nonce: string, body: string) =>
  `kkisi-intake:v1\n${method.toUpperCase()}\n${path}\n${ts}\n${nonce}\n${createHash('sha256').update(body, 'utf8').digest('hex')}`;
const mac = (key: Buffer, text: string) => createHmac('sha256', key).update(text, 'utf8').digest();

/** Header value for one request (the first key of the ring signs). */
export function signIntakeRequest(keys: readonly IntakeKey[], req: { method: string; path: string; body: string }, now: Date = new Date(), nonce = randomBytes(16).toString('hex')): string {
  const k = keys[0];
  const ts = Math.floor(now.getTime() / 1000);
  return `kid=${k.kid},ts=${ts},nonce=${nonce},sig=${mac(k.key, canonical(req.method, req.path, ts, nonce, req.body)).toString('base64url')}`;
}

export type IntakeVerification = { ok: true; kid: string; nonce: string } | { ok: false; reason: 'MISSING' | 'MALFORMED' | 'UNKNOWN_KEY' | 'EXPIRED' | 'BAD_SIGNATURE' | 'REPLAYED' };

/** Remembers nonces for the acceptance window (single process; the window bounds its size). */
export class NonceCache {
  private readonly seen = new Map<string, number>();
  private readonly max: number;
  constructor(max = 10_000) { this.max = max; }
  /** false when the nonce was already used inside the window. Entries expire in insertion order (constant window). */
  use(nonce: string, nowMs: number): boolean {
    for (const [n, exp] of this.seen) { if (exp > nowMs) break; this.seen.delete(n); }
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= this.max) this.seen.delete(this.seen.keys().next().value as string);
    this.seen.set(nonce, nowMs + 2 * INTAKE_WINDOW_S * 1000);
    return true;
  }
}

export function verifyIntakeRequest(keys: readonly IntakeKey[], header: string | null, req: { method: string; path: string; body: string }, now: Date = new Date(), nonces?: NonceCache): IntakeVerification {
  if (!header) return { ok: false, reason: 'MISSING' };
  if (header.length > 300) return { ok: false, reason: 'MALFORMED' };
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : ['', '']; }));
  const { kid, ts, nonce, sig } = parts as Record<string, string | undefined>;
  if (!kid || !ts || !nonce || !sig || !/^\d{9,12}$/.test(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return { ok: false, reason: 'MALFORMED' };
  const key = keys.find((k) => k.kid === kid);
  if (!key) return { ok: false, reason: 'UNKNOWN_KEY' };
  const t = Number(ts);
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > INTAKE_WINDOW_S) return { ok: false, reason: 'EXPIRED' };
  const expected = mac(key.key, canonical(req.method, req.path, t, nonce, req.body));
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'BAD_SIGNATURE' };
  if (nonces && !nonces.use(nonce, now.getTime())) return { ok: false, reason: 'REPLAYED' };
  return { ok: true, kid, nonce };
}
