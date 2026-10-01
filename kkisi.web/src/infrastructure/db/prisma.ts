import { PrismaClient } from '@prisma/client';

const globalPrisma = globalThis as typeof globalThis & { prismaClient?: PrismaClient };

export const prisma = globalPrisma.prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalPrisma.prismaClient = prisma;
