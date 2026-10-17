import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import type { KosipaMemberReader } from '@koperasi/application/kosipa/member-360';
import type { StoreColumnMap } from '@koperasi/domain/kosipa';
import type { LoanReader } from '@koperasi/application/kosipa/loans';
import type { PayrollReader } from '@koperasi/application/kosipa/payroll';
import { consolePrisma } from '../db/prisma-console.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaKosipaMemberReader } from '../repositories/kosipa-member.repository.ts';
import { PrismaKosipaLoanReader } from '../repositories/kosipa-loan.repository.ts';
import { PrismaKosipaPayrollReader } from '../repositories/kosipa-payroll.repository.ts';
import { consoleStoreUsable, kosipaReadEnabled } from './config.ts';
import { storeColumnMapFromEnv } from './payroll-config.ts';
import { PrismaAuditLog, PrismaIdentityLinkStore } from './console-store.ts';
import { PrismaKosipaDirectory } from './kosipa-directory.ts';

export type ConsoleServices = IdentityPorts & { directory: PrismaKosipaDirectory };

/** Console-store services, or null when the store is not configured/allowed (features that need it stay off). */
export function consoleServices(env: Record<string, string | undefined> = process.env): ConsoleServices | null {
  if (!consoleStoreUsable(env)) return null;
  const db = consolePrisma();
  const directory = new PrismaKosipaDirectory(prisma);
  return { links: new PrismaIdentityLinkStore(db), audit: new PrismaAuditLog(db), kosipa: directory, consoleUsers: directory, directory, now: () => new Date() };
}

/** KOSIPA read access needs BOTH the flag and a usable console store (identity links live there). */
export function kosipaServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & { members: KosipaMemberReader; payroll: PayrollReader; loans: LoanReader; storeColumnMap: StoreColumnMap }) | null {
  if (!kosipaReadEnabled(env)) return null;
  const services = consoleServices(env);
  return services ? { ...services, members: new PrismaKosipaMemberReader(prisma), payroll: new PrismaKosipaPayrollReader(prisma), loans: new PrismaKosipaLoanReader(prisma), storeColumnMap: storeColumnMapFromEnv(env) } : null;
}
