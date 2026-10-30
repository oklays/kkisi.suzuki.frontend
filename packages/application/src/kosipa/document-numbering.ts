import { KosipaError } from '@koperasi/domain/kosipa';
import { documentNumberScheme, resolveNumberingPeriod, type DocumentNumberScheme } from '@koperasi/domain/kosipa/document-number';

/**
 * Document numbering service (TASK-109; REQ-107, BR-116). Used by document commands INSIDE their own transaction (the repository receives the
 * transaction handle `Tx` of the unit of work), so a number exists exactly when the document does: a rollback releases it, a commit makes it
 * permanent, and a replayed command returns the stored number without allocating (the ledger replay).
 */
export type AllocationRequest = {
  scheme: string;
  now: Date;
  /** Required for document-period schemes (payroll batch: YYYYMM of the payroll), forbidden for clock schemes. */
  documentPeriod?: string;
  /** Row-id schemes: the id of the business row just inserted in this transaction. Forbidden for period-sequence schemes. */
  rowId?: number;
  /** The business table the number is for; must be the scheme's table (explicit numbering scope). */
  table: string;
  requestId: string;
};
export type AllocatedNumber = { docNo: string; scheme: string; period: string; sequence: number };

export interface DocumentNumberRepository<Tx> {
  allocate(tx: Tx, scheme: DocumentNumberScheme, period: string, request: { rowId?: number; requestId: string }): Promise<AllocatedNumber>;
}

export class DocumentNumberingService<Tx> {
  private readonly repository: DocumentNumberRepository<Tx>;
  constructor(repository: DocumentNumberRepository<Tx>) { this.repository = repository; }

  allocate(tx: Tx, request: AllocationRequest): Promise<AllocatedNumber> {
    const scheme = documentNumberScheme(request.scheme);
    if (request.table !== scheme.table) throw new KosipaError('NUMBERING_SCOPE_MISMATCH');
    const period = resolveNumberingPeriod(scheme, request.now, request.documentPeriod);
    if (scheme.strategy === 'row-id') {
      if (!Number.isSafeInteger(request.rowId) || (request.rowId as number) < 1) throw new KosipaError('NUMBERING_ROW_ID_REQUIRED');
    } else if (request.rowId !== undefined) throw new KosipaError('NUMBERING_ROW_ID_NOT_ALLOWED');
    return this.repository.allocate(tx, scheme, period, { rowId: request.rowId, requestId: request.requestId });
  }
}
