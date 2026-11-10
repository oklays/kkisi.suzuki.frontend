import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError, nikLookupKeys } from '@koperasi/domain/kosipa';
import {
  MEMBER_REQUEST, activeDeductionOptions, assertIntakeMember, buildMobileLoanProducts, planDeductionApprove, planDeductionIntake, planDeductionReject,
  planLoanIntake, planLoanRequestReject, requestChannel, requestDocNo, requestLedgerSnapshot,
  type DeductionIntake, type IntakeMemberFacts, type LoanIntake, type MemberRequestType, type RequestDecision, type RequestDecisionAction,
} from '@koperasi/domain/kosipa/member-request';
import type { LegacyFenceState } from '@koperasi/application/kosipa/commands/master';
import type { IntakeResult, MemberRequestFilter, MemberRequestRepository, MemberRequestRow, RequestDecisionResult } from '@koperasi/application/kosipa/commands/member-request';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { runCommandTransaction, type LedgerFacts, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';
import { DEDUCTION_REQUEST_LEGACY_CONTROLLERS, LOAN_REQUEST_LEGACY_CONTROLLERS } from '../console/kosipa-ownership.ts';

/**
 * Member requests (P1) through the request writer (kosipa_request_w; grants db/kosipa/009_request_writer_grants.sql.tpl). Rules in
 * @koperasi/domain/kosipa/member-request. What is written:
 *   intake loan       INSERT trans_pinjaman_pengajuan OPEN (the columns the PWA and smartkkisi fill; is_online 1, is_payroll 1)
 *   intake deduction  INSERT trans_simpanan_pengajuan OPEN (potongan_old = current deduction, effective next month, is_mobile 1, remarks PWA_ANGGOTA)
 *   reject loan       trans_pinjaman_pengajuan doc_status REJECTED + keterangan_riject + ud/ud_usr (never once converted into a loan)
 *   reject deduction  trans_simpanan_pengajuan doc_status REJECTED + updated_at/ud_usr (legacy stores no reason: it is in the ledger row)
 *   approve deduction F45: every m_simpanan_aktif row of the exact NIK + jenis -> doc_no, potongan_payroll, status 1 (or one inserted row);
 *                     m_anggota.sim_wajib / sim_sukarela = amount; header APPROVED + posting_date/updated_at/ud_usr. All in ONE transaction.
 * None of these tables has an index on doc_no or nik_kar (30 Sep 2026 dump): ids are found with a consistent (non-locking) read and only those rows
 * are locked by primary key, so no command ever locks a whole table. Intake serialises per member on the m_anggota row (FOR UPDATE): the open-request
 * count it then reads is taken after the previous intake of that member committed (REPEATABLE READ snapshot starts at that first plain read).
 * Version = SHA-256 of the request row's columns as database text: any legacy or smartkkisi change makes a held decision STALE.
 */
const JAKARTA_NOW = Prisma.sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`;
const LOAN_COLUMNS = ['id', 'doc_no', 'doc_date', 'doc_status', 'status_pencairan', 'doc_remarks', 'nik_kar', 'nama', 'bagian', 'jenis_pinjaman_id', 'jenis_pinjaman', 'total_pinjaman',
  'lama_angsuran', 'keterangan_riject', 'is_online', 'is_payroll', 'cd', 'cd_usr', 'ud', 'ud_usr'] as const;
const DEDUCTION_COLUMNS = ['id', 'doc_no', 'doc_date', 'doc_status', 'jenis_simpanan', 'nik_kar', 'nama', 'bagian', 'lokasi', 'potongan_old', 'potongan', 'awal_potong_bulan',
  'awal_potong_tahun', 'remarks', 'posting_date', 'created_at', 'cd_usr', 'updated_at', 'ud_usr', 'is_mobile'] as const;
const MEMBER_COLUMNS = ['id', 'nik_kar', 'nama_kar', 'status_anggota', 'bagian', 'lokasi', 'no_telp', 'kd_group'] as const;
const select = (cols: readonly string[]) => Prisma.raw(cols.map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``).join(', '));
type Row = Record<string, string | null>;
type Db = Prisma.TransactionClient | PrismaClient;

const TABLE: Record<MemberRequestType, { name: string; cols: readonly string[] }> = {
  loan: { name: 'trans_pinjaman_pengajuan', cols: LOAN_COLUMNS },
  deduction: { name: 'trans_simpanan_pengajuan', cols: DEDUCTION_COLUMNS },
};
const sameValue = (stored: string | null, value: string) => (stored ?? '').replace(/ +$/, '').toUpperCase() === value.toUpperCase();
const version = (type: MemberRequestType, rows: readonly Row[]) => createHash('sha256').update(JSON.stringify([type, ...rows.map((r) => TABLE[type].cols.map((c) => r[c] ?? null))])).digest('hex');
const jakartaDate = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const num = (v: string | null) => { const n = Number(v ?? ''); return Number.isFinite(n) ? n : null; };
const dec = (v: string | null) => { const s = /^-?\d+(\.\d+)?$/.test(v ?? '') ? v as string : '0'; return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); };

function memberFacts(r: Row | undefined): IntakeMemberFacts | null {
  return r ? { id: Number(r.id), nik: r.nik_kar ?? '', name: r.nama_kar ?? '', status: r.status_anggota, section: r.bagian, location: r.lokasi, phone: r.no_telp, group: r.kd_group } : null;
}

export type MemberRequestRepositoryOptions = { ledgerDatabase?: string; hooks?: UnitOfWorkHooks; deductionShared?: boolean; now?: () => Date };

export class PrismaKosipaMemberRequestRepository implements MemberRequestRepository {
  private readonly read_: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: MemberRequestRepositoryOptions;
  constructor(read: PrismaClient, write?: PrismaClient, options: MemberRequestRepositoryOptions = {}) { this.read_ = read; this.write = write; this.options = options; }

  private get now(): Date { return (this.options.now ?? (() => new Date()))(); }

  sharedWithLegacy(type: MemberRequestType): boolean { return type === 'loan' || this.options.deductionShared === true; }

  private writer(): { client: PrismaClient; ledgerDatabase: string } {
    if (!this.write || !this.options.ledgerDatabase) throw new KosipaError('WRITE_NOT_CONFIGURED');
    return { client: this.write, ledgerDatabase: this.options.ledgerDatabase };
  }

  /** Rows of one request number, found without locks and (when `lock`) locked by primary key in id order. */
  private async requestRows(db: Db, type: MemberRequestType, docNo: string, lock: boolean): Promise<Row[]> {
    const t = TABLE[type];
    const ids = await db.$queryRaw<{ id: number | bigint }[]>(Prisma.sql`SELECT id FROM ${Prisma.raw(t.name)} WHERE doc_no = ${docNo} ORDER BY id LIMIT 4`);
    if (!ids.length) return [];
    const rows = await db.$queryRaw<Row[]>(Prisma.sql`SELECT ${select(t.cols)} FROM ${Prisma.raw(t.name)} WHERE id IN (${Prisma.join(ids.map((r) => Number(r.id)))}) ORDER BY id ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    return rows.filter((r) => sameValue(r.doc_no, docNo));
  }

  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name?.trim() || `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  private lockMember(tx: Prisma.TransactionClient, memberId: number) {
    return tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${select(MEMBER_COLUMNS)} FROM m_anggota WHERE id = ${memberId} FOR UPDATE`).then((r) => memberFacts(r[0]));
  }

  // ------------------------------------------------------------------------------------------------------------------ intake
  intakeLoan(envelope: CommandEnvelope, input: LoanIntake): Promise<CommandOutcome<IntakeResult>> {
    let w: ReturnType<PrismaKosipaMemberRequestRepository['writer']>;
    try { w = this.writer(); } catch (e) { return Promise.reject(e); }
    const now = this.now;
    return runCommandTransaction<IntakeMemberFacts | null, IntakeResult>(w.client, envelope, {
      lock: (tx) => this.lockMember(tx, input.member.memberId),
      run: async (tx, locked) => {
        const member = assertIntakeMember(locked, input.member);
        const productRows = await tx.$queryRaw<Row[]>`SELECT CAST(m.id AS CHAR) AS id, m.jenis_pinjaman AS name, CAST(COALESCE(m.min_nominal, 0) AS DECIMAL(24,2)) AS min_amount,
            CAST(COALESCE(m.max_nominal, 0) AS DECIMAL(24,2)) AS max_amount, CAST(m.min_jw AS CHAR) AS min_jw, CAST(m.max_jw AS CHAR) AS max_jw, m.jasa,
            (SELECT j.jenis_bunga FROM m_jenis_pinjaman j WHERE j.jenis_pinjaman_name = m.jenis_pinjaman AND j.is_active = '1' ORDER BY j.id LIMIT 1) AS method
          FROM m_pinjaman_mobile m WHERE m.status = 1 ORDER BY m.id LIMIT 20`;
        const products = buildMobileLoanProducts(productRows.map((r) => ({ id: Number(r.id), name: r.name ?? '', minAmount: String(r.min_amount ?? '0'), maxAmount: String(r.max_amount ?? '0'),
          minMonths: Number(r.min_jw ?? 0), maxMonths: Number(r.max_jw ?? 0), ratePercent: r.jasa ?? '', method: r.method })));
        const [open] = await tx.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE nik_kar = ${member.nik} AND doc_status = ${MEMBER_REQUEST.open}`;
        const plan = planLoanIntake(input, products, Number(open?.n ?? 0));
        const docNo = requestDocNo('loan', member.id, input.clientKey, now);
        if ((await this.requestRows(tx, 'loan', docNo, false)).length) throw new KosipaError('DOCUMENT_NUMBER_CONFLICT');
        await tx.$executeRaw`INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_date, doc_status, status_pencairan, doc_remarks, nik_kar, nama, bagian, jenis_pinjaman_id, jenis_pinjaman,
            total_pinjaman, lama_angsuran, cd, cd_usr, created_at, is_payroll, is_online)
          VALUES (${docNo}, ${jakartaDate(now)}, ${MEMBER_REQUEST.open}, 'OPEN', ${input.purpose}, ${member.nik}, ${member.name.slice(0, 50)}, ${(member.section ?? '').slice(0, 100)},
            ${plan.product.id}, ${plan.product.name.slice(0, 50)}, ${input.amountRp}, ${input.months}, ${JAKARTA_NOW}, ${member.nik.slice(0, 50)}, ${JAKARTA_NOW}, 1, 1)`;
        const stored = await this.requestRows(tx, 'loan', docNo, false);
        if (stored.length !== 1 || stored[0].doc_status !== MEMBER_REQUEST.open || stored[0].nik_kar !== member.nik || Number(stored[0].total_pinjaman) !== input.amountRp
          || Number(stored[0].lama_angsuran) !== input.months) throw new KosipaError('POSTCONDITION_FAILED');
        const ledger: LedgerFacts = { fromState: null, toState: MEMBER_REQUEST.open, before: null,
          after: requestLedgerSnapshot({ docNo, type: 'loan', status: MEMBER_REQUEST.open, amountRp: input.amountRp, months: input.months, productId: plan.product.id }) };
        return {
          result: { docNo, status: MEMBER_REQUEST.open, type: 'loan', summary: { product: plan.product.name, amountRp: input.amountRp, months: input.months,
            firstInstallmentSen: plan.simulation.firstInstallmentSen, totalSen: plan.simulation.totalSen, status: MEMBER_REQUEST.open } },
          ledger,
        };
      },
    }, { ledgerDatabase: w.ledgerDatabase, legacyControllers: [], legacyFence: 'shared', hooks: this.options.hooks });
  }

  intakeDeduction(envelope: CommandEnvelope, input: DeductionIntake): Promise<CommandOutcome<IntakeResult>> {
    let w: ReturnType<PrismaKosipaMemberRequestRepository['writer']>;
    try { w = this.writer(); } catch (e) { return Promise.reject(e); }
    const now = this.now;
    return runCommandTransaction<IntakeMemberFacts | null, IntakeResult>(w.client, envelope, {
      lock: (tx) => this.lockMember(tx, input.member.memberId),
      run: async (tx, locked) => {
        const member = assertIntakeMember(locked, input.member);
        let keys: string[];
        try { keys = nikLookupKeys(member.nik); } catch { throw new KosipaError('REQUEST_MEMBER_INVALID'); }
        const active = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT CAST(id AS CHAR) AS id, jenis_simpanan AS type, CAST(COALESCE(potongan_payroll, 0) AS DECIMAL(24,2)) AS payroll,
            CAST(status AS CHAR) AS status FROM m_simpanan_aktif WHERE nik_kar IN (${Prisma.join(keys)}) ORDER BY id DESC LIMIT 30`);
        const options = activeDeductionOptions(active.map((r) => ({ id: Number(r.id), type: r.type ?? '', payroll: String(r.payroll ?? '0'), status: num(r.status) })));
        const plan = planDeductionIntake(input, options, now);
        const docNo = requestDocNo('deduction', member.id, input.clientKey, now);
        if ((await this.requestRows(tx, 'deduction', docNo, false)).length) throw new KosipaError('DOCUMENT_NUMBER_CONFLICT');
        await tx.$executeRaw`INSERT INTO trans_simpanan_pengajuan (doc_no, doc_date, doc_status, jenis_simpanan, nik_kar, nama, phone, bagian, lokasi, potongan_old, potongan,
            awal_potong_bulan, awal_potong_tahun, remarks, created_at, cd_usr, status_notif, is_mobile)
          VALUES (${docNo}, ${jakartaDate(now)}, ${MEMBER_REQUEST.open}, ${plan.option.type}, ${member.nik}, ${member.name.slice(0, 50)}, ${(member.phone ?? '').slice(0, 50)},
            ${(member.section ?? '').slice(0, 100)}, ${(member.location ?? '').slice(0, 100)}, ${plan.previousRp}, ${input.requestedRp}, ${plan.effectiveMonth}, ${plan.effectiveYear},
            'PWA_ANGGOTA', ${JAKARTA_NOW}, ${member.nik.slice(0, 50)}, 0, 1)`;
        const stored = await this.requestRows(tx, 'deduction', docNo, false);
        if (stored.length !== 1 || stored[0].doc_status !== MEMBER_REQUEST.open || stored[0].nik_kar !== member.nik || Number(stored[0].potongan) !== input.requestedRp) throw new KosipaError('POSTCONDITION_FAILED');
        const ledger: LedgerFacts = { fromState: null, toState: MEMBER_REQUEST.open, before: null,
          after: requestLedgerSnapshot({ docNo, type: 'deduction', status: MEMBER_REQUEST.open, amountRp: input.requestedRp, savingsType: plan.option.type }) };
        return {
          result: { docNo, status: MEMBER_REQUEST.open, type: 'deduction', summary: { savingsType: plan.option.type, previousRp: plan.previousRp, requestedRp: input.requestedRp,
            effectiveMonth: `${plan.effectiveYear}-${plan.effectiveMonth}`, status: MEMBER_REQUEST.open } },
          ledger,
        };
      },
    }, { ledgerDatabase: w.ledgerDatabase, legacyControllers: [], legacyFence: 'shared', hooks: this.options.hooks });
  }

  // --------------------------------------------------------------------------------------------------------------- decisions
  decide(envelope: CommandEnvelope, type: MemberRequestType, docNo: string, action: RequestDecisionAction, decision: RequestDecision): Promise<CommandOutcome<RequestDecisionResult>> {
    let w: ReturnType<PrismaKosipaMemberRequestRepository['writer']>;
    try { w = this.writer(); } catch (e) { return Promise.reject(e); }
    if (type === 'loan' && action !== 'reject') return Promise.reject(new KosipaError('REQUEST_TYPE_UNSUPPORTED'));
    const controllers = type === 'loan' ? LOAN_REQUEST_LEGACY_CONTROLLERS : DEDUCTION_REQUEST_LEGACY_CONTROLLERS;
    return runCommandTransaction<Row[], RequestDecisionResult>(w.client, envelope, {
      lock: (tx) => this.requestRows(tx, type, docNo, true),
      run: async (tx, rows) => {
        if (rows.length && version(type, rows) !== decision.expectedVersion) throw new KosipaError('STALE');
        const who = await this.actorName(tx, envelope);
        return type === 'loan' ? this.rejectLoan(tx, docNo, rows, who, decision) : action === 'approve' ? this.approveDeduction(tx, envelope, docNo, rows, who) : this.rejectDeduction(tx, docNo, rows, who, decision);
      },
    }, { ledgerDatabase: w.ledgerDatabase, legacyControllers: controllers, legacyFence: this.sharedWithLegacy(type) ? 'shared' : 'enforced', hooks: this.options.hooks });
  }

  private async rejectLoan(tx: Prisma.TransactionClient, docNo: string, rows: Row[], who: string, decision: RequestDecision) {
    const [converted] = await tx.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM trans_pinjaman WHERE doc_no = ${docNo}`;
    const plan = planLoanRequestReject(rows.length ? { docNo, status: rows[0].doc_status, headerCount: rows.length, convertedLoans: Number(converted?.n ?? 0) } : null);
    const id = Number(rows[0].id);
    if ((await tx.$executeRaw`UPDATE trans_pinjaman_pengajuan SET doc_status = ${plan.to}, keterangan_riject = ${decision.reason ?? null}, ud = ${JAKARTA_NOW}, ud_usr = ${who}
        WHERE id = ${id} AND doc_status = ${plan.from}`) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
    const stored = await this.requestRows(tx, 'loan', docNo, false);
    if (stored.length !== 1 || stored[0].doc_status !== plan.to || stored[0].keterangan_riject !== decision.reason || stored[0].ud_usr !== who) throw new KosipaError('POSTCONDITION_FAILED');
    const amountRp = num(rows[0].total_pinjaman);
    const ledger: LedgerFacts = {
      fromState: plan.from, toState: plan.to, reason: decision.reason ?? null,
      before: requestLedgerSnapshot({ docNo, type: 'loan', status: plan.from, amountRp }), after: requestLedgerSnapshot({ docNo, type: 'loan', status: plan.to, amountRp }),
      makerConsoleUserId: null, checkerConsoleUserId: null,
    };
    return { result: { docNo, status: plan.to, version: version('loan', stored) }, ledger };
  }

  private async rejectDeduction(tx: Prisma.TransactionClient, docNo: string, rows: Row[], who: string, decision: RequestDecision) {
    const r = rows[0];
    const plan = planDeductionReject(r ? { docNo, status: r.doc_status, headerCount: rows.length, type: r.jenis_simpanan, nik: r.nik_kar, requestedRp: r.potongan, docDate: r.doc_date } : null);
    if ((await tx.$executeRaw`UPDATE trans_simpanan_pengajuan SET doc_status = ${plan.to}, updated_at = ${JAKARTA_NOW}, ud_usr = ${who} WHERE id = ${Number(r.id)} AND doc_status = ${plan.from}`) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
    const stored = await this.requestRows(tx, 'deduction', docNo, false);
    if (stored.length !== 1 || stored[0].doc_status !== plan.to || stored[0].ud_usr !== who) throw new KosipaError('POSTCONDITION_FAILED');
    const amountRp = num(r.potongan);
    const ledger: LedgerFacts = {
      fromState: plan.from, toState: plan.to, reason: decision.reason ?? null,
      before: requestLedgerSnapshot({ docNo, type: 'deduction', status: plan.from, amountRp, savingsType: r.jenis_simpanan }),
      after: requestLedgerSnapshot({ docNo, type: 'deduction', status: plan.to, amountRp, savingsType: r.jenis_simpanan }),
      makerConsoleUserId: null, checkerConsoleUserId: null,
    };
    return { result: { docNo, status: plan.to, version: version('deduction', stored) }, ledger };
  }

  private async approveDeduction(tx: Prisma.TransactionClient, envelope: CommandEnvelope, docNo: string, rows: Row[], who: string) {
    const r = rows[0];
    const nik = r?.nik_kar ?? '';
    const type = (r?.jenis_simpanan ?? '').trim();
    // Members and active rows: ids by a plain read (no index on nik_kar), then locked by primary key in id order (request -> member -> active rows).
    const memberIds = nik ? await tx.$queryRaw<{ id: number | bigint }[]>`SELECT id FROM m_anggota WHERE nik_kar = ${nik} ORDER BY id LIMIT 3` : [];
    const members = memberIds.length ? await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${select([...MEMBER_COLUMNS, 'sim_wajib', 'sim_sukarela'])} FROM m_anggota
      WHERE id IN (${Prisma.join(memberIds.map((m) => Number(m.id)))}) ORDER BY id FOR UPDATE`) : [];
    const activeIds = nik && type ? await tx.$queryRaw<{ id: number | bigint }[]>`SELECT id FROM m_simpanan_aktif WHERE nik_kar = ${nik} AND jenis_simpanan = ${type} ORDER BY id LIMIT 20` : [];
    const active = activeIds.length ? await tx.$queryRaw<Row[]>(Prisma.sql`SELECT CAST(id AS CHAR) AS id, CAST(status AS CHAR) AS status, CAST(COALESCE(potongan_payroll, 0) AS DECIMAL(24,2)) AS payroll
      FROM m_simpanan_aktif WHERE id IN (${Prisma.join(activeIds.map((a) => Number(a.id)))}) ORDER BY id FOR UPDATE`) : [];
    const plan = planDeductionApprove(
      r ? { docNo, status: r.doc_status, headerCount: rows.length, type: r.jenis_simpanan, nik: r.nik_kar, requestedRp: r.potongan, docDate: r.doc_date } : null,
      members.map((m) => ({ id: Number(m.id), nik: m.nik_kar ?? '', name: m.nama_kar, group: m.kd_group, status: m.status_anggota })),
      active.map((a) => ({ id: Number(a.id), status: num(a.status), payroll: String(a.payroll ?? '0') })),
    );
    if (plan.update.length) {
      const changed = await tx.$executeRaw(Prisma.sql`UPDATE m_simpanan_aktif SET doc_no = ${docNo}, potongan_payroll = ${plan.amountRp}, status = 1, ud = ${JAKARTA_NOW}, usr_ud = ${who}
        WHERE id IN (${Prisma.join(plan.update)})`);
      if (changed !== plan.update.length) throw new KosipaError('POSTCONDITION_FAILED');
    } else if (plan.insert) {
      const i = plan.insert;
      await tx.$executeRaw`INSERT INTO m_simpanan_aktif (doc_no, jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_old, potongan_payroll, status, cd, usr_cd, periode_start, periode_end, is_mobile)
        VALUES (${docNo}, ${i.type}, ${i.nik}, ${i.name}, ${i.group}, ${i.previousRp}, ${plan.amountRp}, 1, ${JAKARTA_NOW}, ${who}, ${i.periodStart}, ${i.periodEnd}, 1)`;
    }
    const memberId = Number(members[0].id);
    await tx.$executeRaw(Prisma.sql`UPDATE m_anggota SET ${Prisma.raw(`\`${plan.memberColumn}\``)} = ${plan.amountRp} WHERE id = ${memberId}`);
    if ((await tx.$executeRaw`UPDATE trans_simpanan_pengajuan SET doc_status = ${plan.to}, posting_date = ${JAKARTA_NOW}, updated_at = ${JAKARTA_NOW}, ud_usr = ${who}
        WHERE id = ${Number(r.id)} AND doc_status = ${plan.from}`) !== 1) throw new KosipaError('POSTCONDITION_FAILED');

    // Postconditions on all three tables.
    const stored = await this.requestRows(tx, 'deduction', docNo, false);
    const after = await tx.$queryRaw<Row[]>`SELECT doc_no, CAST(status AS CHAR) AS status, CAST(COALESCE(potongan_payroll, 0) AS DECIMAL(24,2)) AS payroll FROM m_simpanan_aktif
      WHERE nik_kar = ${nik} AND jenis_simpanan = ${type}`;
    const [m] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT CAST(${Prisma.raw(`\`${plan.memberColumn}\``)} AS DECIMAL(24,2)) AS amount FROM m_anggota WHERE id = ${memberId}`);
    if (stored.length !== 1 || stored[0].doc_status !== plan.to || stored[0].ud_usr !== who
      || after.length !== Math.max(plan.update.length, 1) || after.some((a) => a.doc_no !== docNo || a.status !== '1' || Number(a.payroll) !== plan.amountRp)
      || Number(m?.amount) !== plan.amountRp) throw new KosipaError('POSTCONDITION_FAILED');
    const ledger: LedgerFacts = {
      fromState: plan.from, toState: plan.to, reason: null,
      before: requestLedgerSnapshot({ docNo, type: 'deduction', status: plan.from, amountRp: plan.amountRp, savingsType: type, activeRows: active.length }),
      after: requestLedgerSnapshot({ docNo, type: 'deduction', status: plan.to, amountRp: plan.amountRp, savingsType: type, activeRows: after.length, inserted: plan.insert !== null }),
      // The maker is the member (PWA intake, actor 0) or a legacy channel: never this console user, so maker != checker holds by construction.
      makerConsoleUserId: null, checkerConsoleUserId: envelope.actorConsoleUserId,
    };
    return { result: { docNo, status: plan.to, version: version('deduction', stored) }, ledger };
  }

  // ---------------------------------------------------------------------------------------------------------------------- read
  async fenceState(type: MemberRequestType): Promise<LegacyFenceState> {
    const controllers = type === 'loan' ? LOAN_REQUEST_LEGACY_CONTROLLERS : DEDUCTION_REQUEST_LEGACY_CONTROLLERS;
    const rows = await this.read_.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) IN (${Prisma.join(controllers.map((c) => c.toUpperCase()))})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  async list(filter: MemberRequestFilter): Promise<MemberRequestRow[]> {
    const t = TABLE[filter.type];
    const status = filter.status === 'ALL' ? Prisma.empty : Prisma.sql`AND doc_status = ${filter.status}`;
    const from = `${filter.month}-01`;
    const rows = await this.read_.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR SELECT ${select(t.cols)} FROM ${Prisma.raw(t.name)}
      WHERE doc_date >= ${from} AND doc_date < DATE_ADD(${from}, INTERVAL 1 MONTH) ${status} ORDER BY id DESC LIMIT 200`);
    // Version per number (a number carried by several rows is reported with all of them, and every decision on it is refused as inconsistent).
    const byDoc = new Map<string, Row[]>();
    for (const r of rows) byDoc.set((r.doc_no ?? '').toUpperCase(), [...(byDoc.get((r.doc_no ?? '').toUpperCase()) ?? []), r]);
    return rows.map((r) => {
      const docNo = r.doc_no ?? '';
      const same = byDoc.get(docNo.toUpperCase()) ?? [r];
      const base = { type: filter.type, id: Number(r.id), docNo, docDate: r.doc_date, status: r.doc_status, channel: requestChannel(docNo), version: version(filter.type, [...same].sort((a, b) => Number(a.id) - Number(b.id))) };
      return filter.type === 'loan'
        ? { ...base, member: { nik: r.nik_kar ?? '', name: r.nama ?? '', section: r.bagian }, detail: { product: r.jenis_pinjaman, amount: dec(r.total_pinjaman), months: num(r.lama_angsuran), purpose: r.doc_remarks, rejection: r.keterangan_riject } }
        : { ...base, member: { nik: r.nik_kar ?? '', name: r.nama ?? '', section: r.bagian }, detail: { savingsType: r.jenis_simpanan, previous: dec(r.potongan_old), requested: dec(r.potongan),
          effective: r.awal_potong_tahun && r.awal_potong_bulan ? `${r.awal_potong_tahun}-${String(r.awal_potong_bulan).padStart(2, '0')}` : null } };
    });
  }
}
