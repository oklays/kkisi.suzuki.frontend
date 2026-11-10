import { randomUUID } from 'node:crypto';
import { KosipaError, KosipaFieldError } from '@koperasi/domain/kosipa';
import { submitMemberIntake, type MemberIntakePorts } from '@koperasi/application/kosipa/commands/member-request';
import { INTAKE_HEADER, NonceCache, parseIntakeKeys, verifyIntakeRequest, type IntakeKey } from '@koperasi/application/member-intake/signature';

/**
 * POST /api/internal/member-requests — the PWA Anggota BFF submits a member's loan / deduction-change request (P1). Layers, in order:
 *   1. feature on (KOSIPA_MEMBER_INTAKE_ENABLED) and a key ring configured, else 404 / 503 — nothing is revealed to a probe;
 *   2. internal caller only: through the public nginx the client address is public, so the endpoint answers 404 (genesis nginx also refuses
 *      /api/internal/ outright); Next fills X-Forwarded-For with the socket address for a direct call (container network / loopback);
 *   3. JSON body of at most 4 KiB, signed with HMAC (x-kkisi-intake, ±60 s, nonce once per process) over the exact bytes received;
 *   4. the strict intake command (member re-verified under lock in the transaction). Responses carry codes only and are never cached.
 */
export const INTAKE_PATH = '/api/internal/member-requests';
const BODY_LIMIT = 4096;
const NO_STORE = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...extra } });

const STATUS: Record<string, number> = {
  INVALID_INPUT: 400, FIELD_NOT_ALLOWED: 400, IDEMPOTENCY_KEY_INVALID: 400, REQUEST_FIELD_INVALID: 422, REQUEST_MEMBER_INVALID: 422,
  REQUEST_OPEN_LIMIT: 409, IDEMPOTENCY_CONFLICT: 409, BUSY_RETRY: 409, DOCUMENT_NUMBER_CONFLICT: 409,
  WRITE_DISABLED: 503, WRITE_NOT_CONFIGURED: 503, POSTCONDITION_FAILED: 503,
};

/** Client address counted from the right of X-Forwarded-For (TRUSTED_PROXY_HOPS); internal = loopback or a private network address. */
export function isInternalCaller(headers: Headers, trustedHops: number): boolean {
  if (trustedHops <= 0) return true;
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const raw = parts[parts.length - trustedHops];
  if (!raw || !/^[0-9a-fA-F:.]{2,45}$/.test(raw)) return false;
  const ip = raw.toLowerCase().replace(/^::ffff:/, '');
  if (ip === '::1' || /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^f[cd][0-9a-f]{2}:/.test(ip)) return true;
  const m = /^172\.(\d{1,3})\./.exec(ip);
  return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

export type IntakeDeps = {
  enabled: boolean;
  keys: readonly IntakeKey[] | null;
  trustedProxyHops: number;
  ports: MemberIntakePorts | null;
  nonces: NonceCache;
  now: () => Date;
  log: (event: string, fields?: Record<string, string | number>) => void;
};

export async function handleMemberIntake(request: Request, deps: IntakeDeps): Promise<Response> {
  if (!deps.enabled) return json(404, { error: 'NOT_FOUND' });
  if (!isInternalCaller(request.headers, deps.trustedProxyHops)) { deps.log('member_intake_external_refused'); return json(404, { error: 'NOT_FOUND' }); }
  if (!deps.keys || !deps.ports) return json(503, { error: 'NOT_CONFIGURED' });
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { error: 'BAD_REQUEST' });
  if (Number(request.headers.get('content-length') ?? '0') > BODY_LIMIT) return json(413, { error: 'TOO_LARGE' });
  const text = await request.text();
  if (text.length > BODY_LIMIT) return json(413, { error: 'TOO_LARGE' });
  const verdict = verifyIntakeRequest(deps.keys, request.headers.get(INTAKE_HEADER), { method: 'POST', path: INTAKE_PATH, body: text }, deps.now(), deps.nonces);
  if (!verdict.ok) { deps.log('member_intake_signature_refused', { reason: verdict.reason }); return json(401, { error: 'UNAUTHORIZED' }); }
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'INVALID_INPUT' }); }
  try {
    const outcome = await submitMemberIntake(deps.ports, request.headers.get('x-request-id')?.slice(0, 40) || randomUUID(), body);
    deps.log('member_intake_recorded', { type: outcome.result.type, replayed: outcome.replayed ? 1 : 0 });
    return json(outcome.replayed ? 200 : 201, { ok: true, replayed: outcome.replayed, ...outcome.result });
  } catch (error) {
    if (error instanceof KosipaFieldError) return json(STATUS[error.code] ?? 422, { error: error.code, field: error.field });
    if (error instanceof KosipaError) return json(STATUS[error.code] ?? 400, { error: error.code }, error.code === 'BUSY_RETRY' ? { 'Retry-After': '1' } : {});
    deps.log('member_intake_failed');
    return json(503, { error: 'UNAVAILABLE' });
  }
}

const g = globalThis as typeof globalThis & { kkisiIntakeNonces?: NonceCache };

/** Configuration from the environment; a malformed key ring leaves the endpoint answering 503 (fail closed), never open. */
export function intakeDepsFromEnv(env: Record<string, string | undefined>, ports: () => MemberIntakePorts): IntakeDeps {
  const enabled = env.KOSIPA_MEMBER_INTAKE_ENABLED === 'true';
  let keys: IntakeKey[] | null = null;
  try { keys = parseIntakeKeys(env.MEMBER_INTAKE_KEYS); } catch { keys = null; }
  const hopsRaw = env.TRUSTED_PROXY_HOPS ?? '';
  const hops = hopsRaw === '' ? 0 : Number(hopsRaw);
  return {
    enabled, keys, trustedProxyHops: Number.isInteger(hops) && hops >= 0 && hops <= 5 ? hops : 1,
    ports: enabled && keys ? ports() : null,
    nonces: (g.kkisiIntakeNonces ??= new NonceCache()),
    now: () => new Date(),
    log: (event, fields = {}) => console.info(JSON.stringify({ at: new Date().toISOString(), app: 'web', event, ...fields })),
  };
}
