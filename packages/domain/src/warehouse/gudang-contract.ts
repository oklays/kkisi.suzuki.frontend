import { typeFamily, type EvidenceBundle, type Finding, type Gate, type GateStatus, type TypeFamily } from '../kosipa/schema-contract.ts';

/**
 * What the Warehouse domain needs from the (still unverified) Gudang schema, expressed as ROLES. No Gudang table or column is assumed: the operator evidence
 * bundle says what exists, and a reviewed MAPPING file (engineer + process owner) says which real column plays which role. The validator checks that every
 * mapped column exists, has a usable type, and that the uniqueness the domain relies on is backed by a key. An adapter is eligible only when its roles pass.
 */
export type GudangRoleId =
  | 'ITEM_ID' | 'ITEM_CODE' | 'ITEM_BARCODE' | 'ITEM_NAME' | 'ITEM_UNIT' | 'ITEM_ACTIVE'
  | 'STOCK_ITEM_ID' | 'STOCK_QTY' | 'STOCK_WAREHOUSE'
  | 'DOC_ID' | 'DOC_NO' | 'DOC_STATUS' | 'DOC_DATE' | 'DOC_STORE_REF'
  | 'LINE_DOC_ID' | 'LINE_NO' | 'LINE_ITEM_ID' | 'LINE_QTY' | 'LINE_UNIT'
  | 'STORE_ID' | 'STORE_NAME';
export type GudangRole = { id: GudangRoleId; group: 'item' | 'stock' | 'document' | 'line' | 'store'; required: boolean; families: TypeFamily[]; unique: 'key' | 'recommended' | null; why: string };

export const GUDANG_ROLES: readonly GudangRole[] = [
  { id: 'ITEM_ID', group: 'item', required: true, families: ['int', 'string'], unique: 'key', why: 'stable Gudang item identity (never assumed equal to a TOKO id)' },
  { id: 'ITEM_CODE', group: 'item', required: true, families: ['string'], unique: 'recommended', why: 'exact item-code match for mapping suggestions' },
  { id: 'ITEM_BARCODE', group: 'item', required: false, families: ['string'], unique: null, why: 'exact barcode match (preferred suggestion basis); absence limits suggestions to the code' },
  { id: 'ITEM_NAME', group: 'item', required: false, families: ['string'], unique: null, why: 'display only: products are never matched by name' },
  { id: 'ITEM_UNIT', group: 'item', required: true, families: ['string', 'int'], unique: null, why: 'unit of measure (decision D9: ratios are approved, never inferred)' },
  { id: 'ITEM_ACTIVE', group: 'item', required: true, families: ['int', 'enum', 'string'], unique: null, why: 'inactive items must be refused' },
  { id: 'STOCK_ITEM_ID', group: 'stock', required: true, families: ['int', 'string'], unique: null, why: 'which item a stock record belongs to' },
  { id: 'STOCK_QTY', group: 'stock', required: true, families: ['int', 'decimal'], unique: null, why: 'quantity on hand (source-side timing and ownership need the process owner)' },
  { id: 'STOCK_WAREHOUSE', group: 'stock', required: false, families: ['int', 'string'], unique: null, why: 'per-warehouse / per-company stock scope' },
  { id: 'DOC_ID', group: 'document', required: true, families: ['int', 'string'], unique: 'key', why: 'stable dispatch document identity -> sourceRef' },
  { id: 'DOC_NO', group: 'document', required: true, families: ['string'], unique: 'recommended', why: 'human document number' },
  { id: 'DOC_STATUS', group: 'document', required: true, families: ['string', 'enum', 'int'], unique: null, why: 'existing statuses (which one means dispatched)' },
  { id: 'DOC_DATE', group: 'document', required: true, families: ['date', 'datetime'], unique: null, why: 'document date' },
  { id: 'DOC_STORE_REF', group: 'document', required: true, families: ['int', 'string'], unique: null, why: 'link from the document to the destination store/customer' },
  { id: 'LINE_DOC_ID', group: 'line', required: true, families: ['int', 'string'], unique: null, why: 'line -> document' },
  { id: 'LINE_NO', group: 'line', required: true, families: ['int'], unique: null, why: 'line identity together with the document (a unique key over both is required)' },
  { id: 'LINE_ITEM_ID', group: 'line', required: true, families: ['int', 'string'], unique: null, why: 'line -> item' },
  { id: 'LINE_QTY', group: 'line', required: true, families: ['int', 'decimal'], unique: null, why: 'dispatched quantity' },
  { id: 'LINE_UNIT', group: 'line', required: false, families: ['string', 'int'], unique: null, why: 'line unit when it can differ from the item unit' },
  { id: 'STORE_ID', group: 'store', required: true, families: ['int', 'string'], unique: 'key', why: 'how a destination store appears in Gudang' },
  { id: 'STORE_NAME', group: 'store', required: false, families: ['string'], unique: null, why: 'display only: stores are never matched by name' },
];
export type GudangMapping = { version: 1; roles: Partial<Record<GudangRoleId, { table: string; column: string }>>; note?: string };

const norm = (s: string) => s.toLowerCase();
const f = (level: Finding['level'], code: string, subject: string, message: string): Finding => ({ level, code, subject, message });

/** Adapters become eligible per capability, only when every REQUIRED role of the groups it needs passes. */
export const GUDANG_ADAPTERS: readonly { id: string; groups: GudangRole['group'][]; title: string }[] = [
  { id: 'ITEM_CATALOG', groups: ['item'], title: 'Gudang item catalog (ItemCatalog.gudangItems)' },
  { id: 'STOCK_READER', groups: ['item', 'stock'], title: 'Gudang stock read (availability presentation)' },
  { id: 'DISPATCH_READER', groups: ['item', 'document', 'line', 'store'], title: 'Gudang dispatch document reader (registerDispatch source)' },
];

export function validateGudangMapping(bundle: EvidenceBundle | null, mapping: GudangMapping | null): { gates: Gate[]; eligibleAdapters: string[]; blockedAdapters: { adapter: string; because: string[] }[]; notes: string[] } {
  const perRole = new Map<GudangRoleId, Finding[]>(); const notes: string[] = [];
  for (const role of GUDANG_ROLES) {
    const out: Finding[] = []; perRole.set(role.id, out);
    const m = mapping?.roles[role.id];
    if (!m) { out.push(f(role.required ? 'blocker' : 'warning', role.required ? 'ROLE_UNMAPPED' : 'OPTIONAL_UNMAPPED', role.id, mapping ? `no column mapped: ${role.why}` : 'no mapping file provided')); continue; }
    if (!bundle) { out.push(f('blocker', 'NO_EVIDENCE', role.id, 'no Gudang evidence bundle provided')); continue; }
    const col = bundle.columns.find((c) => norm(c.table) === norm(m.table) && norm(c.column) === norm(m.column));
    if (!col) { out.push(f('blocker', 'COLUMN_NOT_IN_EVIDENCE', `${role.id} -> ${m.table}.${m.column}`, 'the mapped column does not exist in the evidence')); continue; }
    const fam = typeFamily(col.type);
    if (!role.families.includes(fam)) { out.push(f('blocker', 'TYPE_UNUSABLE', `${role.id} -> ${m.table}.${m.column}`, `type ${col.type} (${fam}) cannot play this role; expected ${role.families.join(' or ')}`)); continue; }
    if (role.unique) {
      const unique = bundle.indexes.some((i) => i.unique && norm(i.table) === norm(m.table) && i.columns.length === 1 && norm(i.columns[0]) === norm(m.column));
      if (!unique) out.push(f(role.unique === 'key' ? 'blocker' : 'warning', 'NOT_UNIQUE', `${role.id} -> ${m.table}.${m.column}`, role.unique === 'key' ? 'no single-column PRIMARY/UNIQUE key: the domain relies on this identity being unique' : 'no unique key: exact-match suggestions may be ambiguous (the domain reports ambiguity, never picks)'));
    }
    if ((role.id === 'STOCK_QTY' || role.id === 'LINE_QTY') && fam === 'decimal') { const s = /,\s*(\d+)\s*\)/.exec(col.type); if (s && Number(s[1]) > 0) out.push(f('warning', 'FRACTIONAL_QUANTITY_STORABLE', `${role.id} -> ${m.table}.${m.column}`, `type ${col.type} can hold fractions: decision D10 (whole units only today) must be confirmed against real data`)); }
    if (!out.some((x) => x.level === 'blocker')) out.push(f('ok', 'ROLE_OK', role.id, `${m.table}.${m.column} (${col.type})`));
  }
  // same-table coherence per group and the composite line key
  for (const group of ['item', 'stock', 'document', 'line', 'store'] as const) {
    const tables = new Set(GUDANG_ROLES.filter((r) => r.group === group).map((r) => mapping?.roles[r.id]?.table).filter((t): t is string => !!t).map(norm));
    if (tables.size > 1) perRole.get(GUDANG_ROLES.find((r) => r.group === group && mapping?.roles[r.id])!.id)!.push(f('blocker', 'GROUP_SPLIT_ACROSS_TABLES', group, `roles of the "${group}" group are mapped to ${tables.size} different tables (${[...tables].join(', ')}): a join would be needed; review the mapping`));
  }
  const ld = mapping?.roles.LINE_DOC_ID, ln = mapping?.roles.LINE_NO;
  if (ld && ln && bundle) {
    const key = bundle.indexes.some((i) => i.unique && norm(i.table) === norm(ld.table) && i.columns.length === 2 && new Set(i.columns.map(norm)).size === 2 && i.columns.map(norm).includes(norm(ld.column)) && i.columns.map(norm).includes(norm(ln.column)));
    const single = bundle.indexes.some((i) => i.unique && norm(i.table) === norm(ld.table) && i.columns.length === 1);   // a surrogate line id is also acceptable
    if (!key && !single) perRole.get('LINE_NO')!.push(f('blocker', 'LINE_KEY_MISSING', 'LINE_DOC_ID + LINE_NO', 'no unique key over (document, line number) and no surrogate line id: a line cannot be identified stably for idempotent receiving'));
  }
  if (!mapping?.roles.ITEM_BARCODE) notes.push('No barcode role: mapping suggestions would rest on the item code only; products are still never matched by name.');
  if (!mapping?.roles.LINE_UNIT) notes.push('No line unit role: the item unit is assumed for every line; confirm that lines cannot carry a different unit (D9).');

  const gates: Gate[] = ['item', 'stock', 'document', 'line', 'store'].map((group) => {
    const roles = GUDANG_ROLES.filter((r) => r.group === group); const findings = roles.flatMap((r) => perRole.get(r.id) ?? []);
    const st: GateStatus = findings.some((x) => x.level === 'blocker') ? (findings.some((x) => x.level === 'ok') ? 'PARTIAL' : 'BLOCKED') : 'ELIGIBLE';
    return { id: `GU-${group.toUpperCase()}`, title: `Gudang ${group} roles`, status: st, unlocks: GUDANG_ADAPTERS.filter((a) => a.groups.includes(group as GudangRole['group'])).map((a) => a.id), findings };
  });
  const status = new Map(gates.map((g) => [g.id.slice(3).toLowerCase(), g.status]));
  const eligibleAdapters: string[] = []; const blockedAdapters: { adapter: string; because: string[] }[] = [];
  for (const a of GUDANG_ADAPTERS) {
    const bad = a.groups.filter((g) => status.get(g) !== 'ELIGIBLE');
    if (bad.length === 0) eligibleAdapters.push(a.id); else blockedAdapters.push({ adapter: a.id, because: bad.flatMap((g) => gates.find((x) => x.id === `GU-${g.toUpperCase()}`)!.findings.filter((y) => y.level === 'blocker').map((y) => `${y.code} ${y.subject}`)) });
  }
  return { gates, eligibleAdapters, blockedAdapters, notes };
}

export function renderGudangReport(r: ReturnType<typeof validateGudangMapping>, schema: string | null): string {
  const out = ['# Gudang schema integration readiness', '', `Schema: \`${schema ?? 'no evidence provided'}\`. Identifiers and statuses only.`, '', '| Group | Status | Adapters it feeds |', '|---|---|---|'];
  for (const g of r.gates) out.push(`| ${g.id} | **${g.status}** | ${g.unlocks.join(', ')} |`);
  for (const g of r.gates) { out.push('', `## ${g.id}: ${g.status}`, ''); for (const x of g.findings) out.push(`- [${x.level}] \`${x.code}\` ${x.subject}: ${x.message}`); }
  out.push('', '## Adapters that become eligible', '', ...(r.eligibleAdapters.length ? r.eligibleAdapters.map((a) => `- ${a}`) : ['- none']), '', '## Still blocked', '', ...(r.blockedAdapters.length ? r.blockedAdapters.map((a) => `- ${a.adapter}: ${a.because.slice(0, 12).join('; ')}`) : ['- none']), '', '## Notes', '', ...(r.notes.length ? r.notes.map((n) => `- ${n}`) : ['- none']), '');
  return out.join('\n');
}
