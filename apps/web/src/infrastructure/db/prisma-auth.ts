import { PrismaClient } from '@prisma/client';

// Second client: same generated class, its OWN pool and its OWN account (kkisi_auth, DATABASE_URL_AUTH). It only runs
// raw, parameterised SQL against kkisi_auth_staging. Import it ONLY from infrastructure/auth (ESLint enforces this).
const globalAuth = globalThis as typeof globalThis & { prismaAuthClient?: PrismaClient };

export function authPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL_AUTH) throw new Error('DATABASE_URL_AUTH missing');
  globalAuth.prismaAuthClient ??= new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_AUTH });
  return globalAuth.prismaAuthClient;
}
