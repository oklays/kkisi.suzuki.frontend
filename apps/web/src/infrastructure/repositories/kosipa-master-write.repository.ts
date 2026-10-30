import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { ledgerSnapshot } from '@koperasi/domain/kosipa/command';
import {
  MASTER_LEDGER_FIELDS, masterLedgerValues, needsReferenceCount, planMasterCreate, planMasterStatus, planMasterUpdate,
  type FieldKey, type MasterDefinition, type MasterRecord, type MasterType, type MasterValues,
} from '@koperasi/domain/kosipa/master';
import { toMasterResult, type LegacyFenceState, type MasterRepository, type MasterResult } from '@koperasi/application/kosipa/commands/master';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { runCommandTransaction, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';

/**
 * KOSIPA reference masters (legacy master/*_c). Reads use the SELECT-only reader; commands use the master writer inside the unit of work.
 * Physical layout per master, verified against the staging DDL (fa-02/MASTER_SEMANTICS.md). Identifiers below are constants, never input.
 * Lock: every row of the (small) master table FOR UPDATE for create/update, so creates and renames serialize and uniqueness is judged on
 * the latest committed rows; status changes lock the target row only. Plain reads elsewhere (legacy pages, member forms) are not blocked.
 */
type TableConfig = {
  table: string;
  columns: Partial<Record<FieldKey, string>>;
  /** int = 1/0 (status INT); text = '1'/'0' (is_active VARCHAR, legacy filters is_active='1'). */
  status: { column: string; kind: 'int' | 'text' };
  /** Legacy audit columns written like the legacy controller: cd/cd_usr on insert, ud/ud_usr on update (display name of the KOSIPA user). */
  stamps: boolean;
  /** Columns elsewhere that store this master's referenced value (definition.referenced). */
  references: readonly { table: string; column: string }[];
};
const TABLES: Readonly<Record<MasterType, TableConfig>> = {
  lokasi: { table: 'm_lokasi', columns: { code: 'code_lokasi', name: 'name_lokasi' }, status: { column: 'status', kind: 'int' }, stamps: false,
    references: [{ table: 'm_anggota', column: 'lokasi' }, { table: 'users', column: 'lokasi' }] },
  bagian: { table: 'm_bagian', columns: { name: 'name_bagian' }, status: { column: 'status', kind: 'int' }, stamps: false,
    references: [{ table: 'm_anggota', column: 'bagian' }, { table: 'users', column: 'bagian' }] },
  'jenis-dokumen': { table: 'm_jenis_dokumen', columns: { code: 'jenis_dokumen_code', name: 'jenis_dokumen_name', remarks: 'jenis_dokumen_remarks' }, status: { column: 'is_active', kind: 'text' }, stamps: true, references: [] },
  'rekening-bank': { table: 'm_rekening', columns: { code: 'rekening_code', name: 'rekening_name', remarks: 'rekening_remarks' }, status: { column: 'is_active', kind: 'text' }, stamps: true,
    references: [{ table: 'trans_pinjaman', column: 'bank_pembiaya' }] },
  // The code (months) never changes, so no reference count is ever needed.
  'periode-angsuran': { table: 'm_jangka_waktu', columns: { code: 'jangka_waktu_code', name: 'jangka_waktu_name', remarks: 'jangka_waktu_remarks' }, status: { column: 'is_active', kind: 'text' }, stamps: true, references: [] },
};
/** Reference tables are small by nature; refuse to reason about one that is not (the lock would be too wide). */
const MAX_ROWS = 2000;

type Row = { id: number | bigint; code: string | null; name: string | null; remarks: string | null; status: number | bigint | string | null };
const raw = (identifier: string) => Prisma.raw(`\`${identifier}\``);
const isActive = (cfg: TableConfig, status: Row['status']) => (cfg.status.kind === 'int' ? Number(status) === 1 : String(status ?? '').trim() === '1');
const statusValue = (cfg: TableConfig, active: boolean) => (cfg.status.kind === 'int' ? (active ? 1 : 0) : (active ? '1' : '0'));
const state = (active: boolean) => (active ? 'ACTIVE' : 'INACTIVE');
const snapshot = (r: MasterRecord) => ledgerSnapshot(masterLedgerValues(r), MASTER_LEDGER_FIELDS);

function selectColumns(cfg: TableConfig): Prisma.Sql {
  const col = (key: FieldKey) => (cfg.columns[key] ? raw(cfg.columns[key]!) : Prisma.raw('NULL'));
  return Prisma.sql`id, ${col('code')} AS code, ${col('name')} AS name, ${col('remarks')} AS remarks, ${raw(cfg.status.column)} AS status`;
}
function toRecord(def: MasterDefinition, cfg: TableConfig, r: Row): MasterRecord {
  const values: MasterValues = {};
  for (const f of def.fields) values[f.key] = (r[f.key] ?? '') as string;
  return { id: Number(r.id), values, active: isActive(cfg, r.status) };
}

export type MasterRepositoryOptions = { ledgerDatabase?: string; hooks?: UnitOfWorkHooks };

export class PrismaKosipaMasterRepository implements MasterRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: MasterRepositoryOptions;
  constructor(read: PrismaClient, write?: PrismaClient, options: MasterRepositoryOptions = {}) { this.read = read; this.write = write; this.options = options; }

  async list(def: MasterDefinition): Promise<MasterRecord[]> {
    const cfg = TABLES[def.type];
    const rows = await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR
      SELECT ${selectColumns(cfg)} FROM ${raw(cfg.table)} ORDER BY id LIMIT ${MAX_ROWS}`);
    return rows.map((r) => toRecord(def, cfg, r));
  }

  async fenceState(def: MasterDefinition): Promise<LegacyFenceState> {
    const rows = await this.read.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) = UPPER(${def.legacyController})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  private run<L, R>(def: MasterDefinition, envelope: CommandEnvelope, steps: Parameters<typeof runCommandTransaction<L, R>>[2]): Promise<CommandOutcome<R>> {
    if (!this.write || !this.options.ledgerDatabase) throw new KosipaError('WRITE_NOT_CONFIGURED');
    return runCommandTransaction(this.write, envelope, steps, { ledgerDatabase: this.options.ledgerDatabase, legacyControllers: [def.legacyController], hooks: this.options.hooks });
  }

  private async lockAll(tx: Prisma.TransactionClient, def: MasterDefinition): Promise<MasterRecord[]> {
    const cfg = TABLES[def.type];
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectColumns(cfg)} FROM ${raw(cfg.table)} ORDER BY id FOR UPDATE`);
    if (rows.length > MAX_ROWS) throw new KosipaError('MASTER_TOO_LARGE');
    return rows.map((r) => toRecord(def, cfg, r));
  }

  /** Rows elsewhere that store `value` in a referencing column (legacy columns compare case-insensitively). */
  private async references(tx: Prisma.TransactionClient, cfg: TableConfig, value: string): Promise<number> {
    let total = 0;
    for (const ref of cfg.references) {
      const [row] = await tx.$queryRaw<{ n: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM ${raw(ref.table)} WHERE ${raw(ref.column)} = ${value}`);
      total += Number(row.n);
    }
    return total;
  }

  /** Legacy cd_usr / ud_usr hold the KOSIPA user's display name (session nama_lengkap); the real identities are in the ledger. */
  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name ?? `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  /** Post-condition: the row as stored now must equal what the command intended (catches truncation or a concurrent writer). */
  private async verify(tx: Prisma.TransactionClient, def: MasterDefinition, expected: MasterRecord): Promise<void> {
    const cfg = TABLES[def.type];
    const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectColumns(cfg)} FROM ${raw(cfg.table)} WHERE id = ${expected.id}`);
    const stored = row ? toRecord(def, cfg, row) : null;
    if (!stored || stored.active !== expected.active || def.fields.some((f) => (stored.values[f.key] ?? '') !== (expected.values[f.key] ?? ''))) throw new KosipaError('POSTCONDITION_FAILED');
  }

  create(def: MasterDefinition, envelope: CommandEnvelope, values: MasterValues): Promise<CommandOutcome<MasterResult>> {
    const cfg = TABLES[def.type];
    return this.run(def, envelope, {
      lock: (tx) => this.lockAll(tx, def),
      run: async (tx, existing) => {
        const planned = planMasterCreate(def, values, existing);
        const columns = def.fields.map((f) => raw(cfg.columns[f.key]!));
        const params = def.fields.map((f) => Prisma.sql`${planned.values[f.key] ?? ''}`);
        if (cfg.stamps) {
          const who = await this.actorName(tx, envelope);
          await tx.$executeRaw(Prisma.sql`INSERT INTO ${raw(cfg.table)} (${Prisma.join(columns)}, ${raw(cfg.status.column)}, cd, cd_usr)
            VALUES (${Prisma.join(params)}, ${statusValue(cfg, true)}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR), ${who})`);
        } else {
          await tx.$executeRaw(Prisma.sql`INSERT INTO ${raw(cfg.table)} (${Prisma.join(columns)}, ${raw(cfg.status.column)}) VALUES (${Prisma.join(params)}, ${statusValue(cfg, true)})`);
        }
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        const created: MasterRecord = { id: Number(id), values: planned.values, active: true };
        await this.verify(tx, def, created);
        return { result: toMasterResult(def, created), ledger: { fromState: null, toState: state(true), before: null, after: snapshot(created) } };
      },
    });
  }

  update(def: MasterDefinition, envelope: CommandEnvelope, id: number, values: MasterValues, expectedVersion: string): Promise<CommandOutcome<MasterResult>> {
    const cfg = TABLES[def.type];
    return this.run(def, envelope, {
      lock: (tx) => this.lockAll(tx, def),
      run: async (tx, existing) => {
        const current = existing.find((r) => r.id === id) ?? null;
        const references = needsReferenceCount(def, current, values) ? await this.references(tx, cfg, current!.values[def.referenced!] ?? '') : 0;
        const change = planMasterUpdate(def, current, values, expectedVersion, existing, references);
        // Fields fixed at creation are never in the SET list (the writer also has no UPDATE privilege on them: defence in depth).
        const sets = def.fields.filter((f) => f.change !== 'never').map((f) => Prisma.sql`${raw(cfg.columns[f.key]!)} = ${change.after.values[f.key] ?? ''}`);
        if (cfg.stamps) sets.push(Prisma.sql`ud = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE ${raw(cfg.table)} SET ${Prisma.join(sets)} WHERE id = ${id}`);
        if (changed !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        await this.verify(tx, def, change.after);
        return { result: toMasterResult(def, change.after), ledger: { fromState: state(change.before.active), toState: state(change.after.active), before: snapshot(change.before), after: snapshot(change.after) } };
      },
    });
  }

  setStatus(def: MasterDefinition, envelope: CommandEnvelope, id: number, active: boolean, expectedVersion: string, reason: string): Promise<CommandOutcome<MasterResult>> {
    const cfg = TABLES[def.type];
    return this.run(def, envelope, {
      lock: async (tx) => {
        const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectColumns(cfg)} FROM ${raw(cfg.table)} WHERE id = ${id} FOR UPDATE`);
        return rows[0] ? toRecord(def, cfg, rows[0]) : null;
      },
      run: async (tx, current) => {
        const change = planMasterStatus(def, current, active, expectedVersion);
        const sets = [Prisma.sql`${raw(cfg.status.column)} = ${statusValue(cfg, active)}`];
        if (cfg.stamps) sets.push(Prisma.sql`ud = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE ${raw(cfg.table)} SET ${Prisma.join(sets)} WHERE id = ${id}`);
        if (changed !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        await this.verify(tx, def, change.after);
        return { result: toMasterResult(def, change.after), ledger: { fromState: state(change.before.active), toState: state(active), reason, before: snapshot(change.before), after: snapshot(change.after) } };
      },
    });
  }
}
