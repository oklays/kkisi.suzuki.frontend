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

test('complete, compatible evidence: every gate is ELIGIBLE and the report never contains definition text', () => {
  const r = validateKosipaEvidence(bundle());
  assert.deepEqual(r.gates.map((g) => [g.id, g.status]), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'].map((id) => [id, 'ELIGIBLE']));
  assert.equal(r.blockedTasks.length, 0); assert.ok(r.eligibleTasks.some((t) => t.includes('official balance')));
  const text = renderReadinessReport(r); assert.ok(!text.includes(MARK), 'no definition text in the report'); assert.match(text, /fingerprint [0-9a-f]{14}/); assert.match(text, /references: m_anggota, trans_simpanan_dtl/);
  assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'RETURNS_NOT_REFERENCED'), 'the generator body does not mention returns: reported as a finding to review, not as a conclusion');
  assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'STORE_COLUMNS_REFERENCED'));
});

test('missing or stubbed views keep exactly their gate BLOCKED and name the object; other gates are unaffected', () => {
  const b = bundle(); b.views = b.views.filter((v) => v.name !== 'v_saldo_awal'); b.views.find((v) => v.name === 'v_trans_pinjaman_flat').definition = 'select NULL AS nik, NULL AS pokok';
  const r = validateKosipaEvidence(b);
  assert.equal(gate(r, 'G2').status, 'PARTIAL'); assert.ok(gate(r, 'G2').findings.some((x) => x.code === 'VIEW_MISSING' && x.subject === 'v_saldo_awal'));
  assert.equal(gate(r, 'G3').status, 'PARTIAL'); assert.ok(gate(r, 'G3').findings.some((x) => x.code === 'VIEW_STUB' && x.subject === 'v_trans_pinjaman_flat'));
  assert.deepEqual([gate(r, 'G1').status, gate(r, 'G4').status, gate(r, 'G5').status], ['ELIGIBLE', 'ELIGIBLE', 'ELIGIBLE']);
  assert.ok(r.blockedTasks.some((t) => t.because.includes('VIEW_MISSING v_saldo_awal')));
  const none = validateKosipaEvidence(bundle({ views: [] })); assert.deepEqual([gate(none, 'G2').status, gate(none, 'G3').status, gate(none, 'G5').status], ['BLOCKED', 'BLOCKED', 'BLOCKED']);
});

test('the payroll generator gate needs the real body and the full component column set', () => {
  const noProc = validateKosipaEvidence(bundle({ routines: [] })); assert.ok(gate(noProc, 'G4').findings.some((x) => x.code === 'ROUTINE_MISSING')); assert.equal(gate(noProc, 'G4').status, 'PARTIAL');
  const stub = validateKosipaEvidence(bundle({ routines: [{ name: 'x_proc_create_matrix', type: 'PROCEDURE', definition: null }] })); assert.ok(gate(stub, 'G4').findings.some((x) => x.code === 'ROUTINE_STUB'));
  const b = bundle(); b.columns = b.columns.filter((c) => !(c.table === 'trans_potongan_matrix' && c.column === 'PRESSING'));
  const r = validateKosipaEvidence(b); assert.ok(gate(r, 'G4').findings.some((x) => x.code === 'MATRIX_COLUMNS' && x.message.includes('PRESSING'))); assert.equal(gate(r, 'G1').status, 'PARTIAL');
  const withReturns = validateKosipaEvidence(bundle({ routines: [{ name: 'x_proc_create_matrix', type: 'PROCEDURE', definition: PROC + ' select * from db_salesreturn r' }] })); assert.ok(gate(withReturns, 'G4').findings.some((x) => x.code === 'RETURNS_REFERENCED'));
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

import { parseEvidenceBundle, scanSensitive } from '../src/kosipa/index.ts';
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
