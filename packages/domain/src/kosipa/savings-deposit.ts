import { KosipaError } from './errors.ts';
import { parseIdempotencyKey, parseReason } from './command.ts';

/**
 * Voluntary-savings deposit (Setor Simpanan; legacy simpanan/sim_setor_c; WI-10 / TASK-118 first slice, FA-03C T07). Legacy contract:
 *   header trans_simpanan: doc_type KREDIT, jenis_transaksi CASH/TRANSFER, jenis_simpanan 'SIMPANAN SUKARELA' (the only option the form offers),
 *   doc_status POSTING until approved; ONE line trans_simpanan_dtl with kredit_cash = amount. Approval sets header and lines APPROVED.
 *   Every production balance view counts header doc_status = 'APPROVED' and sums kredit + kredit_cash - debit (FD-12 evidence).
 * Owner decisions: FD-35 maker != checker, FD-36 date within the current Jakarta month, FD-37 cancel = REJECTED with a reason (never deleted).
 */
export const SAVINGS_DEPOSIT = {
  jenisSimpanan: 'SIMPANAN SUKARELA', docType: 'KREDIT', jenisTransaksi: 'CASH/TRANSFER', pending: 'POSTING', approved: 'APPROVED', rejected: 'REJECTED',
} as const;

export type DepositCreate = { memberId: number; docDate: string; paymentType: 'CASH' | 'TRANSFER'; amount: string; bankName: string; bankAccount: string; remarks: string; idempotencyKey: string };
export type DepositMember = { id: number; nik: string; name: string; group: string | null; status: string | null };
export type DepositProduct = { code: string; active: boolean };
export type DepositLine = { kredit: string; kreditCash: string; debit: string; status: string | null };
export type DepositDocument = { id: number; docNo: string; docType: string | null; kind: string | null; type: string | null; status: string | null; docDate: string | null; lines: readonly DepositLine[] };

const PRINTABLE = /^[\x20-\x7e]*$/;
const MAX_AMOUNT = 10n ** 13n * 100n; // in sen: 10^13 rupiah (VAL-103)

function plain(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new KosipaError('INVALID_INPUT');
  for (const k of Object.keys(raw)) if (!allowed.includes(k)) throw new KosipaError('FIELD_NOT_ALLOWED');
  return raw as Record<string, unknown>;
}
function text(raw: unknown, max: number): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new KosipaError('SAVINGS_FIELD_INVALID');
  const v = raw.replace(/\s+/g, ' ').trim();
  if (v.length > max || !PRINTABLE.test(v)) throw new KosipaError('SAVINGS_FIELD_INVALID');
  return v;
}
/** Exact rupiah amount > 0, at most 2 decimals and 10^13 (VAL-103); canonical form ('0010000.00' -> '10000'). */
export function parseDepositAmount(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{1,16}(\.\d{1,2})?$/.test(raw)) throw new KosipaError('SAVINGS_AMOUNT_INVALID');
  const [w, f = ''] = raw.split('.');
  const sen = BigInt(w) * 100n + BigInt((f + '00').slice(0, 2));
  if (sen <= 0n || sen > MAX_AMOUNT) throw new KosipaError('SAVINGS_AMOUNT_INVALID');
  const whole = (sen / 100n).toString(), frac = (sen % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
function realDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** `today` = the Jakarta business date (YYYY-MM-DD). */
export function parseDepositCreate(raw: unknown, today: string): DepositCreate {
  const b = plain(raw, ['memberId', 'docDate', 'paymentType', 'amount', 'bankName', 'bankAccount', 'remarks', 'idempotencyKey']);
  const idempotencyKey = parseIdempotencyKey(b.idempotencyKey);
  if (typeof b.memberId !== 'string' || !/^[1-9]\d{0,9}$/.test(b.memberId) || Number(b.memberId) > 2_147_483_647) throw new KosipaError('MEMBER_ID_INVALID');
  const docDate = typeof b.docDate === 'string' ? b.docDate : '';
  // FD-36: the current Jakarta month, not after today.
  if (!realDate(docDate) || docDate > today || docDate.slice(0, 7) !== today.slice(0, 7)) throw new KosipaError('SAVINGS_DATE_INVALID');
  if (b.paymentType !== 'CASH' && b.paymentType !== 'TRANSFER') throw new KosipaError('SAVINGS_FIELD_INVALID');
  const amount = parseDepositAmount(b.amount);
  const bankName = text(b.bankName, 50), bankAccount = text(b.bankAccount, 50), remarks = text(b.remarks, 50);
  // The legacy form shows the bank fields only for transfers; a cash deposit carrying bank details is a client error.
  if (b.paymentType === 'CASH' && (bankName || bankAccount)) throw new KosipaError('SAVINGS_FIELD_INVALID');
  return { memberId: Number(b.memberId), docDate, paymentType: b.paymentType, amount, bankName, bankAccount, remarks, idempotencyKey };
}

/**
 * Facts read under lock. A member who has left (RESIGN / PENSIUN) cannot receive a deposit (exit settlement owns their savings; implementer
 * decision, owner review). The line stores the member's NIK in a VARCHAR(10) column: a longer NIK is refused, never truncated.
 */
export function planDepositCreate(input: DepositCreate, member: DepositMember | null, product: DepositProduct | null): { nik: string; name: string; group: string | null; periodYear: string; periodMonth: string } {
  if (!member) throw new KosipaError('MEMBER_NOT_FOUND');
  if (member.status === 'RESIGN' || member.status === 'PENSIUN') throw new KosipaError('SAVINGS_MEMBER_INACTIVE');
  const nik = member.nik.trim();
  if (!nik || nik.length > 10) throw new KosipaError('SAVINGS_NIK_TOO_LONG');
  if (!product || !product.active) throw new KosipaError('SAVINGS_PRODUCT_INACTIVE');
  return { nik, name: member.name.slice(0, 50), group: member.group, periodYear: input.docDate.slice(0, 4), periodMonth: input.docDate.slice(5, 7) };
}

export function parseDepositDecision(raw: unknown, reasonRequired: boolean): { expectedVersion: string; reason?: string; idempotencyKey: string } {
  const b = plain(raw, ['expectedVersion', 'reason', 'idempotencyKey']);
  const idempotencyKey = parseIdempotencyKey(b.idempotencyKey);
  if (typeof b.expectedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(b.expectedVersion)) throw new KosipaError('VERSION_INVALID');
  const reason = reasonRequired || (b.reason !== undefined && b.reason !== '') ? parseReason(b.reason) : undefined;
  return { expectedVersion: b.expectedVersion, ...(reason === undefined ? {} : { reason }), idempotencyKey };
}

const sen = (v: string) => { const [w, f = ''] = (v || '0').split('.'); return BigInt(w || '0') * 100n + BigInt((f + '00').slice(0, 2)); };
const rupiah = (s: bigint) => { const w = (s / 100n).toString(), f = (s % 100n).toString().padStart(2, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : w; };

/** A pending cash/transfer deposit with ≥ 1 credit line and no debit; header and every line still pending (or unset, as legacy writes them). */
function assertPendingDeposit(doc: DepositDocument | null): { lines: number; total: string } {
  if (!doc) throw new KosipaError('SAVINGS_DOC_NOT_FOUND');
  if (doc.docType !== SAVINGS_DEPOSIT.docType || doc.kind !== SAVINGS_DEPOSIT.jenisTransaksi) throw new KosipaError('SAVINGS_NOT_A_DEPOSIT');
  if (doc.status !== SAVINGS_DEPOSIT.pending) throw new KosipaError('SAVINGS_STATUS_INVALID');
  if (!doc.lines.length) throw new KosipaError('SAVINGS_LINES_INVALID');
  let total = 0n;
  for (const l of doc.lines) {
    if (!/^\d+(\.\d+)?$/.test(l.kreditCash) || sen(l.kreditCash) <= 0n || sen(l.debit) !== 0n || sen(l.kredit) !== 0n) throw new KosipaError('SAVINGS_LINES_INVALID');
    if (l.status !== null && l.status !== '' && l.status !== SAVINGS_DEPOSIT.pending) throw new KosipaError('SAVINGS_LINES_INVALID');
    total += sen(l.kreditCash);
  }
  return { lines: doc.lines.length, total: rupiah(total) };
}

/** FD-35: the approver must not be the native maker; `makerConsoleUserId` null = created by legacy (FD-17 c). */
export function planDepositApprove(doc: DepositDocument | null, approverConsoleUserId: number, makerConsoleUserId: number | null) {
  const facts = assertPendingDeposit(doc);
  if (makerConsoleUserId !== null && makerConsoleUserId === approverConsoleUserId) throw new KosipaError('SAVINGS_MAKER_CHECKER');
  return { from: SAVINGS_DEPOSIT.pending, to: SAVINGS_DEPOSIT.approved, ...facts };
}

/** FD-37: cancellation/rejection of a pending deposit keeps every row and only changes status. */
export function planDepositReject(doc: DepositDocument | null) {
  return { from: SAVINGS_DEPOSIT.pending, to: SAVINGS_DEPOSIT.rejected, ...assertPendingDeposit(doc) };
}

/** Ledger snapshot: document identity, status and totals; no member identity. */
export function depositLedgerSummary(doc: DepositDocument, status: string) {
  const total = doc.lines.reduce((t, l) => t + sen(l.kreditCash), 0n);
  return { id: doc.id, doc_no: doc.docNo, status, lines: doc.lines.length, total: rupiah(total), jenis_simpanan: doc.type ?? '' };
}
