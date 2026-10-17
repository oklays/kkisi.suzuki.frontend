import { PrismaClient } from '@prisma/client';

const globalPrisma = globalThis as typeof globalThis & { prismaClient?: PrismaClient };

/**
 * The SELECT-only reader pool: ONE client per process, in every environment. Next.js can evaluate this module more than once in a single
 * process (separate server module graphs); caching only outside production let `next start` build a second client and a second pool, so one
 * process opened 2 x connection_limit reader connections (measured 6 against 3 in checkpoint 12) while the startup guard counted 3. The other
 * clients (auth, console, writers) already cache unconditionally.
 */
export const prisma = (globalPrisma.prismaClient ??= new PrismaClient());
