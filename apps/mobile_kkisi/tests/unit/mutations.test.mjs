// P0 hardening of the member mutation path: strict body parsing and the ledger/lease contract (no database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMutationCommand } from '../../src/server/writers/mutation-commands.ts';
import { MemoryCommandLedgerStore } from '../../src/server/writers/member-mutations.ts';
import { HttpMemberIntakeClient, INTAKE_PATH } from '../../src/server/writers/intake-client.ts';
import { parseIntakeKeys, verifyIntakeRequest } from '@koperasi/application/member-intake/signature';

const KEY = 'idem-unit-test-000001';
const loan = { kind: 'loan_application', idempotencyKey: KEY, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah' };

test('strict parser: typed commands pass, unknown or forged fields are refused', () => {
  assert.deepEqual(parseMutationCommand(loan), { ok: true, cmd: loan });
  assert.deepEqual(parseMutationCommand({ ...loan, status: 'APPROVED' }).error, { code: 'FIELD_NOT_ALLOWED', field: 'status' });
  assert.deepEqual(parseMutationCommand({ ...loan, nik: '999' }).error, { code: 'FIELD_NOT_ALLOWED', field: 'nik' });
  assert.deepEqual(parseMutationCommand({ ...loan, amountRp: '5000000' }).error, { code: 'INVALID_INPUT', field: 'amountRp' });
  assert.deepEqual(parseMutationCommand({ ...loan, amountRp: 1.5 }).error, { code: 'INVALID_INPUT', field: 'amountRp' });
  assert.deepEqual(parseMutationCommand({ ...loan, months: -1 }).error, { code: 'INVALID_INPUT', field: 'months' });
  assert.deepEqual(parseMutationCommand({ ...loan, purpose: 'a\u0000b' }).error, { code: 'INVALID_INPUT', field: 'purpose' });
  assert.deepEqual(parseMutationCommand({ ...loan, kind: 'withdraw_all' }).error, { code: 'INVALID_INPUT', field: 'kind' });
  assert.deepEqual(parseMutationCommand([loan]).error, { code: 'INVALID_INPUT' });
  assert.deepEqual(parseMutationCommand(null).error, { code: 'INVALID_INPUT' });
});

test('strict parser: deduction, favourite, checkout and PPOB shapes', () => {
  const ded = { kind: 'deduction_change', idempotencyKey: KEY, savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000, consent: true };
  assert.equal(parseMutationCommand(ded).ok, true);
  assert.equal(parseMutationCommand({ ...ded, requestedRp: '150000' }).ok, false);
  assert.equal(parseMutationCommand({ ...ded, consent: 'yes' }).ok, false);
  assert.equal(parseMutationCommand({ ...ded, savingsType: '   ' }).ok, false);
  assert.equal(parseMutationCommand({ kind: 'favourite_toggle', idempotencyKey: KEY, productId: 3, action: 'add' }).ok, true);
  assert.equal(parseMutationCommand({ kind: 'favourite_toggle', idempotencyKey: KEY, productId: 3, action: 'toggle' }).ok, false);
  const cart = { kind: 'store_checkout', idempotencyKey: KEY, items: [{ id: 1, quantity: 2 }], payment: 'kredit' };
  assert.equal(parseMutationCommand(cart).ok, true);
  assert.equal(parseMutationCommand({ ...cart, items: [{ id: 1, quantity: 2, price: 1 }] }).ok, false, 'a client price is never accepted');
  assert.equal(parseMutationCommand({ ...cart, items: [{ id: 1, quantity: 100 }] }).ok, false);
  assert.equal(parseMutationCommand({ ...cart, items: [] }).ok, false);
  assert.equal(parseMutationCommand({ ...cart, items: Array.from({ length: 41 }, (_, i) => ({ id: i + 1, quantity: 1 })) }).ok, false);
  assert.equal(parseMutationCommand({ kind: 'ppob', idempotencyKey: KEY, serviceId: 'pulsa', account: '081234567890' }).ok, true);
});

test('idempotency key: header or body, equal when both, well-formed', () => {
  const { idempotencyKey, ...noKey } = loan;
  assert.equal(parseMutationCommand(noKey, idempotencyKey).cmd.idempotencyKey, KEY);
  assert.equal(parseMutationCommand(loan, KEY).ok, true);
  assert.deepEqual(parseMutationCommand(loan, 'idem-other-key-000002').error, { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.deepEqual(parseMutationCommand(noKey).error, { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.deepEqual(parseMutationCommand({ ...loan, idempotencyKey: 'short' }).error, { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.deepEqual(parseMutationCommand({ ...loan, idempotencyKey: 42 }).error, { code: 'INVALID_IDEMPOTENCY_KEY' });
});

test('ledger: reservation is exclusive, completion records the doc_no, release frees only PENDING rows', async () => {
  const l = new MemoryCommandLedgerStore();
  const ref = { memberId: 7, kind: 'loan_application', key: KEY };
  const now = new Date('2026-11-10T03:00:00Z');
  assert.deepEqual(await l.reserve({ ...ref, nik: '10234', payloadHash: 'h1', docNo: 'PGJ-MBL-1', now }), { reserved: true });
  assert.deepEqual(await l.reserve({ ...ref, nik: '10234', payloadHash: 'h1', docNo: 'PGJ-MBL-1', now }), { reserved: false, existing: { payloadHash: 'h1', status: 'PENDING', docNo: 'PGJ-MBL-1' } });
  await l.complete(ref, 'PGJ-MBL-1');
  await l.release(ref);
  assert.equal((await l.reserve({ ...ref, nik: '10234', payloadHash: 'h1', docNo: null, now })).existing.status, 'RECORDED', 'a recorded row is never released');
});

test('lease: one holder per member until release or expiry', async () => {
  const l = new MemoryCommandLedgerStore();
  const now = new Date('2026-11-10T03:00:00Z');
  assert.equal(await l.acquireLease(7, 'a', now, 30_000), true);
  assert.equal(await l.acquireLease(7, 'b', now, 30_000), false);
  assert.equal(await l.acquireLease(8, 'b', now, 30_000), true, 'other members are independent');
  await l.releaseLease(7, 'b');
  assert.equal(await l.acquireLease(7, 'b', now, 30_000), false, 'only the holder releases');
  assert.equal(await l.acquireLease(7, 'b', new Date(now.getTime() + 30_001), 30_000), true, 'an expired lease is taken over');
});

test('intake client: signs the exact body for the fixed path and maps replies', async () => {
  const keys = parseIntakeKeys(`k1:${Buffer.alloc(32, 8).toString('base64')}`);
  const sent = [];
  const reply = (status, body) => async (url, init) => { sent.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }); };
  const body = { kind: 'loan', clientKey: KEY, member: { memberId: 7, userId: 8, nik: '10234' }, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'x' };
  const ok = await new HttpMemberIntakeClient({ baseUrl: 'http://genesis-web-netns:3000', keys }, reply(201, { ok: true, replayed: false, docNo: 'PGJ-MBL-1', summary: { status: 'OPEN' } })).submit(body);
  assert.deepEqual(ok, { ok: true, status: 201, replayed: false, docNo: 'PGJ-MBL-1', summary: { status: 'OPEN' } });
  assert.equal(sent[0].url, `http://genesis-web-netns:3000${INTAKE_PATH}`);
  assert.equal(sent[0].init.redirect, 'error');
  assert.equal(verifyIntakeRequest(keys, sent[0].init.headers['x-kkisi-intake'], { method: 'POST', path: INTAKE_PATH, body: sent[0].init.body }).ok, true);
  const client = (status, b) => new HttpMemberIntakeClient({ baseUrl: 'http://x:1', keys }, reply(status, b));
  assert.deepEqual(await client(409, { error: 'REQUEST_OPEN_LIMIT' }).submit(body), { ok: false, kind: 'refused', status: 409, code: 'REQUEST_OPEN_LIMIT' });
  assert.deepEqual(await client(422, { error: 'REQUEST_FIELD_INVALID', field: 'amountRp' }).submit(body), { ok: false, kind: 'refused', status: 422, code: 'REQUEST_FIELD_INVALID', field: 'amountRp' });
  for (const [status, b] of [[401, { error: 'UNAUTHORIZED' }], [404, { error: 'NOT_FOUND' }], [503, { error: 'UNAVAILABLE' }], [200, { ok: false }]]) {
    assert.deepEqual(await client(status, b).submit(body), { ok: false, kind: 'unavailable' }, String(status));
  }
  const thrown = await new HttpMemberIntakeClient({ baseUrl: 'http://x:1', keys }, async () => { throw new TypeError('fetch failed'); }).submit(body);
  assert.deepEqual(thrown, { ok: false, kind: 'unavailable' });
});
