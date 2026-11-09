import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError, nikLookupKeys } from '@koperasi/domain/kosipa';
import { loanDecisionSnapshot, planLoanDecision, type LoanDecisionAction, type LoanDecisionFacts, type LoanDecisionInput } from '@koperasi/domain/kosipa/loan-decision';
import type { LegacyFenceState } from '@koperasi/application/kosipa/commands/master';
import type { LoanDecisionRecord, LoanDecisionRepository, LoanDecisionResult } from '@koperasi/application/kosipa/commands/loan-decision';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { ledgerTable, runCommandTransaction, type LedgerFacts, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';
import { LOAN_DECISION_LEGACY_CONTROLLERS } from '../console/kosipa-ownership.ts';

/**
 * Loan decisions (FA-04, REQ-119) through the loan writer (kosipa_loan_w; grants db/kosipa/008_loan_writer_grants.sql.tpl).
 * What changes, compared with legacy `ajax_posting` (rules in @koperasi/domain/kosipa/loan-decision):
 *   trans_pinjaman            doc_status + the matching legacy stamp pair (posting_doc/_usr, approved_doc/_usr, rejected_doc/_usr) + ud/ud_usr;
 *                             reject also keterangan_riject. cd_usr is NOT touched (ANO-K27). Disbursement, amounts, schedule: never.
 *   trans_pinjaman_pengajuan  doc_status (+ keterangan_riject on reject) of the ONE request with this number, when the stored loan is a mobile loan.
 *   trans_pinjaman_rollover / old loans / instalments: never (settled by disbursement, REQ-120).
 * trans_pinjaman and trans_pinjaman_pengajuan have no index on doc_no (30 Sep 2026 dump), so ids are found with a consistent (non-locking) read
 * and only those rows are locked by primary key: a locking scan would hold every loan row of the table for the whole transaction.
 * Version = SHA-256 of the header columns a decision depends on and of the mobile request statuses, so any legacy or smartkkisi change makes a
 * held decision STALE. The native poster of a loan is the actor of its last `loan.post` ledger row.
 */
const JAKARTA_NOW = Prisma.sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`;
const HEADER_COLUMNS = ['id', 'doc_no', 'doc_date', 'doc_status', 'status_pencairan', 'status_bayar', 'tgl_pencairan', 'nominal_pencairan', 'nik', 'nama', 'jenis_pinjaman', 'bank_pembiaya',
  'plan_pinjaman', 'plan_angsuran', 'plan_jangka_waktu', 'jenis_suku_bunga', 'biaya_suku_bunga', 'total_potongan', 'total_diterima', 'total_roll_over', 'status_roll_over', 'pengajuan_mobile',
  'keterangan_riject', 'posting_doc', 'posting_doc_usr', 'approved_doc', 'approved_doc_usr', 'rejected_doc', 'rejected_doc_usr', 'cd', 'cd_usr', 'ud', 'ud_usr'] as const;
const REQUEST_COLUMNS = ['id', 'doc_no', 'doc_status', 'keterangan_riject'] as const;
const select = (cols: readonly string[]) => Prisma.raw(cols.map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``).join(', '));
type Row = Record<string, string | null>;
type Loaded = { headers: Row[]; requests: Row[] };

const STAMP: Record<'posting' | 'approved' | 'rejected', { at: string; by: string }> = {
  posting: { at: 'posting_doc', by: 'posting_doc_usr' }, approved: { at: 'approved_doc', by: 'approved_doc_usr' }, rejected: { at: 'rejected_doc', by: 'rejected_doc_usr' },
};

const sameDocNo = (stored: string | null, docNo: string) => (stored ?? '').replace(/ +$/, '').toUpperCase() === docNo.toUpperCase();

function version(loaded: Loaded): string {
  return createHash('sha256').update(JSON.stringify([...loaded.headers.map((h) => HEADER_COLUMNS.map((c) => h[c] ?? null)), '|', ...loaded.requests.map((r) => REQUEST_COLUMNS.map((c) => r[c] ?? null))])).digest('hex');
}
function facts(loaded: Loaded): LoanDecisionFacts | null {
  const h = loaded.headers[0];
  if (!h) return null;
  return {
    id: Number(h.id), docNo: h.doc_no ?? '', status: h.doc_status, disbursement: h.status_pencairan, repayment: h.status_bayar, planPrincipal: h.plan_pinjaman ?? '0',
    type: h.jenis_pinjaman, nik: h.nik, mobile: Number(h.pengajuan_mobile) === 1, headerCount: loaded.headers.length,
  };
}

export type LoanDecisionRepositoryOptions = { ledgerDatabase?: string; hooks?: UnitOfWorkHooks; sharedWithLegacy?: boolean };

export class PrismaKosipaLoanDecisionRepository implements LoanDecisionRepository {
  private readonly read_: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: LoanDecisionRepositoryOptions;
  readonly sharedWithLegacy: boolean;
  constructor(read: PrismaClient, write?: PrismaClient, options: LoanDecisionRepositoryOptions = {}) { this.read_ = read; this.write = write; this.options = options; this.sharedWithLegacy = options.sharedWithLegacy === true; }

  /** Headers then mobile requests, each found by doc_no and (when `lock`) locked by primary key in ascending id order. */
  private async load(db: Prisma.TransactionClient | PrismaClient, docNo: string, lock: boolean): Promise<Loaded> {
    const suffix = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rowsOf = async (table: 'trans_pinjaman' | 'trans_pinjaman_pengajuan', cols: readonly string[]): Promise<Row[]> => {
      const ids = await db.$queryRaw<{ id: number | bigint }[]>(Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE doc_no = ${docNo} ORDER BY id LIMIT 6`);
      if (!ids.length) return [];
      const rows = await db.$queryRaw<Row[]>(Prisma.sql`SELECT ${select(cols)} FROM ${Prisma.raw(table)} WHERE id IN (${Prisma.join(ids.map((r) => Number(r.id)))}) ORDER BY id ${suffix}`);
      // A row renumbered between the two reads is no longer part of this document (compared like the latin1_swedish_ci PAD SPACE column).
      return rows.filter((r) => sameDocNo(r.doc_no, docNo));
    };
    const headers = await rowsOf('trans_pinjaman', HEADER_COLUMNS);
    const requests = headers.some((h) => Number(h.pengajuan_mobile) === 1) ? await rowsOf('trans_pinjaman_pengajuan', REQUEST_COLUMNS) : [];
    return { headers, requests };
  }

  private async context(db: Prisma.TransactionClient | PrismaClient, loan: LoanDecisionFacts, loaded: Loaded, ledgerReader: Prisma.TransactionClient | PrismaClient | null) {
    let keys: string[] = [];
    try { keys = loan.nik ? nikLookupKeys(loan.nik) : []; } catch { keys = []; }
    // Sequential: these may run on one interactive transaction connection.
    const members = keys.length ? await db.$queryRaw<{ status: string | null }[]>(Prisma.sql`SELECT status_anggota AS status FROM m_anggota WHERE nik_kar IN (${Prisma.join(keys)}) ORDER BY id LIMIT 3`) : [];
    const orders = await db.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM orders WHERE order_code = ${loan.docNo}`;
    const poster = await this.poster(ledgerReader, loan.docNo, loan.id);
    return { members, mobileRequests: loaded.requests.length, ppobOrders: Number(orders[0]?.n ?? 0), posterConsoleUserId: poster };
  }

  /**
   * The ledger database is readable by the writer account only: without it nothing is known about native posting.
   * Matched on the number AND the row id: legacy can hand out a deleted loan's number again (get_no_save = last id of the month + 1), and the poster
   * of the deleted loan must not become the poster of the new one.
   */
  private async poster(db: Prisma.TransactionClient | PrismaClient | null, docNo: string, id: number): Promise<number | null> {
    if (!db || !this.options.ledgerDatabase) return null;
    const [row] = await db.$queryRaw<{ actor: number | bigint }[]>(Prisma.sql`SELECT actor_console_user_id AS actor FROM ${ledgerTable(this.options.ledgerDatabase)}
      WHERE subject_type = 'loan' AND subject_ref = ${docNo} AND command = 'loan.post' AND JSON_VALUE(result_json, '$.id') = ${String(id)} ORDER BY id DESC LIMIT 1`);
    return row ? Number(row.actor) : null;
  }

  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name?.trim() || `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  async fenceState(): Promise<LegacyFenceState> {
    const rows = await this.read_.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) IN (${Prisma.join(LOAN_DECISION_LEGACY_CONTROLLERS.map((c) => c.toUpperCase()))})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  async read(docNo: string): Promise<LoanDecisionRecord | null> {
    const loaded = await this.load(this.read_, docNo, false);
    const loan = facts(loaded);
    if (!loan) return null;
    const context = await this.context(this.read_, loan, loaded, this.write ?? null);
    const h = loaded.headers[0];
    return {
      facts: loan, context, version: version(loaded),
      stamps: { postedAt: h.posting_doc, postedBy: h.posting_doc_usr, approvedAt: h.approved_doc, approvedBy: h.approved_doc_usr, rejectedAt: h.rejected_doc, rejectedBy: h.rejected_doc_usr, rejectReason: h.keterangan_riject },
    };
  }

  decide(envelope: CommandEnvelope, docNo: string, action: LoanDecisionAction, input: LoanDecisionInput): Promise<CommandOutcome<LoanDecisionResult>> {
    if (!this.write || !this.options.ledgerDatabase) return Promise.reject(new KosipaError('WRITE_NOT_CONFIGURED'));
    return runCommandTransaction<Loaded, LoanDecisionResult>(this.write, envelope, {
      lock: (tx) => this.load(tx, docNo, true),
      run: async (tx, locked) => {
        const loan = facts(locked);
        if (loan && version(locked) !== input.expectedVersion) throw new KosipaError('STALE');
        const context = loan ? await this.context(tx, loan, locked, tx) : { members: [], mobileRequests: 0, ppobOrders: 0, posterConsoleUserId: null };
        const plan = planLoanDecision(loan, action, { ...context, actorConsoleUserId: envelope.actorConsoleUserId }, input.reason);
        const id = loan!.id;
        const who = await this.actorName(tx, envelope);
        const stamp = STAMP[plan.stamp];
        const reject = plan.to === 'REJECTED' ? Prisma.sql`, keterangan_riject = ${plan.reason}` : Prisma.empty;
        // Guarded: the status the plan was made on, so nothing that slipped past the lock can be overwritten.
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE trans_pinjaman SET doc_status = ${plan.to}, ${Prisma.raw(`\`${stamp.at}\``)} = ${JAKARTA_NOW}, ${Prisma.raw(`\`${stamp.by}\``)} = ${who},
            ud = ${JAKARTA_NOW}, ud_usr = ${who} ${reject} WHERE id = ${id} AND doc_no = ${docNo} AND doc_status = ${plan.from}`);
        if (changed !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        if (plan.syncMobile) {
          const requestId = Number(locked.requests[0].id);
          const note = plan.to === 'REJECTED' ? Prisma.sql`, keterangan_riject = ${plan.reason}` : Prisma.empty;
          if ((await tx.$executeRaw(Prisma.sql`UPDATE trans_pinjaman_pengajuan SET doc_status = ${plan.to} ${note} WHERE id = ${requestId} AND doc_no = ${docNo}`)) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        }
        const stored = await this.load(tx, docNo, false);
        const after = facts(stored);
        const h = stored.headers[0];
        if (!after || after.status !== plan.to || after.headerCount !== 1 || h[stamp.by] !== who || !h[stamp.at] || h.cd_usr !== locked.headers[0].cd_usr
          || (plan.to === 'REJECTED' && h.keterangan_riject !== plan.reason)
          || (plan.syncMobile && stored.requests[0]?.doc_status !== plan.to)) throw new KosipaError('POSTCONDITION_FAILED');
        const ledger: LedgerFacts = {
          fromState: plan.from, toState: plan.to, reason: plan.reason,
          before: { ...loanDecisionSnapshot(loan!, plan.from), mobile_synced: plan.syncMobile },
          after: { ...loanDecisionSnapshot(after, plan.to), mobile_synced: plan.syncMobile },
          makerConsoleUserId: action === 'post' ? envelope.actorConsoleUserId : context.posterConsoleUserId,
          checkerConsoleUserId: action === 'post' ? null : envelope.actorConsoleUserId,
        };
        return { result: { id, docNo: after.docNo, status: plan.to, version: version(stored) }, ledger };
      },
    }, { ledgerDatabase: this.options.ledgerDatabase, legacyControllers: LOAN_DECISION_LEGACY_CONTROLLERS, legacyFence: this.sharedWithLegacy ? 'shared' : 'enforced', hooks: this.options.hooks });
  }
}
