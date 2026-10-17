import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSIPA_TABLE_CONTRACT, typeFamily, fingerprint, isStubDefinition, referencedTables, validateKosipaEvidence, renderReadinessReport } from '../src/kosipa/index.ts';

const TYPE = { int: 'int(11)', string: 'varchar(50)', enum: 'enum(\'A\',\'B\')', decimal: 'decimal(18,2)', double: 'double(18,4)', date: 'date', datetime: 'datetime' };
const MARK = 'SECRET_DEFINITION_MARKER_8842';
const REAL_VIEW = (name) => `select m.nik_kar AS nik, sum(d.kredit) AS kredit /* ${MARK} */ from m_anggota m join trans_simpanan_dtl d on d.nik_kar = m.nik_kar group by m.nik_kar -- ${name}`;
const PROC = `BEGIN insert into trans_potongan_matrix (periode, nik_kar, TOKO_TAMBUN, TOKO_MJ, TOKO_GIIC) select 'x', s.nik_kar, 1, 2, 3 from db_sales s; /* ${MARK} */ END`;

function bundle(over = {}) {
  const columns = Object.entries(KOSIPA_TABLE_CONTRACT).flatMap(([table, reqs]) => reqs.map((r) => ({ table, column: r.column, type: TYPE[r.family[0]] })));
  return {
    version: 1, schema: 'synthetic', capturedAt: '2026-10-17', columns, indexes: [], triggers: [],
    views: ['v_kartu_simpanan', 'v_saldo_awal', 'v_trans_pinjaman_flat', 'v_trans_pinjaman_anuitas', 'v_trans_pinjaman_simulasi', 'v_trans_potongan_bulanan', 'v_matrix_toko', 'v_matrix_toko_dtl'].map((name) => ({ name, definition: REAL_VIEW(name) })),
    routines: [{ name: 'x_proc_create_matrix', type: 'PROCEDURE', definition: PROC }],
    server: { version: '10.6', sqlMode: '', maxUserConnections: 20 }, ...over,
  };
}
const gate = (r, id) => r.gates.find((g) => g.id === id);

test('type families and stub detection', () => {
  assert.deepEqual(['int(11)', 'bigint(20) unsigned', 'decimal(18,2)', 'double(18,4)', 'varchar(50)', 'date', 'datetime', "enum('A')", 'blob'].map(typeFamily), ['int', 'int', 'decimal', 'double', 'string', 'date', 'datetime', 'enum', 'other']);
  for (const stub of [null, '', 'select 1', 'select NULL AS nik, NULL AS kredit', 'SELECT NULL AS `a`,NULL AS `b` from dual']) assert.equal(isStubDefinition(stub), true, String(stub));
  assert.equal(isStubDefinition(REAL_VIEW('x')), false);
  assert.deepEqual(referencedTables('select 1 from `db`.`M_Anggota` m join trans_pinjaman p on p.id=m.id, other_t'), ['m_anggota', 'trans_pinjaman']);
  assert.equal(fingerprint('abc'), fingerprint('abc')); assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

const FIN = ['G2', 'G3', 'G4', 'G5'];
const OBJECTS = { G2: ['v_kartu_simpanan', 'v_saldo_awal'], G3: ['v_trans_pinjaman_flat', 'v_trans_pinjaman_anuitas', 'v_trans_pinjaman_simulasi'], G4: ['x_proc_create_matrix'], G5: ['v_trans_potongan_bulanan', 'v_matrix_toko', 'v_matrix_toko_dtl'] };
const defOf = (b, name) => (b.views.find((v) => v.name === name) ?? b.routines.find((r) => r.name === name)).definition;
const cases = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, purpose: `property ${i + 1} of the definition` }));
const RUN = (n, over = {}) => ({ executedAt: '2026-10-18T01:00:00Z', environment: 'isolated-sanitized', passed: n, failed: 0, reviewedBy: 'operator', reviewedAt: '2026-10-18', ...over });
const PAR = (over = {}) => ({ executedAt: '2026-10-18T02:00:00Z', sampleSize: 30, compared: 30, unexplainedDifferences: 0, reviewedBy: 'operator', signedOffBy: 'data owner', signedOffAt: '2026-10-18', ...over });
const semanticFor = (b, gateId, over = {}) => OBJECTS[gateId].map((object) => ({ version: 1, gate: gateId, object, definitionFingerprint: fingerprint(defOf(b, object)), cases: cases(5), run: RUN(5), parity: PAR(), ...over }));

test('complete metadata (real definitions, compatible tables) reaches level 3 only: analysis is unlocked, official figures and parity stay BLOCKED; no definition text in the report', () => {
  const r = validateKosipaEvidence(bundle());
  assert.deepEqual(r.gates.map((g) => [g.id, g.status]), [['G1', 'ELIGIBLE'], ['G2', 'PARTIAL'], ['G3', 'PARTIAL'], ['G4', 'PARTIAL'], ['G5', 'PARTIAL'], ['G6', 'ELIGIBLE'], ['G7', 'ELIGIBLE'], ['G8', 'ELIGIBLE']]);
  for (const id of FIN) assert.equal(gate(r, id).level, 3, `${id} level`);
  assert.ok(r.eligibleTasks.some((t) => t.startsWith('G2 (level 3 DEFINITION_AVAILABLE)')), 'reading the definition is allowed');
  assert.ok(!r.eligibleTasks.some((t) => /official balance display|generator parity claim|official outstanding|component semantics and TOKO Kredit comparison basis \(official\)/.test(t)), 'no official figure from metadata');
  assert.ok(r.blockedTasks.some((t) => t.task.startsWith('G2 level 5 PARITY_ACCEPTED') && t.because[0].includes('signed-off parity')));
  const text = renderReadinessReport(r); assert.ok(!text.includes(MARK), 'no definition text in the report'); assert.match(text, /fingerprint [0-9a-f]{14}/); assert.match(text, /references: m_anggota, trans_simpanan_dtl/);
  assert.match(text, /\| G2 [^|]*\| \*\*PARTIAL\*\* \| 3 DEFINITION_AVAILABLE \|/);
  assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'RETURNS_NOT_REFERENCED'), 'the generator body does not mention returns: reported as a finding to review, not as a conclusion');
  assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'STORE_COLUMNS_REFERENCED'));
});

test('levels 4 and 5 need operator evidence bound to the CURRENT definition fingerprint; every shortfall keeps the gate at the lower level', () => {
  const b = bundle();
  const full = validateKosipaEvidence(b, FIN.flatMap((g) => semanticFor(b, g)));
  for (const id of FIN) { assert.equal(gate(full, id).level, 5, id); assert.equal(gate(full, id).status, 'ELIGIBLE'); }
  assert.ok(full.eligibleTasks.some((t) => t.includes('TASK-025 official balance display')));
  const level = (sem) => gate(validateKosipaEvidence(b, sem), 'G2').level;
  assert.equal(level(semanticFor(b, 'G2', { definitionFingerprint: '00000000000000' })), 3, 'stale fingerprint: evidence for another definition does not count');
  assert.ok(gate(validateKosipaEvidence(b, semanticFor(b, 'G2', { definitionFingerprint: '00000000000000' })), 'G2').findings.some((x) => x.code === 'SEMANTIC_STALE'));
  assert.equal(level(semanticFor(b, 'G2', { cases: cases(4), run: RUN(4) })), 3, 'fewer than the minimum cases');
  assert.equal(level(semanticFor(b, 'G2', { run: RUN(5, { failed: 1, passed: 4 }) })), 3, 'a failed case');
  assert.equal(level(semanticFor(b, 'G2', { run: RUN(5, { environment: 'production' }) })), 3, 'not an isolated sanitized environment');
  assert.equal(level(semanticFor(b, 'G2', { run: undefined })), 3, 'parity without a semantic run does not skip a level');
  assert.equal(level(semanticFor(b, 'G2', { parity: PAR({ unexplainedDifferences: 1 }) })), 4, 'one unexplained difference');
  assert.equal(level(semanticFor(b, 'G2', { parity: PAR({ sampleSize: 29, compared: 29 }) })), 4, 'sample below the minimum');
  assert.equal(level(semanticFor(b, 'G2', { parity: PAR({ signedOffBy: '' }) })), 4, 'not signed off');
  assert.equal(level([semanticFor(b, 'G2')[0]]), 3, 'every object of the gate needs its own evidence');
});

test('missing or stubbed objects keep their gate below level 3 (BLOCKED) and name the object; other gates are unaffected', () => {
  const b = bundle(); b.views = b.views.filter((v) => v.name !== 'v_saldo_awal'); b.views.find((v) => v.name === 'v_trans_pinjaman_flat').definition = 'select NULL AS nik, NULL AS pokok';
  const r = validateKosipaEvidence(b);
  assert.deepEqual([gate(r, 'G2').status, gate(r, 'G2').level], ['BLOCKED', 0]); assert.ok(gate(r, 'G2').findings.some((x) => x.code === 'VIEW_MISSING' && x.subject === 'v_saldo_awal'));
  assert.deepEqual([gate(r, 'G3').status, gate(r, 'G3').level], ['BLOCKED', 2]); assert.ok(gate(r, 'G3').findings.some((x) => x.code === 'VIEW_STUB' && x.subject === 'v_trans_pinjaman_flat'));
  assert.deepEqual([gate(r, 'G1').status, gate(r, 'G4').status, gate(r, 'G5').status], ['ELIGIBLE', 'PARTIAL', 'PARTIAL']);
  assert.ok(r.blockedTasks.some((t) => t.because.includes('VIEW_MISSING v_saldo_awal')));
  const none = validateKosipaEvidence(bundle({ views: [] })); assert.deepEqual([gate(none, 'G2').status, gate(none, 'G3').status, gate(none, 'G5').status], ['BLOCKED', 'BLOCKED', 'BLOCKED']);
  const shape = bundle(); shape.columns = shape.columns.filter((c) => c.table !== 'trans_simpanan_dtl');   // a table the savings views read fails the contract
  const rs = validateKosipaEvidence(shape); assert.equal(gate(rs, 'G2').level, 1); assert.ok(gate(rs, 'G2').findings.some((x) => x.code === 'REFERENCED_TABLE_INCOMPATIBLE'));
});

test('the payroll generator gate needs the real body and the full component column set', () => {
  const noProc = validateKosipaEvidence(bundle({ routines: [] })); assert.ok(gate(noProc, 'G4').findings.some((x) => x.code === 'ROUTINE_MISSING')); assert.deepEqual([gate(noProc, 'G4').status, gate(noProc, 'G4').level], ['BLOCKED', 0]);
  const stub = validateKosipaEvidence(bundle({ routines: [{ name: 'x_proc_create_matrix', type: 'PROCEDURE', definition: null }] })); assert.ok(gate(stub, 'G4').findings.some((x) => x.code === 'ROUTINE_STUB')); assert.equal(gate(stub, 'G4').level, 2);
  const b = bundle(); b.columns = b.columns.filter((c) => !(c.table === 'trans_potongan_matrix' && c.column === 'PRESSING'));
  const r = validateKosipaEvidence(b); assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'MATRIX_COLUMNS' && x.message.includes('PRESSING'))); assert.equal(gate(r, 'G1').status, 'PARTIAL'); assert.equal(gate(r, 'G4').level, 1);
  const withReturns = validateKosipaEvidence(bundle({ routines: [{ name: 'x_proc_create_matrix', type: 'PROCEDURE', definition: PROC + ' select * from db_salesreturn r' }] })); assert.ok(gate(withReturns, 'G4').findings.some((x) => x.code === 'RETURNS_REFERENCED'));
});

test('semantic evidence intake is strict and refuses anything that looks like personal data', () => {
  const b = bundle(); const good = semanticFor(b, 'G2')[0];
  assert.equal(parseSemanticEvidence(good).ok, true);
  for (const [bad, msg] of [[{ ...good, cases: [{ id: 'C1', purpose: 'member 3201234567890123 opening balance' }] }, /digit sequence/], [{ ...good, cases: [{ id: 'C1', purpose: 'ask ops@example.com' }] }, /e-mail/],
    [{ ...good, definitionFingerprint: 'abc' }, /fingerprint/], [{ ...good, gate: 'G9' }, /gate/], [{ ...good, cases: [{ id: 'C1', purpose: 'a' }, { id: 'C1', purpose: 'b' }] }, /unique/],
    [{ ...good, run: { ...good.run, environment: undefined } }, /isolated-sanitized/], [{ ...good, parity: { ...good.parity, signedOffAt: 'yesterday' } }, /signedOffAt/], [null, /JSON object/]]) {
    const r = parseSemanticEvidence(bad); assert.equal(r.ok, false, JSON.stringify(bad)?.slice(0, 80)); assert.match(r.error, msg);
  }
});

test('incompatible or missing columns are named; floating-point money and strict modes are warnings, not silent', () => {
  const b = bundle(); b.columns = b.columns.filter((c) => !(c.table === 'trans_pinjaman_dtl' && c.column === 'tgl_cicilan'));
  b.columns.find((c) => c.table === 'trans_pinjaman' && c.column === 'plan_pinjaman').type = 'varchar(20)'; b.columns = b.columns.filter((c) => c.table !== 'db_salesreturn');
  const r = validateKosipaEvidence(b); const g1 = gate(r, 'G1').findings;
  assert.ok(g1.some((x) => x.code === 'COLUMNS_MISSING' && x.subject === 'trans_pinjaman_dtl' && x.message.includes('tgl_cicilan')));
  assert.ok(g1.some((x) => x.code === 'TYPE_INCOMPATIBLE' && x.subject === 'trans_pinjaman' && x.message.includes('plan_pinjaman')));
  assert.ok(g1.some((x) => x.code === 'TABLE_MISSING' && x.subject === 'db_salesreturn')); assert.equal(gate(r, 'G1').status, 'PARTIAL');
  const dbl = bundle(); dbl.columns.find((c) => c.table === 'trans_potongan_bulanan' && c.column === 'total').type = 'double(18,4)';
  assert.ok(gate(validateKosipaEvidence(dbl), 'G1').findings.some((x) => x.code === 'FLOATING_POINT_MONEY' && x.subject === 'trans_potongan_bulanan.total'));
  assert.ok(gate(validateKosipaEvidence(bundle({ server: { sqlMode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE', maxUserConnections: 20 } })), 'G7').findings.some((x) => x.code === 'STRICT_MODE'));
});

test('server settings and indexes: unknown capacity or sql_mode blocks that gate; triggers and absent indexes are reported', () => {
  const r = validateKosipaEvidence(bundle({ server: {} })); assert.equal(gate(r, 'G7').status, 'BLOCKED'); assert.ok(gate(r, 'G7').findings.some((x) => x.code === 'MAX_USER_CONNECTIONS_UNKNOWN'));
  const t = validateKosipaEvidence(bundle({ triggers: [{ name: 'trg_x', table: 'trans_pinjaman_dtl', event: 'UPDATE', timing: 'AFTER' }], indexes: [{ table: 'm_anggota', index: 'idx_anggota_nik', unique: false, columns: ['nik_kar'] }] }));
  assert.ok(gate(t, 'G6').findings.some((x) => x.code === 'TRIGGERS_PRESENT')); const g8 = gate(t, 'G8').findings;
  assert.ok(g8.some((x) => x.code === 'INDEX_PRESENT' && x.subject.startsWith('m_anggota'))); assert.ok(g8.some((x) => x.code === 'INDEX_ABSENT' && x.subject.startsWith('trans_pinjaman_dtl(nik_kar')));
});

test('an empty bundle blocks everything instead of passing vacuously', () => {
  const r = validateKosipaEvidence({ version: 1, schema: 'x', columns: [], indexes: [], views: [], routines: [], triggers: [] });
  assert.ok(r.gates.filter((g) => ['G1', 'G2', 'G3', 'G4', 'G5', 'G7'].includes(g.id)).every((g) => g.status === 'BLOCKED'), JSON.stringify(r.gates.map((g) => [g.id, g.status])));
  assert.equal(r.eligibleTasks.some((t) => t.startsWith('G1') || t.startsWith('G2')), false);
});

import { parseEvidenceBundle, scanSensitive, parseSemanticEvidence } from '../src/kosipa/index.ts';
test('operator JSON is normalised (0/1 booleans) and anything malformed is refused with a precise message', () => {
  const ok = parseEvidenceBundle({ version: 1, schema: 'n1608204_smart_kopkar', columns: [{ table: 't', column: 'c', type: 'int(11)', nullable: 1 }], indexes: [{ table: 't', index: 'PRIMARY', unique: 1, columns: ['c'] }], views: [{ name: 'v', definition: null }], routines: [{ name: 'p', type: 'PROCEDURE', definition: 'x' }], triggers: [{ name: 'trg', table: 't', event: 'INSERT', timing: 'AFTER' }], server: { version: '11.4', sqlMode: '', maxUserConnections: '20' } });
  assert.equal(ok.ok, true); assert.deepEqual([ok.bundle.columns[0].nullable, ok.bundle.indexes[0].unique, ok.bundle.server.maxUserConnections], [true, true, 20]);
  for (const [bad, msg] of [[null, /not a JSON object/], [{ version: 2 }, /version/], [{ version: 1, schema: "x'; DROP" }, /schema/], [{ version: 1, schema: 's', columns: [], indexes: [], views: [], routines: [] }, /triggers must be an array/], [{ version: 1, schema: 's', columns: [{ table: 't' }], indexes: [], views: [], routines: [], triggers: [] }, /column row incomplete/], [{ version: 1, schema: 's', columns: [], indexes: [], views: [], routines: [{ name: 'p', type: 'TRIGGER' }], triggers: [] }, /routine row incomplete/]]) {
    const r = parseEvidenceBundle(bad); assert.equal(r.ok, false); assert.match(r.error, msg);
  }
});

test('sensitive-text scan reports counts only, so the bundle can be checked before it is shared', () => {
  const clean = () => { const x = bundle(); for (const v of x.views) v.definition = 'select a from m_anggota'; x.routines[0].definition = 'BEGIN select 1 from db_sales; END'; return x; };
  const b = clean(); b.routines[0].definition = "create definer=`admin`@`10.1.2.3` procedure x() set @p = 'password'; -- mail ops@example.com";
  const found = Object.fromEntries(scanSensitive(b).map((x) => [x.pattern, x.objects]));
  assert.deepEqual(found, { 'password / identified by': 1, 'ip address': 1, 'e-mail address': 1, definer: 1 }); assert.deepEqual(scanSensitive(clean()), []);
  assert.ok(!JSON.stringify(scanSensitive(b)).includes('ops@example.com'));
});
