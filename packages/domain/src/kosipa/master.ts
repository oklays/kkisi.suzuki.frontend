import { KosipaError } from './errors.ts';

/**
 * KOSIPA reference masters (F52, spec REQ-129, TASK-114). One rule set, one definition per master. FA-01 shipped Master Lokasi;
 * FA-02 adds Bagian, Jenis Dokumen, Rekening Bank and Periode Angsuran. Evidence per master: fa-02/MASTER_SEMANTICS.md.
 *
 * Legacy facts (E1, kosipa/application/modules/master): every `<name>_c` ajax_add / ajax_update writes the posted values as they are
 * (no validation, no uniqueness) and ajax_delete hard-deletes without a reference check. Consumers store a master's VALUE, never its id:
 * members store the location / bagian NAME, bank loans store the bank CODE (trans_pinjaman.bank_pembiaya), loan terms are month numbers.
 * Native rules (class B, 05 §4):
 *   - required fields, printable ASCII (latin1 tables), column-derived limits;
 *   - unique fields compared like the tables' case-insensitive collation;
 *   - a field other data stores (`referenced`) never changes while referenced ('unreferenced'), or never at all ('never');
 *   - removal = deactivation with a reason; the legacy hard delete is not offered.
 */
export const MASTER_TYPES = ['lokasi', 'bagian', 'jenis-dokumen', 'rekening-bank', 'periode-angsuran'] as const;
export type MasterType = (typeof MASTER_TYPES)[number];
export type FieldKey = 'code' | 'name' | 'remarks';

export type FieldRule = {
  key: FieldKey;
  label: string;
  max: number;
  required: boolean;
  unique: boolean;
  /** free = editable; unreferenced = editable only while nothing stores it; never = fixed at creation. */
  change: 'free' | 'unreferenced' | 'never';
  /** months: a whole number of months 1..360 (VAL-104 term range). */
  format?: 'months';
};
export type MasterDefinition = {
  type: MasterType;
  /** Command / feature key (lower case, underscore: the ledger and audit grammar has no hyphen). */
  key: string;
  title: string;
  legacyController: string;
  fields: readonly FieldRule[];
  /** The field whose value other data stores (reference count before changing it). */
  referenced?: FieldKey;
  /** What deactivation means for users of the master (shown in the UI, recorded in the spec). */
  deactivateEffect: string;
};

const code = (max: number, change: FieldRule['change'], extra: Partial<FieldRule> = {}): FieldRule => ({ key: 'code', label: 'Kode', max, required: true, unique: true, change, ...extra });
const name = (max: number, unique: boolean, change: FieldRule['change'], label = 'Nama'): FieldRule => ({ key: 'name', label, max, required: true, unique, change });
const remarks: FieldRule = { key: 'remarks', label: 'Keterangan', max: 150, required: false, unique: false, change: 'free' };

export const MASTER_DEFINITIONS: Readonly<Record<MasterType, MasterDefinition>> = {
  // m_anggota.lokasi VARCHAR(100) and users.lokasi store the NAME.
  lokasi: { type: 'lokasi', key: 'lokasi', title: 'Master Lokasi', legacyController: 'master/lokasi_c', referenced: 'name',
    fields: [code(50, 'free'), name(100, true, 'unreferenced', 'Nama lokasi')], deactivateEffect: 'Tidak muncul lagi di formulir anggota baru; anggota yang sudah ada tetap menyimpan nama lokasinya.' },
  // m_anggota.bagian VARCHAR(100) and users.bagian store the NAME (member forms and the smartkkisi app list status=1 rows).
  bagian: { type: 'bagian', key: 'bagian', title: 'Master Bagian', legacyController: 'master/bagian_c', referenced: 'name',
    fields: [name(100, true, 'unreferenced', 'Nama bagian')], deactivateEffect: 'Tidak muncul lagi di formulir anggota dan aplikasi anggota; anggota yang sudah ada tetap menyimpan nama bagiannya.' },
  // No KOSIPA screen reads the table (loan document forms use a fixed list); kept as reference data.
  'jenis-dokumen': { type: 'jenis-dokumen', key: 'jenis_dokumen', title: 'Master Jenis Dokumen', legacyController: 'master/jenis_dokumen_c',
    fields: [code(20, 'free'), name(50, false, 'free', 'Deskripsi'), remarks], deactivateEffect: 'Ditandai tidak aktif; tidak ada transaksi yang membaca master ini.' },
  // trans_pinjaman.bank_pembiaya stores the CODE (bank loan form lists is_active='1' rows).
  'rekening-bank': { type: 'rekening-bank', key: 'rekening_bank', title: 'Master Rekening Bank', legacyController: 'master/rekening_bank_c', referenced: 'code',
    fields: [code(20, 'unreferenced'), name(50, false, 'free', 'Deskripsi'), remarks], deactivateEffect: 'Tidak muncul lagi di formulir pinjaman bank baru; pinjaman yang sudah ada tetap menyimpan kode banknya.' },
  // The code is a number of months; loans store the term as a number. Fixed at creation so no existing meaning can change.
  'periode-angsuran': { type: 'periode-angsuran', key: 'periode_angsuran', title: 'Master Periode Angsuran', legacyController: 'master/periode_angsuran_c', referenced: 'code',
    fields: [code(3, 'never', { format: 'months', label: 'Jumlah bulan' }), name(50, false, 'free', 'Deskripsi'), remarks], deactivateEffect: 'Ditandai tidak aktif; pinjaman yang sudah ada tidak berubah.' },
};

export function parseMasterType(raw: string): MasterDefinition {
  if (!(MASTER_TYPES as readonly string[]).includes(raw)) throw new KosipaError('MASTER_TYPE_UNKNOWN');
  return MASTER_DEFINITIONS[raw as MasterType];
}

const MAX_ID = 2_147_483_647;
/** VAL-112: identifiers in URLs are parsed before any query. */
export function parseMasterId(raw: string): number {
  if (!/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > MAX_ID) throw new KosipaError('MASTER_ID_INVALID');
  return Number(raw);
}

export type MasterValues = Partial<Record<FieldKey, string>>;
export type MasterRecord = { id: number; values: MasterValues; active: boolean };

/** The tables are latin1: printable ASCII only, so no value can fail the charset conversion under STRICT_TRANS_TABLES. */
const PRINTABLE = /^[\x20-\x7e]*$/;
const fieldCode = (key: FieldKey) => `MASTER_${key.toUpperCase()}_INVALID`;

function text(rule: FieldRule, raw: unknown): string {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw new KosipaError(fieldCode(rule.key));
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if ((rule.required && !value) || value.length > rule.max || !PRINTABLE.test(value)) throw new KosipaError(fieldCode(rule.key));
  if (rule.format === 'months' && (!/^[1-9]\d{0,2}$/.test(value) || Number(value) > 360)) throw new KosipaError(fieldCode(rule.key));
  return value;
}

/** Every field of the definition, validated. Fields that are not part of the definition are refused by the caller's body check. */
export function parseMasterValues(def: MasterDefinition, body: Record<string, unknown>): MasterValues {
  const out: MasterValues = {};
  for (const rule of def.fields) out[rule.key] = text(rule, body[rule.key]);
  return out;
}

/** latin1_swedish_ci equality as far as these values reach: case-insensitive, trailing spaces ignored (values are trimmed). */
export const sameMasterText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Optimistic version of a row (these tables have no reliable update timestamp): two FNV-1a 32 passes over every column the form shows.
 * A form saved against an older version is refused as STALE instead of overwriting someone else's change.
 */
export function masterVersion(def: MasterDefinition, record: MasterRecord): string {
  const text = [record.id, ...def.fields.map((f) => record.values[f.key] ?? ''), record.active ? 1 : 0].join('\u0000');
  const fnv = (offset: number) => {
    let hash = offset;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

export function parseVersion(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{16}$/.test(raw)) throw new KosipaError('VERSION_INVALID');
  return raw;
}

function assertUnique(def: MasterDefinition, candidate: MasterValues, others: readonly MasterRecord[], keys: readonly FieldKey[]): void {
  for (const rule of def.fields) {
    if (!rule.unique || !keys.includes(rule.key)) continue;
    const value = candidate[rule.key] ?? '';
    if (others.some((o) => sameMasterText(o.values[rule.key] ?? '', value))) throw new KosipaError(`MASTER_${rule.key.toUpperCase()}_DUPLICATE`);
  }
}

/** New rows start active, like the legacy forms' default option. `existing` = every row, read under the table lock. */
export function planMasterCreate(def: MasterDefinition, input: MasterValues, existing: readonly MasterRecord[]): { values: MasterValues; active: true } {
  assertUnique(def, input, existing, def.fields.map((f) => f.key));
  return { values: input, active: true };
}

export type MasterChange = { before: MasterRecord; after: MasterRecord; changed: (FieldKey | 'active')[] };

/**
 * Edit on the locked row. `references` = rows elsewhere that store the CURRENT value of `def.referenced` (only needed when that field
 * changes). Uniqueness is judged only for fields that actually change, so a pre-existing legacy duplicate never blocks an unrelated edit.
 */
export function planMasterUpdate(def: MasterDefinition, current: MasterRecord | null, input: MasterValues, expectedVersion: string, existing: readonly MasterRecord[], references: number): MasterChange {
  if (!current) throw new KosipaError('MASTER_NOT_FOUND');
  if (masterVersion(def, current) !== expectedVersion) throw new KosipaError('STALE');
  const changed = def.fields.filter((f) => (input[f.key] ?? '') !== (current.values[f.key] ?? ''));
  if (!changed.length) throw new KosipaError('NO_CHANGE');
  for (const rule of changed) {
    if (rule.change === 'never') throw new KosipaError('MASTER_FIELD_IMMUTABLE');
    if (rule.change === 'unreferenced' && rule.key === def.referenced && references > 0) throw new KosipaError('MASTER_REFERENCED');
  }
  assertUnique(def, input, existing.filter((o) => o.id !== current.id), changed.map((f) => f.key));
  return { before: current, after: { ...current, values: { ...current.values, ...input } }, changed: changed.map((f) => f.key) };
}

/** Whether a change of the referenced field needs the reference count (avoids scanning large tables otherwise). */
export function needsReferenceCount(def: MasterDefinition, current: MasterRecord | null, input: MasterValues): boolean {
  if (!current || !def.referenced) return false;
  const rule = def.fields.find((f) => f.key === def.referenced);
  return rule?.change === 'unreferenced' && (input[def.referenced] ?? '') !== (current.values[def.referenced] ?? '');
}

/** Deactivate (hidden from new forms; existing references keep their value) or reactivate. Never a delete. */
export function planMasterStatus(def: MasterDefinition, current: MasterRecord | null, active: boolean, expectedVersion: string): MasterChange {
  if (!current) throw new KosipaError('MASTER_NOT_FOUND');
  if (masterVersion(def, current) !== expectedVersion) throw new KosipaError('STALE');
  if (current.active === active) throw new KosipaError('NO_CHANGE');
  return { before: current, after: { ...current, active }, changed: ['active'] };
}

/** Ledger fields of a master row: reference data only, no personal data. */
export const masterLedgerValues = (record: MasterRecord): Record<string, string | number> => ({ id: record.id, ...record.values, status: record.active ? 1 : 0 });
export const MASTER_LEDGER_FIELDS = ['id', 'code', 'name', 'remarks', 'status'] as const;
