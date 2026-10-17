import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import type { KosipaMemberReader } from '@koperasi/application/kosipa/member-360';
import type { StoreColumnMap } from '@koperasi/domain/kosipa';
import type { ReportReader } from '@koperasi/application/kosipa/reports';
import type { OpsReportReader } from '@koperasi/application/kosipa/reports-ops';
import type { ExportPolicy } from '@koperasi/application/console/capabilities';
import type { ExportThrottle } from '@koperasi/application/kosipa/report-export';
import type { SavingsReader } from '@koperasi/application/kosipa/savings';
import type { LoanReader } from '@koperasi/application/kosipa/loans';
import type { PayrollReader } from '@koperasi/application/kosipa/payroll';
import { consolePrisma } from '../db/prisma-console.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaKosipaMemberReader } from '../repositories/kosipa-member.repository.ts';
import { PrismaKosipaLoanReader } from '../repositories/kosipa-loan.repository.ts';
import { PrismaKosipaOpsReportReader } from '../repositories/kosipa-ops-report.repository.ts';
import { PrismaKosipaReportReader } from '../repositories/kosipa-report.repository.ts';
import { PrismaKosipaSavingsReader } from '../repositories/kosipa-savings.repository.ts';
import { PrismaKosipaPayrollReader } from '../repositories/kosipa-payroll.repository.ts';
import { consoleStoreUsable, kosipaReadEnabled } from './config.ts';
import { storeColumnMapFromEnv } from './payroll-config.ts';
import { exportPolicyFromEnv, exportThrottle } from './export-config.ts';
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
export function kosipaServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & { members: KosipaMemberReader; payroll: PayrollReader; loans: LoanReader; savings: SavingsReader; reports: ReportReader; opsReports: OpsReportReader; storeColumnMap: StoreColumnMap; exportPolicy: ExportPolicy; exportThrottle: ExportThrottle }) | null {
  if (!kosipaReadEnabled(env)) return null;
  const services = consoleServices(env);
  return services ? { ...services, members: new PrismaKosipaMemberReader(prisma), payroll: new PrismaKosipaPayrollReader(prisma), loans: new PrismaKosipaLoanReader(prisma), savings: new PrismaKosipaSavingsReader(prisma), reports: new PrismaKosipaReportReader(prisma), opsReports: new PrismaKosipaOpsReportReader(prisma), storeColumnMap: storeColumnMapFromEnv(env), exportPolicy: exportPolicyFromEnv(env), exportThrottle } : null;
}
