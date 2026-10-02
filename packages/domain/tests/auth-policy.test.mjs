import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlEscape, passwordCandidates, unsupportedPasswordClass } from '@koperasi/domain/auth/password';
import { ABSOLUTE_MS, IDLE_MS, isSessionValid, newDeadlines } from '@koperasi/domain/auth/session-policy';
import { isActiveLock, LOCK_MS, activeKinds } from '@koperasi/domain/auth/throttle-policy';
import { safeNextPath } from '@koperasi/domain/auth/redirect';

test('idle 2 h and absolute 12 h decide validity; revocation always wins', () => {
  assert.equal(IDLE_MS, 7200000); assert.equal(ABSOLUTE_MS, 43200000);
  const now = new Date('2026-10-01T00:00:00Z');
  const d = newDeadlines(now);
  const s = { revokedAt: null, idleExpiresAt: d.idleExpiresAt, absExpiresAt: d.absExpiresAt };
  assert.equal(isSessionValid(s, new Date(now.getTime() + IDLE_MS - 1)), true);
  assert.equal(isSessionValid(s, new Date(now.getTime() + IDLE_MS)), false);
  assert.equal(isSessionValid({ ...s, idleExpiresAt: new Date(now.getTime() + 99 * 3600e3) }, new Date(now.getTime() + ABSOLUTE_MS)), false);
  assert.equal(isSessionValid({ ...s, revokedAt: now }, now), false);
  assert.equal(d.purgeAfter.getTime() - d.absExpiresAt.getTime(), 24 * 3600e3);
});

test('lock cap: a lock further away than 15 min + slack (clock jump) is not a lock', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  assert.equal(isActiveLock(new Date(now.getTime() + LOCK_MS), now), true);
  assert.equal(isActiveLock(new Date(now.getTime() + LOCK_MS + 60000), now), true);
  assert.equal(isActiveLock(new Date(now.getTime() + LOCK_MS + 60001), now), false);
  assert.equal(isActiveLock(new Date(now.getTime() + 10 * 365 * 86400e3), now), false);
  assert.equal(isActiveLock(new Date(now.getTime() - 1), now), false);
  assert.equal(isActiveLock(null, now), false);
  assert.deepEqual(activeKinds(false), ['user']); assert.deepEqual(activeKinds(true), ['user', 'pair', 'ip']);
});

test('password candidates: raw first, legacy html_escape second; class detection only labels failures', () => {
  assert.deepEqual(passwordCandidates('Plain123!'), ['Plain123!']);
  assert.deepEqual(passwordCandidates('a&b<c>"d\'e'), ['a&b<c>"d\'e', 'a&amp;b&lt;c&gt;&quot;d&#039;e']);
  assert.equal(htmlEscape("it's"), 'it&#039;s');
  for (const p of ['100%25', '%41bc', 'x\tz', 'eval(x)', 'javascript:x', 'document.cookie', 'a\u0007b']) assert.equal(unsupportedPasswordClass(p), true, p);
  for (const p of ['Password1!', 'a&b', "it's", '50%', 'x<y', 'C:\\dir']) assert.equal(unsupportedPasswordClass(p), false, p);
});

test('post-login redirect is same-site only', () => {
  assert.equal(safeNextPath('/pos'), '/pos'); assert.equal(safeNextPath('/pos?x=1'), '/pos?x=1');
  for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', '\\evil', 'javascript:alert(1)', '/api/pos/products', '/login', '', null, undefined, '/a\nb', '/' + 'a'.repeat(300)]) assert.equal(safeNextPath(bad), '/pos', String(bad));
});
