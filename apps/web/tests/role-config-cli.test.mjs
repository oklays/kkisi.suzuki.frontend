import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../scripts/validate-role-config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'roles-')); test.after(() => rmSync(dir, { recursive: true, force: true }));
const put = (o) => { const p = join(dir, `${Math.random()}.json`); writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return p; };
const cap = (argv) => { let out = ''; const code = run(argv, { write: (s) => { out += s; } }); return { code, out }; };
const synthetic = { version: 1, tokoRoles: [{ roleId: 4, name: 'SYN KASIR', active: true, slugs: ['sales_add'] }], branches: [{ companyId: 1, active: true }], tokoUsers: [{ u: 'abcdef012345', roleId: 4, companyId: 1, active: true }], kosipaGroups: [], kosipaUsers: [] };

test('the CLI evaluates a pseudonymised bundle with the real navigation registry (mysql --batch header accepted)', () => {
  const r = cap(['--bundle', put('role_config\n' + JSON.stringify(synthetic))]);
  assert.equal(r.code, 0); assert.match(r.out, /\| 4 SYN KASIR \| yes \| 1 \| 1 \| no \| TOKO Cashier \| \/pos \| dashboard, toko-pos \|/); assert.doesNotMatch(r.out, /abcdef012345/);
});

test('a bundle with user-identifying fields or without the expected shape is refused with exit 1', () => {
  assert.equal(cap(['--bundle', put({ ...synthetic, tokoUsers: [{ u: 'abcdef012345', roleId: 4, companyId: 1, active: true, username: 'x' }] })]).code, 1);
  assert.equal(cap(['--bundle', put({ version: 1 })]).code, 1); assert.equal(cap([]).code, 1);
});
