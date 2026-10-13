import type { Prisma } from '@prisma/client';

/**
 * Legacy writes share tables with the PHP application, whose unindexed UPDATE/DELETE statements briefly lock whole
 * tables. Without a cap, a blocked statement waits the server's innodb_lock_wait_timeout (50 s on Niagahoster), the
 * HTTP request times out and our own row locks are held all that time. Capping the wait makes a blocked transaction
 * fail fast (error 1205), which the repositories already retry or report, and releases its locks quickly.
 * Session-scoped on the writer's pooled connection; first statement of every legacy write transaction.
 */
export const LOCK_WAIT_SECONDS = 8;

export async function capLockWait(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe(`SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_SECONDS}`);
}
