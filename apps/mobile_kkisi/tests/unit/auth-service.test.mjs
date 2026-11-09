// Auth service against the in-memory store and fake ports (no database): login stages, PIN lockout, rotation, revocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, logout, pendingPinSession, resolveMember, verifyPin } from '../../src/server/auth/auth-service.ts';
import { MemoryMemberSessionStore } from '../../src/server/auth/memory-store.ts';
import { classifyIdentity, parseLoginInput, plainPinMatches, safeNextPath, MEMBER_IDLE_MS, PIN_STAGE_MS } from '../../src/server/auth/policy.ts';
import { parseSecrets } from '../../src/lib/config/env.ts';

const HASH = '$2y$10$abcdefghijklmnopqrstuuWfWbJ4xJ7q8q8z3QhS1yJm1aR0pXk6e';   // shape only; the fake verifier decides
function deps(overrides = {}) {
  let now = new Date('2026-11-09T03:00:00Z');
  const state = { active: true, deleted: false, pin: '2468' };
  const d = {
    identity: {
      findAccounts: async (q) => (q.keys.includes('10234') || q.keys.includes('anggota@contoh.test') ? [{ userId: 1, nik: '10234', passwordHash: HASH, active: state.active, deleted: state.deleted }] : []),
      storedPin: async () => state.pin,
      accountState: async () => ({ active: state.active, deleted: state.deleted }),
      memberByNik: async (keys) => (keys.includes('10234') ? [{ memberId: 9001, nik: '10234', name: 'UJI', status: 'AKTIVE' }] : []),
    },
    store: new MemoryMemberSessionStore(),
    verifier: { verify: async (pw, hash) => hash === HASH && pw === 'benar' },
    secrets: parseSecrets(`k1:${Buffer.alloc(32, 7).toString('base64')}`),
    now: () => now,
    log: () => {},
    ...overrides,
  };
  return { d, state, advance: (ms) => { now = new Date(now.getTime() + ms); } };
}

test('identity classification: NIK keys, email, phone spellings', () => {
  assert.deepEqual(classifyIdentity('0010234').keys, ['0010234', '10234']);
  assert.equal(classifyIdentity('Anggota@Contoh.Test').keys[0], 'anggota@contoh.test');
  assert.deepEqual(classifyIdentity('+62 812-0000-0001').keys.sort(), ['+6281200000001', '081200000001', '6281200000001'].sort());
  assert.equal(classifyIdentity('bad id with spaces'), null);
  assert.deepEqual(parseLoginInput({ identity: ' ', password: 'x' }), { ok: false, error: 'IDENTITY_REQUIRED' });
  assert.deepEqual(parseLoginInput({ identity: '10234', password: '' }), { ok: false, error: 'PASSWORD_REQUIRED' });
  assert.equal(parseLoginInput({ identity: '10234', password: ' spaced ' }).value.password, ' spaced ', 'password is never trimmed');
});

test('PIN comparison and redirect safety', () => {
  assert.equal(plainPinMatches('2468', '2468'), true);
  assert.equal(plainPinMatches('2468', ' 2468 '), true);
  assert.equal(plainPinMatches('246', '2468'), false);
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '/api/auth/logout', '/masuk', '/pin?x=1', '']) assert.equal(safeNextPath(bad), '/beranda', bad);
  assert.equal(safeNextPath('/simpanan?tab=setoran'), '/simpanan?tab=setoran');
});

test('login opens a PIN-stage session; PIN rotates it into an active session', async () => {
  const { d } = deps();
  const r = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal(r.ok, true);
  assert.ok(await pendingPinSession(d, r.sid));
  assert.equal(await resolveMember(d, r.sid), null);
  const p = await verifyPin(d, r.sid, '2468');
  assert.equal(p.ok, true);
  assert.notEqual(p.sid, r.sid);
  assert.equal((await resolveMember(d, p.sid)).memberId, 9001);
  assert.equal(await pendingPinSession(d, r.sid), null);
});

test('wrong password and unknown identity are indistinguishable; throttle locks the identity', async () => {
  const { d } = deps();
  assert.deepEqual(await login(d, { identity: '10234', password: 'salah' }, null), { ok: false, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual(await login(d, { identity: '77777', password: 'benar' }, null), { ok: false, code: 'INVALID_CREDENTIALS' });
  for (let i = 0; i < 7; i++) await login(d, { identity: '10234', password: 'salah' }, null);
  const locked = await login(d, { identity: '0010234', password: 'benar' }, null);
  assert.equal(locked.code, 'THROTTLED', 'the same member via another NIK spelling is locked too');
});

test('PIN stage expires; five wrong PINs revoke; malformed PIN is rejected without counting', async () => {
  const { d, advance } = deps();
  const r = await login(d, { identity: '10234', password: 'benar' }, null);
  assert.deepEqual(await verifyPin(d, r.sid, 'abcd'), { ok: false, code: 'PIN_MALFORMED' });
  for (let i = 4; i >= 1; i--) assert.equal((await verifyPin(d, r.sid, '0000')).remaining, i);
  assert.deepEqual(await verifyPin(d, r.sid, '0000'), { ok: false, code: 'PIN_LOCKED' });
  const r2 = await login(d, { identity: '10234', password: 'benar' }, null);
  advance(PIN_STAGE_MS + 1);
  assert.deepEqual(await verifyPin(d, r2.sid, '2468'), { ok: false, code: 'SESSION_EXPIRED' });
});

test('idle timeout, account deactivation and logout end the session', async () => {
  const { d, state, advance } = deps();
  const sid = (await verifyPin(d, (await login(d, { identity: '10234', password: 'benar' }, null)).sid, '2468')).sid;
  advance(MEMBER_IDLE_MS - 1000);
  assert.ok(await resolveMember(d, sid), 'still valid just before the idle deadline');
  advance(MEMBER_IDLE_MS + 1);
  assert.equal(await resolveMember(d, sid), null, 'idle deadline slides only on activity');
  const sid2 = (await verifyPin(d, (await login(d, { identity: '10234', password: 'benar' }, null)).sid, '2468')).sid;
  state.active = false;
  assert.equal(await resolveMember(d, sid2), null);
  state.active = true;
  const sid3 = (await verifyPin(d, (await login(d, { identity: '10234', password: 'benar' }, null)).sid, '2468')).sid;
  await logout(d, sid3);
  assert.equal(await resolveMember(d, sid3), null);
});

test('inactive or deleted accounts are refused only after a correct password; missing PIN is reported', async () => {
  const { d, state } = deps();
  state.deleted = true;
  assert.deepEqual(await login(d, { identity: '10234', password: 'benar' }, null), { ok: false, code: 'ACCOUNT_INACTIVE' });
  state.deleted = false; state.pin = null;
  const r = await login(d, { identity: '10234', password: 'benar' }, null);
  assert.deepEqual(await verifyPin(d, r.sid, '2468'), { ok: false, code: 'PIN_NOT_SET' });
});
