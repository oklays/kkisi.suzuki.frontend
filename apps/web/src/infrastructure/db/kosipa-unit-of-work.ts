import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { idempotencyDecision, type Snapshot } from '@koperasi/domain/kosipa/command';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { capLockWait } from './lock-wait.ts';

/**
 * Unit of work for native KOSIPA commands (kosipa-full-access TASK-107; REQ-105, NFR-103, NFR-105). ONE InnoDB transaction,
 * REPEATABLE READ (server default), with this fixed order:
 *   1. capLockWait                       blocked statements fail fast (1205) instead of holding locks for 50 s
 *   2. legacy fence, LOCK IN SHARE MODE  every ref_menu row of the feature's legacy controllers (same match as the legacy gate) must be
 *                                        switched off, else 503 LEGACY_ACTIVE. The share locks make a concurrent legacy re-enable
 *                                        (admin/adm_menu_c UPDATE or INSERT) wait until this command has committed (FD-03, FA-01.5)
 *   3. steps.lock(tx)                    the command's business locks (SELECT ... FOR UPDATE in the context's lock order)
 *   4. ledger lookup FOR UPDATE          a locking read sees the latest COMMITTED row: same key + same hash -> replay
 *   5. steps.run(tx, locked)             re-check with the domain rules on the locked rows, write legacy-compatible rows
 *   6. ledger INSERT                     same transaction: the ledger row exists if and only if the effect exists
 *   7. COMMIT
 * The ledger lives in its own database on the same server (FD-01b, option b): one connection and one InnoDB transaction span both
 * databases, so atomicity is unchanged, while the writer's privileges on the ledger database are exactly SELECT, INSERT (database level,
 * which is what cPanel can grant) and the legacy application accounts have none there.
 * Business locks come BEFORE the ledger lookup: concurrent submissions of one logical command serialize on the subject, so the
 * second one finds the first one's committed row and replays it (no gap-lock deadlock on the ledger index). A submission whose
 * subject lock does not serialize it (same key reused for another record) can only meet the first at the ledger unique key
 * (1062) or as a deadlock (1213); both roll back completely and are retried, after which the lookup answers.
 * Retries: deadlock / lock-wait timeout / ledger-key race -> whole transaction again, at most 3 attempts, then 409 BUSY_RETRY
 * (safe to resubmit with the same key). Nothing outside the database happens inside the transaction (no network, no files).
 */
export type LedgerFacts = {
  fromState?: string | null; toState?: string | null; reason?: string | null;
  before?: Snapshot | null; after?: Snapshot | null; makerConsoleUserId?: number | null; checkerConsoleUserId?: number | null;
};
export type CommandSteps<L, R> = {
  lock(tx: Prisma.TransactionClient): Promise<L>;
  run(tx: Prisma.TransactionClient, locked: L): Promise<{ result: R; ledger: LedgerFacts }>;
};
/** Failure injection for tests only (never wired by the services): after the business write / after the ledger row, before COMMIT. */
export type UnitOfWorkHooks = { afterBusinessWrite?: (tx: Prisma.TransactionClient) => Promise<void>; afterLedgerWrite?: (tx: Prisma.TransactionClient) => Promise<void> };
export type UnitOfWorkOptions = { ledgerDatabase: string; legacyControllers: readonly string[]; hooks?: UnitOfWorkHooks };

const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;
/** Fully qualified ledger table; the database name comes from validated configuration only, never from a request. */
export function ledgerTable(database: string): Prisma.Sql {
  if (!IDENTIFIER.test(database)) throw new KosipaError('WRITE_NOT_CONFIGURED');
  return Prisma.raw(`\`${database}\`.kosipa_command_ledger`);
}

/**
 * Fail closed when any ref_menu row of the legacy controllers is enabled (legacy compares upper(url) = upper('<module>/<Class>') AND
 * status = 1). Every matching row is share-locked WHATEVER its status: re-enabling is an UPDATE of exactly those rows, and under
 * REPEATABLE READ the unindexed scan's next-key locks also hold back an INSERT of a duplicate row until this transaction ends.
 */
async function assertLegacyFenced(tx: Prisma.TransactionClient, controllers: readonly string[]): Promise<void> {
  if (!controllers.length) throw new KosipaError('WRITE_NOT_CONFIGURED');
  const rows = await tx.$queryRaw<{ status: bigint | number | null }[]>(Prisma.sql`SELECT status FROM ref_menu
    WHERE UPPER(url) IN (${Prisma.join(controllers.map((c) => Prisma.sql`UPPER(${c})`))}) LOCK IN SHARE MODE`);
  if (rows.some((r) => Number(r.status) === 1)) throw new KosipaError('LEGACY_ACTIVE');
}

export const MAX_ATTEMPTS = 3;
export const TRANSACTION_TIMEOUT_MS = 15_000;

/** MariaDB error number of a Prisma raw-query failure (P2010 meta or message), without exposing the message. */
export function dbErrno(error: unknown): string | null {
  const e = error as { meta?: { code?: unknown }; message?: unknown } | null;
  if (typeof e?.meta?.code === 'string' && /^\d{4}$/.test(e.meta.code)) return e.meta.code;
  const m = /\b(1062|1205|1213|4025)\b/.exec(String(e?.message ?? ''));
  return m ? m[1] : null;
}
const prismaCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

function retryable(error: unknown): boolean {
  if (prismaCode(error) === 'P2034') return true;                        // write conflict / deadlock reported by Prisma
  const errno = dbErrno(error);
  if (errno === '1213' || errno === '1205') return true;                 // deadlock, lock wait timeout
  return errno === '1062' && /ux_ledger_idem/.test(String((error as { message?: unknown })?.message ?? ''));
}

const json =(value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LedgerRow = { id: bigint | number; command: string; request_hash: string; result_json: string | null };

export async function runCommandTransaction<L, R>(client: PrismaClient, envelope: CommandEnvelope, steps: CommandSteps<L, R>, options: UnitOfWorkOptions): Promise<CommandOutcome<R>> {
  const ledger = ledgerTable(options.ledgerDatabase);
  const hooks = options.hooks ?? {};
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(async (tx) => {
        await capLockWait(tx);
        await assertLegacyFenced(tx, options.legacyControllers);
        const locked = await steps.lock(tx);
        const [stored] = await tx.$queryRaw<LedgerRow[]>`SELECT id, command, request_hash, result_json FROM ${ledger}
          WHERE actor_console_user_id = ${envelope.actorConsoleUserId} AND idempotency_key = ${envelope.idempotencyKey} FOR UPDATE`;
        const decision = idempotencyDecision(stored ? { ledgerId: Number(stored.id), command: stored.command, requestHash: stored.request_hash, result: JSON.parse(stored.result_json ?? 'null') } : null, envelope);
        if (decision.kind === 'replay') return { result: decision.result as R, replayed: true, ledgerId: decision.ledgerId };

        const { result, ledger: facts } = await steps.run(tx, locked);
        await hooks.afterBusinessWrite?.(tx);
        await tx.$executeRaw`INSERT INTO ${ledger} (command, capability, idempotency_key, request_hash, request_id, actor_console_user_id, actor_kosipa_user_id,
          subject_type, subject_ref, from_state, to_state, maker_console_user_id, checker_console_user_id, reason, before_json, after_json, result_json, created_at)
          VALUES (${envelope.command}, ${envelope.capability}, ${envelope.idempotencyKey}, ${envelope.requestHash}, ${envelope.requestId.slice(0, 40)},
          ${envelope.actorConsoleUserId}, ${envelope.actorKosipaUserId}, ${envelope.subjectType}, ${envelope.subjectRef.slice(0, 64)},
          ${facts.fromState ?? null}, ${facts.toState ?? null}, ${facts.makerConsoleUserId ?? null}, ${facts.checkerConsoleUserId ?? null},
          ${facts.reason ?? null}, ${json(facts.before)}, ${json(facts.after)}, ${JSON.stringify(result)}, UTC_TIMESTAMP(3))`;
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        await hooks.afterLedgerWrite?.(tx);
        return { result, replayed: false, ledgerId: Number(id) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: TRANSACTION_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof KosipaError) throw error;
      if (prismaCode(error) === 'P2024') throw new KosipaError('BUSY_RETRY');   // writer pool exhausted: tell the client to retry
      if (!retryable(error)) throw error;
      if (attempt >= MAX_ATTEMPTS) throw new KosipaError('BUSY_RETRY');
      await sleep(15 * attempt + Math.floor(Math.random() * 40));
    }
  }
}
