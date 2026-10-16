import { PrismaClient } from '@prisma/client';

// Third client: the console store (identity links + audit) with its OWN account, database and pool (DATABASE_URL_CONSOLE,
// connection_limit 1). Raw, parameterised SQL only. Import it ONLY from infrastructure/console (scan-tested).
const globalConsole = globalThis as typeof globalThis & { prismaConsoleClient?: PrismaClient };

export function consolePrisma(): PrismaClient {
  if (!process.env.DATABASE_URL_CONSOLE) throw new Error('DATABASE_URL_CONSOLE missing');
  globalConsole.prismaConsoleClient ??= new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_CONSOLE });
  return globalConsole.prismaConsoleClient;
}
