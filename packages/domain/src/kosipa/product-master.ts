import { KosipaError, KosipaFieldError } from './errors.ts';
import { parseReason } from './command.ts';
import { sameMasterText } from './master.ts';

/**
 * KOSIPA product masters (WI-06 / F52, FA-03B T06): Jenis Simpanan, Jenis Pinjaman, Jenis Pembiayaan and Suku Bunga. Evidence and per-column contracts:
 * fa-03b/REMAINING_MASTERS_CONTRACT.md. Owner decisions: FD-32 (legacy parity: rates, fees, COA accounts and lock_1angsuran stay editable by one
 * authorized operator with a MANDATORY REASON and a UI warning; product codes immutable once referenced), FD-33 (the other eight masters are retired,
 * no native writer), FD-34 (Suku Bunga keyed by the consumed `field`, the reader ignores is_active).
 * Unlike the five reference masters (master.ts: code/name/remarks text only) these rows carry typed financial parameters, server-derived COA
 * descriptions, a reference to another master and (loan types) a one-level hierarchy, so they have their own rule set. Keys are the legacy column names.
 */
export const PRODUCT_MASTER_TYPES = ['jenis-simpanan', 'jenis-pinjaman', 'jenis-pembiayaan', 'suku-bunga', 'pinjaman-mobile'] as const;
export type ProductMasterType = (typeof PRODUCT_MASTER_TYPES)[number];

export type ProductFieldKind = 'code' | 'text' | 'decimal' | 'int' | 'enum' | 'flag' | 'coa' | 'financing' | 'parent';
export type ProductField = {
  key: string;
  label: string;
  kind: ProductFieldKind;
  required: boolean;
  /** text/code/coa/financing: column width (decimal: VARCHAR width when the column is text). */
  max?: number;
  /** decimal: DECIMAL(precision, scale) (or the scale a VARCHAR column is validated to). */
  precision?: number; scale?: number;
  /** int: inclusive range. */
  min?: number; maxValue?: number;
  options?: readonly string[];
  /** coa: the column receiving the DERIVED m_acc_coa.coa_desc, and its width (rejected, never truncated). */
  descColumn?: string; descMax?: number;
  /** FD-32: changing this field needs a reason (rates, fees, COA accounts, behaviour flags, limits). Labels do not. */
  financial?: boolean;
  /** code / unique keys: free | only while nothing stores it | fixed at creation. */
  change?: 'free' | 'unreferenced' | 'never';
  /** Unique among all rows (case-insensitive like the latin1 collation). */
  unique?: boolean;
  hint?: string;
};
export type ProductMasterDefinition = {
  type: ProductMasterType;
  /** Command / feature key (ledger grammar: lower case + underscore). */
  key: string;
  title: string;
  table: string;
  legacyController: string;
  status: { column: string; kind: 'int' | 'text' };
  fields: readonly ProductField[];
  /** The field other data stores (reference count before it may change). */
  codeKey: string;
  /** Columns elsewhere storing this master's code. */
  references: readonly { table: string; column: string }[];
  /** Legacy readers filter on these literal ids (`parent_id=1/2/3/4/28`): they stay roots. */
  fixedRoots?: readonly number[];
  deactivateEffect: string;
  /** Shown before a financial edit (FD-32 UI warning). */
  financialWarning?: string;
  stamps?: boolean;
};

const text = (key: string, label: string, max: number, required = false): ProductField => ({ key, label, kind: 'text', max, required });
const code = (key: string, max: number, change: 'unreferenced' | 'never', hint: string): ProductField => ({ key, label: 'Kode', kind: 'code', max, required: true, unique: true, change, hint });
const money = (key: string, label: string, precision = 18, scale = 2): ProductField => ({ key, label, kind: 'decimal', precision, scale, required: true, financial: true });
const coa = (key: string, label: string, descColumn: string, descMax: number, required: boolean): ProductField => ({ key, label, kind: 'coa', max: 50, required, descColumn, descMax, financial: true });
const RATE_WARNING = 'Layar dan laporan KOSIPA lama serta pinjaman/simpanan yang sedang berjalan membaca nilai master SAAT INI. Mengubah tarif, biaya, akun atau kunci angsuran juga mengubah tampilan dan perhitungan data lama yang memakai produk ini.';

export const PRODUCT_MASTER_DEFINITIONS: Readonly<Record<ProductMasterType, ProductMasterDefinition>> = {
  // Readers store jenis_simpanan_code and 13 legacy files hard-code the codes: the code is fixed at creation.
  'jenis-simpanan': {
    type: 'jenis-simpanan', key: 'jenis_simpanan', title: 'Master Jenis Simpanan', table: 'm_jenis_simpanan', legacyController: 'master/jenis_simpanan_c',
    status: { column: 'is_active', kind: 'int' }, codeKey: 'jenis_simpanan_code',
    references: [{ table: 'trans_simpanan', column: 'jenis_simpanan' }, { table: 'trans_simpanan_dtl', column: 'jenis_simpanan' }, { table: 'm_simpanan_aktif', column: 'jenis_simpanan' }],
    fields: [
      code('jenis_simpanan_code', 50, 'never', 'Tetap sejak dibuat: transaksi dan kode program KOSIPA lama menyimpan kode ini.'),
      text('jenis_simpanan_name', 'Nama', 50, true), text('jenis_simpanan_remarks', 'Keterangan', 150),
      { key: 'bunga_simpanan', label: 'Bunga simpanan (%)', kind: 'decimal', precision: 10, scale: 2, required: true, financial: true },
      coa('akun_code', 'Akun COA', 'akun_desc', 50, true),
      { key: 'is_active_tarik_deposito', label: 'Bisa ditarik sebagai deposito', kind: 'flag', required: true, financial: true },
    ],
    deactivateEffect: 'Tidak muncul lagi di pilihan produk simpanan baru; transaksi dan laporan lama tetap membaca kode dan akunnya.',
    financialWarning: RATE_WARNING,
  },
  // trans_pinjaman stores the code in jenis_pinjaman / jenis_potongan / bank_pembiaya; pinjaman_m reads lock_1angsuran at runtime.
  'jenis-pinjaman': {
    type: 'jenis-pinjaman', key: 'jenis_pinjaman', title: 'Master Jenis Pinjaman', table: 'm_jenis_pinjaman', legacyController: 'master/jenis_pinjaman_c',
    status: { column: 'is_active', kind: 'text' }, codeKey: 'jenis_pinjaman_code', fixedRoots: [1, 2, 3, 4, 28],
    references: [
      { table: 'trans_pinjaman', column: 'jenis_pinjaman' },
      { table: 'trans_pinjaman', column: 'jenis_potongan' },
      { table: 'trans_pinjaman', column: 'bank_pembiaya' },
      { table: 'trans_pinjaman_pengajuan', column: 'jenis_pinjaman' },
    ],
    fields: [
      code('jenis_pinjaman_code', 50, 'unreferenced', 'Tidak dapat diubah bila sudah dipakai pinjaman.'),
      text('jenis_pinjaman_name', 'Nama', 50, true), text('jenis_pinjaman_remarks', 'Keterangan', 150),
      { key: 'parent_id', label: 'Induk jenis', kind: 'parent', required: true, hint: 'Pilih "Jenis induk" untuk menjadikannya induk.' },
      { key: 'jenis_pembiayaan', label: 'Jenis pembiayaan', kind: 'financing', max: 150, required: true, financial: true },
      { key: 'jenis_bunga', label: 'Jenis bunga', kind: 'enum', options: ['Flat', 'Anuitas'], required: true, financial: true },
      money('biaya_asuransi', 'Biaya asuransi'), money('biaya_jasa', 'Biaya jasa'), money('biaya_admin', 'Biaya admin'),
      { key: 'biaya_bunga', label: 'Bunga (%)', kind: 'decimal', precision: 18, scale: 4, max: 50, required: true, financial: true },
      money('biaya_pinalty', 'Biaya penalti'),
      { key: 'tgl_tempo', label: 'Tanggal jatuh tempo', kind: 'int', min: 0, maxValue: 31, required: true, financial: true },
      { key: 'lock_1angsuran', label: 'Kunci 1 angsuran', kind: 'flag', required: true, financial: true },
      // 0 = not set: most real loan types store 0 and legacy only prints the value on the loan document (prn_pinjaman_doc.php "max N kali").
      { key: 'max_angsuran', label: 'Maks. angsuran (bulan)', kind: 'int', min: 0, maxValue: 360, required: true, financial: true, hint: '0 = tidak ditetapkan (hanya tercetak di dokumen pinjaman).' },
      money('max_pinjaman', 'Maks. pinjaman (Rp)'),
      coa('akun_code', 'Akun COA', 'akun_desc', 50, true), coa('akun_code_pembiayaan', 'Akun pembiayaan', 'akun_desc_pembiayaan', 200, false),
      coa('akun_code_pendapatan', 'Akun pendapatan', 'akun_desc_pendapatan', 200, false),
    ],
    deactivateEffect: 'Disembunyikan dari pilihan yang menyaring status aktif. Beberapa layar KOSIPA lama membaca jenis pinjaman tanpa melihat status, dan pinjaman yang sudah ada tetap memakai nilainya.',
    financialWarning: RATE_WARNING,
  },
  // trans_pinjaman.pembiayaan_code and m_jenis_pinjaman.jenis_pembiayaan store the code; lock_1angsuran is joined live by many loan screens.
  'jenis-pembiayaan': {
    type: 'jenis-pembiayaan', key: 'jenis_pembiayaan', title: 'Master Jenis Pembiayaan', table: 'm_jenis_pembiayaan', legacyController: 'master/jenis_pembiayaan_c',
    status: { column: 'is_active', kind: 'text' }, codeKey: 'pembiayaan_code',
    references: [{ table: 'trans_pinjaman', column: 'pembiayaan_code' }, { table: 'm_jenis_pinjaman', column: 'jenis_pembiayaan' }],
    fields: [
      code('pembiayaan_code', 50, 'unreferenced', 'Tidak dapat diubah bila sudah dipakai pinjaman atau jenis pinjaman.'),
      text('pembiayaan_name', 'Nama', 50, true), text('pembiayaan_remarks', 'Keterangan', 50),
      { key: 'jenis_bunga', label: 'Jenis bunga', kind: 'enum', options: ['Flat', 'Anuitas'], required: true, financial: true },
      money('biaya_asuransi', 'Biaya asuransi'), money('biaya_jasa', 'Biaya jasa', 18, 4), money('biaya_admin', 'Biaya admin'),
      money('biaya_bunga', 'Bunga (%)'), money('biaya_pinalty', 'Biaya penalti'),
      { key: 'tgl_tempo', label: 'Tanggal jatuh tempo', kind: 'int', min: 0, maxValue: 31, required: true, financial: true },
      coa('akun_code', 'Akun COA', 'akun_desc', 50, true),
      { key: 'lock_1angsuran', label: 'Kunci 1 angsuran', kind: 'flag', required: true, financial: true },
    ],
    deactivateEffect: 'Tidak muncul lagi untuk jenis pinjaman baru. Pinjaman yang sudah ada tetap membaca kunci angsuran produk ini, apa pun statusnya.',
    financialWarning: RATE_WARNING,
  },
  // Only reader: pinjaman_m get_nilai_field('tgl_tempo') — first row by `field`, is_active ignored (FD-34).
  'suku-bunga': {
    type: 'suku-bunga', key: 'suku_bunga', title: 'Master Suku Bunga', table: 'm_suku_bunga', legacyController: 'master/suku_bunga_c',
    status: { column: 'is_active', kind: 'int' }, codeKey: 'code_suku_bunga', references: [],
    fields: [
      { key: 'code_suku_bunga', label: 'Kode', kind: 'code', max: 50, required: true, unique: true, change: 'free' },
      text('desc_suku_bunga', 'Deskripsi', 50, true),
      { key: 'field', label: 'Parameter yang dibaca', kind: 'enum', options: ['tgl_tempo'], required: true, unique: true, change: 'never', hint: 'Satu baris per parameter; pinjaman membaca baris pertama untuk parameter ini.' },
      { key: 'nilai_persen', label: 'Nilai (tanggal 1–31)', kind: 'int', min: 1, maxValue: 31, required: true, financial: true },
      text('remarks_suku_bunga', 'Keterangan', 50),
    ],
    deactivateEffect: 'Tidak berpengaruh pada perhitungan: pembaca pinjaman KOSIPA mengabaikan status dan tetap memakai nilai baris ini.',
    financialWarning: 'Pinjaman baru membaca nilai ini saat dihitung. Mengubahnya mengubah tanggal jatuh tempo pinjaman berikutnya.',
  },
  // Pinjaman mobile: batas nominal, tenor, dan jasa yang dibaca aplikasi mobile anggota saat mengajukan pinjaman.
  'pinjaman-mobile': {
    type: 'pinjaman-mobile', key: 'pinjaman_mobile', title: 'Master Pinjaman Mobile', table: 'm_pinjaman_mobile', legacyController: 'mobile/pinjaman_mobile_c',
    status: { column: 'status', kind: 'int' }, codeKey: 'jenis_pinjaman',
    references: [{ table: 'trans_pinjaman_pengajuan', column: 'jenis_pinjaman' }],
    stamps: false,
    fields: [
      { key: 'jenis_pinjaman', label: 'Jenis Pinjaman', kind: 'code', max: 50, required: true, unique: true, change: 'unreferenced', hint: 'Nama jenis pinjaman mobile (contoh: PINJAMAN REGULAR, KASBON, PINJAMAN POT. DESEMBER).' },
      { key: 'min_nominal', label: 'Min. Nominal (Rp)', kind: 'int', min: 0, maxValue: 2_000_000_000, required: true, financial: true },
      { key: 'max_nominal', label: 'Maks. Nominal (Rp)', kind: 'int', min: 0, maxValue: 2_000_000_000, required: true, financial: true },
      { key: 'min_jw', label: 'Min. Tenor (Bulan)', kind: 'int', min: 1, maxValue: 120, required: true, financial: true },
      { key: 'max_jw', label: 'Maks. Tenor (Bulan)', kind: 'int', min: 1, maxValue: 120, required: true, financial: true },
      { key: 'jasa', label: 'Jasa/Bunga (%)', kind: 'decimal', precision: 10, scale: 2, required: true, financial: true },
    ],
    deactivateEffect: 'Tidak muncul lagi di dropdown pilihan pengajuan pinjaman pada aplikasi mobile anggota.',
    financialWarning: 'Mengubah nominal, tenor, atau jasa pinjaman mobile akan langsung mengubah batasan pengajuan baru pada aplikasi mobile.',
  },
};

export function parseProductMasterType(raw: string): ProductMasterDefinition {
  if (!(PRODUCT_MASTER_TYPES as readonly string[]).includes(raw)) throw new KosipaError('MASTER_TYPE_UNKNOWN');
  return PRODUCT_MASTER_DEFINITIONS[raw as ProductMasterType];
}
export const isProductMasterType = (raw: string): raw is ProductMasterType => (PRODUCT_MASTER_TYPES as readonly string[]).includes(raw);

export type ProductValues = Record<string, string>;
export type ProductRecord = { id: number; values: ProductValues; active: boolean };
export type ProductFacts = { coa: readonly { code: string; desc: string; group: boolean }[]; financing: readonly { code: string; active: boolean }[] };

/** Same character rule as the reference masters: printable ASCII only (latin1 tables, STRICT_TRANS_TABLES). */
const PRINTABLE = /^[\x20-\x7e]*$/;
const bad = (field: ProductField): never => { throw new KosipaFieldError('PRODUCT_FIELD_INVALID', field.key); };

/** '001.500' -> '1.5'; '0.00' -> '0'. Non-decimal input is returned unchanged (so a legacy garbage value never equals a valid one). */
export function canonicalDecimal(raw: string): string {
  if (!/^\d+(\.\d+)?$/.test(raw)) return raw;
  const [whole, fraction = ''] = raw.split('.');
  const w = whole.replace(/^0+(?=\d)/, ''), f = fraction.replace(/0+$/, '');
  return f ? `${w}.${f}` : w;
}

function parseField(field: ProductField, raw: unknown): string {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return bad(field);
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  // Accounts: real legacy rows store '' (or '0', or codes absent from the chart). Parsing keeps them so unrelated edits stay possible; a NEW row or a
  // CHANGED account must resolve in the chart (planProductCreate / planProductUpdate).
  if (!value) return field.required && field.kind !== 'coa' ? bad(field) : '';
  if (!PRINTABLE.test(value)) return bad(field);
  switch (field.kind) {
    case 'decimal': {
      const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
      if (!m || (m[2] ?? '').length > (field.scale ?? 0) || m[1].replace(/^0+(?=\d)/, '').length > (field.precision ?? 18) - (field.scale ?? 0)) return bad(field);
      const out = canonicalDecimal(value);
      return field.max !== undefined && out.length > field.max ? bad(field) : out;
    }
    case 'int': case 'parent': {
      if (!/^\d{1,10}$/.test(value)) return bad(field);
      const n = Number(value);
      if (n < (field.min ?? 0) || n > (field.maxValue ?? 2_147_483_647)) return bad(field);
      return String(n);
    }
    case 'flag': return value === '0' || value === '1' ? value : bad(field);
    case 'enum': return field.options?.includes(value) ? value : bad(field);
    default: return value.length > (field.max ?? 50) ? bad(field) : value;
  }
}

/** Every field of the definition, validated; any other key (status, derived descriptions, stamps, never-written legacy columns) is refused. */
export function parseProductValues(def: ProductMasterDefinition, raw: unknown): ProductValues {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new KosipaError('INVALID_INPUT');
  const body = raw as Record<string, unknown>;
  const keys = new Set(def.fields.map((f) => f.key));
  for (const k of Object.keys(body)) if (!keys.has(k)) throw new KosipaError('FIELD_NOT_ALLOWED');
  return Object.fromEntries(def.fields.map((f) => [f.key, parseField(f, body[f.key])]));
}

/** Stored-vs-new equality per kind: exact decimals compare canonically, numbers numerically, text exactly. */
function same(field: ProductField | undefined, a: string | undefined, b: string | undefined): boolean {
  const x = a ?? '', y = b ?? '';
  if (field?.kind === 'decimal') return canonicalDecimal(x) === canonicalDecimal(y);
  if ((field?.kind === 'int' || field?.kind === 'parent' || field?.kind === 'flag') && /^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) === Number(y);
  return x === y;
}

/** COA codes resolve to the canonical stored code and its description; the description is never taken from a client. */
function deriveCoa(def: ProductMasterDefinition, values: ProductValues, facts: ProductFacts, only?: ReadonlySet<string>): ProductValues {
  const out = { ...values };
  for (const f of def.fields) {
    if (f.kind !== 'coa' || !f.descColumn || (only && !only.has(f.key))) continue;
    const value = values[f.key] ?? '';
    if (!value) { out[f.descColumn] = ''; continue; }
    const hit = facts.coa.find((c) => sameMasterText(c.code, value));
    if (!hit) throw new KosipaFieldError('PRODUCT_COA_INVALID', f.key);
    if (hit.desc.length > (f.descMax ?? 50)) throw new KosipaFieldError('PRODUCT_COA_DESC_TOO_LONG', f.key);
    out[f.key] = hit.code; out[f.descColumn] = hit.desc;
  }
  return out;
}

function assertFinancing(def: ProductMasterDefinition, values: ProductValues, facts: ProductFacts): void {
  for (const f of def.fields) {
    if (f.kind !== 'financing') continue;
    if (!facts.financing.some((x) => x.active && sameMasterText(x.code, values[f.key] ?? ''))) throw new KosipaFieldError('PRODUCT_FINANCING_INVALID', f.key);
  }
}

/** One level: a parent is 0 (root) or an existing root that is not the row itself. */
function assertParent(value: string, rows: readonly ProductRecord[], selfId?: number): void {
  if (value === '0') return;
  const parent = rows.find((r) => r.id === Number(value));
  if (!parent || parent.id === selfId || (parent.values.parent_id ?? '0') !== '0') throw new KosipaFieldError('PRODUCT_PARENT_INVALID', 'parent_id');
}

function assertUnique(def: ProductMasterDefinition, values: ProductValues, others: readonly ProductRecord[], keys: readonly string[]): void {
  for (const f of def.fields) {
    if (!f.unique || !keys.includes(f.key)) continue;
    if (others.some((o) => sameMasterText(o.values[f.key] ?? '', values[f.key] ?? ''))) {
      if (f.key === def.codeKey) throw new KosipaError('MASTER_CODE_DUPLICATE');
      throw new KosipaFieldError('PRODUCT_FIELD_DUPLICATE', f.key);
    }
  }
}

/** New rows start active (the legacy forms' first option). `existing` = every row, read under the table lock. */
/** A required account may not be left empty on a new row or be changed to empty. */
function assertRequiredCoa(def: ProductMasterDefinition, values: ProductValues, keys: readonly string[]): void {
  for (const f of def.fields) if (f.kind === 'coa' && f.required && keys.includes(f.key) && !(values[f.key] ?? '')) throw new KosipaFieldError('PRODUCT_COA_INVALID', f.key);
}

export function planProductCreate(def: ProductMasterDefinition, input: ProductValues, existing: readonly ProductRecord[], facts: ProductFacts): { values: ProductValues; active: true } {
  assertRequiredCoa(def, input, def.fields.map((f) => f.key));
  assertUnique(def, input, existing, def.fields.map((f) => f.key));
  assertFinancing(def, input, facts);
  if (def.fields.some((f) => f.kind === 'parent')) assertParent(input.parent_id ?? '0', existing);
  return { values: deriveCoa(def, input, facts), active: true };
}

export type ProductChange = { before: ProductRecord; after: ProductRecord; changed: string[]; financial: boolean; reason?: string };

/** Whether this edit needs the (unindexed, possibly large) reference count: a changing code, or a changing parent. */
export function productNeedsReferenceCount(def: ProductMasterDefinition, current: ProductRecord | null, input: ProductValues): boolean {
  if (!current || !def.references.length) return false;
  const codeField = def.fields.find((f) => f.key === def.codeKey);
  const codeChanges = codeField?.change === 'unreferenced' && !same(codeField, current.values[def.codeKey], input[def.codeKey]);
  const parent = def.fields.find((f) => f.kind === 'parent');
  return codeChanges || (!!parent && !same(parent, current.values[parent.key], input[parent.key]));
}

/**
 * Edit of the locked row (the repository checks the version first). `references` = rows elsewhere storing the CURRENT code (0 when not counted).
 * FD-32: any change of a financial field needs a reason; label-only edits need none. COA descriptions are re-derived only for COA codes that change.
 */
export function planProductUpdate(def: ProductMasterDefinition, current: ProductRecord | null, input: ProductValues, rawReason: unknown, existing: readonly ProductRecord[], facts: ProductFacts, references: number): ProductChange {
  if (!current) throw new KosipaError('MASTER_NOT_FOUND');
  const byKey = new Map(def.fields.map((f) => [f.key, f]));
  const editedCoa = new Set(def.fields.filter((f) => f.kind === 'coa' && !same(f, current.values[f.key], input[f.key])).map((f) => f.key));
  assertRequiredCoa(def, input, [...editedCoa]);
  const after = deriveCoa(def, { ...current.values, ...input }, facts, editedCoa);
  const descColumns = def.fields.filter((f) => f.descColumn).map((f) => f.descColumn as string);
  const changed = [...def.fields.map((f) => f.key), ...descColumns].filter((k) => !same(byKey.get(k), current.values[k], after[k]));
  if (!changed.length) throw new KosipaError('NO_CHANGE');
  for (const k of changed) {
    const f = byKey.get(k);
    if (!f) continue;
    if (f.change === 'never') throw new KosipaFieldError('MASTER_FIELD_IMMUTABLE', k);
    if (k === def.codeKey && f.change === 'unreferenced' && references > 0) throw new KosipaError('MASTER_REFERENCED');
    if (f.kind === 'financing') assertFinancing(def, after, facts);
    if (f.kind === 'parent') {
      if (def.fixedRoots?.includes(current.id)) throw new KosipaFieldError('PRODUCT_PARENT_INVALID', k);
      if (after[k] !== '0' && existing.some((r) => r.id !== current.id && (r.values.parent_id ?? '') === String(current.id))) throw new KosipaFieldError('PRODUCT_PARENT_INVALID', k);
      assertParent(after[k], existing, current.id);
      if (references > 0) throw new KosipaFieldError('MASTER_REFERENCED', k);
    }
  }
  assertUnique(def, after, existing.filter((o) => o.id !== current.id), changed);
  const financial = changed.some((k) => byKey.get(k)?.financial || descColumns.includes(k));
  const reason = financial || rawReason !== undefined ? parseReason(rawReason) : undefined;
  return { before: current, after: { ...current, values: after }, changed, financial, ...(reason === undefined ? {} : { reason }) };
}

/** Deactivate / reactivate. Never a delete. */
export function planProductStatus(def: ProductMasterDefinition, current: ProductRecord | null, active: boolean): ProductChange {
  if (!current) throw new KosipaError('MASTER_NOT_FOUND');
  if (current.active === active) throw new KosipaError('NO_CHANGE');
  void def;
  return { before: current, after: { ...current, active }, changed: ['active'], financial: false };
}

/** Ledger snapshot of a product row: product parameters only (no personal data), each value capped. */
export function productLedgerValues(def: ProductMasterDefinition, record: ProductRecord): Record<string, string | number> {
  const keys = [...def.fields.map((f) => f.key), ...def.fields.filter((f) => f.descColumn).map((f) => f.descColumn as string)];
  return { id: record.id, ...Object.fromEntries(keys.map((k) => [k, (record.values[k] ?? '').slice(0, 200)])), status: record.active ? 1 : 0 };
}
