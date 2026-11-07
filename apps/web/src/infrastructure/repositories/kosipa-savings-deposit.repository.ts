import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError, nikLookupKeys } from '@koperasi/domain/kosipa';
import { SAVINGS_DEPOSIT, depositLedgerSummary, planDepositApprove, planDepositCreate, planDepositReject, type DepositCreate, type DepositDocument } from '@koperasi/domain/kosipa/savings-deposit';
import { businessDates } from '@koperasi/domain/pos/sale';
import { DocumentNumberingService } from '@koperasi/application/kosipa/document-numbering';
import type { LegacyFenceState } from '@koperasi/application/kosipa/commands/master';
import type { DepositDecision, DepositListFilter, DepositMemberFacts, DepositResult, DepositRow, SavingsDepositRepository } from '@koperasi/application/kosipa/commands/savings-deposit';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { ledgerTable, runCommandTransaction, type LedgerFacts, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';
import { PrismaDocumentNumberRepository } from './kosipa-document-number.ts';

/**
 * Voluntary-savings deposits (FA-03C T07) through the savings writer (kosipa_savings_w; grants db/kosipa/007_savings_writer_grants.sql.tpl).
 * Rows are exactly what legacy simpanan/sim_setor_c writes (header KREDIT + CASH/TRANSFER + SIMPANAN SUKARELA, one kredit_cash line), plus the integrity
 * corrections: explicit values for the NOT NULL columns legacy filled only under non-strict SQL mode (is_mobile, saldo_awal_penarikan, line saldo),
 * header and line in the SAME status from creation (REQ-114), line tgl_cair on approval, and nothing deleted (FD-37).
 * Version = SHA-256 of every header column and every line column (as database text), so a legacy edit of either makes a held decision STALE.
 * The maker of a native document is the actor of its `savings.deposit.create` ledger row; legacy documents have none (FD-17 c).
 */
const LEGACY_CONTROLLERS = ['simpanan/sim_setor_c'] as const;
const JAKARTA_NOW = Prisma.sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`;
const HEADER_COLUMNS = ['id', 'doc_no', 'doc_date', 'no_transaksi', 'start_date', 'finish_date', 'doc_status', 'doc_type', 'akun_jenis_simpanan', 'bunga_simpanan', 'jenis_simpanan', 'simpanan_potong_payroll',
  'remarks', 'posting_date', 'cd', 'cd_usr', 'ud', 'ud_usr', 'akun_code', 'akun_desc', 'jenis_transaksi', 'periode_th', 'periode_bl', 'is_mobile', 'nama_penarik', 'payment_type', 'status_perorangan', 'saldo_awal_penarikan'] as const;
const LINE_COLUMNS = ['id', 'doc_no', 'doc_no_dtl', 'no_anggota', 'nik_kar', 'nama', 'kd_group', 'debit', 'kredit_cash', 'kredit', 'jasa_kredit', 'saldo', 'cd', 'cd_usr', 'ud', 'ud_usr', 'rek_bank', 'rek_nama', 'rek_no',
  'periode_th', 'periode_bl', 'jenis_simpanan', 'start_date', 'finish_date', 'remark_detail', 'doc_status', 'tgl_cair'] as const;
const select = (cols: readonly string[], alias = '') => Prisma.raw(cols.map((c) => `CAST(${alias}\`${c}\` AS CHAR) AS \`${c}\``).join(', '));
type Row = Record<string, string | null>;

const version = (header: Row, lines: readonly Row[]) => createHash('sha256').update(JSON.stringify([HEADER_COLUMNS.map((c) => header[c] ?? null), ...lines.map((l) => LINE_COLUMNS.map((c) => l[c] ?? null))])).digest('hex');
function toDocument(header: Row, lines: readonly Row[]): DepositDocument {
  return {
    id: Number(header.id), docNo: header.doc_no ?? '', docType: header.doc_type, kind: header.jenis_transaksi, type: header.jenis_simpanan, status: header.doc_status, docDate: header.doc_date,
    lines: lines.map((l) => ({ kredit: l.kredit ?? '0', kreditCash: l.kredit_cash ?? '0', debit: l.debit ?? '0', status: l.doc_status })),
  };
}
const dec = (v: string | null) => { const n = /^-?\d+(\.\d+)?$/.test(v ?? '') ? v as string : '0'; return n.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); };

export type SavingsDepositRepositoryOptions = { ledgerDatabase?: string; hooks?: UnitOfWorkHooks; now?: () => Date };

export class PrismaKosipaSavingsDepositRepository implements SavingsDepositRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: SavingsDepositRepositoryOptions;
  constructor(read: PrismaClient, write?: PrismaClient, options: SavingsDepositRepositoryOptions = {}) { this.read = read; this.write = write; this.options = options; }

  private get now(): Date { return (this.options.now ?? (() => new Date()))(); }

  private run<L>(envelope: CommandEnvelope, steps: Parameters<typeof runCommandTransaction<L, DepositResult>>[2]): Promise<CommandOutcome<DepositResult>> {
    if (!this.write || !this.options.ledgerDatabase) return Promise.reject(new KosipaError('WRITE_NOT_CONFIGURED'));
    return runCommandTransaction(this.write, envelope, steps, { ledgerDatabase: this.options.ledgerDatabase, legacyControllers: LEGACY_CONTROLLERS, hooks: this.options.hooks });
  }

  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name ?? `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  private async fetch(tx: Prisma.TransactionClient | PrismaClient, where: Prisma.Sql, lock: boolean): Promise<{ header: Row; lines: Row[] } | null> {
    const suffix = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const [header] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${select(HEADER_COLUMNS)} FROM trans_simpanan WHERE ${where} ${suffix}`);
    if (!header) return null;
    const lines = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${select(LINE_COLUMNS)} FROM trans_simpanan_dtl WHERE doc_no = ${header.doc_no} ORDER BY id ${suffix}`);
    return { header, lines };
  }

  async fenceState(): Promise<LegacyFenceState> {
    const rows = await this.read.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) IN (${Prisma.join(LEGACY_CONTROLLERS.map((c) => c.toUpperCase()))})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  /** Makers of native deposits, from the ledger (the legacy cd_usr display name is not an identity). */
  private async makers(db: Prisma.TransactionClient | PrismaClient, ids: readonly number[]): Promise<Map<number, number>> {
    if (!ids.length || !this.options.ledgerDatabase) return new Map();
    const rows = await db.$queryRaw<{ id: string | null; actor: number | bigint }[]>(Prisma.sql`SELECT JSON_VALUE(result_json, '$.id') AS id, actor_console_user_id AS actor
      FROM ${ledgerTable(this.options.ledgerDatabase)} WHERE command = 'savings.deposit.create' AND JSON_VALUE(result_json, '$.id') IN (${Prisma.join(ids.map(String))})`);
    return new Map(rows.filter((r) => r.id).map((r) => [Number(r.id), Number(r.actor)]));
  }

  create(envelope: CommandEnvelope, input: DepositCreate): Promise<CommandOutcome<DepositResult>> {
    const numbering = new DocumentNumberingService<Prisma.TransactionClient>(new PrismaDocumentNumberRepository(this.options.ledgerDatabase ?? 'unset'));
    type Locked = { member: Row | null; product: Row | null };
    return this.run<Locked>(envelope, {
      // Share locks: the member and the product cannot change underneath (a status change or a product deactivation waits for this command).
      lock: async (tx) => ({
        member: (await tx.$queryRaw<Row[]>`SELECT CAST(id AS CHAR) AS id, nik_kar, nama_kar, kd_group, status_anggota FROM m_anggota WHERE id = ${input.memberId} LOCK IN SHARE MODE`)[0] ?? null,
        product: (await tx.$queryRaw<Row[]>`SELECT jenis_simpanan_code AS code, CAST(is_active AS CHAR) AS active FROM m_jenis_simpanan WHERE jenis_simpanan_code = ${SAVINGS_DEPOSIT.jenisSimpanan} ORDER BY id LIMIT 1 LOCK IN SHARE MODE`)[0] ?? null,
      }),
      run: async (tx, locked) => {
        const m = locked.member;
        const plan = planDepositCreate(input, m ? { id: Number(m.id), nik: m.nik_kar ?? '', name: m.nama_kar ?? '', group: m.kd_group, status: m.status_anggota } : null,
          locked.product ? { code: locked.product.code ?? '', active: Number(locked.product.active) === 1 } : null);
        const who = await this.actorName(tx, envelope);
        await tx.$executeRaw`INSERT INTO trans_simpanan (doc_date, doc_status, start_date, finish_date, periode_bl, periode_th, doc_type, jenis_simpanan, payment_type, remarks, jenis_transaksi,
            cd, cd_usr, is_mobile, saldo_awal_penarikan)
          VALUES (${input.docDate}, ${SAVINGS_DEPOSIT.pending}, ${input.docDate}, ${input.docDate}, ${plan.periodMonth}, ${plan.periodYear}, ${SAVINGS_DEPOSIT.docType}, ${SAVINGS_DEPOSIT.jenisSimpanan},
            ${input.paymentType}, ${input.remarks}, ${SAVINGS_DEPOSIT.jenisTransaksi}, ${JAKARTA_NOW}, ${who}, 0, 0)`;
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        const headerId = Number(id);
        const { docNo } = await numbering.allocate(tx, { scheme: 'savings-cash-transfer', now: this.now, table: 'trans_simpanan', rowId: headerId, requestId: envelope.requestId });
        if ((await tx.$executeRaw`UPDATE trans_simpanan SET doc_no = ${docNo} WHERE id = ${headerId}`) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        await tx.$executeRaw`INSERT INTO trans_simpanan_dtl (doc_no, doc_no_dtl, nik_kar, nama, kd_group, jenis_simpanan, rek_bank, rek_nama, rek_no, remark_detail, periode_th, periode_bl,
            start_date, finish_date, debit, kredit_cash, kredit, jasa_kredit, saldo, doc_status, cd, cd_usr)
          VALUES (${docNo}, ${docNo + plan.nik}, ${plan.nik}, ${plan.name}, ${plan.group}, ${SAVINGS_DEPOSIT.jenisSimpanan}, ${input.bankName}, ${plan.name}, ${input.bankAccount}, ${input.remarks},
            ${plan.periodYear}, ${plan.periodMonth}, ${input.docDate}, ${input.docDate}, 0, ${input.amount}, 0, 0, 0, ${SAVINGS_DEPOSIT.pending}, ${JAKARTA_NOW}, ${who})`;
        const stored = await this.fetch(tx, Prisma.sql`id = ${headerId}`, false);
        if (!stored || stored.lines.length !== 1 || stored.header.doc_status !== SAVINGS_DEPOSIT.pending || dec(stored.lines[0].kredit_cash) !== input.amount || stored.lines[0].nik_kar !== plan.nik) throw new KosipaError('POSTCONDITION_FAILED');
        const doc = toDocument(stored.header, stored.lines);
        const ledger: LedgerFacts = { fromState: null, toState: SAVINGS_DEPOSIT.pending, before: null, after: depositLedgerSummary(doc, SAVINGS_DEPOSIT.pending), makerConsoleUserId: envelope.actorConsoleUserId };
        return { result: { id: headerId, docNo, status: SAVINGS_DEPOSIT.pending, version: version(stored.header, stored.lines) }, ledger };
      },
    });
  }

  decide(envelope: CommandEnvelope, id: number, kind: 'approve' | 'reject', decision: DepositDecision): Promise<CommandOutcome<DepositResult>> {
    return this.run<{ header: Row; lines: Row[] } | null>(envelope, {
      lock: (tx) => this.fetch(tx, Prisma.sql`id = ${id}`, true),
      run: async (tx, locked) => {
        if (locked && version(locked.header, locked.lines) !== decision.expectedVersion) throw new KosipaError('STALE');
        const doc = locked ? toDocument(locked.header, locked.lines) : null;
        const maker = doc ? (await this.makers(tx, [doc.id])).get(doc.id) ?? null : null;
        const plan = kind === 'approve' ? planDepositApprove(doc, envelope.actorConsoleUserId, maker) : planDepositReject(doc);
        const who = await this.actorName(tx, envelope);
        if ((await tx.$executeRaw`UPDATE trans_simpanan SET doc_status = ${plan.to}, ud = ${JAKARTA_NOW}, ud_usr = ${who} WHERE id = ${id} AND doc_status = ${SAVINGS_DEPOSIT.pending}`) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        const receipt = kind === 'approve' ? businessDates(this.now).day : null;
        const lines = await tx.$executeRaw`UPDATE trans_simpanan_dtl SET doc_status = ${plan.to}, tgl_cair = COALESCE(${receipt}, tgl_cair), ud = ${JAKARTA_NOW}, ud_usr = ${who} WHERE doc_no = ${doc!.docNo}`;
        if (lines !== plan.lines) throw new KosipaError('POSTCONDITION_FAILED');
        const stored = await this.fetch(tx, Prisma.sql`id = ${id}`, false);
        if (!stored || stored.header.doc_status !== plan.to || stored.lines.some((l) => l.doc_status !== plan.to)) throw new KosipaError('POSTCONDITION_FAILED');
        const after = toDocument(stored.header, stored.lines);
        const ledger: LedgerFacts = {
          fromState: plan.from, toState: plan.to, reason: decision.reason ?? null, before: depositLedgerSummary(doc!, plan.from), after: depositLedgerSummary(after, plan.to),
          makerConsoleUserId: maker, checkerConsoleUserId: envelope.actorConsoleUserId,
        };
        return { result: { id, docNo: after.docNo, status: plan.to, version: version(stored.header, stored.lines) }, ledger };
      },
    });
  }

  async list(filter: DepositListFilter): Promise<DepositRow[]> {
    const status = filter.status === 'ALL' ? Prisma.empty : Prisma.sql`AND doc_status = ${filter.status}`;
    const headers = await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR SELECT ${select(HEADER_COLUMNS)} FROM trans_simpanan
      WHERE jenis_transaksi = ${SAVINGS_DEPOSIT.jenisTransaksi} AND doc_type = ${SAVINGS_DEPOSIT.docType} AND jenis_simpanan = ${SAVINGS_DEPOSIT.jenisSimpanan}
        AND doc_date >= ${`${filter.month}-01`} AND doc_date < DATE_ADD(${`${filter.month}-01`}, INTERVAL 1 MONTH) ${status} ORDER BY id DESC LIMIT 200`);
    if (!headers.length) return [];
    const docNos = headers.map((h) => h.doc_no).filter((d): d is string => !!d);
    const lines = docNos.length ? await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR SELECT ${select(LINE_COLUMNS)} FROM trans_simpanan_dtl WHERE doc_no IN (${Prisma.join(docNos)}) ORDER BY id`) : [];
    // The ledger database is readable by the writer account only (the business reader has no grant there): no writer, no maker information.
    const makers = this.write ? await this.makers(this.write, headers.map((h) => Number(h.id))) : new Map<number, number>();
    return headers.map((h) => {
      const mine = lines.filter((l) => l.doc_no === h.doc_no);
      const first = mine[0];
      const total = mine.reduce((t, l) => t + Math.round(Number(l.kredit_cash ?? 0) * 100), 0);
      return {
        id: Number(h.id), docNo: h.doc_no ?? '', docDate: h.doc_date ?? '', status: h.doc_status ?? '', paymentType: h.payment_type ?? '', amount: dec((total / 100).toFixed(2)), remarks: h.remarks ?? '',
        member: { nik: first?.nik_kar ?? '', name: first?.nama ?? '', group: first?.kd_group ?? null }, createdBy: h.cd_usr ?? '', makerConsoleUserId: makers.get(Number(h.id)) ?? null,
        native: makers.has(Number(h.id)), version: version(h, mine),
      };
    });
  }

  async member(nik: string): Promise<DepositMemberFacts | null> {
    let keys: string[];
    try { keys = nikLookupKeys(nik); } catch { return null; }
    const rows = await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(id AS CHAR) AS id, nik_kar, nama_kar, kd_group, status_anggota FROM m_anggota WHERE nik_kar IN (${Prisma.join(keys)}) ORDER BY id LIMIT 2`);
    if (rows.length !== 1) return null;   // none, or an ambiguous NIK alias: the operator must resolve it in the member directory
    const m = rows[0];
    // Header-status rule of every legacy balance view: APPROVED headers, kredit + kredit_cash - debit of their lines.
    const [bal] = await this.read.$queryRaw<{ saldo: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(COALESCE(SUM(d.kredit + d.kredit_cash - d.debit), 0) AS CHAR) AS saldo FROM trans_simpanan_dtl d JOIN trans_simpanan h ON h.doc_no = d.doc_no
      WHERE d.nik_kar = ${m.nik_kar} AND h.jenis_simpanan = ${SAVINGS_DEPOSIT.jenisSimpanan} AND h.doc_status = 'APPROVED'`;
    return { id: Number(m.id), nik: m.nik_kar ?? '', name: m.nama_kar ?? '', group: m.kd_group, status: m.status_anggota, balance: dec(bal?.saldo ?? '0') };
  }
}
