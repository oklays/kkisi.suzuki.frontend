import { Prisma } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { formatDocumentNumber, nextPeriodSequence, type DocumentNumberScheme } from '@koperasi/domain/kosipa/document-number';
import type { AllocatedNumber, DocumentNumberRepository } from '@koperasi/application/kosipa/document-numbering';
import { dbErrno } from '../db/kosipa-unit-of-work.ts';

/**
 * Document numbers inside the caller's InnoDB transaction (TASK-109). Every issued number is claimed in the append-only registry
 * `<ledger db>.kosipa_document_number` (db/kosipa/005), whose unique keys — (scheme, period, seq) and (doc_no) — are the database-enforced
 * guarantee that no number is ever issued twice. The writer has SELECT, INSERT there only, so a committed claim can never be released.
 *   period-sequence: n = above every number of the scheme x period already in the legacy table and in the registry; a concurrent transaction
 *     that claimed the same n first makes our INSERT wait and then fail with 1062 -> try n+1 (bounded). The failed statement does not abort
 *     the InnoDB transaction. A claim rolled back by its own transaction disappears, so that n may be issued again (it was never committed).
 *   row-id: n = the id of the business row this transaction just inserted (legacy's MAX(id)+1 basis); a clash with a number already present
 *     in the legacy table or registry is DOCUMENT_NUMBER_CONFLICT (409) — never silently renumbered.
 */
const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;
const raw = (identifier: string) => {
  if (!IDENTIFIER.test(identifier)) throw new KosipaError('WRITE_NOT_CONFIGURED');
  return Prisma.raw(`\`${identifier}\``);
};
const MAX_PROBES = 50;

export class PrismaDocumentNumberRepository implements DocumentNumberRepository<Prisma.TransactionClient> {
  private readonly registry: Prisma.Sql;
  constructor(ledgerDatabase: string) { this.registry = Prisma.raw(`${raw(ledgerDatabase).sql}.kosipa_document_number`); }

  private async takenInTable(tx: Prisma.TransactionClient, scheme: DocumentNumberScheme, docNo: string): Promise<boolean> {
    // Selects the numbered column itself: a numbering writer holds a column-level SELECT on it and nothing else of the table.
    const rows = await tx.$queryRaw<unknown[]>(Prisma.sql`SELECT ${raw(scheme.column)} FROM ${raw(scheme.table)} WHERE ${raw(scheme.column)} = ${docNo} LIMIT 1`);
    return rows.length > 0;
  }

  private async claim(tx: Prisma.TransactionClient, scheme: DocumentNumberScheme, period: string, n: number, docNo: string, requestId: string): Promise<boolean> {
    try {
      await tx.$executeRaw(Prisma.sql`INSERT INTO ${this.registry} (scheme, period, seq, doc_no, subject_table, request_id, created_at)
        VALUES (${scheme.key}, ${period}, ${n}, ${docNo}, ${scheme.table}, ${requestId.slice(0, 40)}, UTC_TIMESTAMP(3))`);
      return true;
    } catch (error) {
      if (dbErrno(error) === '1062') return false;
      throw error;
    }
  }

  async allocate(tx: Prisma.TransactionClient, scheme: DocumentNumberScheme, period: string, request: { rowId?: number; requestId: string }): Promise<AllocatedNumber> {
    if (scheme.strategy === 'row-id') {
      const n = request.rowId as number;
      const docNo = formatDocumentNumber(scheme, period, n);
      if (await this.takenInTable(tx, scheme, docNo) || !(await this.claim(tx, scheme, period, n, docNo, request.requestId))) throw new KosipaError('DOCUMENT_NUMBER_CONFLICT');
      return { docNo, scheme: scheme.key, period, sequence: n };
    }
    const head = `${scheme.prefix}${period}`;
    const existing = await tx.$queryRaw<{ doc_no: string }[]>(Prisma.sql`SELECT ${raw(scheme.column)} AS doc_no FROM ${raw(scheme.table)} WHERE ${raw(scheme.column)} LIKE ${`${head}%`}`);
    const [reg] = await tx.$queryRaw<{ m: bigint | number | null }[]>(Prisma.sql`SELECT MAX(seq) AS m FROM ${this.registry} WHERE scheme = ${scheme.key} AND period = ${period}`);
    let n = nextPeriodSequence(existing.map((r) => r.doc_no), scheme, period, reg.m === null ? null : Number(reg.m));
    for (let probe = 0; probe < MAX_PROBES; probe++, n++) {
      const docNo = formatDocumentNumber(scheme, period, n);
      if (await this.takenInTable(tx, scheme, docNo)) continue;
      if (await this.claim(tx, scheme, period, n, docNo, request.requestId)) return { docNo, scheme: scheme.key, period, sequence: n };
    }
    throw new KosipaError('BUSY_RETRY');
  }
}
