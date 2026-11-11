import { Prisma, type PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { ledgerSnapshot } from '@koperasi/domain/kosipa/command';
import {
  canonicalDecimal, planProductCreate, planProductStatus, planProductUpdate, productLedgerValues, productNeedsReferenceCount,
  type ProductFacts, type ProductMasterDefinition, type ProductMasterType, type ProductRecord, type ProductValues,
} from '@koperasi/domain/kosipa/product-master';
import { productVersion } from '@koperasi/domain/kosipa/product-master-version';
import type { LegacyFenceState } from '@koperasi/application/kosipa/commands/master';
import type { ProductFormFacts, ProductMasterRepository, ProductResult } from '@koperasi/application/kosipa/commands/product-master';
import type { CommandEnvelope, CommandOutcome } from '@koperasi/application/kosipa/commands/pipeline';
import { runCommandTransaction, type LedgerFacts, type UnitOfWorkHooks } from '../db/kosipa-unit-of-work.ts';

/**
 * KOSIPA product masters (FA-03B T06) through the master writer (kosipa_master_w; grants db/kosipa/002_master_writer_grants.sql.tpl). One unit of
 * work per command: fence -> every row of the (small) table FOR UPDATE -> COA / financing facts under share locks -> ledger lookup -> domain plan on
 * the locked rows -> legacy-compatible write -> post-condition read -> ledger row.
 * Version = SHA-256 over EVERY column read (including legacy-only columns the native writer never writes), so a legacy edit makes a held form STALE.
 * Stamps as the legacy controllers: cd/cd_usr on insert, ud/ud_usr on update (cd_usr = the actor's KOSIPA display name). Columns legacy never wrote
 * (m_jenis_pinjaman dd/dd_usr/is_payroll, m_jenis_pembiayaan doc_no/doc_date, m_jenis_simpanan status_perorangan) are read but never written.
 */
const LEGACY_ONLY: Readonly<Record<ProductMasterType, readonly string[]>> = {
  'jenis-simpanan': ['status_perorangan'],
  'jenis-pinjaman': ['dd', 'dd_usr', 'is_payroll'],
  'jenis-pembiayaan': ['doc_no', 'doc_date'],
  'suku-bunga': [],
  'pinjaman-mobile': [],
};
const STAMPS = ['cd', 'cd_usr', 'ud', 'ud_usr'];
const MAX_ROWS = 2000;
const JAKARTA_NOW = Prisma.sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)`;
const IDENTIFIER = /^[a-z0-9_]{1,64}$/;
const raw = (identifier: string) => { if (!IDENTIFIER.test(identifier)) throw new KosipaError('WRITE_NOT_CONFIGURED'); return Prisma.raw(`\`${identifier}\``); };

type Row = Record<string, string | null>;
const written = (def: ProductMasterDefinition) => [...def.fields.map((f) => f.key), ...def.fields.filter((f) => f.descColumn).map((f) => f.descColumn as string)];
/** Every column the repository reads (and versions), in a fixed order. Constants only, never input. */
export const productColumns = (def: ProductMasterDefinition) => [
  ...written(def),
  def.status.column,
  ...(def.stamps === false ? [] : STAMPS),
  ...LEGACY_ONLY[def.type],
];
const selectList = (def: ProductMasterDefinition) => Prisma.raw(['`id`', ...productColumns(def).map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``)].join(', '));
const isActive = (def: ProductMasterDefinition, v: string | null) => (def.status.kind === 'int' ? Number(v) === 1 : String(v ?? '').trim() === '1');
const statusValue = (def: ProductMasterDefinition, active: boolean) => (def.status.kind === 'int' ? (active ? 1 : 0) : (active ? '1' : '0'));
const versionOf = (def: ProductMasterDefinition, row: Row) => productVersion({ id: Number(row.id), columns: Object.fromEntries(productColumns(def).map((c) => [c, row[c] ?? null])) });

function toRecord(def: ProductMasterDefinition, row: Row): ProductRecord {
  return { id: Number(row.id), values: Object.fromEntries(written(def).map((c) => [c, row[c] ?? ''])), active: isActive(def, row[def.status.column]) };
}
const toResult = (def: ProductMasterDefinition, row: Row): ProductResult => ({ ...toRecord(def, row), version: versionOf(def, row) });

/** Stored value equals the planned one (exact decimals canonically: DECIMAL(18,2) reads back as '10000.00'). */
function storedEquals(def: ProductMasterDefinition, key: string, stored: string | null, expected: string): boolean {
  const field = def.fields.find((f) => f.key === key);
  if (field?.kind === 'decimal') return canonicalDecimal(stored ?? '') === canonicalDecimal(expected);
  if (field && ['int', 'parent', 'flag'].includes(field.kind)) return Number(stored) === Number(expected) && (stored ?? '') !== '';
  return (stored ?? '') === expected;
}

export type ProductRepositoryOptions = { ledgerDatabase?: string; sharedWithLegacy?: boolean; hooks?: UnitOfWorkHooks };

export class PrismaKosipaProductMasterRepository implements ProductMasterRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  private readonly options: ProductRepositoryOptions;
  constructor(read: PrismaClient, write?: PrismaClient, options: ProductRepositoryOptions = {}) { this.read = read; this.write = write; this.options = options; }

  async list(def: ProductMasterDefinition): Promise<{ rows: ProductResult[]; facts: ProductFormFacts }> {
    const rows = await this.read.$queryRaw<Row[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR SELECT ${selectList(def)} FROM ${raw(def.table)} ORDER BY id LIMIT ${MAX_ROWS}`);
    const coa = def.fields.some((f) => f.kind === 'coa')
      ? await this.read.$queryRaw<{ code: string | null; descr: string | null; grp: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
          SELECT coa_no AS code, coa_desc AS descr, coa_group AS grp FROM m_acc_coa WHERE coa_no IS NOT NULL AND coa_no <> '' ORDER BY coa_no LIMIT 2000` : [];
    const financing = def.fields.some((f) => f.kind === 'financing')
      ? await this.read.$queryRaw<{ code: string | null; name: string | null; active: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
          SELECT pembiayaan_code AS code, pembiayaan_name AS name, CAST(is_active AS CHAR) AS active FROM m_jenis_pembiayaan ORDER BY pembiayaan_code LIMIT 2000` : [];
    const results = rows.map((r) => toResult(def, r));
    return {
      rows: results,
      facts: {
        coa: coa.filter((c) => c.code).map((c) => ({ code: c.code as string, desc: c.descr ?? '', group: Number(c.grp) === 1 })),
        financing: financing.filter((f) => f.code).map((f) => ({ code: f.code as string, name: f.name ?? '', active: String(f.active ?? '').trim() === '1' })),
        parents: def.fields.some((f) => f.kind === 'parent') ? results.filter((r) => (r.values.parent_id ?? '0') === '0').map((r) => ({ id: r.id, code: r.values[def.codeKey] ?? '', name: r.values[def.fields[1].key] ?? '' })) : [],
      },
    };
  }

  async fenceState(def: ProductMasterDefinition): Promise<LegacyFenceState> {
    if (def.legacyWriter === false || this.options.sharedWithLegacy) return 'fenced';   // no legacy writer or coexistence: the reading/legacy screen stays open
    const rows = await this.read.$queryRaw<{ status: number | bigint | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status FROM ref_menu WHERE UPPER(url) = UPPER(${def.legacyController})`;
    return rows.some((r) => Number(r.status) === 1) ? 'legacy-active' : 'fenced';
  }

  private run<L>(def: ProductMasterDefinition, envelope: CommandEnvelope, steps: Parameters<typeof runCommandTransaction<L, ProductResult>>[2]): Promise<CommandOutcome<ProductResult>> {
    if (!this.write || !this.options.ledgerDatabase) return Promise.reject(new KosipaError('WRITE_NOT_CONFIGURED'));
    return runCommandTransaction(this.write, envelope, steps, { ledgerDatabase: this.options.ledgerDatabase, legacyControllers: [def.legacyController], legacyFence: def.legacyWriter === false || this.options.sharedWithLegacy ? 'shared' : 'enforced', hooks: this.options.hooks });
  }

  private async lockAll(tx: Prisma.TransactionClient, def: ProductMasterDefinition): Promise<Row[]> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectList(def)} FROM ${raw(def.table)} ORDER BY id FOR UPDATE`);
    if (rows.length > MAX_ROWS) throw new KosipaError('MASTER_TOO_LARGE');
    return rows;
  }

  /** COA and financing facts under share locks: a concurrent account or financing change waits for this command. */
  private async facts(tx: Prisma.TransactionClient, def: ProductMasterDefinition): Promise<ProductFacts> {
    const coa = def.fields.some((f) => f.kind === 'coa')
      ? await tx.$queryRaw<{ code: string | null; descr: string | null; grp: number | bigint | null }[]>`SELECT coa_no AS code, coa_desc AS descr, coa_group AS grp FROM m_acc_coa ORDER BY id LOCK IN SHARE MODE` : [];
    const financing = def.fields.some((f) => f.kind === 'financing')
      ? await tx.$queryRaw<{ code: string | null; active: string | null }[]>`SELECT pembiayaan_code AS code, CAST(is_active AS CHAR) AS active FROM m_jenis_pembiayaan ORDER BY id LOCK IN SHARE MODE` : [];
    return {
      coa: coa.filter((c) => c.code).map((c) => ({ code: c.code as string, desc: c.descr ?? '', group: Number(c.grp) === 1 })),
      financing: financing.filter((f) => f.code).map((f) => ({ code: f.code as string, active: String(f.active ?? '').trim() === '1' })),
    };
  }

  /** Rows elsewhere storing `value` (the current code). Consistent read: counting only, never locking the large transaction tables. */
  private async references(tx: Prisma.TransactionClient, def: ProductMasterDefinition, value: string): Promise<number> {
    let total = 0;
    for (const ref of def.references) {
      const [row] = await tx.$queryRaw<{ n: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM ${raw(ref.table)} WHERE ${raw(ref.column)} = ${value}`);
      total += Number(row.n);
    }
    return total;
  }

  private async actorName(tx: Prisma.TransactionClient, envelope: CommandEnvelope): Promise<string> {
    const [row] = await tx.$queryRaw<{ name: string | null }[]>`SELECT nama_lengkap AS name FROM ref_users WHERE id_ref_user = ${envelope.actorKosipaUserId}`;
    return (row?.name ?? `console:${envelope.actorConsoleUserId}`).slice(0, 50);
  }

  /** Post-condition: the stored row equals the plan (catches truncation, coercion or a concurrent writer). Returns the stored row. */
  private async verify(tx: Prisma.TransactionClient, def: ProductMasterDefinition, id: number, values: ProductValues, active: boolean): Promise<Row> {
    const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectList(def)} FROM ${raw(def.table)} WHERE id = ${id}`);
    if (!row || isActive(def, row[def.status.column]) !== active || written(def).some((k) => !storedEquals(def, k, row[k] ?? null, values[k] ?? ''))) throw new KosipaError('POSTCONDITION_FAILED');
    return row;
  }

  private snapshot(def: ProductMasterDefinition, record: ProductRecord, keys: readonly string[]) {
    return ledgerSnapshot(productLedgerValues(def, record), ['id', ...keys, 'status']);
  }

  create(def: ProductMasterDefinition, envelope: CommandEnvelope, values: ProductValues): Promise<CommandOutcome<ProductResult>> {
    return this.run<{ rows: Row[]; facts: ProductFacts }>(def, envelope, {
      lock: async (tx) => ({ rows: await this.lockAll(tx, def), facts: await this.facts(tx, def) }),
      run: async (tx, locked) => {
        const planned = planProductCreate(def, values, locked.rows.map((r) => toRecord(def, r)), locked.facts);
        const columns = written(def);
        if (def.stamps === false) {
          await tx.$executeRaw(Prisma.sql`INSERT INTO ${raw(def.table)} (${Prisma.join(columns.map(raw))}, ${raw(def.status.column)})
            VALUES (${Prisma.join(columns.map((c) => Prisma.sql`${planned.values[c] ?? ''}`))}, ${statusValue(def, true)})`);
        } else {
          await tx.$executeRaw(Prisma.sql`INSERT INTO ${raw(def.table)} (${Prisma.join(columns.map(raw))}, ${raw(def.status.column)}, cd, cd_usr)
            VALUES (${Prisma.join(columns.map((c) => Prisma.sql`${planned.values[c] ?? ''}`))}, ${statusValue(def, true)}, ${JAKARTA_NOW}, ${await this.actorName(tx, envelope)})`);
        }
        const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        const stored = await this.verify(tx, def, Number(id), planned.values, true);
        const record = toRecord(def, stored);
        const ledger: LedgerFacts = { fromState: null, toState: 'ACTIVE', before: null, after: this.snapshot(def, record, written(def)) };
        return { result: toResult(def, stored), ledger };
      },
    });
  }

  update(def: ProductMasterDefinition, envelope: CommandEnvelope, id: number, values: ProductValues, expectedVersion: string, reason: string | undefined): Promise<CommandOutcome<ProductResult>> {
    return this.run<{ rows: Row[]; facts: ProductFacts }>(def, envelope, {
      lock: async (tx) => ({ rows: await this.lockAll(tx, def), facts: await this.facts(tx, def) }),
      run: async (tx, locked) => {
        const row = locked.rows.find((r) => Number(r.id) === id) ?? null;
        if (row && versionOf(def, row) !== expectedVersion) throw new KosipaError('STALE');
        const current = row ? toRecord(def, row) : null;
        const references = productNeedsReferenceCount(def, current, values) ? await this.references(tx, def, current!.values[def.codeKey] ?? '') : 0;
        const change = planProductUpdate(def, current, values, reason, locked.rows.map((r) => toRecord(def, r)), locked.facts, references);
        const sets = change.changed.map((k) => Prisma.sql`${raw(k)} = ${change.after.values[k] ?? ''}`);
        if (def.stamps !== false) {
          sets.push(Prisma.sql`ud = ${JAKARTA_NOW}`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        }
        if ((await tx.$executeRaw(Prisma.sql`UPDATE ${raw(def.table)} SET ${Prisma.join(sets)} WHERE id = ${id}`)) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        const stored = await this.verify(tx, def, id, change.after.values, change.after.active);
        const ledger: LedgerFacts = {
          fromState: change.before.active ? 'ACTIVE' : 'INACTIVE', toState: change.after.active ? 'ACTIVE' : 'INACTIVE', reason: change.reason ?? null,
          before: this.snapshot(def, change.before, change.changed), after: this.snapshot(def, change.after, change.changed),
        };
        return { result: toResult(def, stored), ledger };
      },
    });
  }

  setStatus(def: ProductMasterDefinition, envelope: CommandEnvelope, id: number, active: boolean, expectedVersion: string, reason: string): Promise<CommandOutcome<ProductResult>> {
    return this.run<Row | null>(def, envelope, {
      lock: async (tx) => (await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${selectList(def)} FROM ${raw(def.table)} WHERE id = ${id} FOR UPDATE`))[0] ?? null,
      run: async (tx, row) => {
        if (row && versionOf(def, row) !== expectedVersion) throw new KosipaError('STALE');
        const change = planProductStatus(def, row ? toRecord(def, row) : null, active);
        const sets = [Prisma.sql`${raw(def.status.column)} = ${statusValue(def, active)}`];
        if (def.stamps !== false) {
          sets.push(Prisma.sql`ud = ${JAKARTA_NOW}`, Prisma.sql`ud_usr = ${await this.actorName(tx, envelope)}`);
        }
        if ((await tx.$executeRaw(Prisma.sql`UPDATE ${raw(def.table)} SET ${Prisma.join(sets)} WHERE id = ${id}`)) !== 1) throw new KosipaError('POSTCONDITION_FAILED');
        const stored = await this.verify(tx, def, id, change.after.values, active);
        const ledger: LedgerFacts = { fromState: active ? 'INACTIVE' : 'ACTIVE', toState: active ? 'ACTIVE' : 'INACTIVE', reason, before: this.snapshot(def, change.before, []), after: this.snapshot(def, change.after, []) };
        return { result: toResult(def, stored), ledger };
      },
    });
  }
}
