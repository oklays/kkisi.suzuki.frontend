import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '../src/kosipa/errors.ts';
import { canonicalJson, commandFingerprint, idempotencyDecision, ledgerSnapshot, parseIdempotencyKey, parseReason } from '../src/kosipa/command.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e)); return e.code; } };
const KEY = '6f1c2a4e-1b7d-4c55-9a0e-2a3f4b5c6d7e';

test('idempotency key: UUID v4 only, normalised to lower case (VAL-109)', () => {
  assert.equal(parseIdempotencyKey(` ${KEY.toUpperCase()} `), KEY);
  for (const bad of [undefined, null, 42, '', 'not-a-uuid', '6f1c2a4e-1b7d-1c55-9a0e-2a3f4b5c6d7e', '6f1c2a4e-1b7d-4c55-7a0e-2a3f4b5c6d7e', `${KEY}x`, "1' OR '1'='1"]) {
    assert.equal(code(() => parseIdempotencyKey(bad)), 'IDEMPOTENCY_KEY_INVALID', String(bad));
  }
});

test('canonical JSON ignores key order and undefined members; refuses non-JSON values', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, 'x'], c: null }, u: undefined }), '{"a":{"c":null,"d":[1,"x"]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
  for (const bad of [{ a: NaN }, { a: Infinity }, { a: new Date() }, { a: () => 1 }, { a: 1n }]) assert.equal(code(() => canonicalJson(bad)), 'INVALID_INPUT');
  let deep = {}; for (let i = 0; i < 12; i++) deep = { deep };
  assert.equal(code(() => canonicalJson(deep)), 'INVALID_INPUT');
});

test('fingerprint binds command, subject and payload', () => {
  const base = commandFingerprint('master.lokasi.create', { type: 'master.lokasi', ref: 'new' }, { code: 'A', name: 'B' });
  assert.equal(base, commandFingerprint('master.lokasi.create', { type: 'master.lokasi', ref: 'new' }, { name: 'B', code: 'A' }));
  assert.notEqual(base, commandFingerprint('master.lokasi.update', { type: 'master.lokasi', ref: 'new' }, { code: 'A', name: 'B' }));
  assert.notEqual(base, commandFingerprint('master.lokasi.create', { type: 'master.lokasi', ref: '7' }, { code: 'A', name: 'B' }));
  assert.notEqual(base, commandFingerprint('master.lokasi.create', { type: 'master.lokasi', ref: 'new' }, { code: 'A', name: 'C' }));
});

test('idempotency decision: nothing stored -> execute; same request -> replay; anything else -> conflict', () => {
  const stored = { ledgerId: 5, command: 'master.lokasi.create', requestHash: 'h1', result: { id: 3 } };
  assert.deepEqual(idempotencyDecision(null, { command: 'master.lokasi.create', requestHash: 'h1' }), { kind: 'execute' });
  assert.deepEqual(idempotencyDecision(stored, { command: 'master.lokasi.create', requestHash: 'h1' }), { kind: 'replay', ledgerId: 5, result: { id: 3 } });
  assert.equal(code(() => idempotencyDecision(stored, { command: 'master.lokasi.create', requestHash: 'h2' })), 'IDEMPOTENCY_CONFLICT');
  assert.equal(code(() => idempotencyDecision(stored, { command: 'master.lokasi.update', requestHash: 'h1' })), 'IDEMPOTENCY_CONFLICT');
});

test('reasons are 5-200 printable characters after trimming (VAL-108)', () => {
  assert.equal(parseReason('  lokasi\n tutup   permanen '), 'lokasi tutup permanen');
  for (const bad of [undefined, 7, '', 'abcd', ' a  b ', 'x'.repeat(201), 'abc\u0000def']) assert.equal(code(() => parseReason(bad)), 'REASON_INVALID', JSON.stringify(bad));
  assert.equal(parseReason('x'.repeat(200)).length, 200);
});

test('ledger snapshot keeps only listed scalar fields and caps strings', () => {
  assert.deepEqual(ledgerSnapshot({ id: 1, code: 'A', nik_kar: '123', obj: { a: 1 }, name: 'n'.repeat(300), status: 0, missing: undefined }, ['id', 'code', 'name', 'status', 'obj', 'missing']),
    { id: 1, code: 'A', name: 'n'.repeat(200), status: 0 });
});
