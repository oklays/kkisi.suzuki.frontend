import assert from 'node:assert/strict';
import test from 'node:test';
import { GUDANG_ROLES, validateGudangMapping, renderGudangReport } from '../src/warehouse/index.ts';

// A hypothetical, SYNTHETIC Gudang layout used only to exercise the validator. It is NOT evidence about the real Gudang schema.
const col = (table, column, type) => ({ table, column, type });
const bundle = (over = {}) => ({
  version: 1, schema: 'synthetic_gudang', views: [], routines: [], triggers: [],
  columns: [col('t_item', 'id', 'int(11)'), col('t_item', 'kode', 'varchar(30)'), col('t_item', 'barcode', 'varchar(30)'), col('t_item', 'nama', 'varchar(80)'), col('t_item', 'satuan', 'varchar(10)'), col('t_item', 'aktif', 'tinyint(1)'),
    col('t_stok', 'item_id', 'int(11)'), col('t_stok', 'qty', 'int(11)'), col('t_stok', 'gudang_id', 'int(11)'),
    col('t_doc', 'id', 'int(11)'), col('t_doc', 'no', 'varchar(30)'), col('t_doc', 'status', "enum('OPEN','DONE')"), col('t_doc', 'tgl', 'date'), col('t_doc', 'toko_id', 'int(11)'),
    col('t_line', 'doc_id', 'int(11)'), col('t_line', 'no', 'int(11)'), col('t_line', 'item_id', 'int(11)'), col('t_line', 'qty', 'int(11)'), col('t_line', 'satuan', 'varchar(10)'),
    col('t_toko', 'id', 'int(11)'), col('t_toko', 'nama', 'varchar(80)')],
  indexes: [{ table: 't_item', index: 'PRIMARY', unique: true, columns: ['id'] }, { table: 't_item', index: 'ux_kode', unique: true, columns: ['kode'] }, { table: 't_doc', index: 'PRIMARY', unique: true, columns: ['id'] }, { table: 't_doc', index: 'ux_no', unique: true, columns: ['no'] },
    { table: 't_line', index: 'uk_line', unique: true, columns: ['doc_id', 'no'] }, { table: 't_toko', index: 'PRIMARY', unique: true, columns: ['id'] }],
  ...over,
});
const mapping = (over = {}) => ({ version: 1, roles: {
  ITEM_ID: { table: 't_item', column: 'id' }, ITEM_CODE: { table: 't_item', column: 'kode' }, ITEM_BARCODE: { table: 't_item', column: 'barcode' }, ITEM_NAME: { table: 't_item', column: 'nama' }, ITEM_UNIT: { table: 't_item', column: 'satuan' }, ITEM_ACTIVE: { table: 't_item', column: 'aktif' },
  STOCK_ITEM_ID: { table: 't_stok', column: 'item_id' }, STOCK_QTY: { table: 't_stok', column: 'qty' }, STOCK_WAREHOUSE: { table: 't_stok', column: 'gudang_id' },
  DOC_ID: { table: 't_doc', column: 'id' }, DOC_NO: { table: 't_doc', column: 'no' }, DOC_STATUS: { table: 't_doc', column: 'status' }, DOC_DATE: { table: 't_doc', column: 'tgl' }, DOC_STORE_REF: { table: 't_doc', column: 'toko_id' },
  LINE_DOC_ID: { table: 't_line', column: 'doc_id' }, LINE_NO: { table: 't_line', column: 'no' }, LINE_ITEM_ID: { table: 't_line', column: 'item_id' }, LINE_QTY: { table: 't_line', column: 'qty' }, LINE_UNIT: { table: 't_line', column: 'satuan' },
  STORE_ID: { table: 't_toko', column: 'id' }, STORE_NAME: { table: 't_toko', column: 'nama' }, ...over } });

test('without evidence or a mapping nothing is assumed: every adapter is blocked and every required role is named', () => {
  const none = validateGudangMapping(null, null);
  assert.deepEqual(none.eligibleAdapters, []); assert.equal(none.blockedAdapters.length, 3);
  const required = GUDANG_ROLES.filter((r) => r.required).map((r) => r.id);
  for (const id of required) assert.ok(none.gates.flatMap((g) => g.findings).some((x) => x.code === 'ROLE_UNMAPPED' && x.subject === id), id);
  assert.match(renderGudangReport(none, null), /no evidence provided/);
});

test('a complete, consistent mapping makes all three adapters eligible', () => {
  const r = validateGudangMapping(bundle(), mapping());
  assert.deepEqual(r.eligibleAdapters.sort(), ['DISPATCH_READER', 'ITEM_CATALOG', 'STOCK_READER']); assert.deepEqual(r.blockedAdapters, []); assert.ok(r.gates.every((g) => g.status === 'ELIGIBLE'));
  assert.deepEqual(r.notes, []);
});

test('a role mapped to a column that does not exist, or has an unusable type, blocks exactly the adapters that need it', () => {
  const ghost = validateGudangMapping(bundle(), mapping({ DOC_STORE_REF: { table: 't_doc', column: 'nope' } }));
  assert.deepEqual(ghost.eligibleAdapters.sort(), ['ITEM_CATALOG', 'STOCK_READER']); assert.ok(ghost.blockedAdapters[0].because.some((x) => x.startsWith('COLUMN_NOT_IN_EVIDENCE')));
  const bad = validateGudangMapping(bundle(), mapping({ LINE_QTY: { table: 't_line', column: 'satuan' } })); assert.ok(bad.blockedAdapters.some((a) => a.adapter === 'DISPATCH_READER' && a.because.some((x) => x.startsWith('TYPE_UNUSABLE'))));
  assert.ok(bad.eligibleAdapters.includes('ITEM_CATALOG'));
});

test('identity relies on keys: no unique key on the document or item id blocks; a missing line key blocks; code and number are only recommended', () => {
  const b = bundle({ indexes: [] });
  const r = validateGudangMapping(b, mapping()); const codes = r.gates.flatMap((g) => g.findings).filter((x) => x.level === 'blocker').map((x) => `${x.code} ${x.subject.split(' ')[0]}`);
  for (const must of ['NOT_UNIQUE ITEM_ID', 'NOT_UNIQUE DOC_ID', 'NOT_UNIQUE STORE_ID', 'LINE_KEY_MISSING LINE_DOC_ID']) assert.ok(codes.includes(must), must);
  assert.deepEqual(r.eligibleAdapters, []);
  const weak = validateGudangMapping(bundle({ indexes: bundle().indexes.filter((i) => i.index !== 'ux_kode' && i.index !== 'ux_no') }), mapping());
  assert.deepEqual(weak.eligibleAdapters.sort(), ['DISPATCH_READER', 'ITEM_CATALOG', 'STOCK_READER']); assert.ok(weak.gates.flatMap((g) => g.findings).filter((x) => x.code === 'NOT_UNIQUE').length === 2);
  const surrogate = validateGudangMapping(bundle({ indexes: [...bundle().indexes.filter((i) => i.index !== 'uk_line'), { table: 't_line', index: 'PRIMARY', unique: true, columns: ['id'] }] }), mapping()); assert.equal(surrogate.gates.find((g) => g.id === 'GU-LINE').status, 'ELIGIBLE');
});

test('roles spread across tables need a join: the mapping is refused for review rather than guessed', () => {
  const r = validateGudangMapping(bundle(), mapping({ DOC_STATUS: { table: 't_toko', column: 'nama' } }));
  assert.ok(r.gates.find((g) => g.id === 'GU-DOCUMENT').findings.some((x) => x.code === 'GROUP_SPLIT_ACROSS_TABLES')); assert.ok(r.blockedAdapters.some((a) => a.adapter === 'DISPATCH_READER'));
});

test('decimal quantities and missing optional roles are surfaced as decisions, not defaults', () => {
  const frac = bundle(); frac.columns.find((c) => c.table === 't_line' && c.column === 'qty').type = 'decimal(12,3)';
  const r = validateGudangMapping(frac, mapping()); assert.ok(r.gates.flatMap((g) => g.findings).some((x) => x.code === 'FRACTIONAL_QUANTITY_STORABLE' && x.message.includes('D10'))); assert.ok(r.eligibleAdapters.includes('DISPATCH_READER'));
  const lean = mapping(); delete lean.roles.ITEM_BARCODE; delete lean.roles.LINE_UNIT; const l = validateGudangMapping(bundle(), lean);
  assert.equal(l.notes.length, 2); assert.match(l.notes.join(' '), /code only/); assert.match(l.notes.join(' '), /D9/); assert.ok(l.eligibleAdapters.includes('ITEM_CATALOG'));
});
