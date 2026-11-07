import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError, canonicalNik } from '@koperasi/domain/kosipa';
import type { Snapshot } from '@koperasi/domain/kosipa/command';
import {
  MEMBER_REGISTRATION_FIELDS, memberFieldSummary, memberNikUniquenessKey, planMemberProfile, planMemberRegistration, planMemberStatus,
  type MemberField, type MemberMasterFacts, type MemberProfile, type MemberRegistration, type MemberStatusChange, type MemberStoredFields,
} from '@koperasi/domain/kosipa/member-command';
import { businessDates } from '@koperasi/domain/pos/sale';
import type { LegacyFenceState } from '@koperasi/application/kosipa/commands/master';
import type { MemberRepository, MemberResult } from '@koperasi/application/kosipa/commands/member';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { DocumentNumberingService } from '@koperasi/application/kosipa/document-numbering';
import { runCommandTransaction, type LedgerFacts, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';
import { PrismaDocumentNumberRepository } from './kosipa-document-number.ts';
import { MEMBER_VERSION_COLUMNS, memberVersion } from './kosipa-member-version.ts';

/**
 * KOSIPA members (legacy master/anggota_c + anggota/anggota_c; FA-03B WI-07 / TASK-115). Commands run in ONE unit of work (kosipa-unit-of-work.ts):
 * fence -> business locks -> ledger lookup -> legacy-compatible writes -> ledger row -> commit.
 *
 * Contract (T04 decisions, see fa-03b/MEMBER_WRITE_REPOSITORY.md):
 *  - Repository -> domain boundary (MemberStoredFields): every value is the database's own TEXT rendering (CAST ... AS CHAR). Dates are
 *    'YYYY-MM-DD' strings, never Date objects; decimals are strings; NULL stays null. The planner compares tolerantly (NULL = '').
 *  - Create lock: every m_anggota (id, nik_kar, no_anggota) FOR UPDATE, so registrations serialize and NIK uniqueness (canonical numeric +
 *    ASCII-case-folded, including legacy aliases such as '00123' vs '123') and the no_anggota sequence are judged on the latest committed rows.
 *    m_anggota has NO unique index on nik_kar / no_anggota (legacy), which is exactly why this lock is the uniqueness guarantee.
 *  - doc_no = REG + YYYYMM + n via the native numbering registry (scheme member-registration). no_anggota keeps the legacy shape
 *    str_pad(count+1) + NIK ('000'/'00'/'0' prefix, then the NIK) and moves past a value that already exists instead of duplicating it.
 *  - Profile update: lock the member row by validated id, check the HMAC version (kosipa-member-version.ts) BEFORE planning, write only the
 *    changed allowlisted columns, then mirror the five verified fields to the users row found from the LOCKED member's NIK (never a client key).
 *  - cd_usr / ud_usr hold the actor's KOSIPA display name (the legacy intent; the session key it asked for never existed, so it stored '0').
 *    The authoritative identities stay in the ledger.
 */
export type MemberRepositoryOptions = {
  ledgerDatabase?: string;
  /** HMAC key for member versions. */
  versionSecret?: string;
  hooks?: UnitOfWorkHooks;
  now?: () => Date;
};

const LEGACY_CONTROLLERS = ['master/anggota_c', 'anggota/anggota_c', 'mobile/users_c'] as const;
const MAX_MEMBERS = 100_000;
const MAX_MASTERS = 2_000;
const COLUMN_NAMES: ReadonlySet<string> = new Set(MEMBER_VERSION_COLUMNS);
const REGISTRATION_FIELDS: ReadonlySet<string> = new Set(MEMBER_REGISTRATION_FIELDS);
const JAKARTA_NOW = Prisma.sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`;
const raw = (identifier: string) => Prisma.raw(`\`${identifier}\``);
const column = (name: string) => { if (!COLUMN_NAMES.has(name)) throw new KosipaError('FIELD_NOT_ALLOWED'); return raw(name); };
const ROW_SELECT = Prisma.raw(MEMBER_VERSION_COLUMNS.map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``).join(', '));

/** The five member fields mirrored into an EXISTING users row (MC06): member field -> users column. Bank/group/location/wallet are never mirrored. */
const MIRROR: Readonly<Record<string, string>> = { ktp: 'ktp', nama_kar: 'name', no_telp: 'phone', email: 'email', alamat_tinggal: 'street_address' };
const DEDUCTIONS = [
  { key: 'pokok', jenis: 'SIMPANAN POKOK' }, { key: 'wajib', jenis: 'SIMPANAN WAJIB' }, { key: 'sukarela', jenis: 'SIMPANAN SUKARELA' },
] as const;

type Row = Record<string, string | null>;
type Master = { name: string | null; status: number | bigint | null };
type UsersRow = { id: number | bigint; ktp: string | null; phone: string | null };
type CreateLocked = { members: { id: number; nik_kar: string | null; no_anggota: string | null }[]; masters: MemberMasterFacts };
type UpdateLocked = { row: Row | null; masters: MemberMasterFacts; user: UsersRow | null };

const idOf = (row: Row) => Number(row.id);
/** Row text -> planner input. Everything the planner may compare, exactly as stored. */
const storedFields = (row: Row): MemberStoredFields => Object.fromEntries(MEMBER_VERSION_COLUMNS.filter((c) => c !== 'id').map((c) => [c, row[c] ?? null]));
/** Every column as the database's own text (never numbers), for the edit view. */
const textFields = (row: Row): Record<string, string | null> => Object.fromEntries(MEMBER_VERSION_COLUMNS.filter((c) => c !== 'id').map((c) => [c, row[c] ?? null]));
const nikKey = (stored: string | null): string => { const value = stored ?? ''; try { return memberNikUniquenessKey(value); } catch { return value.trim().toLowerCase(); } };

/** Legacy get_no_anggota(): '000n' / '00n' / '0n' (for n >= 100 simply '0' + n), then the NIK. */
export function legacyMemberNumber(n: number, nik: string): string {
  return (n <= 9 ? `000${n}` : n <= 99 ? `00${n}` : `0${n}`) + nik;
}

/** The planned value as the database should store it (dates and text are written as given; salary as its exact decimal string). */
const NUMERIC = new Set(['gaji', 'sim_pokok', 'sim_wajib', 'sim_sukarela', 'gaji_minus', 'limit_toko_old', 'limit_toko', 'limit_persen', 'surat_kuasa']);
function equalsStored(key: string, stored: string | null, expected: unknown): boolean {
  if (NUMERIC.has(key)) return Number(stored) === Number(expected ?? 0);
  return (stored ?? '') === String(expected ?? '');
}

export class PrismaKosipaMemberRepository implements MemberRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: MemberRepositoryOptions;
  constructor(read: PrismaClient, write?: PrismaClient, options: MemberRepositoryOptions = {}) { this.read = read; this.write = write; this.options = options; }

  private get now(): Date { return (this.options.now ?? (() => new Date()))(); }

  private run<L, R>(envelope: CommandEnvelope, steps: Parameters<typeof runCommandTransaction<L, R>>[2]): Promise<CommandOutcome<R>> {
    if (!this.write || !this.options.ledgerDatabase || !this.options.versionSecret) throw new KosipaError('WRITE_NOT_CONFIGURED');
    return runCommandTransaction(this.write, envelope, steps, { ledgerDatabase: this.options.ledgerDatabase, legacyControllers: LEGACY_CONTROLLERS, hooks: this.options.hooks });
  }

  /** The member as stored now plus the opaque version a profile edit must echo back. Plain consistent read (SELECT-only reader). */
  async detail(id: number): Promise<{ id: number; fields: Record<string, string | null>; version: string } | null> {
    if (!this.options.versionSecret) throw new KosipaError('WRITE_NOT_CONFIGURED');
    const [row] = await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR SELECT ${ROW_SELECT} FROM m_anggota WHERE id = ${id}`);
    return row ? { id: idOf(row), fields: textFields(row), version: memberVersion(this.options.versionSecret, row) } : null;
  }

  async fenceState(): Promise<LegacyFenceState> {
    const rows = await this.read.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) IN (${Prisma.join(LEGACY_CONTROLLERS.map((c) => c.toUpperCase()))})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  private async masters(tx: Prisma.TransactionClient): Promise<MemberMasterFacts> {
    // Shared locks: a concurrent master deactivation/rename waits until this command has committed (the master writer takes FOR UPDATE).
    const bagian = await tx.$queryRaw<Master[]>`SELECT name_bagian AS name, status FROM m_bagian ORDER BY id LOCK IN SHARE MODE`;
    const lokasi = await tx.$queryRaw<Master[]>`SELECT name_lokasi AS name, status FROM m_lokasi ORDER BY id LOCK IN SHARE MODE`;
    if (bagian.length > MAX_MASTERS || lokasi.length > MAX_MASTERS) throw new KosipaError('MASTER_TOO_LARGE');
    const facts = (rows: Master[]) => rows.filter((r) => r.name !== null).map((r) => ({ name: r.name as string, active: Number(r.status) === 1 }));
    return { bagian: facts(bagian), lokasi: facts(lokasi) };
  }

  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name ?? `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  private async fetchRow(tx: Prisma.TransactionClient, id: number, lock: boolean): Promise<Row | null> {
    const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${ROW_SELECT} FROM m_anggota WHERE id = ${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    return row ?? null;
  }

  create(envelope: CommandEnvelope, input: MemberRegistration): Promise<CommandOutcome<MemberResult>> {
    if (!this.write || !this.options.ledgerDatabase || !this.options.versionSecret) return Promise.reject(new KosipaError('WRITE_NOT_CONFIGURED'));
    const numbering = new DocumentNumberingService<Prisma.TransactionClient>(new PrismaDocumentNumberRepository(this.options.ledgerDatabase ?? ''));
    return this.run<CreateLocked, MemberResult>(envelope, {
      lock: async (tx) => {
        const members = await tx.$queryRaw<{ id: number; nik_kar: string | null; no_anggota: string | null }[]>`SELECT id, nik_kar, no_anggota FROM m_anggota ORDER BY id FOR UPDATE`;
        if (members.length > MAX_MEMBERS) throw new KosipaError('MEMBER_TOO_LARGE');
        return { members, masters: await this.masters(tx) };
      },
      run: async (tx, locked) => {
        const planned = planMemberRegistration(input, locked.masters);
        const nik = planned.fields.nik_kar as string;
        const key = memberNikUniquenessKey(nik);
        if (locked.members.some((m) => nikKey(m.nik_kar) === key)) throw new KosipaError('MEMBER_NIK_DUPLICATE');
        for (const name of Object.keys(planned.fields)) if (!REGISTRATION_FIELDS.has(name)) throw new KosipaError('FIELD_NOT_ALLOWED');

        const taken = new Set(locked.members.map((m) => m.no_anggota));
        let sequence = locked.members.length + 1;
        while (taken.has(legacyMemberNumber(sequence, nik))) sequence++;
        const noAnggota = legacyMemberNumber(sequence, nik);
        const { docNo } = await numbering.allocate(tx, { scheme: 'member-registration', now: this.now, table: 'm_anggota', requestId: envelope.requestId });
        const who = await this.actorName(tx, envelope);
        const today = businessDates(this.now).day;

        // Explicit values for every NOT NULL-without-default column and for the columns registration must never take from a client:
        // strict mode stays ON (no session sql_mode change). Limits and gaji_minus belong to WI-08 and start at 0.
        const values: [string, unknown][] = [
          ...Object.entries(planned.fields).filter(([k]) => k !== 'gaji' && k !== 'tgl_daftar'),
          ['tgl_daftar', planned.fields.tgl_daftar ?? today], ['gaji', planned.fields.gaji ?? '0'],
          ['doc_no', docNo], ['no_anggota', noAnggota],
          ['sim_pokok', planned.initialDeductions.pokok], ['sim_wajib', planned.initialDeductions.wajib], ['sim_sukarela', planned.initialDeductions.sukarela],
          ['gaji_minus', 0], ['limit_toko_old', 0], ['limit_toko', 0], ['limit_persen', 0], ['surat_kuasa', 0], ['cd_usr', who],
        ];
        const names = values.map(([k]) => column(k));
        await tx.$executeRaw(Prisma.sql`INSERT INTO m_anggota (${Prisma.join(names)}, cd) VALUES (${Prisma.join(values.map(([, v]) => Prisma.sql`${v}`))}, ${JAKARTA_NOW})`);
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        const memberId = Number(id);

        // Legacy MC01: exactly one active config row per strictly positive deduction; none for "0"; no mobile account, token or savings posting.
        for (const { key: kind, jenis } of DEDUCTIONS) {
          const amount = planned.initialDeductions[kind];
          if (Number(amount) <= 0) continue;
          await tx.$executeRaw`INSERT INTO m_simpanan_aktif (jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_old, potongan_payroll, status, is_mobile)
            VALUES (${jenis}, ${nik}, ${planned.fields.nama_kar}, ${planned.fields.kd_group}, 0, ${amount}, 1, 0)`;
        }

        const stored = await this.fetchRow(tx, memberId, false);
        if (!stored) throw new KosipaError('POSTCONDITION_FAILED');
        for (const [k, v] of values) if (k !== 'cd_usr' && !equalsStored(k, stored[k] ?? null, v)) throw new KosipaError('POSTCONDITION_FAILED');
        const summary = memberFieldSummary(memberId, planned.fields);
        const ledger: LedgerFacts = { fromState: null, toState: 'REGISTERED', before: null, after: ledgerSummary(summary, docNo) };
        return { result: { id: memberId, version: memberVersion(this.options.versionSecret as string, stored) }, ledger };
      },
    });
  }

  /** The member row FOR UPDATE and, from that LOCKED row's NIK only (MC05 correction), the existing users row FOR UPDATE. */
  private async lockMember(tx: Prisma.TransactionClient, id: number): Promise<{ row: Row | null; user: UsersRow | null }> {
    const row = await this.fetchRow(tx, id, true);
    let user: UsersRow | null = null;
    if (row) {
      const nik = (row.nik_kar ?? '').trim();
      const keys = [...new Set([nik, nikKeyOrSame(nik)])].filter(Boolean);
      const users = keys.length ? await tx.$queryRaw<UsersRow[]>(Prisma.sql`SELECT id, ktp, phone FROM users WHERE nik IN (${Prisma.join(keys)}) FOR UPDATE`) : [];
      if (users.length > 1) throw new KosipaError('MEMBER_MIRROR_CONFLICT');
      user = users[0] ?? null;
    }
    return { row, user };
  }

  update(envelope: CommandEnvelope, id: number, input: MemberProfile): Promise<CommandOutcome<MemberResult>> {
    return this.run<UpdateLocked, MemberResult>(envelope, {
      lock: async (tx) => ({ ...(await this.lockMember(tx, id)), masters: await this.masters(tx) }),
      run: async (tx, locked) => {
        if (!locked.row) throw new KosipaError('MEMBER_NOT_FOUND');
        const secret = this.options.versionSecret as string;
        if (memberVersion(secret, locked.row) !== input.expectedVersion) throw new KosipaError('STALE');
        const plan = planMemberProfile({ id, fields: storedFields(locked.row) }, input, locked.masters);

        const sets = plan.changed.map((key) => Prisma.sql`${column(key)} = ${plan.after.fields[key] ?? null}`);
        sets.push(Prisma.sql`ud = ${JAKARTA_NOW}`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE m_anggota SET ${Prisma.join(sets)} WHERE id = ${id}`);
        if (changed !== 1) throw new KosipaError('POSTCONDITION_FAILED');

        const mirrored = plan.changed.filter((key) => key in MIRROR);
        if (locked.user && mirrored.length) await this.mirror(tx, Number(locked.user.id), locked.user, plan.after.fields, mirrored);

        const stored = await this.fetchRow(tx, id, false);
        if (!stored) throw new KosipaError('POSTCONDITION_FAILED');
        for (const key of plan.changed) if (!equalsStored(key, stored[key] ?? null, plan.after.fields[key] as string | null)) throw new KosipaError('POSTCONDITION_FAILED');
        const ledger: LedgerFacts = { before: null, after: ledgerSummary(plan.summary), ...(plan.reason === undefined ? {} : { reason: plan.reason }) };
        return { result: { id, version: memberVersion(secret, stored) }, ledger };
      },
    });
  }

  /** REQ-110 / FD-30: see MemberRepository.changeStatus. Reason is mandatory and stored in the ledger only. */
  changeStatus(envelope: CommandEnvelope, id: number, input: MemberStatusChange): Promise<CommandOutcome<MemberResult>> {
    return this.run<{ row: Row | null; user: UsersRow | null }, MemberResult>(envelope, {
      lock: (tx) => this.lockMember(tx, id),
      run: async (tx, locked) => {
        if (!locked.row) throw new KosipaError('MEMBER_NOT_FOUND');
        const secret = this.options.versionSecret as string;
        if (memberVersion(secret, locked.row) !== input.expectedVersion) throw new KosipaError('STALE');
        const plan = planMemberStatus({ id, status: locked.row.status_anggota }, input);

        const sets = [Prisma.sql`status_anggota = ${plan.to}`];
        if (plan.zeroLimits) sets.push(Prisma.sql`limit_toko = 0`, Prisma.sql`limit_ppob = 0`, Prisma.sql`gaji_minus = 0`);
        sets.push(Prisma.sql`ud = ${JAKARTA_NOW}`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        if ((await tx.$executeRaw(Prisma.sql`UPDATE m_anggota SET ${Prisma.join(sets)} WHERE id = ${id}`)) !== 1) throw new KosipaError('POSTCONDITION_FAILED');

        // Existing mobile identity only: all and only its tokens (by user_id), and the disabled mirror written once (no legacy wallet recredit).
        let tokensRevoked = 0;
        if (plan.disableMobile && locked.user) {
          const userId = Number(locked.user.id);
          tokensRevoked = Number(await tx.$executeRaw`DELETE FROM oauth_access_tokens WHERE user_id = ${userId}`);
          await tx.$executeRaw`UPDATE users SET is_active = 0, is_delete = 1, admin_verifikasi = 0, temporary_token = '', wallet_balance = 0, wallet_balance_ppob = 0 WHERE id = ${userId}`;
          const [u] = await tx.$queryRaw<Record<string, string | null>[]>`SELECT CAST(is_active AS CHAR) AS is_active, CAST(is_delete AS CHAR) AS is_delete, CAST(admin_verifikasi AS CHAR) AS admin_verifikasi,
            temporary_token, CAST(wallet_balance AS CHAR) AS wallet_balance, CAST(wallet_balance_ppob AS CHAR) AS wallet_balance_ppob FROM users WHERE id = ${userId}`;
          const [left] = await tx.$queryRaw<{ n: bigint | number }[]>`SELECT COUNT(*) AS n FROM oauth_access_tokens WHERE user_id = ${userId}`;
          if (!u || Number(u.is_active) !== 0 || Number(u.is_delete) !== 1 || Number(u.admin_verifikasi) !== 0 || u.temporary_token !== '' || Number(u.wallet_balance) !== 0 || Number(u.wallet_balance_ppob) !== 0 || Number(left.n) !== 0) throw new KosipaError('POSTCONDITION_FAILED');
        }

        const stored = await this.fetchRow(tx, id, false);
        if (!stored || stored.status_anggota !== plan.to || (plan.zeroLimits && ['limit_toko', 'limit_ppob', 'gaji_minus'].some((c) => Number(stored[c]) !== 0))) throw new KosipaError('POSTCONDITION_FAILED');
        const ledger: LedgerFacts = {
          fromState: plan.from, toState: plan.to, reason: input.reason, before: null,
          after: { id, kind: plan.kind, limitsZeroed: plan.zeroLimits, mobileDisabled: plan.disableMobile && locked.user !== null, tokensRevoked },
        };
        return { result: { id, version: memberVersion(secret, stored) }, ledger };
      },
    });
  }

  /** Mirrors the changed ktp/name/phone/email/street_address values into the existing users row, after checking its unique keys under lock. */
  private async mirror(tx: Prisma.TransactionClient, userId: number, user: UsersRow, after: MemberStoredFields, mirrored: readonly MemberField[]): Promise<void> {
    const value = (key: MemberField) => (after[key] ?? null) as string | null;
    if (mirrored.includes('email') && (await tx.$queryRaw<unknown[]>`SELECT id FROM users WHERE email = ${value('email')} AND id <> ${userId} LIMIT 1 FOR UPDATE`).length) throw new KosipaError('MEMBER_MIRROR_CONFLICT');
    if (mirrored.includes('ktp') || mirrored.includes('no_telp')) {
      const ktp = mirrored.includes('ktp') ? value('ktp') : user.ktp, phone = mirrored.includes('no_telp') ? value('no_telp') : user.phone;
      if ((await tx.$queryRaw<unknown[]>`SELECT id FROM users WHERE ktp = ${ktp} AND phone = ${phone} AND id <> ${userId} LIMIT 1 FOR UPDATE`).length) throw new KosipaError('MEMBER_MIRROR_CONFLICT');
    }
    const sets = mirrored.map((key) => Prisma.sql`${raw(MIRROR[key])} = ${value(key)}`);
    await tx.$executeRaw(Prisma.sql`UPDATE users SET ${Prisma.join(sets)} WHERE id = ${userId}`);
    const [row] = await tx.$queryRaw<Record<string, string | null>[]>(Prisma.sql`SELECT ${Prisma.join(mirrored.map((key) => Prisma.sql`CAST(${raw(MIRROR[key])} AS CHAR) AS ${raw(key)}`))} FROM users WHERE id = ${userId}`);
    if (!row || mirrored.some((key) => (row[key] ?? '') !== (value(key) ?? ''))) throw new KosipaError('POSTCONDITION_FAILED');
  }
}

function nikKeyOrSame(nik: string): string { try { return canonicalNik(nik); } catch { return nik; } }

/** PII-free ledger summary (no NIK, names, amounts or reason text): the id, field NAMES that changed, and the bank/salary flags. */
function ledgerSummary(summary: ReturnType<typeof memberFieldSummary>, docNo?: string): Snapshot {
  const names = Object.keys(summary.changes).filter((k) => summary.changes[k as MemberField]).join(',');
  return { id: summary.id, ...(docNo ? { doc_no: docNo } : {}), fields: names, bankChanged: summary.bankChanged, salaryChanged: summary.salaryChanged };
}
