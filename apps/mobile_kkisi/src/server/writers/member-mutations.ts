import { createHash, randomBytes } from 'node:crypto';
import type { FeatureFlags, Secret } from '../../lib/config/env.ts';
import { businessMonth } from '../../lib/utils/dates.ts';
import { senOf } from '../../lib/utils/money.ts';
import { buildLoanProducts, simulateLoan } from '../../features/loans/services/loans.ts';
import { buildActiveDeductions } from '../../features/savings/services/savings.ts';
import { validateDeductionChange } from '../../features/deductions/services/deduction-change.ts';
import { buildStoreCredit } from '../../features/store-credit/services/store-credit.ts';
import { normaliseAccount, ppobService, type PpobService } from '../../features/ppob/services/ppob.ts';
import type { ActiveSession } from '../auth/auth-service.ts';
import { throttleKey } from '../auth/crypto.ts';
import type { MemberSessionStore } from '../auth/types.ts';
import { readActiveDeductions, readLoanProducts, readProfile } from '../kosipa/member.reader.ts';
import { readCatalogItems, readCreditUsage } from '../kosipa/store.reader.ts';
import { query, type Db } from '../kosipa/sql.ts';
import { rows, StoreUnavailableError } from '../db/mysql.ts';
import { parseMutationCommand, type MutationCommand } from './mutation-commands.ts';
import type { IntakeReply, MemberIntakeSubmitter } from './intake-client.ts';

export type { MutationCommand } from './mutation-commands.ts';

export type MutationOutcome =
  | { ok: true; status: 200 | 201; replayed: boolean; kind: MutationCommand['kind']; docNo: string; summary: Record<string, string | number> }
  | {
    ok: false;
    status: 400 | 403 | 409 | 422 | 429 | 503;
    code:
      | 'FEATURE_DISABLED'
      | 'INVALID_INPUT'
      | 'FIELD_NOT_ALLOWED'
      | 'INVALID_IDEMPOTENCY_KEY'
      | 'IDEMPOTENCY_CONFLICT'
      | 'BUSY_RETRY'
      | 'THROTTLED'
      | 'OPEN_APPLICATION_LIMIT'
      | 'ITEM_UNAVAILABLE'
      | 'CREDIT_INSUFFICIENT'
      | 'WRITER_NOT_CONFIGURED'
      | 'UPSTREAM_WRITER_UNAVAILABLE'
      | 'PROVIDER_UNAVAILABLE';
    feature?: string;
    field?: string;
    message?: string;
  };

export type LedgerEntry = { payloadHash: string; status: 'PENDING' | 'RECORDED' | 'REJECTED'; docNo: string | null };
export type LedgerKey = { memberId: number; kind: string; key: string };

/**
 * Idempotency ledger + per-member write lease (kkisi_member_auth). The legacy intake tables have no unique key on doc_no, so the
 * ledger row is RESERVED (status PENDING, carrying the planned doc_no) before any business write, under a lease that lets one
 * command of a member run at a time across processes. A PENDING row found later means an earlier attempt ended without
 * completing; it is reconciled against the business table by its planned doc_no before anything is written again.
 */
export type CommandLedgerStore = {
  /** Inserts a PENDING row; when (member, kind, key) already exists, returns that row instead (the unique key is the guard). */
  reserve(entry: LedgerKey & { nik: string; payloadHash: string; docNo: string | null; now: Date }): Promise<{ reserved: true } | { reserved: false; existing: LedgerEntry }>;
  /** PENDING -> RECORDED with the business document number. */
  complete(k: LedgerKey, docNo: string): Promise<void>;
  /** Drops a PENDING row whose command was refused before any business write, so the same key may be retried. */
  release(k: LedgerKey): Promise<void>;
  /** Exclusive, expiring per-member lease (no connection is held while the command runs). */
  acquireLease(memberId: number, token: string, now: Date, ttlMs: number): Promise<boolean>;
  releaseLease(memberId: number, token: string): Promise<void>;
};

// UTC text, same convention as the session store (the server time zone never shifts a deadline).
const utc = (d: Date) => d.toISOString().slice(0, 23).replace('T', ' ');
const isDuplicate = (e: unknown) => typeof e === 'object' && e !== null && ((e as { code?: string }).code === 'ER_DUP_ENTRY' || (e as { errno?: number }).errno === 1062);

export class MysqlCommandLedgerStore implements CommandLedgerStore {
  private readonly db: Db;
  constructor(db: Db) { this.db = db; }

  async reserve(e: LedgerKey & { nik: string; payloadHash: string; docNo: string | null; now: Date }) {
    try {
      await this.db.query(
        `INSERT INTO member_command_ledger (member_id, nik, command_kind, idempotency_key, payload_hash, status, result_doc_no, created_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [e.memberId, e.nik, e.kind, e.key, e.payloadHash, e.docNo, utc(e.now)],
      );
      return { reserved: true as const };
    } catch (err) {
      if (!isDuplicate(err)) throw new StoreUnavailableError();
    }
    const [r] = await query<{ payload_hash: string; status: LedgerEntry['status']; result_doc_no: string | null }>(
      this.db,
      'SELECT payload_hash, status, result_doc_no FROM member_command_ledger WHERE member_id = ? AND command_kind = ? AND idempotency_key = ? LIMIT 1',
      [e.memberId, e.kind, e.key],
    );
    if (!r) throw new StoreUnavailableError();
    return { reserved: false as const, existing: { payloadHash: r.payload_hash, status: r.status, docNo: r.result_doc_no } };
  }

  async complete(k: LedgerKey, docNo: string) {
    await rows(this.db, "UPDATE member_command_ledger SET status = 'RECORDED', result_doc_no = ? WHERE member_id = ? AND command_kind = ? AND idempotency_key = ? AND status = 'PENDING'",
      [docNo, k.memberId, k.kind, k.key]);
  }

  async release(k: LedgerKey) {
    await rows(this.db, "DELETE FROM member_command_ledger WHERE member_id = ? AND command_kind = ? AND idempotency_key = ? AND status = 'PENDING'", [k.memberId, k.kind, k.key]);
  }

  async acquireLease(memberId: number, token: string, now: Date, ttlMs: number) {
    // token is taken over only when the current lease has expired; expires_at moves only when the token is (now) ours.
    // ON DUPLICATE KEY UPDATE assigns left to right with already-updated values (MariaDB SIMULTANEOUS_ASSIGNMENT must stay off).
    await rows(this.db, `INSERT INTO member_write_lease (member_id, token, expires_at) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE token = IF(expires_at < ?, VALUES(token), token), expires_at = IF(token = VALUES(token), VALUES(expires_at), expires_at)`,
    [memberId, token, utc(new Date(now.getTime() + ttlMs)), utc(now)]);
    const [r] = await rows<{ token: string }>(this.db, 'SELECT token FROM member_write_lease WHERE member_id = ?', [memberId]);
    return r?.token === token;
  }

  async releaseLease(memberId: number, token: string) {
    await rows(this.db, 'DELETE FROM member_write_lease WHERE member_id = ? AND token = ?', [memberId, token]);
  }
}

export class MemoryCommandLedgerStore implements CommandLedgerStore {
  private readonly rows = new Map<string, LedgerEntry>();
  private readonly leases = new Map<number, { token: string; expiresAt: number }>();
  private id = (k: LedgerKey) => `${k.memberId}:${k.kind}:${k.key}`;

  async reserve(e: LedgerKey & { nik: string; payloadHash: string; docNo: string | null; now: Date }) {
    const existing = this.rows.get(this.id(e));
    if (existing) return { reserved: false as const, existing: { ...existing } };
    this.rows.set(this.id(e), { payloadHash: e.payloadHash, status: 'PENDING', docNo: e.docNo });
    return { reserved: true as const };
  }
  async complete(k: LedgerKey, docNo: string) {
    const r = this.rows.get(this.id(k));
    if (r?.status === 'PENDING') this.rows.set(this.id(k), { ...r, status: 'RECORDED', docNo });
  }
  async release(k: LedgerKey) { if (this.rows.get(this.id(k))?.status === 'PENDING') this.rows.delete(this.id(k)); }
  async acquireLease(memberId: number, token: string, now: Date, ttlMs: number) {
    const l = this.leases.get(memberId);
    if (l && l.expiresAt >= now.getTime()) return l.token === token;
    this.leases.set(memberId, { token, expiresAt: now.getTime() + ttlMs });
    return true;
  }
  async releaseLease(memberId: number, token: string) { if (this.leases.get(memberId)?.token === token) this.leases.delete(memberId); }
}

const WRITE_LIMIT_PER_WINDOW = 10;
const WRITE_WINDOW_MS = 15 * 60_000;
const WRITE_LOCK_MS = 15 * 60_000;
const LEASE_TTL_MS = 30_000;              // > the sum of the 5 s statement caps a command can run; a crashed holder frees it
const LEASE_ATTEMPTS = 10;
const LEASE_RETRY_MS = 300;               // a double-tap waits ~3 s for the first request, then replays its result

/** Fingerprint of a parsed command without its key (exported for reconciliation tests). */
export function payloadHashOf(cmd: MutationCommand): string {
  return createHash('sha256').update(JSON.stringify({ ...cmd, idempotencyKey: undefined })).digest('hex');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Deps = {
  flags: FeatureFlags;
  secrets: Secret[];
  store: Pick<MemberSessionStore, 'throttleGet' | 'throttleHit'>;
  ledger: CommandLedgerStore;
  readerDb: Db;
  writerDb: Db | null;
  /** apps/web member-intake channel (P1): loan applications and deduction changes. null = not configured (503). */
  intake: MemberIntakeSubmitter | null;
  companyId: number;
  now?: () => Date;
  leaseRetryMs?: number;
};

export class MemberMutationService {
  private readonly deps: Deps;
  constructor(deps: Deps) { this.deps = deps; }

  private clock() { return this.deps.now ? this.deps.now() : new Date(); }

  /** `raw` is the untrusted request body; `headerKey` the Idempotency-Key header. */
  async execute(member: ActiveSession, raw: unknown, headerKey: string | null = null): Promise<MutationOutcome> {
    const parsed = parseMutationCommand(raw, headerKey);
    if (!parsed.ok) {
      const { code, field } = parsed.error;
      return { ok: false, status: 400, code, ...(field ? { field } : {}), ...(code === 'INVALID_IDEMPOTENCY_KEY' ? { message: 'Idempotency-Key tidak valid.' } : {}) };
    }
    const cmd = parsed.cmd;

    const flagCheck = this.checkFeatureFlag(cmd.kind);
    if (!flagCheck.enabled) {
      return { ok: false, status: 403, code: 'FEATURE_DISABLED', feature: flagCheck.name };
    }

    const now = this.clock();
    const tKey = throttleKey('write', String(member.memberId), this.deps.secrets[0]);
    const tState = await this.deps.store.throttleGet(tKey);
    if (tState?.lockedUntil && tState.lockedUntil > now) {
      return { ok: false, status: 429, code: 'THROTTLED' };
    }

    const token = randomBytes(16).toString('hex');
    let leased = false;
    for (let i = 0; i < LEASE_ATTEMPTS && !leased; i++) {
      if (i > 0) await sleep(this.deps.leaseRetryMs ?? LEASE_RETRY_MS);
      leased = await this.deps.ledger.acquireLease(member.memberId, token, this.clock(), LEASE_TTL_MS);
    }
    if (!leased) return { ok: false, status: 409, code: 'BUSY_RETRY' };
    try {
      return cmd.kind === 'loan_application' || cmd.kind === 'deduction_change'
        ? await this.executeIntake(member, cmd, tKey, now)
        : await this.executeLeased(member, cmd, tKey, now);
    } finally {
      await this.deps.ledger.releaseLease(member.memberId, token).catch(() => undefined);   // expires on its own otherwise
    }
  }

  private throttleHit(tKey: string, now: Date) {
    return this.deps.store.throttleHit(tKey, { now, windowMs: WRITE_WINDOW_MS, lockMs: WRITE_LOCK_MS, limit: WRITE_LIMIT_PER_WINDOW });
  }

  /**
   * Loan application / deduction change (P1): checked here for a helpful message, then submitted to apps/web, which re-checks
   * everything under lock and owns idempotency (same Idempotency-Key -> same document, replayed). Nothing is written by the PWA.
   */
  private async executeIntake(member: ActiveSession, cmd: Extract<MutationCommand, { kind: 'loan_application' | 'deduction_change' }>, tKey: string, now: Date): Promise<MutationOutcome> {
    const precheck = cmd.kind === 'loan_application' ? await this.precheckLoan(cmd) : await this.precheckDeduction(member, cmd);
    if (precheck) return precheck;
    if (!this.deps.intake) return { ok: false, status: 503, code: 'WRITER_NOT_CONFIGURED' };
    const t = await this.throttleHit(tKey, now);
    if (t.failures > WRITE_LIMIT_PER_WINDOW) return { ok: false, status: 429, code: 'THROTTLED' };
    const identity = { memberId: member.memberId, userId: member.userId, nik: member.nik };
    const reply = await this.deps.intake.submit(cmd.kind === 'loan_application'
      ? { kind: 'loan', clientKey: cmd.idempotencyKey, member: identity, productId: cmd.productId, amountRp: cmd.amountRp, months: cmd.months, purpose: cmd.purpose.trim() }
      : { kind: 'deduction', clientKey: cmd.idempotencyKey, member: identity, savingsType: cmd.savingsType, requestedRp: cmd.requestedRp });
    if (reply.ok) return { ok: true, status: reply.status, replayed: reply.replayed, kind: cmd.kind, docNo: reply.docNo, summary: reply.summary };
    if (reply.kind === 'unavailable') return { ok: false, status: 503, code: 'UPSTREAM_WRITER_UNAVAILABLE', message: 'Layanan pengajuan koperasi sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.' };
    return intakeRefusal(reply);
  }

  private async precheckLoan(cmd: Extract<MutationCommand, { kind: 'loan_application' }>): Promise<MutationOutcome | null> {
    const purpose = cmd.purpose.trim();
    if (!purpose || purpose.length > 120) return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Keperluan pinjaman wajib diisi (maksimal 120 karakter).' };
    const sim = simulateLoan(buildLoanProducts(await readLoanProducts(this.deps.readerDb)), { productId: cmd.productId, amountRp: cmd.amountRp, months: cmd.months });
    return sim.ok ? null : { ok: false, status: 422, code: 'INVALID_INPUT', message: sim.message };
  }

  private async precheckDeduction(member: ActiveSession, cmd: Extract<MutationCommand, { kind: 'deduction_change' }>): Promise<MutationOutcome | null> {
    if (cmd.consent !== true) return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Persetujuan pemotongan payroll wajib dicentang.' };
    const option = buildActiveDeductions(await readActiveDeductions(this.deps.readerDb, member.nikKeys)).find((a) => a.type === cmd.savingsType);
    const error = validateDeductionChange(option, String(cmd.requestedRp));
    return option && !error ? null : { ok: false, status: 422, code: 'INVALID_INPUT', message: error ?? 'Pilih jenis simpanan.' };
  }

  /** Favourites, checkout and PPOB: this member's lease is held, so the ledger check and the write cannot interleave. */
  private async executeLeased(member: ActiveSession, cmd: MutationCommand, tKey: string, now: Date): Promise<MutationOutcome> {
    const payloadHash = payloadHashOf(cmd);
    const ref: LedgerKey = { memberId: member.memberId, kind: cmd.kind, key: cmd.idempotencyKey };
    const reservation = await this.deps.ledger.reserve({ ...ref, nik: member.nik, payloadHash, docNo: null, now });
    if (!reservation.reserved) {
      const ex = reservation.existing;
      if (ex.payloadHash !== payloadHash) {
        return { ok: false, status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key sudah dipakai untuk data berbeda.' };
      }
      if (ex.status === 'RECORDED' && ex.docNo) {
        return { ok: true, status: 200, replayed: true, kind: cmd.kind, docNo: ex.docNo, summary: { status: 'OPEN' } };
      }
      // PENDING under our lease: an earlier attempt ended without completing. These operations are idempotent (favourite add checks
      // existence, remove deletes), so this attempt takes the reservation over.
    }
    const t = await this.throttleHit(tKey, now);
    if (t.failures > WRITE_LIMIT_PER_WINDOW) {
      await this.deps.ledger.release(ref);
      return { ok: false, status: 429, code: 'THROTTLED' };
    }
    const outcome = await this.run(member, cmd, now);
    if (outcome.ok) await this.deps.ledger.complete(ref, outcome.docNo);
    else await this.deps.ledger.release(ref);   // refused before any write
    return outcome;
  }

  private run(member: ActiveSession, cmd: MutationCommand, now: Date): Promise<MutationOutcome> | MutationOutcome {
    if (cmd.kind === 'favourite_toggle') return this.submitFavouriteToggle(member, cmd, now);
    if (cmd.kind === 'store_checkout') return this.submitStoreCheckout(member, cmd, now);
    if (cmd.kind === 'ppob') return this.submitPpob(cmd);
    return { ok: false, status: 400, code: 'INVALID_INPUT' };
  }

  private checkFeatureFlag(kind: MutationCommand['kind']): { enabled: boolean; name: string } {
    const f = this.deps.flags;
    if (kind === 'loan_application') return { enabled: f.enableLoanApplication, name: 'ENABLE_LOAN_APPLICATION' };
    if (kind === 'deduction_change') return { enabled: f.enableDeductionChange, name: 'ENABLE_DEDUCTION_CHANGE' };
    if (kind === 'favourite_toggle') return { enabled: f.enableMemberFavouritesWrite, name: 'ENABLE_MEMBER_FAVOURITES_WRITE' };
    if (kind === 'store_checkout') return { enabled: f.enableStoreCheckout, name: 'ENABLE_STORE_CHECKOUT' };
    return { enabled: f.enablePpob, name: 'ENABLE_PPOB' };
  }

  private async submitFavouriteToggle(
    member: ActiveSession,
    cmd: Extract<MutationCommand, { kind: 'favourite_toggle' }>,
    now: Date,
  ): Promise<MutationOutcome> {
    if (!Number.isInteger(cmd.productId) || cmd.productId <= 0 || (cmd.action !== 'add' && cmd.action !== 'remove')) {
      return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Produk tidak valid.' };
    }
    if (!this.deps.writerDb) {
      return { ok: false, status: 503, code: 'WRITER_NOT_CONFIGURED' };
    }
    if (cmd.action === 'add') {
      const [prod] = await query<{ id: string }>(this.deps.readerDb, 'SELECT id FROM products WHERE id = ? LIMIT 1', [cmd.productId]);
      if (!prod) return { ok: false, status: 422, code: 'ITEM_UNAVAILABLE', message: 'Produk tidak ditemukan.' };
      const [exists] = await query<{ id: string }>(this.deps.writerDb, 'SELECT id FROM wishlists WHERE customer_id = ? AND product_id = ? LIMIT 1', [member.userId, cmd.productId]);
      if (!exists) {
        await this.deps.writerDb.query('INSERT INTO wishlists (customer_id, product_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [member.userId, cmd.productId, now, now]);
      }
    } else {
      await this.deps.writerDb.query('DELETE FROM wishlists WHERE customer_id = ? AND product_id = ? LIMIT 5', [member.userId, cmd.productId]);
    }
    const docNo = `FAV-${member.userId}-${cmd.productId}-${cmd.action.toUpperCase()}`;
    return { ok: true, status: 200, replayed: false, kind: 'favourite_toggle', docNo, summary: { productId: cmd.productId, action: cmd.action } };
  }

  private async submitStoreCheckout(
    member: ActiveSession,
    cmd: Extract<MutationCommand, { kind: 'store_checkout' }>,
    now: Date,
  ): Promise<MutationOutcome> {
    if (!Array.isArray(cmd.items) || cmd.items.length === 0 || cmd.items.length > 40 || (cmd.payment !== 'kredit' && cmd.payment !== 'cod')) {
      return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Keranjang atau metode pembayaran tidak valid.' };
    }
    for (const line of cmd.items) {
      if (!Number.isInteger(line.id) || line.id <= 0 || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
        return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Jumlah barang tidak valid.' };
      }
    }
    const uniqueIds = [...new Set(cmd.items.map((i) => i.id))];
    const catalog = await readCatalogItems(this.deps.readerDb, this.deps.companyId, uniqueIds);
    const byId = new Map(catalog.map((c) => [c.id, c]));
    let subtotalSen = 0;
    for (const line of cmd.items) {
      const item = byId.get(line.id);
      const priceSen = item ? senOf(item.price) : 0;
      if (!item || priceSen <= 0) {
        return { ok: false, status: 422, code: 'ITEM_UNAVAILABLE', message: 'Ada produk yang tidak tersedia lagi di katalog.' };
      }
      subtotalSen += priceSen * line.quantity;
    }
    if (cmd.payment === 'kredit') {
      const profile = await readProfile(this.deps.readerDb, member.memberId, member.nikKeys);
      const month = businessMonth(now);
      const usage = await readCreditUsage(this.deps.readerDb, member.nik, month.start, month.endExclusive);
      const credit = profile ? buildStoreCredit(profile, usage, now) : null;
      if (!credit || !credit.eligible || subtotalSen > credit.remainingSen) {
        return { ok: false, status: 422, code: 'CREDIT_INSUFFICIENT', message: 'Sisa kredit toko tidak mencukupi untuk total pesanan ini.' };
      }
    }
    // Store order placement requires the external S-MART order_details & stock reservation contract.
    return { ok: false, status: 503, code: 'UPSTREAM_WRITER_UNAVAILABLE', message: 'Layanan pemesanan online S-MART belum terhubung.' };
  }

  private submitPpob(cmd: Extract<MutationCommand, { kind: 'ppob' }>): MutationOutcome {
    const service = ppobService(cmd.serviceId as PpobService['id']);
    const account = normaliseAccount(cmd.account ?? '');
    if (!service || !account || !service.pattern.test(account)) {
      return { ok: false, status: 422, code: 'INVALID_INPUT', message: service?.patternMessage ?? 'Nomor tujuan tidak valid.' };
    }
    return { ok: false, status: 503, code: 'PROVIDER_UNAVAILABLE', message: 'Penyedia PPOB belum terhubung ke aplikasi anggota.' };
  }
}

/** apps/web refusal codes -> the PWA's codes and Indonesian messages (field names only, never values). */
function intakeRefusal(reply: Extract<IntakeReply, { kind: 'refused' }>): MutationOutcome {
  switch (reply.code) {
    case 'REQUEST_OPEN_LIMIT': return { ok: false, status: 409, code: 'OPEN_APPLICATION_LIMIT', message: 'Masih ada pengajuan pinjaman berstatus OPEN yang menunggu verifikasi.' };
    case 'IDEMPOTENCY_CONFLICT': return { ok: false, status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key sudah dipakai untuk data berbeda.' };
    case 'BUSY_RETRY': return { ok: false, status: 409, code: 'BUSY_RETRY' };
    case 'REQUEST_MEMBER_INVALID': return { ok: false, status: 422, code: 'INVALID_INPUT', message: 'Data keanggotaan Anda belum dapat diverifikasi. Hubungi pengurus koperasi.' };
    case 'REQUEST_FIELD_INVALID': return { ok: false, status: 422, code: 'INVALID_INPUT', ...(reply.field ? { field: reply.field } : {}), message: 'Data pengajuan tidak sesuai ketentuan koperasi. Periksa kembali lalu kirim ulang.' };
    default: return { ok: false, status: 503, code: 'UPSTREAM_WRITER_UNAVAILABLE', message: 'Layanan pengajuan koperasi sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.' };
  }
}
