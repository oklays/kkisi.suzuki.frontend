import { PAYROLL_COMPONENT_COLUMNS } from './payroll-read.ts';

/**
 * Schema evidence validation (checkpoint 11, TASK-003 / WH-EVID). Pure functions over a REVIEWED, operator-supplied evidence bundle (metadata only: no table
 * data). They decide, without inventing anything, which implemented reads are still compatible with the real schema and which blocked tasks become
 * ELIGIBLE. Missing, stubbed or incompatible evidence keeps a gate BLOCKED. The report contains identifiers, booleans and fingerprints only: never a
 * definition body, a definer, a credential or a row.
 */
export type EvidenceColumn = { table: string; column: string; type: string; nullable?: boolean };
export type EvidenceIndex = { table: string; index: string; unique: boolean; columns: string[] };
export type EvidenceView = { name: string; definition: string | null };
export type EvidenceRoutine = { name: string; type: 'PROCEDURE' | 'FUNCTION'; definition: string | null };
export type EvidenceTrigger = { name: string; table: string; event: string; timing: string };
export type EvidenceBundle = {
  version: 1; schema: string; capturedAt?: string;
  columns: EvidenceColumn[]; indexes: EvidenceIndex[]; views: EvidenceView[]; routines: EvidenceRoutine[]; triggers: EvidenceTrigger[];
  server?: { version?: string; sqlMode?: string; maxUserConnections?: number | null };
};

// ---------------------------------------------------------------------------------------------------------------------------- helpers
export type TypeFamily = 'int' | 'decimal' | 'double' | 'string' | 'date' | 'datetime' | 'enum' | 'other';
export function typeFamily(columnType: string): TypeFamily {
  const t = columnType.trim().toLowerCase();
  if (/^(tinyint|smallint|mediumint|int|integer|bigint)\b/.test(t)) return 'int';
  if (/^(decimal|numeric)\b/.test(t)) return 'decimal';
  if (/^(double|float|real)\b/.test(t)) return 'double';
  if (/^(varchar|char|text|tinytext|mediumtext|longtext)\b/.test(t)) return 'string';
  if (/^date\b/.test(t)) return 'date';
  if (/^(datetime|timestamp)\b/.test(t)) return 'datetime';
  if (/^enum\b/.test(t)) return 'enum';
  return 'other';
}
const decimalScale = (columnType: string): number | null => { const m = /^(?:decimal|numeric)\(\s*\d+\s*,\s*(\d+)\s*\)/i.exec(columnType.trim()); return m ? Number(m[1]) : null; };
const norm = (s: string) => s.toLowerCase();
/** Non-cryptographic fingerprint (cyrb53) so a definition can be referred to and compared without its text ever entering the report. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
/** A view / routine "definition" that is really a stub (the 30 Sep dump exports views as `SELECT NULL AS …`) or empty carries no evidence. */
export function isStubDefinition(definition: string | null | undefined): boolean {
  if (definition === null || definition === undefined) return true;
  const d = definition.trim();
  if (d.length < 20) return true;
  const lower = d.toLowerCase().replace(/\s+/g, ' ');
  const hasRealFrom = /\bfrom\s+(?!dual\b)[`\w]/.test(lower);
  return /^select (?:(?:null|\d+) as [`'"\w]+,? ?)+/.test(lower) && !hasRealFrom;
}
/** Identifiers after FROM / JOIN (schema prefix and quotes removed), nothing else. A hint for dependency review, not a parser. */
export function referencedTables(definition: string): string[] {
  const out = new Set<string>();
  for (const m of definition.matchAll(/\b(?:from|join)\s+(?:`?[\w$]+`?\.)?`?([\w$]+)`?/gi)) { const t = m[1]; if (!/^(select|dual|lateral|\(|as)$/i.test(t)) out.add(norm(t)); }
  return [...out].sort();
}

// ----------------------------------------------------------------------------------------------------------------------- table contract
type Req = { column: string; family: TypeFamily[]; why: string };
const ID = (c: string, why = 'key'): Req => ({ column: c, family: ['int'], why });
const STR = (c: string, why: string): Req => ({ column: c, family: ['string', 'enum'], why });
const AMT = (c: string, why: string): Req => ({ column: c, family: ['decimal', 'double'], why });
const DTE = (c: string, why: string): Req => ({ column: c, family: ['date', 'datetime'], why });
const COUNT = (c: string, why: string): Req => ({ column: c, family: ['int'], why });

/** Columns the implemented read adapters select (kosipa-*.repository.ts). A missing column or a changed type family would break a read or change what it means. */
export const KOSIPA_TABLE_CONTRACT: Readonly<Record<string, Req[]>> = {
  m_anggota: [ID('id'), STR('nik_kar', 'member key'), STR('nama_kar', 'name'), STR('kd_group', 'group'), STR('status_anggota', 'status'), STR('status_karyawan', 'employment'), DTE('tgl_keluar', 'exit date'), DTE('tgl_daftar', 'joined'), STR('divisi', 'division'), STR('bagian', 'section'), STR('no_telp', 'phone (masked)'), STR('email', 'email (masked)'), STR('no_rek', 'account (masked)'), STR('bank_rek', 'bank'), AMT('limit_toko', 'store limit'), AMT('gaji_minus', 'negative salary flag'), AMT('limit_ppob', 'ppob limit')],
  trans_simpanan: [ID('id'), STR('doc_no', 'document'), DTE('doc_date', 'date'), STR('doc_status', 'authoritative status'), STR('jenis_simpanan', 'type'), STR('jenis_transaksi', 'kind')],
  trans_simpanan_dtl: [ID('id'), STR('doc_no', 'document'), STR('nik_kar', 'member'), STR('jenis_simpanan', 'type'), AMT('kredit', 'credit'), AMT('kredit_cash', 'cash credit'), AMT('debit', 'debit'), AMT('jasa_kredit', 'interest'), STR('doc_status', 'detail status (not authoritative)'), STR('remark_detail', 'remark')],
  trans_pinjaman: [ID('id'), STR('doc_no', 'document'), DTE('doc_date', 'date'), STR('nik', 'member'), STR('nama', 'name'), STR('jenis_pinjaman', 'type'), STR('jenis_suku_bunga', 'method'), STR('biaya_suku_bunga', 'rate'), AMT('plan_pinjaman', 'principal'), AMT('actual_pinjaman', 'actual principal'), AMT('plan_angsuran', 'installment'), AMT('actual_angsuran', 'actual installment'), COUNT('plan_jangka_waktu', 'months'), COUNT('actual_jangka_waktu', 'actual months'), DTE('awal_pinjaman', 'start'), DTE('akhir_pinjaman', 'end'), DTE('tgl_pencairan', 'disbursed'), AMT('nominal_pencairan', 'disbursed amount'), AMT('biaya_admin', 'admin fee'), AMT('biaya_asuransi', 'insurance'), AMT('total_potongan', 'deduction'), AMT('total_diterima', 'received'), STR('doc_status', 'status'), STR('status_pencairan', 'disbursement status'), STR('status_bayar', 'repayment status'), STR('pelunasan_status', 'settlement'), DTE('pelunasan_date', 'settlement date'), AMT('pelunasan_total', 'settlement total'), STR('status_roll_over', 'rollover')],
  trans_pinjaman_dtl: [ID('id'), STR('doc_no', 'loan document'), STR('nik_kar', 'member'), COUNT('ke_cicilan', 'installment no'), DTE('tgl_cicilan', 'due date'), AMT('pokok_cicilan', 'principal'), AMT('bunga_cicilan', 'interest'), AMT('angsuran_cicilan', 'installment'), DTE('tgl_bayar', 'paid date'), STR('status_cicilan', 'status'), STR('type_cicilan', 'type'), COUNT('blokir', 'blocked'), COUNT('rool_over', 'rollover'), STR('doc_no_cicilan', 'installment document')],
  trans_potongan_bulanan: [ID('id'), STR('doc_no', 'batch'), DTE('doc_date', 'document date'), STR('doc_status', 'status'), DTE('periode_potongan', 'period date'), AMT('total', 'header total'), STR('periode_bl', 'month'), STR('periode_th', 'year'), STR('kd_group', 'group'), DTE('tgl_cair', 'cash date'), AMT('total_cair', 'cash total'), STR('cd_usr', 'creator'), STR('ud_usr', 'updater')],
  trans_potongan_matrix: [ID('id'), STR('periode', 'batch document'), STR('nik_kar', 'member'), STR('nama', 'name'), STR('kd_group', 'group'), AMT('total_potongan', 'recorded total'), AMT('potongan_toko', 'store subtotal'), ...PAYROLL_COMPONENT_COLUMNS.map((c) => AMT(c, 'deduction component'))],
  db_sales: [ID('id'), ID('company_id', 'branch'), STR('nik_kar', 'member'), STR('payment_type', 'Kredit'), STR('sales_status', 'Final'), DTE('sales_date', 'date'), AMT('grand_total', 'total')],
  db_salesreturn: [ID('id'), ID('company_id', 'branch'), ID('sales_id', 'sale'), AMT('grand_total', 'amount'), STR('payment_type', 'Kredit'), STR('return_status', 'Return'), COUNT('status', 'active flag')],
};

export type Finding = { level: 'ok' | 'blocker' | 'warning' | 'info'; code: string; subject: string; message: string };
export type GateStatus = 'ELIGIBLE' | 'BLOCKED' | 'PARTIAL';
export type Gate = { id: string; title: string; status: GateStatus; unlocks: string[]; findings: Finding[]; level?: EvidenceLevel; levels?: LevelState[] };

/**
 * Evidence levels for the FINANCIAL gates (checkpoint 12). Each level unlocks only its own tasks; metadata can prove at most level 3.
 *   1 OBJECT_EXISTS          the named view/procedure is present
 *   2 SHAPE_COMPATIBLE       every table it references passes the column/type contract (G1)
 *   3 DEFINITION_AVAILABLE   a real (non-stub) body, fingerprinted — engineering may READ and analyse it, nothing more
 *   4 SEMANTICS_VERIFIED     operator-supplied, reviewed test cases bound to THAT fingerprint ran in an isolated sanitized environment with no failure
 *   5 PARITY_ACCEPTED        a representative parity comparison has zero unexplained differences and is signed off by the data owner
 * A movement sum or an instalment-schedule sum is never an official balance at any level; official figures need level 5.
 */
export type EvidenceLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const EVIDENCE_LEVELS = ['NONE', 'OBJECT_EXISTS', 'SHAPE_COMPATIBLE', 'DEFINITION_AVAILABLE', 'SEMANTICS_VERIFIED', 'PARITY_ACCEPTED'] as const;
export type LevelState = { level: Exclude<EvidenceLevel, 0>; name: (typeof EVIDENCE_LEVELS)[number]; reached: boolean; unlocks: string[]; requires: string };

/** Operator-supplied semantic / parity evidence for ONE financial object (JSON, kept out of the repository; contains no personal data). */
export type SemanticEvidence = {
  version: 1; gate: 'G2' | 'G3' | 'G4' | 'G5'; object: string; definitionFingerprint: string;
  cases: { id: string; purpose: string }[];
  run?: { executedAt: string; environment: 'isolated-sanitized'; passed: number; failed: number; reviewedBy: string; reviewedAt: string };
  parity?: { executedAt: string; sampleSize: number; compared: number; unexplainedDifferences: number; reviewedBy: string; signedOffBy: string; signedOffAt: string };
};
/** PROPOSED minimums (owner/operator may raise them; never lower without a recorded decision). */
export const SEMANTIC_MIN_CASES = 5;
export const PARITY_MIN_SAMPLE = 30;
export type ReadinessReport = { schema: string; capturedAt: string | null; serverVersion: string | null; gates: Gate[]; eligibleTasks: string[]; blockedTasks: { task: string; because: string[] }[]; counts: { tables: number; columns: number; views: number; routines: number; triggers: number } };

const f = (level: Finding['level'], code: string, subject: string, message: string): Finding => ({ level, code, subject, message });
const status = (findings: Finding[]): GateStatus => (findings.some((x) => x.level === 'blocker') ? (findings.some((x) => x.level === 'ok') ? 'PARTIAL' : 'BLOCKED') : 'ELIGIBLE');

function checkTables(b: EvidenceBundle): Finding[] {
  const out: Finding[] = [];
  for (const [table, reqs] of Object.entries(KOSIPA_TABLE_CONTRACT)) {
    const cols = b.columns.filter((c) => norm(c.table) === table);
    if (cols.length === 0) { out.push(f('blocker', 'TABLE_MISSING', table, 'table not present in the evidence')); continue; }
    const byName = new Map(cols.map((c) => [norm(c.column), c]));
    const missing = reqs.filter((r) => !byName.has(norm(r.column))).map((r) => r.column);
    const wrong = reqs.filter((r) => byName.has(norm(r.column)) && !r.family.includes(typeFamily(byName.get(norm(r.column))!.type))).map((r) => `${r.column}:${byName.get(norm(r.column))!.type}`);
    if (missing.length) out.push(f('blocker', 'COLUMNS_MISSING', table, `missing: ${missing.join(', ')}`));
    if (wrong.length) out.push(f('blocker', 'TYPE_INCOMPATIBLE', table, `unexpected type family: ${wrong.join(', ')}`));
    if (!missing.length && !wrong.length) out.push(f('ok', 'TABLE_COMPATIBLE', table, `${reqs.length} required columns present with compatible types`));
  }
  // exact-money rule: money columns that are floating point need a documented tolerance (the matrix header total is `double`)
  for (const [table, reqs] of Object.entries(KOSIPA_TABLE_CONTRACT)) for (const r of reqs) {
    const c = b.columns.find((x) => norm(x.table) === table && norm(x.column) === norm(r.column));
    if (c && r.family.includes('decimal') && typeFamily(c.type) === 'double') out.push(f('warning', 'FLOATING_POINT_MONEY', `${table}.${r.column}`, `stored as ${c.type}: sub-sen noise is expected and tolerated by the diagnostics`));
    const scale = c ? decimalScale(c.type) : null;
    if (c && scale !== null && ![2, 4].includes(scale) && r.family.includes('decimal')) out.push(f('warning', 'UNEXPECTED_DECIMAL_SCALE', `${table}.${r.column}`, `scale ${scale}: exact parsing supports up to 4 decimals`));
  }
  return out;
}



type FinancialSpec = { id: 'G2' | 'G3' | 'G4' | 'G5'; title: string; objects: { name: string; kind: 'view' | 'procedure' }[]; analysis: string[]; candidate: string[]; official: string[] };
const FINANCIAL: FinancialSpec[] = [
  { id: 'G2', title: 'Official savings balance (opening balance + movements)', objects: [{ name: 'v_kartu_simpanan', kind: 'view' }, { name: 'v_saldo_awal', kind: 'view' }],
    analysis: ['analyse the savings balance definition (no figure shown)'], candidate: ['TASK-025 candidate official-balance implementation under test (not displayed as official)'], official: ['TASK-025 official balance display and parity claim (REQ-023)', 'TASK-044 balance precondition'] },
  { id: 'G3', title: 'Official loan balance, schedule and simulation', objects: [{ name: 'v_trans_pinjaman_flat', kind: 'view' }, { name: 'v_trans_pinjaman_anuitas', kind: 'view' }, { name: 'v_trans_pinjaman_simulasi', kind: 'view' }],
    analysis: ['analyse the loan calculation definitions (no figure shown)'], candidate: ['TASK-026/043 candidate outstanding and simulation implementation under test'], official: ['TASK-026 official outstanding and simulation parity (REQ-024/030)', 'TASK-043 calculation baseline'] },
  { id: 'G4', title: 'Payroll generator parity (procedure body + matrix columns)', objects: [{ name: 'x_proc_create_matrix', kind: 'procedure' }],
    analysis: ['analyse the generator body; D5 evidence (company ↔ TOKO_* column) can be READ from it — the decision itself stays the owner\'s'], candidate: ['TASK-027 candidate generator re-implementation under test'], official: ['TASK-027 generator parity claim', 'TASK-045 settlement baseline'] },
  { id: 'G5', title: 'Payroll component semantics (legacy report views)', objects: [{ name: 'v_trans_potongan_bulanan', kind: 'view' }, { name: 'v_matrix_toko', kind: 'view' }, { name: 'v_matrix_toko_dtl', kind: 'view' }],
    analysis: ['analyse the payroll component report definitions'], candidate: ['TASK-027 candidate component semantics under test'], official: ['TASK-027 component semantics and TOKO Kredit comparison basis (official)'] },
];

function financialGate(spec: FinancialSpec, b: EvidenceBundle, compatibleTables: Set<string>, semantic: readonly SemanticEvidence[], extra: Finding[]): Gate {
  const findings: Finding[] = [...extra];
  const objs = spec.objects.map((o) => {
    const def = o.kind === 'view' ? b.views.find((v) => norm(v.name) === o.name)?.definition : b.routines.find((r) => norm(r.name) === o.name)?.definition;
    const exists = o.kind === 'view' ? b.views.some((v) => norm(v.name) === o.name) : b.routines.some((r) => norm(r.name) === o.name);
    const real = exists && !isStubDefinition(def);
    const refs = real ? referencedTables(def as string) : [];
    const fp = real ? fingerprint(def as string) : null;
    const missingRefs = refs.filter((t) => t in KOSIPA_TABLE_CONTRACT && !compatibleTables.has(t));
    if (!exists) findings.push(f('blocker', o.kind === 'view' ? 'VIEW_MISSING' : 'ROUTINE_MISSING', o.name, `${o.kind} not present in the evidence`));
    else if (!real) findings.push(f('blocker', o.kind === 'view' ? 'VIEW_STUB' : 'ROUTINE_STUB', o.name, o.kind === 'view' ? 'definition is empty or a stub (not an exported definition): re-export with SHOW VIEW privilege' : 'no body exported: needs the SHOW CREATE PROCEDURE privilege'));
    else findings.push(f('ok', o.kind === 'view' ? 'VIEW_PRESENT' : 'ROUTINE_PRESENT', o.name, `definition present (fingerprint ${fp}); references: ${refs.join(', ') || '(none found)'}`));
    if (real && missingRefs.length) findings.push(f('blocker', 'REFERENCED_TABLE_INCOMPATIBLE', o.name, `referenced tables fail the column contract: ${missingRefs.join(', ')}`));
    const ev = semantic.filter((e) => e.gate === spec.id && norm(e.object) === o.name);
    const current = ev.filter((e) => fp !== null && e.definitionFingerprint === fp);
    if (ev.length && !current.length) findings.push(f('blocker', 'SEMANTIC_STALE', o.name, 'semantic evidence was produced for a different definition (fingerprint mismatch): re-run against the current definition'));
    const sem = current.some((e) => e.cases.length >= SEMANTIC_MIN_CASES && !!e.run && e.run.environment === 'isolated-sanitized' && e.run.failed === 0 && e.run.passed === e.cases.length && !!e.run.reviewedBy && !!e.run.reviewedAt);
    const par = sem && current.some((e) => !!e.parity && e.parity.unexplainedDifferences === 0 && e.parity.sampleSize >= PARITY_MIN_SAMPLE && e.parity.compared >= e.parity.sampleSize && !!e.parity.reviewedBy && !!e.parity.signedOffBy && !!e.parity.signedOffAt);
    if (real && !sem) findings.push(f('info', 'SEMANTICS_UNVERIFIED', o.name, current.length ? `semantic evidence incomplete: needs >= ${SEMANTIC_MIN_CASES} reviewed cases, all passed, run in an isolated sanitized environment` : 'no semantic evidence supplied for this definition'));
    if (sem && !par) findings.push(f('info', 'PARITY_UNACCEPTED', o.name, `no signed-off parity run with >= ${PARITY_MIN_SAMPLE} compared records and zero unexplained differences`));
    if (sem) findings.push(f('ok', 'SEMANTICS_VERIFIED', o.name, `reviewed semantic cases passed for fingerprint ${fp}`));
    if (par) findings.push(f('ok', 'PARITY_ACCEPTED', o.name, 'signed-off parity run with zero unexplained differences'));
    return { exists, shape: real ? missingRefs.length === 0 : exists, real, sem, par };
  });
  const all = (k: 'exists' | 'shape' | 'real' | 'sem' | 'par') => objs.every((o) => o[k]);
  const extraBlocked = extra.some((x) => x.level === 'blocker');
  const reached = [all('exists'), all('exists') && all('shape') && !extraBlocked, all('real') && all('shape') && !extraBlocked, all('real') && all('sem') && !extraBlocked, all('real') && all('par') && !extraBlocked];
  const levels: LevelState[] = [
    { level: 1, name: 'OBJECT_EXISTS', reached: reached[0], unlocks: [], requires: 'every named object present in the evidence bundle' },
    { level: 2, name: 'SHAPE_COMPATIBLE', reached: reached[1], unlocks: [], requires: 'every referenced KOSIPA table passes the column/type contract' },
    { level: 3, name: 'DEFINITION_AVAILABLE', reached: reached[2], unlocks: spec.analysis, requires: 'real (non-stub) definitions exported with SHOW VIEW / SHOW CREATE PROCEDURE' },
    { level: 4, name: 'SEMANTICS_VERIFIED', reached: reached[3], unlocks: spec.candidate, requires: `per object: >= ${SEMANTIC_MIN_CASES} reviewed sanitized test cases bound to the current fingerprint, all passed in an isolated environment` },
    { level: 5, name: 'PARITY_ACCEPTED', reached: reached[4], unlocks: spec.official, requires: `per object: signed-off parity run, >= ${PARITY_MIN_SAMPLE} representative records, zero unexplained differences` },
  ];
  // a level counts only if every lower level is reached too
  let level: EvidenceLevel = 0; for (const l of levels) { if (l.reached && level === l.level - 1) level = l.level; }
  for (const l of levels) l.reached = l.level <= level;
  const statusOf: GateStatus = level === 5 ? 'ELIGIBLE' : level >= 3 ? 'PARTIAL' : 'BLOCKED';
  return { id: spec.id, title: spec.title, status: statusOf, unlocks: [...spec.analysis, ...spec.candidate, ...spec.official], findings, level, levels };
}

export function validateKosipaEvidence(b: EvidenceBundle, semantic: readonly SemanticEvidence[] = []): ReadinessReport {
  const gates: Gate[] = [];
  const tableFindings = checkTables(b);
  gates.push({ id: 'G1', title: 'Implemented KOSIPA reads match the real schema', status: status(tableFindings), unlocks: ['keep TASK-021/024/025/026/027/028 reads valid against this schema'], findings: tableFindings });

  const compatible = new Set(tableFindings.filter((x) => x.code === 'TABLE_COMPATIBLE').map((x) => x.subject));
  const spec = (id: string) => FINANCIAL.find((x) => x.id === id) as FinancialSpec;
  gates.push(financialGate(spec('G2'), b, compatible, semantic, []));
  gates.push(financialGate(spec('G3'), b, compatible, semantic, []));

  const proc = b.routines.find((r) => norm(r.name) === 'x_proc_create_matrix');
  const pf: Finding[] = [];
  const matrixCols = new Set(b.columns.filter((c) => norm(c.table) === 'trans_potongan_matrix').map((c) => norm(c.column)));
  const uncovered = PAYROLL_COMPONENT_COLUMNS.filter((c) => !matrixCols.has(norm(c)));
  pf.push(uncovered.length === 0 && matrixCols.size > 0 ? f('ok', 'MATRIX_COLUMNS', 'trans_potongan_matrix', `all ${PAYROLL_COMPONENT_COLUMNS.length} catalogued component columns exist`) : f('blocker', 'MATRIX_COLUMNS', 'trans_potongan_matrix', `catalogued components missing in the evidence: ${uncovered.join(', ') || '(table absent)'}`));
  if (proc && !isStubDefinition(proc.definition)) {
    const def = proc.definition as string; const refs = referencedTables(def); const lower = def.toLowerCase();
    pf.push(refs.includes('db_salesreturn') || lower.includes('db_salesreturn')
      ? f('info', 'RETURNS_REFERENCED', 'x_proc_create_matrix', 'the generator references db_salesreturn: confirm by review whether returns reduce each TOKO column')
      : f('info', 'RETURNS_NOT_REFERENCED', 'x_proc_create_matrix', 'the generator does not reference db_salesreturn: legacy store deductions are likely NOT return-adjusted (matches the observed behaviour; confirm by review)'));
    const stores = ['toko_tambun', 'toko_mj', 'toko_giic'].filter((c) => lower.includes(c));
    pf.push(stores.length === 3 ? f('info', 'STORE_COLUMNS_REFERENCED', 'x_proc_create_matrix', 'all three TOKO_* columns are written by the generator: the company↔column map (D5) can now be read from its body') : f('warning', 'STORE_COLUMNS_PARTIAL', 'x_proc_create_matrix', `TOKO_* columns found in the body: ${stores.length}/3`));
  }
  gates.push(financialGate(spec('G4'), b, compatible, semantic, pf));

  gates.push(financialGate(spec('G5'), b, compatible, semantic, []));

  const fin = new Set(['trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl', 'trans_potongan_bulanan', 'trans_potongan_matrix', 'db_sales', 'db_salesreturn']);
  const trg = b.triggers.filter((t) => fin.has(norm(t.table)));
  gates.push({ id: 'G6', title: 'Triggers on financial tables (values changed behind the application)', status: 'ELIGIBLE', unlocks: ['parity claims can account for trigger side effects'], findings: [trg.length ? f('warning', 'TRIGGERS_PRESENT', trg.map((t) => `${t.table}.${t.name}`).join(', '), 'review each: parity must include their effects') : f('ok', 'NO_TRIGGERS', 'financial tables', 'no trigger on the financial tables in the evidence')] });

  const sf: Finding[] = [];
  if (b.server?.sqlMode === undefined) sf.push(f('blocker', 'SQL_MODE_UNKNOWN', 'server', 'sql_mode not provided: zero-date behaviour of production is unverified'));
  else sf.push(/NO_ZERO_DATE|NO_ZERO_IN_DATE|STRICT_/i.test(b.server.sqlMode) ? f('warning', 'STRICT_MODE', 'server', 'a strict sql_mode is active: zero dates may behave differently from the 30 Sep copy') : f('ok', 'SQL_MODE', 'server', 'non-strict sql_mode: zero dates are storable (the console labels them, never guesses)'));
  if (b.server?.maxUserConnections === undefined || b.server.maxUserConnections === null) sf.push(f('blocker', 'MAX_USER_CONNECTIONS_UNKNOWN', 'server', 'max_user_connections not provided: capacity decision B5 cannot be made'));
  else sf.push(f('ok', 'MAX_USER_CONNECTIONS', 'server', `max_user_connections = ${b.server.maxUserConnections}`));
  gates.push({ id: 'G7', title: 'Server settings that change behaviour or capacity', status: status(sf), unlocks: ['date-handling claims', 'connection capacity decision B5'], findings: sf });

  const proposed: [string, string][] = [['trans_pinjaman_dtl', 'nik_kar'], ['trans_pinjaman_dtl', 'doc_no'], ['m_anggota', 'nik_kar'], ['db_sales', 'nik_kar']];
  const idx = proposed.map(([t, c]) => { const has = b.indexes.some((i) => norm(i.table) === t && norm(i.columns[0] ?? '') === c); return f('info', has ? 'INDEX_PRESENT' : 'INDEX_ABSENT', `${t}(${c}…)`, has ? 'a leading index exists in production' : 'no leading index: the read is a scan capped at 5 s (index proposal candidate; DDL is not executed)'); });
  gates.push({ id: 'G8', title: 'Index state of the candidate lookups', status: 'ELIGIBLE', unlocks: ['index staging validation (separate task)'], findings: idx });

  const counts = { tables: new Set(b.columns.map((c) => norm(c.table))).size, columns: b.columns.length, views: b.views.length, routines: b.routines.length, triggers: b.triggers.length };
  const blocked: { task: string; because: string[] }[] = []; const eligible: string[] = [];
  for (const g of gates) {
    if (g.levels) {
      for (const l of g.levels) {
        if (!l.unlocks.length) continue;
        if (l.reached) eligible.push(...l.unlocks.map((u) => `${g.id} (level ${l.level} ${l.name}): ${u}`));
        else blocked.push({ task: `${g.id} level ${l.level} ${l.name}: ${l.unlocks.join(' / ')}`, because: [`requires ${l.requires}`, ...g.findings.filter((x) => x.level === 'blocker').map((x) => `${x.code} ${x.subject}`)] });
      }
    } else if (g.status === 'ELIGIBLE') eligible.push(...g.unlocks.map((u) => `${g.id}: ${u}`));
    else blocked.push({ task: g.unlocks.join(' / '), because: g.findings.filter((x) => x.level === 'blocker').map((x) => `${x.code} ${x.subject}`) });
  }
  return { schema: b.schema, capturedAt: b.capturedAt ?? null, serverVersion: b.server?.version ?? null, gates, eligibleTasks: eligible, blockedTasks: blocked, counts };
}

/** Markdown report: identifiers, statuses and fingerprints only (safe to attach to a ticket). */
export function renderReadinessReport(r: ReadinessReport, title = 'KOSIPA schema evidence readiness'): string {
  const out: string[] = [`# ${title}`, '', `Schema: \`${r.schema}\` · captured: ${r.capturedAt ?? 'not stated'} · server: ${r.serverVersion ?? 'not stated'} · ${r.counts.tables} tables, ${r.counts.columns} columns, ${r.counts.views} views, ${r.counts.routines} routines, ${r.counts.triggers} triggers`, '', 'This report contains identifiers, statuses and fingerprints only. It contains no definition text, row or credential.', '', 'Financial gates (G2–G5) report an evidence level: 1 object exists, 2 shape compatible, 3 definition available, 4 semantics verified, 5 parity accepted. Metadata alone can reach level 3 at most; official figures need level 5.', '', '| Gate | Status | Evidence level | Unlocks |', '|---|---|---|---|'];
  for (const g of r.gates) out.push(`| ${g.id} ${g.title} | **${g.status}** | ${g.level === undefined ? 'n/a' : `${g.level} ${EVIDENCE_LEVELS[g.level]}`} | ${g.unlocks.join('; ')} |`);
  for (const g of r.gates) { out.push('', `## ${g.id} — ${g.title}: ${g.status}`, ''); if (g.levels) for (const l of g.levels) out.push(`- level ${l.level} ${l.name}: ${l.reached ? 'REACHED' : 'not reached'} — requires ${l.requires}`); const detail = (y: Finding) => y.level !== 'ok' || ['VIEW_PRESENT', 'ROUTINE_PRESENT', 'SEMANTICS_VERIFIED', 'PARITY_ACCEPTED'].includes(y.code);   // present objects are listed with fingerprint and dependencies
    for (const x of g.findings.filter(detail).slice(0, 60)) out.push(`- [${x.level}] \`${x.code}\` ${x.subject}: ${x.message}`); const oks = g.findings.filter((y) => y.level === 'ok' && !detail(y)); if (oks.length) out.push(`- ${oks.length} check(s) OK: ${oks.map((o) => o.subject).join(', ')}`); }
  out.push('', '## Tasks that become eligible', '', ...(r.eligibleTasks.length ? r.eligibleTasks.map((t) => `- ${t}`) : ['- none']), '', '## Still blocked', '', ...(r.blockedTasks.length ? r.blockedTasks.map((t) => `- ${t.task} — ${t.because.join('; ')}`) : ['- none']), '');
  return out.join('\n');
}

// ------------------------------------------------------------------------------------------------------- bundle shape and sensitivity
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'YES';
/** Normalises the JSON produced by `schema-evidence-bundle-json.sql` (MariaDB returns booleans as 0/1) and refuses anything malformed with a precise message. */
export function parseEvidenceBundle(raw: unknown): { ok: true; bundle: EvidenceBundle } | { ok: false; error: string } {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return { ok: false, error: 'the bundle is not a JSON object' };
  if (o.version !== 1) return { ok: false, error: 'unsupported bundle version (expected 1)' };
  if (typeof o.schema !== 'string' || !/^[A-Za-z0-9_$]{1,64}$/.test(o.schema)) return { ok: false, error: 'schema name missing or malformed' };
  for (const k of ['columns', 'indexes', 'views', 'routines', 'triggers']) if (!Array.isArray(o[k])) return { ok: false, error: `${k} must be an array` };
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  try {
    const columns = (o.columns as Record<string, unknown>[]).map((c) => { const t = str(c.table), n = str(c.column), ty = str(c.type); if (!t || !n || !ty) throw new Error('column row incomplete'); return { table: t, column: n, type: ty, nullable: bool(c.nullable) }; });
    const indexes = (o.indexes as Record<string, unknown>[]).map((i) => { const t = str(i.table), n = str(i.index); if (!t || !n || !Array.isArray(i.columns)) throw new Error('index row incomplete'); return { table: t, index: n, unique: bool(i.unique), columns: (i.columns as unknown[]).map(String) }; });
    const views = (o.views as Record<string, unknown>[]).map((v) => { const n = str(v.name); if (!n) throw new Error('view row incomplete'); return { name: n, definition: str(v.definition) }; });
    const routines = (o.routines as Record<string, unknown>[]).map((r) => { const n = str(r.name); const ty = str(r.type); if (!n || (ty !== 'PROCEDURE' && ty !== 'FUNCTION')) throw new Error('routine row incomplete'); return { name: n, type: ty as 'PROCEDURE' | 'FUNCTION', definition: str(r.definition) }; });
    const triggers = (o.triggers as Record<string, unknown>[]).map((t) => { const n = str(t.name), tb = str(t.table); if (!n || !tb) throw new Error('trigger row incomplete'); return { name: n, table: tb, event: str(t.event) ?? '', timing: str(t.timing) ?? '' }; });
    const sv = o.server as Record<string, unknown> | undefined;
    const server = sv ? { version: str(sv.version) ?? undefined, sqlMode: str(sv.sqlMode) ?? undefined, maxUserConnections: sv.maxUserConnections === null || sv.maxUserConnections === undefined ? null : Number(sv.maxUserConnections) } : undefined;
    return { ok: true, bundle: { version: 1, schema: o.schema, capturedAt: str(o.capturedAt) ?? undefined, columns, indexes, views, routines, triggers, server } };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Counts (never contents) of text in view/routine bodies that must be redacted before the BUNDLE is shared or stored: the report itself is always safe. */
export function scanSensitive(b: EvidenceBundle): { pattern: string; objects: number }[] {
  const patterns: [string, RegExp][] = [['password / identified by', /password|identified\s+by/i], ['secret / token / api key', /secret|token|api[_-]?key/i], ['ip address', /\b\d{1,3}(?:\.\d{1,3}){3}\b/], ['e-mail address', /[\w.+-]+@[\w-]+\.[\w.]+/], ['definer', /definer\s*=/i]];
  const bodies = [...b.views.map((v) => v.definition), ...b.routines.map((r) => r.definition)].filter((x): x is string => !!x);
  return patterns.map(([pattern, re]) => ({ pattern, objects: bodies.filter((t) => re.test(t)).length })).filter((x) => x.objects > 0);
}

// ------------------------------------------------------------------------------------------------------- semantic / parity evidence intake
const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
/**
 * Strict intake of ONE operator-supplied semantic evidence file. It must describe test cases and outcomes only: no row values, no member data.
 * Anything that looks personal (a long digit run such as a NIK or account number, an e-mail address) refuses the WHOLE file, so it is never stored.
 */
export function parseSemanticEvidence(raw: unknown): { ok: true; evidence: SemanticEvidence } | { ok: false; error: string } {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return { ok: false, error: 'not a JSON object' };
  const text = JSON.stringify(o);
  if (/\d{8,}/.test(text.replace(/"definitionFingerprint":"[0-9a-f]+"/, '').replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z?"/g, '""'))) return { ok: false, error: 'refused: contains a long digit sequence (possible NIK / account number); semantic evidence must not carry personal data' };
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) return { ok: false, error: 'refused: contains an e-mail address' };
  if (o.version !== 1) return { ok: false, error: 'unsupported version (expected 1)' };
  if (!['G2', 'G3', 'G4', 'G5'].includes(o.gate as string)) return { ok: false, error: 'gate must be G2, G3, G4 or G5' };
  if (typeof o.object !== 'string' || !/^[a-z0-9_]{1,64}$/i.test(o.object)) return { ok: false, error: 'object name missing or malformed' };
  if (typeof o.definitionFingerprint !== 'string' || !/^[0-9a-f]{14}$/.test(o.definitionFingerprint)) return { ok: false, error: 'definitionFingerprint must be the 14-hex fingerprint printed by the readiness report' };
  if (!Array.isArray(o.cases) || !o.cases.every((c) => c && typeof c.id === 'string' && typeof c.purpose === 'string' && c.purpose.length <= 200)) return { ok: false, error: 'cases must be [{ id, purpose (<= 200 chars) }]' };
  const ids = (o.cases as { id: string }[]).map((c) => c.id); if (new Set(ids).size !== ids.length) return { ok: false, error: 'case ids must be unique' };
  const run = o.run as Record<string, unknown> | undefined;
  if (run && !(ISO.test(String(run.executedAt)) && run.environment === 'isolated-sanitized' && Number.isInteger(run.passed) && Number.isInteger(run.failed) && typeof run.reviewedBy === 'string' && ISO.test(String(run.reviewedAt)))) return { ok: false, error: 'run must state executedAt, environment "isolated-sanitized", integer passed/failed, reviewedBy and reviewedAt' };
  const par = o.parity as Record<string, unknown> | undefined;
  if (par && !(ISO.test(String(par.executedAt)) && Number.isInteger(par.sampleSize) && Number.isInteger(par.compared) && Number.isInteger(par.unexplainedDifferences) && typeof par.reviewedBy === 'string' && typeof par.signedOffBy === 'string' && ISO.test(String(par.signedOffAt)))) return { ok: false, error: 'parity must state executedAt, integer sampleSize/compared/unexplainedDifferences, reviewedBy, signedOffBy and signedOffAt' };
  return { ok: true, evidence: o as unknown as SemanticEvidence };
}
