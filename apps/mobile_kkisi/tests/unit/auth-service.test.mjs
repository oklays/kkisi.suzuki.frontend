// Auth service against the in-memory store and fake ports (no database): login stages, PIN lockout, rotation, revocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, logout, pendingPinSession, resolveMember, verifyPin } from '../../src/server/auth/auth-service.ts';
import { MemoryMemberSessionStore } from '../../src/server/auth/memory-store.ts';
import {
  classifyIdentity, hashPin, parseLoginInput, plainPinMatches, resolveMemberIdentity, safeNextPath, verifyStoredPin,
  MEMBER_IDLE_MS, PIN_STAGE_MS,
} from '../../src/server/auth/policy.ts';
import { derivePinPeppers, parseSecrets } from '../../src/lib/config/env.ts';
import { throttleKey } from '../../src/server/auth/crypto.ts';

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

test('WS-01: memory-hard scrypt+pepper PIN hashing, multi-scheme verifier, and shadow credential upgrade', async () => {
  const secrets = parseSecrets(`k1:${Buffer.alloc(32, 9).toString('base64')}`);
  const peppers = derivePinPeppers(secrets);
  const hashed = await hashPin('2468', peppers[0]);
  assert.match(hashed, /^\$scrypt-p\$kid=k1,n=16384,r=8,p=1\$/);
  const okPeppered = await verifyStoredPin('2468', hashed, { peppers });
  assert.deepEqual(okPeppered, { ok: true, scheme: 'scrypt-p', needsUpgrade: false });
  assert.equal((await verifyStoredPin('9999', hashed, { peppers })).ok, false);

  const unpeppered = await hashPin('2468');
  assert.match(unpeppered, /^\$scrypt\$n=16384,r=8,p=1\$/);
  assert.deepEqual(await verifyStoredPin('2468', unpeppered, { peppers }), { ok: true, scheme: 'scrypt', needsUpgrade: true });
  assert.deepEqual(await verifyStoredPin('2468', '2468', { peppers }), { ok: true, scheme: 'plain', needsUpgrade: true });

  // Verify shadow credential upgrade on login + automatic re-upgrade when upstream users.pin changes
  const { d, state } = deps();
  const r1 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal((await verifyPin(d, r1.sid, '2468', '1.2.3.4')).ok, true);
  const cred1 = await d.store.pinCredentialGet(1);
  assert.ok(cred1 && cred1.hashScheme === 'scrypt-p' && cred1.pinHash.startsWith('$scrypt-p$'));

  // Subsequent login verifies against the shadow scrypt-p hash
  const r2 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal((await verifyPin(d, r2.sid, '2468', '1.2.3.4')).ok, true);

  // If upstream smartkkisi resets users.pin to '1357', sourceDigest changes so the new PIN is accepted and re-hashed
  state.pin = '1357';
  const r3 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal((await verifyPin(d, r3.sid, '2468', '1.2.3.4')).ok, false);
  assert.equal((await verifyPin(d, r3.sid, '1357', '1.2.3.4')).ok, true);
  const cred2 = await d.store.pinCredentialGet(1);
  assert.notEqual(cred2.sourceDigest, cred1.sourceDigest);
});

test('WS-01: cross-session PIN failure carryover and account-level PIN lockout defeat session hopping', async () => {
  const { d } = deps();
  // Session 1: fail PIN 3 times (remaining: 4, 3, 2)
  const s1 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal((await verifyPin(d, s1.sid, '0000', '1.2.3.4')).remaining, 4);
  assert.equal((await verifyPin(d, s1.sid, '0000', '1.2.3.4')).remaining, 3);
  assert.equal((await verifyPin(d, s1.sid, '0000', '1.2.3.4')).remaining, 2);

  // Attacker re-logs in to get a fresh PIN session: s1 is revoked and s2 carries over 3 failures!
  const s2 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal(await pendingPinSession(d, s1.sid), null, 'prior PIN session revoked on new login');
  assert.equal((await verifyPin(d, s2.sid, '0000', '1.2.3.4')).remaining, 1, 'carried 3 failures into s2');
  assert.deepEqual(await verifyPin(d, s2.sid, '0000', '1.2.3.4'), { ok: false, code: 'PIN_LOCKED' });

  // Second 5-failure cycle triggers account-level PIN throttle (10 total failures)
  const s3 = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  for (let i = 0; i < 4; i++) await verifyPin(d, s3.sid, '0000', '1.2.3.4');
  assert.deepEqual(await verifyPin(d, s3.sid, '0000', '1.2.3.4'), { ok: false, code: 'PIN_LOCKED' });

  // Now even login() is throttled at the account level for 15 minutes
  const lockedLogin = await login(d, { identity: '10234', password: 'benar' }, '1.2.3.4');
  assert.equal(lockedLogin.code, 'THROTTLED');
});

test('P0: parallel PIN guesses each take a counted slot; the account locks after the limit', async () => {
  const { d } = deps();
  const r = await login(d, { identity: '10234', password: 'benar' }, null);
  const guesses = Array.from({ length: 12 }, (_, i) => String(1000 + i));
  const results = await Promise.all(guesses.map((g) => verifyPin(d, r.sid, g)));
  assert.ok(results.every((x) => !x.ok));
  const state = await d.store.throttleGet(throttleKey('pin', '1', d.secrets[0]));
  assert.equal(state.failures, 12, 'every parallel attempt was counted exactly once');
  const again = await login(d, { identity: '10234', password: 'benar' }, null);
  assert.equal(again.code, 'THROTTLED', 'the account PIN lock also blocks a fresh login');
});

test('P0: memory throttleHit counts, opens a fresh window and locks at the limit', async () => {
  const store = new MemoryMemberSessionStore();
  const now = new Date('2026-11-09T03:00:00Z');
  const policy = { now, windowMs: 60_000, lockMs: 30_000, limit: 3 };
  assert.equal((await store.throttleHit('k', policy)).failures, 1);
  assert.equal((await store.throttleHit('k', policy)).lockedUntil, null);
  const third = await store.throttleHit('k', policy);
  assert.equal(third.failures, 3);
  assert.equal(third.lockedUntil.getTime(), now.getTime() + 30_000);
  const later = await store.throttleHit('k', { ...policy, now: new Date(now.getTime() + 61_000) });
  assert.deepEqual([later.failures, later.lockedUntil], [1, null]);
});

test('WS-01: resolveMemberIdentity fails closed on duplicate active NIKs, placeholder 0, and exited members', () => {
  assert.deepEqual(resolveMemberIdentity([], '10234'), { ok: false, reason: 'no_member_record' });
  assert.deepEqual(resolveMemberIdentity([{ memberId: 1, nik: '0', name: 'X', status: 'AKTIVE' }], '0'), { ok: false, reason: 'no_member_record' });
  assert.deepEqual(resolveMemberIdentity([
    { memberId: 8031, nik: '10234', name: 'A', status: 'AKTIVE' },
    { memberId: 10008, nik: '010234', name: 'B', status: 'AKTIVE' },
  ], '10234'), { ok: false, reason: 'ambiguous_member' });
  assert.deepEqual(resolveMemberIdentity([
    { memberId: 1, nik: '10234', name: 'A', status: 'RESIGN' },
    { memberId: 2, nik: '10234', name: 'A', status: 'PENSIUN' },
  ], '10234'), { ok: false, reason: 'ambiguous_member' });
  assert.deepEqual(resolveMemberIdentity([
    { memberId: 1, nik: '10234', name: 'A', status: 'RESIGN' },
  ], '10234'), { ok: false, reason: 'member_inactive' });
  // One historical RESIGN row + one current AKTIVE row for the same canonical NIK resolves to the unique AKTIVE row
  const uniqueActive = resolveMemberIdentity([
    { memberId: 3318, nik: '10234', name: 'LAMA', status: 'RESIGN' },
    { memberId: 1807, nik: '10234', name: 'BARU', status: 'AKTIVE' },
  ], '10234');
  assert.equal(uniqueActive.ok, true);
  assert.equal(uniqueActive.member.memberId, 1807);
});
