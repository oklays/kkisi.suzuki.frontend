import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../scripts/validate-capacity-evidence.mjs';

const dir = mkdtempSync(join(tmpdir(), 'cap-')); test.after(() => rmSync(dir, { recursive: true, force: true }));
const put = (o) => { const p = join(dir, `${Math.random()}.json`); writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return p; };
const cap = (argv) => { let out = ''; const code = run(argv, { write: (s) => { out += s; } }); return { code, out }; };

test('exit codes: 0 fits, 2 does not fit or insufficient evidence (the honest state), 1 unusable input; the report names what is missing', () => {
  const ok = cap(['--evidence', put({ scope: 'hosting-wide', limit: 20, legacyPhpPeak: 4, reserve: 2, instances: 1 }), '--pools', 'reader,auth,console']); assert.equal(ok.code, 0); assert.match(ok.out, /verdict: FITS/);
  const no = cap(['--evidence', put({ scope: 'hosting-wide', limit: 20, legacyPhpPeak: 15, reserve: 2, instances: 1 })]); assert.equal(no.code, 2); assert.match(no.out, /DOES_NOT_FIT/);
  const missing = cap(['--evidence', put({ scope: 'hosting-wide', limit: 20, legacyPhpPeak: null, reserve: 2, instances: 1 })]); assert.equal(missing.code, 2); assert.match(missing.out, /INSUFFICIENT_EVIDENCE/); assert.match(missing.out, /measured legacy PHP peak/);
  for (const argv of [[], ['--evidence', join(dir, 'nope.json')], ['--evidence', put('not json')], ['--evidence', put({}), '--pools', 'reader,bogus']]) assert.equal(cap(argv).code, 1, JSON.stringify(argv));
});
