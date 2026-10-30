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
import { PrismaKosipaGrantStore } from './kosipa-grant-store.ts';
import { kosipaGrantAdmins, kosipaWriteGrantsEnabled, kosipaWriteOwnership } from './kosipa-ownership.ts';
import { PrismaKosipaMasterRepository } from '../repositories/kosipa-master-write.repository.ts';
import { kosipaMasterWritePrisma, kosipaMasterWritesAvailable, validateKosipaLedgerDatabase } from '../db/prisma-kosipa-master-write.ts';
import type { KosipaWriteSources } from '@koperasi/application/console/capabilities';
import type { WriteOwnership } from '@koperasi/application/kosipa/commands/pipeline';
import type { MasterRepository } from '@koperasi/application/kosipa/commands/master';
import type { KosipaGrantStore } from '@koperasi/application/console/kosipa-grants';

export type ConsoleServices = IdentityPorts & { directory: PrismaKosipaDirectory };

/** Console-store services, or null when the store is not configured/allowed (features that need it stay off). */
export function consoleServices(env: Record<string, string | undefined> = process.env): ConsoleServices | null {
  if (!consoleStoreUsable(env)) return null;
  const db = consolePrisma();
  const directory = new PrismaKosipaDirectory(prisma);
  return { links: new PrismaIdentityLinkStore(db), audit: new PrismaAuditLog(db), kosipa: directory, consoleUsers: directory, directory, now: () => new Date() };
}

/** KOSIPA read access needs BOTH the flag and a usable console store (identity links live there). */
export function kosipaServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & KosipaWriteSources & { members: KosipaMemberReader; payroll: PayrollReader; loans: LoanReader; savings: SavingsReader; reports: ReportReader; opsReports: OpsReportReader; storeColumnMap: StoreColumnMap; exportPolicy: ExportPolicy; exportThrottle: ExportThrottle }) | null {
  if (!kosipaReadEnabled(env)) return null;
  const services = consoleServices(env);
  // Write grants (FD-16) are read only where the console store has db/console/004 and the flag says so; otherwise no write capability.
  const write: KosipaWriteSources = services && kosipaWriteGrantsEnabled(env) ? { grants: new PrismaKosipaGrantStore(consolePrisma()), grantAdmins: kosipaGrantAdmins(env) } : {};
  return services ? { ...services, ...write, members: new PrismaKosipaMemberReader(prisma), payroll: new PrismaKosipaPayrollReader(prisma), loans: new PrismaKosipaLoanReader(prisma), savings: new PrismaKosipaSavingsReader(prisma), reports: new PrismaKosipaReportReader(prisma), opsReports: new PrismaKosipaOpsReportReader(prisma), storeColumnMap: storeColumnMapFromEnv(env), exportPolicy: exportPolicyFromEnv(env), exportThrottle } : null;
}

/** Native KOSIPA commands (FA-01): KOSIPA read services + ownership gate + writer repositories. The writer is attached only when its
 *  guarded configuration is valid; otherwise reads work and every command answers 503 WRITE_NOT_CONFIGURED. */
export type KosipaCommandServices = ConsoleServices & KosipaWriteSources & { ownership: WriteOwnership; masters: MasterRepository };
export function kosipaCommandServices(env: Record<string, string | undefined> = process.env): KosipaCommandServices | null {
  const services = kosipaServices(env);
  if (!services) return null;
  const writable = kosipaMasterWritesAvailable(env);
  const masters = new PrismaKosipaMasterRepository(prisma, writable ? kosipaMasterWritePrisma() : undefined, { ledgerDatabase: writable ? validateKosipaLedgerDatabase(env) : undefined });
  return { ...services, ownership: kosipaWriteOwnership(env), masters };
}

/** Grant administration needs the console store, the grant table (flag) and the KOSIPA directory for identity links. */
export function kosipaGrantServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & { grants: KosipaGrantStore; grantAdmins: ReadonlySet<number> }) | null {
  const services = consoleServices(env);
  if (!services || !kosipaWriteGrantsEnabled(env)) return null;
  return { ...services, grants: new PrismaKosipaGrantStore(consolePrisma()), grantAdmins: kosipaGrantAdmins(env) };
}
