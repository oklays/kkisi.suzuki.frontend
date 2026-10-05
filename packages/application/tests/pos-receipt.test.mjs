import assert from 'node:assert/strict';
import test from 'node:test';
import { readReceipt } from '../src/pos/read-receipt.usecase.ts';

test('receipt rejects unsafe IDs before reading and keeps the session company', async () => {
  const calls = [];
  const repo = { async find(companyId, id) { calls.push([companyId, id]); return { saleId: id }; } };
  for (const id of ['0', '01', '-1', '1e2', '9007199254740992', 'x']) {
    await assert.rejects(readReceipt(repo, { companyId: 7 }, id), { code: 'INVALID_INPUT' });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await readReceipt(repo, { companyId: 7 }, '42'), { saleId: 42 });
  assert.deepEqual(calls, [[7, 42]]);
});

test('missing or other-branch receipt is indistinguishable', async () => {
  await assert.rejects(readReceipt({ find: async () => null }, { companyId: 7 }, '42'), { code: 'NOT_FOUND' });
});

test('receipt read carries a trusted explicit mode into its repository', async () => {
  const modes = [];
  const repo = { async find(_companyId, id, mode) { modes.push(mode); return { saleId: id, mode }; } };
  assert.deepEqual(await readReceipt(repo, { companyId: 7 }, '42', 'reprint'), { saleId: 42, mode: 'reprint' });
  assert.deepEqual(modes, ['reprint']);
});
