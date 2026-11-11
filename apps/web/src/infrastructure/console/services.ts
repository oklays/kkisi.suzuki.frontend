import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import type { KosipaMemberReader } from '@koperasi/application/kosipa/member-360';
import type { KosipaDashboardFinanceReader } from '@koperasi/application/kosipa/dashboard-finance';
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
import { PrismaKosipaDashboardFinanceReader } from '../repositories/kosipa-dashboard-finance.repository.ts';
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
import { LOAN_DECISION_LEGACY_CONTROLLERS, kosipaDeductionRequestShared, kosipaGrantAdmins, kosipaLoanDecisionShared, kosipaMasterShared, kosipaWriteGrantsEnabled, kosipaWriteOwnership } from './kosipa-ownership.ts';
import { PrismaKosipaMemberRequestRepository } from '../repositories/kosipa-member-request.repository.ts';
import { kosipaRequestWritePrisma, kosipaRequestWritesAvailable, validateKosipaRequestLedgerDatabase } from '../db/prisma-kosipa-request-write.ts';
import type { MemberRequestRepository } from '@koperasi/application/kosipa/commands/member-request';
import { PrismaKosipaMasterRepository } from '../repositories/kosipa-master-write.repository.ts';
import { kosipaMasterWritePrisma, kosipaMasterWritesAvailable, validateKosipaLedgerDatabase } from '../db/prisma-kosipa-master-write.ts';
import { PrismaKosipaMemberRepository } from '../repositories/kosipa-member-write.repository.ts';
import { PrismaKosipaProductMasterRepository } from '../repositories/kosipa-product-master.repository.ts';
import { PrismaKosipaSavingsDepositRepository } from '../repositories/kosipa-savings-deposit.repository.ts';
import { kosipaSavingsWritePrisma, kosipaSavingsWritesAvailable, validateKosipaSavingsLedgerDatabase } from '../db/prisma-kosipa-savings-write.ts';
import { PrismaKosipaLoanDecisionRepository } from '../repositories/kosipa-loan-decision.repository.ts';
import { kosipaLoanWritePrisma, kosipaLoanWritesAvailable, validateKosipaLoanLedgerDatabase } from '../db/prisma-kosipa-loan-write.ts';
import type { LoanDecisionRepository } from '@koperasi/application/kosipa/commands/loan-decision';
import { kosipaMemberWritePrisma, kosipaMemberWritesAvailable, validateKosipaMemberLedgerDatabase } from '../db/prisma-kosipa-member-write.ts';
import type { KosipaWriteSources } from '@koperasi/application/console/capabilities';
import type { WriteOwnership } from '@koperasi/application/kosipa/commands/pipeline';
import type { MasterRepository } from '@koperasi/application/kosipa/commands/master';
import type { MemberRepository } from '@koperasi/application/kosipa/commands/member';
import type { ProductMasterRepository } from '@koperasi/application/kosipa/commands/product-master';
import type { SavingsDepositRepository } from '@koperasi/application/kosipa/commands/savings-deposit';
import type { KosipaGrantStore } from '@koperasi/application/console/kosipa-grants';

export type ConsoleServices = IdentityPorts & { directory: PrismaKosipaDirectory };

/** Console-store services, or null when the store is not configured/allowed (features that need it stay off). */
export function consoleServices(env: Record<string, string | undefined> = process.env): ConsoleServices | null {
  if (!consoleStoreUsable(env)) return null;
  const db = consolePrisma();
  // Once Next.js owns member writes, the legacy member controllers are fenced (status 0); their group access rows must still grant member VIEW.
  // Same for the loan decision: pinjaman/pinjaman_c is fenced with the other loan controllers but also grants kosipa.loan.view.
  const ownership = kosipaWriteOwnership(env);
  const fencedViewUrls = [...(ownership.owns('member') ? ['anggota/anggota_c', 'master/anggota_c'] : []), ...(ownership.owns('loan.decision') && !kosipaLoanDecisionShared(env) ? LOAN_DECISION_LEGACY_CONTROLLERS : [])];
  const directory = new PrismaKosipaDirectory(prisma, { fencedViewUrls });
  return { links: new PrismaIdentityLinkStore(db), audit: new PrismaAuditLog(db), kosipa: directory, consoleUsers: directory, directory, now: () => new Date() };
}

/** KOSIPA read access needs BOTH the flag and a usable console store (identity links live there). */
export function kosipaServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & KosipaWriteSources & { members: KosipaMemberReader; finance: KosipaDashboardFinanceReader; payroll: PayrollReader; loans: LoanReader; savings: SavingsReader; reports: ReportReader; opsReports: OpsReportReader; storeColumnMap: StoreColumnMap; exportPolicy: ExportPolicy; exportThrottle: ExportThrottle }) | null {
  if (!kosipaReadEnabled(env)) return null;
  const services = consoleServices(env);
  // Write grants (FD-16) are read only where the console store has db/console/004 and the flag says so; otherwise no write capability.
  const write: KosipaWriteSources = services && kosipaWriteGrantsEnabled(env) ? { roleWriteGrantsEnabled: true, grants: new PrismaKosipaGrantStore(consolePrisma()), grantAdmins: kosipaGrantAdmins(env) } : {};
  return services ? { ...services, ...write, members: new PrismaKosipaMemberReader(prisma), finance: new PrismaKosipaDashboardFinanceReader(prisma), payroll: new PrismaKosipaPayrollReader(prisma), loans: new PrismaKosipaLoanReader(prisma), savings: new PrismaKosipaSavingsReader(prisma), reports: new PrismaKosipaReportReader(prisma), opsReports: new PrismaKosipaOpsReportReader(prisma), storeColumnMap: storeColumnMapFromEnv(env), exportPolicy: exportPolicyFromEnv(env), exportThrottle } : null;
}

/** Native KOSIPA commands (FA-01): KOSIPA read services + ownership gate + writer repositories. The writer is attached only when its
 *  guarded configuration is valid; otherwise reads work and every command answers 503 WRITE_NOT_CONFIGURED. */
export type KosipaCommandServices = ConsoleServices & KosipaWriteSources & { ownership: WriteOwnership; masters: MasterRepository; members: MemberRepository; products: ProductMasterRepository; deposits: SavingsDepositRepository; loanDecisions: LoanDecisionRepository; requests: MemberRequestRepository };
export function kosipaCommandServices(env: Record<string, string | undefined> = process.env): KosipaCommandServices | null {
  const services = kosipaServices(env);
  if (!services) return null;
  const writable = kosipaMasterWritesAvailable(env);
  const masterShared = kosipaMasterShared(env);
  const masters = new PrismaKosipaMasterRepository(prisma, writable ? kosipaMasterWritePrisma() : undefined, { ledgerDatabase: writable ? validateKosipaLedgerDatabase(env) : undefined, sharedWithLegacy: masterShared });
  const memberWritable = kosipaMemberWritesAvailable(env);
  const versionSecret = (env.KOSIPA_MEMBER_VERSION_SECRET ?? '').length >= 32 ? env.KOSIPA_MEMBER_VERSION_SECRET : undefined;
  const members = new PrismaKosipaMemberRepository(prisma, memberWritable ? kosipaMemberWritePrisma() : undefined, { ledgerDatabase: memberWritable ? validateKosipaMemberLedgerDatabase(env) : undefined, versionSecret });
  // Product masters (FA-03B T06) share the master writer, its flag and its ledger.
  const products = new PrismaKosipaProductMasterRepository(prisma, writable ? kosipaMasterWritePrisma() : undefined, { ledgerDatabase: writable ? validateKosipaLedgerDatabase(env) : undefined, sharedWithLegacy: masterShared });
  // Savings deposits (FA-03C T07): their own writer account, flag and ledger check.
  const savingsWritable = kosipaSavingsWritesAvailable(env);
  const deposits = new PrismaKosipaSavingsDepositRepository(prisma, savingsWritable ? kosipaSavingsWritePrisma() : undefined, { ledgerDatabase: savingsWritable ? validateKosipaSavingsLedgerDatabase(env) : undefined });
  // Loan decisions (FA-04): their own writer account, flag and ledger check.
  const loanWritable = kosipaLoanWritesAvailable(env);
  const loanDecisions = new PrismaKosipaLoanDecisionRepository(prisma, loanWritable ? kosipaLoanWritePrisma() : undefined, { ledgerDatabase: loanWritable ? validateKosipaLoanLedgerDatabase(env) : undefined, sharedWithLegacy: kosipaLoanDecisionShared(env) });
  // Member requests (P1): their own writer account, flag and ledger check; deduction coexistence is an owner decision.
  const requests = memberRequestRepository(env);
  return { ...services, ownership: kosipaWriteOwnership(env), masters, members, products, deposits, loanDecisions, requests };
}

/** Grant administration needs the console store, the grant table (flag) and the KOSIPA directory for identity links. */
export function kosipaGrantServices(env: Record<string, string | undefined> = process.env): (ConsoleServices & KosipaWriteSources & { grants: KosipaGrantStore; grantAdmins: ReadonlySet<number> }) | null {
  const services = consoleServices(env);
  if (!services || !kosipaWriteGrantsEnabled(env)) return null;
  return { ...services, roleWriteGrantsEnabled: true, grants: new PrismaKosipaGrantStore(consolePrisma()), grantAdmins: kosipaGrantAdmins(env) };
}

/** Member-request repository (console decisions and the internal PWA intake share it). Reads use the KOSIPA reader. */
export function memberRequestRepository(env: Record<string, string | undefined> = process.env): PrismaKosipaMemberRequestRepository {
  const writable = kosipaRequestWritesAvailable(env);
  return new PrismaKosipaMemberRequestRepository(prisma, writable ? kosipaRequestWritePrisma() : undefined, { ledgerDatabase: writable ? validateKosipaRequestLedgerDatabase(env) : undefined, deductionShared: kosipaDeductionRequestShared(env) });
}
