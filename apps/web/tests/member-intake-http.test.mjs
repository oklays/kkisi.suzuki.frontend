import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError, KosipaFieldError } from '@koperasi/domain/kosipa';
import { NonceCache, parseIntakeKeys, signIntakeRequest } from '@koperasi/application/member-intake/signature';
import { INTAKE_PATH, handleMemberIntake, intakeDepsFromEnv, isInternalCaller } from '../src/infrastructure/member-intake/http.ts';

// Signed internal intake endpoint (P1), without a database: the repository is a fake.
const KEYS = parseIntakeKeys(`k1:${Buffer.alloc(32, 4).toString('base64')}`);
const member = { memberId: 9001, userId: 101, nik: '10234' };
const body = JSON.stringify({ kind: 'loan', clientKey: 'idem-http-0000000001', member, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Sekolah' });

function deps(extra = {}, behaviour = 'ok') {
  const logs = [];
  const requests = {
    async intakeLoan() {
      if (behaviour === 'field') throw new KosipaFieldError('REQUEST_FIELD_INVALID', 'amountRp');
      if (behaviour === 'limit') throw new KosipaError('REQUEST_OPEN_LIMIT');
      if (behaviour === 'crash') throw new Error('db exploded with secret detail');
      return { result: { docNo: 'PGJ-MBL-20261110-ABCDEF', status: 'OPEN', type: 'loan', summary: { status: 'OPEN' } }, replayed: behaviour === 'replay', ledgerId: 1 };
    },
  };
  return { enabled: true, keys: KEYS, trustedProxyHops: 1, ports: { ownership: { owns: () => true }, now: () => new Date(), requests }, nonces: new NonceCache(), now: () => new Date(), log: (e, f) => logs.push([e, f]), logs, ...extra };
}
const request = (opts = {}) => {
  const b = opts.body ?? body;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': opts.xff ?? '172.18.0.3', ...(opts.headers ?? {}) };
  if (opts.sign !== false) headers['x-kkisi-intake'] = signIntakeRequest(KEYS, { method: 'POST', path: INTAKE_PATH, body: opts.signedBody ?? b });
  return new Request(`http://genesis-web-netns:3000${INTAKE_PATH}`, { method: 'POST', headers, body: b });
};
const call = async (r, d) => { const res = await handleMemberIntake(r, d); return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }; };

test('a signed request from the container network records the request (201) and replays (200)', async () => {
  assert.deepEqual(await call(request(), deps()), { status: 201, body: { ok: true, replayed: false, docNo: 'PGJ-MBL-20261110-ABCDEF', status: 'OPEN', type: 'loan', summary: { status: 'OPEN' } }, cache: 'no-store' });
  assert.equal((await call(request(), deps({}, 'replay'))).status, 200);
});

test('refusals: disabled, public caller, unsigned, tampered, replayed nonce, wrong type, oversize, not configured', async () => {
  assert.equal((await call(request(), deps({ enabled: false }))).status, 404);
  const pub = deps();
  assert.equal((await call(request({ xff: '203.0.113.9' }), pub)).status, 404, 'through the public proxy the endpoint does not exist');
  assert.equal(pub.logs[0][0], 'member_intake_external_refused');
  assert.equal((await call(request({ sign: false }), deps())).status, 401);
  assert.equal((await call(request({ signedBody: body.replace('5000000', '50000000') }), deps())).status, 401, 'signature covers the exact body');
  const d = deps();
  const r1 = request();
  const header = r1.headers.get('x-kkisi-intake');
  assert.equal((await call(r1, d)).status, 201);
  assert.equal((await call(request({ sign: false, headers: { 'x-kkisi-intake': header } }), d)).status, 401, 'the same nonce is refused');
  assert.equal((await call(request({ headers: { 'content-type': 'text/plain' } }), deps())).status, 415);
  const big = JSON.stringify({ pad: 'x'.repeat(5000) });
  assert.equal((await call(request({ body: big }), deps())).status, 413);
  assert.equal((await call(request(), deps({ keys: null }))).status, 503);
});

test('errors are code-only: field errors name the field, internal failures never leak detail', async () => {
  assert.deepEqual((await call(request(), deps({}, 'field'))).body, { error: 'REQUEST_FIELD_INVALID', field: 'amountRp' });
  const limit = await call(request(), deps({}, 'limit'));
  assert.deepEqual([limit.status, limit.body], [409, { error: 'REQUEST_OPEN_LIMIT' }]);
  const crash = await call(request(), deps({}, 'crash'));
  assert.deepEqual([crash.status, crash.body], [503, { error: 'UNAVAILABLE' }]);
  const forged = await call(request({ body: JSON.stringify({ ...JSON.parse(body), doc_status: 'APPROVED' }) }), deps());
  assert.deepEqual([forged.status, forged.body], [400, { error: 'FIELD_NOT_ALLOWED' }]);
});

test('internal caller rule and fail-closed configuration', () => {
  const h = (xff) => new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff });
  assert.equal(isInternalCaller(h('127.0.0.1'), 1), true);
  assert.equal(isInternalCaller(h('::ffff:10.1.2.3'), 1), true);
  assert.equal(isInternalCaller(h('8.8.8.8, 172.20.0.1'), 1), true, 'right-most trusted hop');
  assert.equal(isInternalCaller(h('172.32.0.1'), 1), false);
  assert.equal(isInternalCaller(h(undefined), 1), false);
  assert.equal(isInternalCaller(h('8.8.8.8'), 0), true, 'no proxy configured (local development)');
  const off = intakeDepsFromEnv({ KOSIPA_MEMBER_INTAKE_ENABLED: 'true', MEMBER_INTAKE_KEYS: 'k1:short' }, () => { throw new Error('ports must not be built'); });
  assert.deepEqual([off.enabled, off.keys, off.ports], [true, null, null]);
  assert.equal(intakeDepsFromEnv({}, () => ({})).enabled, false);
});
