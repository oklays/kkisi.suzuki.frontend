import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KOSIPA_TABLE_CONTRACT } from '../../../packages/domain/src/kosipa/index.ts';
import { run, extractJson } from '../scripts/validate-schema-evidence.mjs';

const TYPE = { int: 'int(11)', string: 'varchar(50)', enum: "enum('A')", decimal: 'decimal(18,2)', double: 'double(18,4)', date: 'date', datetime: 'datetime' };
const MARK = 'DEFINITION_BODY_MARKER_5521';
const bundle = () => ({
  version: 1, schema: 'synthetic', capturedAt: '2026-10-17T00:00:00Z', indexes: [], triggers: [], routines: [], views: [{ name: 'v_kartu_simpanan', definition: `select NULL AS a /* ${MARK} */` }],
  columns: Object.entries(KOSIPA_TABLE_CONTRACT).flatMap(([table, reqs]) => reqs.map((r) => ({ table, column: r.column, type: TYPE[r.family[0]], nullable: 1 }))),
  server: { version: '10.6', sqlMode: '', maxUserConnections: 20 },
});
const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
const put = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const capture = (argv) => { let out = ''; const code = run(argv, { write: (s) => { out += s; } }); return { code, out }; };
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('mysql --batch output (column header, escaped backslashes) is accepted as the same document', () => {
  const doc = JSON.stringify({ a: 'say "hi" x\\y' });
  assert.deepEqual(extractJson(doc).value, { a: 'say "hi" x\\y' });
  assert.deepEqual(extractJson('evidence_bundle\n' + doc).value, { a: 'say "hi" x\\y' });
  assert.deepEqual(extractJson(doc.replace(/\\/g, '\\\\')).value, { a: 'say "hi" x\\y' });
  assert.equal(extractJson('{"truncated":').ok, false); assert.match(extractJson('{"truncated":').error, /group_concat_max_len/);
});

test('a bundle with stubbed views yields a report with BLOCKED gates, exit code 2, and no definition text', () => {
  const { code, out } = capture(['--bundle', put('b.json', JSON.stringify(bundle()))]);
  assert.equal(code, 2); assert.match(out, /G1[^\n]*\*\*ELIGIBLE\*\*/); assert.match(out, /G2[^\n]*\*\*BLOCKED\*\*/); assert.ok(!out.includes(MARK));
  assert.match(out, /ROUTINE_MISSING x_proc_create_matrix/);
});

test('--out writes the report to a file instead of stdout; --scan prints counts only', () => {
  const b = bundle(); b.routines = [{ name: 'p', type: 'PROCEDURE', definition: "set @pw = 'password'; -- ops@example.com" }];
  const outFile = join(dir, 'report.md');
  const r = capture(['--bundle', put('c.json', JSON.stringify(b)), '--scan', '--out', outFile]);
  assert.equal(r.out, ''); const text = readFileSync(outFile, 'utf8');
  assert.match(text, /password \/ identified by: 1 object/); assert.match(text, /e-mail address: 1 object/); assert.ok(!text.includes('ops@example.com'));
});

test('unusable input exits 1 with a precise message and writes no report', () => {
  for (const [argv, msg] of [[[], /usage/], [['--bundle', join(dir, 'missing.json')], /cannot read/], [['--bundle', put('bad.json', '{"version":2}')], /bundle refused: unsupported bundle version/], [['--bogus'], /unknown argument/], [['--bundle', put('trunc.json', '{"version":1,')], /not valid JSON/]]) {
    const r = capture(argv); assert.equal(r.code, 1, JSON.stringify(argv)); assert.match(r.out, msg);
  }
});

test('Gudang: with a bundle but no mapping every adapter stays blocked; nothing is guessed from table names', () => {
  const g = { version: 1, schema: 'gudang_synth', columns: [{ table: 'barang', column: 'kode', type: 'varchar(20)' }, { table: 'barang', column: 'id', type: 'int(11)' }], indexes: [{ table: 'barang', index: 'PRIMARY', unique: true, columns: ['id'] }], views: [], routines: [], triggers: [] };
  const r = capture(['--gudang-bundle', put('g.json', JSON.stringify(g))]);
  assert.equal(r.code, 2); assert.match(r.out, /ROLE_UNMAPPED/); assert.ok(!/ELIGIBLE\*\*[^\n]*ITEM_CATALOG/.test(r.out));
});
