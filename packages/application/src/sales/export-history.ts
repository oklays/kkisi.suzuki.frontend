import { AuthError } from '@koperasi/domain/auth/errors';
import { SalesHistoryError, type SalesHistoryQuery } from '@koperasi/domain/sales/history';
import {
  buildSalesExportFilename,
  buildSalesExportPdf,
  buildSalesExportWorkbook,
  type SalesExportBundle,
  type SalesExportQuery,
  type SalesExportScope,
} from '@koperasi/domain/sales/export';

export interface SalesExportRepository {
  exportBundle(companyId: number, scope: SalesExportScope, query: SalesHistoryQuery, now: Date): Promise<SalesExportBundle>;
}

export type SalesExportActor = {
  companyId: number;
  canSwitchBranch: boolean;
};

export type SalesExportResult = {
  filename: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/pdf';
  body: Uint8Array;
};

function validCompany(companyId: number): boolean {
  return Number.isSafeInteger(companyId) && companyId > 0 && companyId <= 2_147_483_647;
}

export async function exportSalesHistory(
  repo: SalesExportRepository,
  actor: SalesExportActor,
  query: SalesExportQuery,
  now = new Date(),
): Promise<SalesExportResult> {
  if (!validCompany(actor.companyId)) throw new SalesHistoryError('INVALID_INPUT');
  if (query.scope === 'all' && !actor.canSwitchBranch) throw new AuthError('FORBIDDEN');

  const bundle = await repo.exportBundle(actor.companyId, query.scope, query, now);
  const body = query.format === 'xlsx' ? buildSalesExportWorkbook(bundle) : buildSalesExportPdf(bundle);
  const contentType = query.format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf';

  return {
    filename: buildSalesExportFilename(bundle, query.format),
    contentType,
    body,
  };
}

