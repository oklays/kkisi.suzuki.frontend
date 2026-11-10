// Strict shape of the member mutation body (POST /api/transaksi/ajukan). Pure: no I/O, unit-tested.
// Every field is type-checked here and unknown fields are refused, never ignored (same rule as apps/web `onlyFields`), so a
// forged `status`, `nik` or `docNo` can never reach a writer. Business rules (limits, rates, credit) stay in the service.

export type MutationCommand =
  | { kind: 'loan_application'; idempotencyKey: string; productId: number; amountRp: number; months: number; purpose: string }
  | { kind: 'deduction_change'; idempotencyKey: string; savingsType: string; requestedRp: number; consent: boolean }
  | { kind: 'favourite_toggle'; idempotencyKey: string; productId: number; action: 'add' | 'remove' }
  | { kind: 'store_checkout'; idempotencyKey: string; items: { id: number; quantity: number }[]; payment: 'kredit' | 'cod' }
  | { kind: 'ppob'; idempotencyKey: string; serviceId: string; account: string };

export type CommandParseError = { code: 'INVALID_INPUT' | 'FIELD_NOT_ALLOWED' | 'INVALID_IDEMPOTENCY_KEY'; field?: string };

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,64}$/;

const FIELDS: Record<MutationCommand['kind'], readonly string[]> = {
  loan_application: ['productId', 'amountRp', 'months', 'purpose'],
  deduction_change: ['savingsType', 'requestedRp', 'consent'],
  favourite_toggle: ['productId', 'action'],
  store_checkout: ['items', 'payment'],
  ppob: ['serviceId', 'account'],
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
const posInt = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u001F\u007F]/.test(v);

class Invalid extends Error {
  readonly field: string;
  constructor(field: string) { super('INVALID_INPUT'); this.field = field; }
}
function need<T>(ok: boolean, field: string, value: T): T { if (!ok) throw new Invalid(field); return value; }

/**
 * The idempotency key may come from the `Idempotency-Key` header or the body; when both are present they must be equal.
 * Returns the typed command or a code-only error (the field NAME at most, never a value).
 */
export function parseMutationCommand(body: unknown, headerKey: string | null = null): { ok: true; cmd: MutationCommand } | { ok: false; error: CommandParseError } {
  if (!isPlainObject(body)) return { ok: false, error: { code: 'INVALID_INPUT' } };
  const kind = body.kind;
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(FIELDS, kind)) return { ok: false, error: { code: 'INVALID_INPUT', field: 'kind' } };
  const k = kind as MutationCommand['kind'];
  for (const key of Object.keys(body)) {
    if (key !== 'kind' && key !== 'idempotencyKey' && !FIELDS[k].includes(key)) return { ok: false, error: { code: 'FIELD_NOT_ALLOWED', field: key } };
  }

  const fromHeader = headerKey?.trim() || null;
  const fromBody = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : null;
  if (body.idempotencyKey !== undefined && fromBody === null) return { ok: false, error: { code: 'INVALID_IDEMPOTENCY_KEY' } };
  if (fromHeader && fromBody && fromHeader !== fromBody) return { ok: false, error: { code: 'INVALID_IDEMPOTENCY_KEY' } };
  const idempotencyKey = fromHeader ?? fromBody ?? '';
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) return { ok: false, error: { code: 'INVALID_IDEMPOTENCY_KEY' } };

  try {
    switch (k) {
      case 'loan_application':
        return { ok: true, cmd: {
          kind: k, idempotencyKey,
          productId: need(posInt(body.productId), 'productId', body.productId as number),
          amountRp: need(posInt(body.amountRp, 10_000_000_000), 'amountRp', body.amountRp as number),
          months: need(posInt(body.months, 600), 'months', body.months as number),
          purpose: need(text(body.purpose, 500), 'purpose', body.purpose as string),
        } };
      case 'deduction_change':
        return { ok: true, cmd: {
          kind: k, idempotencyKey,
          savingsType: need(text(body.savingsType, 60) && (body.savingsType as string).trim() !== '', 'savingsType', body.savingsType as string),
          requestedRp: need(posInt(body.requestedRp, 10_000_000_000), 'requestedRp', body.requestedRp as number),
          consent: need(typeof body.consent === 'boolean', 'consent', body.consent as boolean),
        } };
      case 'favourite_toggle':
        return { ok: true, cmd: {
          kind: k, idempotencyKey,
          productId: need(posInt(body.productId), 'productId', body.productId as number),
          action: need(body.action === 'add' || body.action === 'remove', 'action', body.action as 'add' | 'remove'),
        } };
      case 'store_checkout': {
        const items = need(Array.isArray(body.items) && body.items.length >= 1 && body.items.length <= 40, 'items', body.items as unknown[]);
        const lines = items.map((line) => {
          need(isPlainObject(line) && Object.keys(line).every((f) => f === 'id' || f === 'quantity'), 'items', null);
          const l = line as Record<string, unknown>;
          return { id: need(posInt(l.id), 'items', l.id as number), quantity: need(posInt(l.quantity, 99), 'items', l.quantity as number) };
        });
        return { ok: true, cmd: { kind: k, idempotencyKey, items: lines, payment: need(body.payment === 'kredit' || body.payment === 'cod', 'payment', body.payment as 'kredit' | 'cod') } };
      }
      case 'ppob':
        return { ok: true, cmd: {
          kind: k, idempotencyKey,
          serviceId: need(text(body.serviceId, 32), 'serviceId', body.serviceId as string),
          account: need(text(body.account, 40), 'account', body.account as string),
        } };
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: { code: 'INVALID_INPUT', field: e.field } };
    throw e;
  }
  return { ok: false, error: { code: 'INVALID_INPUT' } };
}
