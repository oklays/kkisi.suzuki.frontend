import { StoreUnavailableError } from '../../domain/auth/errors.ts';

/** MariaDB error number from a Prisma raw-query error (P2010 meta.code) or from the message; null if not present. */
export function dbErrorNumber(error: unknown): number | null {
  const e = error as { meta?: { code?: unknown }; message?: unknown } | null;
  const fromMeta = Number(e?.meta?.code);
  if (Number.isInteger(fromMeta) && fromMeta > 0) return fromMeta;
  const m = /Code: `(\d+)`/.exec(String(e?.message ?? ''));
  return m ? Number(m[1]) : null;
}

/** Deadlock (1213), lock wait timeout (1205), or Prisma's own write-conflict (P2034): worth retrying. */
export function isRetryable(error: unknown): boolean {
  const n = dbErrorNumber(error);
  const code = (error as { code?: unknown } | null)?.code;
  return n === 1213 || n === 1205 || code === 'P2034';
}

export type StoreLog = (event: string, fields?: Record<string, string | number | boolean>) => void;

/**
 * G3: one attempt plus at most 2 retries on deadlock/lock-wait. Every other failure (connection lost, pool cap 1226,
 * timeouts, permissions, exhausted retries) becomes StoreUnavailableError -> HTTP 503. Nothing here can grant access.
 */
export async function withStoreRetry<T>(log: StoreLog, task: string, fn: () => Promise<T>, backoffMs = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (error instanceof StoreUnavailableError) throw error;
      if (isRetryable(error) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt + Math.floor(Math.random() * backoffMs)));
        continue;
      }
      const number = dbErrorNumber(error);
      const prismaCode = String((error as { code?: unknown } | null)?.code ?? '');
      log('store_error', { task, attempt, db: number ?? 0, prisma: /^P\d{4}$/.test(prismaCode) ? prismaCode : 'none' });
      throw new StoreUnavailableError();
    }
  }
}
