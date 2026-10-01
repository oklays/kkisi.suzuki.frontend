import { randomBytes } from 'node:crypto';
import { ReadProductsUseCase } from '../../application/inventory/use-cases/read-products.usecase.ts';
import { loadAuthConfig } from './config.ts';
import { consoleLogger } from './logger.ts';
import { buildKeys } from './keys.ts';
import { WorkerPasswordVerifier } from './password-verifier.ts';
import { PrismaSessionStore } from './prisma-session-store.ts';
import { PrismaThrottleStore } from './prisma-throttle-store.ts';
import { PrismaCompanyRepository, PrismaPermissionRepository, PrismaRegisterRepository, PrismaUserRepository } from './prisma-legacy-repositories.ts';
import { authPrisma } from '../db/prisma-auth.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaItemRepository } from '../repositories/prisma-item.repository.ts';
import type { AuthServices } from './http.ts';

type Container = { services: AuthServices; catalog: ReadProductsUseCase };
const holder = globalThis as typeof globalThis & { kkisiAuthContainer?: Container };

/**
 * Builds the real dependencies once per server process. Throws AuthError('NOT_CONFIGURED') when anything is missing or
 * unsafe (non-loopback origin or database, weak/missing secrets, a legacy account that could write): auth then answers 503.
 */
export function getContainer(): Container {
  if (holder.kkisiAuthContainer) return holder.kkisiAuthContainer;
  const config = loadAuthConfig(process.env);
  const log = consoleLogger();
  const keys = buildKeys(config.secrets);
  const legacy = prisma;                       // DATABASE_URL: SELECT-only
  const auth = authPrisma();                   // DATABASE_URL_AUTH: kkisi_auth, auth schema only
  const services: AuthServices = {
    config, keys,
    deps: {
      clock: { now: () => new Date() },
      random: { bytes: (n) => randomBytes(n) },
      log,
      users: new PrismaUserRepository(legacy, log),
      permissions: new PrismaPermissionRepository(legacy, log),
      companies: new PrismaCompanyRepository(legacy, log),
      registers: new PrismaRegisterRepository(legacy, log),
      sessions: new PrismaSessionStore(auth, log),
      throttle: new PrismaThrottleStore(auth, log),
      verifier: new WorkerPasswordVerifier({ workers: 2, maxQueue: 8 }),
      throttleKeys: (username, ip) => keys.throttleKeys(username, ip),
    },
  };
  holder.kkisiAuthContainer = { services, catalog: new ReadProductsUseCase(new PrismaItemRepository()) };
  return holder.kkisiAuthContainer;
}
