import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaAuditLog, PrismaIdentityLinkStore } from '../src/infrastructure/console/console-store.ts';

// Opt-in: CONSOLE_STORE_TEST_URL = the LOCAL console store with the app's least-privilege account (kkisi_console).
// The store is append-only by design, so rows written here stay; they use a reserved synthetic id range (>= 4e9).
const URL_ = process.env.CONSOLE_STORE_TEST_URL;
const options = { skip: URL_ ? false : 'set CONSOLE_STORE_TEST_URL (local kkisi_console_staging, kkisi_console account)' };
if (URL_) {
  const u = new URL(URL_);
  assert.equal(u.hostname, '127.0.0.1', 'console store test DB must be local');
  assert.match(u.pathname, /^\/kkisi_console_staging$/, 'only the local console store');
  assert.equal(decodeURIComponent(u.username), 'kkisi_console', 'run with the application account, never root');
}
const db = URL_ ? new PrismaClient({ datasourceUrl: URL_ }) : null;
const store = db ? new PrismaIdentityLinkStore(db) : null;
const audit = db ? new PrismaAuditLog(db) : null;
const id = () => 4_000_000_000 + randomInt(0, 290_000_000);
const errno = (e) => (/\b(1142|1143|1644|4025)\b/.exec(String(e?.message)) ?? [])[1];
// Rows cannot be deleted (append-only by design), but nothing synthetic may stay ACTIVE.
test.after(async () => {
  if (!db) return;
  await db.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = 4294967295, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'synthetic test cleanup' WHERE status = 'active' AND console_user_id >= 4000000000`;
  await db.$disconnect();
});

test('one ACTIVE link per console user and per KOSIPA user; history allowed after revocation', options, async () => {
  const consoleUser = id(), kosipaUser = id(), admin = id(), now = new Date();
  const first = await store.create({ consoleUserId: consoleUser, externalUserId: kosipaUser, linkedBy: admin, linkedAt: now });
  assert.equal((await store.activeForConsoleUser(consoleUser)).id, first);
  await assert.rejects(store.create({ consoleUserId: consoleUser, externalUserId: id(), linkedBy: admin, linkedAt: now }), { code: 'ALREADY_LINKED' });
  await assert.rejects(store.create({ consoleUserId: id(), externalUserId: kosipaUser, linkedBy: admin, linkedAt: now }), { code: 'ALREADY_LINKED' });
  assert.equal(await store.revoke(first, admin, now, 'synthetic test'), true);
  assert.equal(await store.revoke(first, admin, now, 'synthetic test'), false, 'revoke is not repeatable');
  const second = await store.create({ consoleUserId: consoleUser, externalUserId: kosipaUser, linkedBy: admin, linkedAt: now });
  assert.ok(second > first);
  assert.equal((await store.find(first)).status, 'revoked');
});

test('database refuses self-links, identity rewrites and deletes, independently of the application', options, async () => {
  const user = id();
  await assert.rejects(store.create({ consoleUserId: user, externalUserId: id(), linkedBy: user, linkedAt: new Date() }), { code: 'SELF_LINK' });
  const linkId = await store.create({ consoleUserId: id(), externalUserId: id(), linkedBy: id(), linkedAt: new Date() });
  await assert.rejects(db.$executeRaw`UPDATE console_identity_link SET console_user_id = ${id()} WHERE id = ${linkId}`, (e) => errno(e) === '1143');
  await assert.rejects(db.$executeRaw`UPDATE console_identity_link SET status = 'active', revoked_at = NULL WHERE id = ${linkId}`, (e) => ['1143', '4025', '1644'].includes(errno(e)));
  await assert.rejects(db.$executeRaw`DELETE FROM console_identity_link WHERE id = ${linkId}`, (e) => errno(e) === '1142');
});

test('audit events are append-only and their detail must be a small JSON object', options, async () => {
  const actor = id();
  await audit.append({ actorUserId: actor, action: 'identity_link.create', subjectType: 'identity_link', subjectId: 'console:1', outcome: 'success', requestId: 'synthetic', detail: { consoleUserId: 1 }, occurredAt: new Date() });
  const [row] = await db.$queryRaw`SELECT id, JSON_VALUE(detail, '$.consoleUserId') AS c FROM console_audit_event WHERE actor_user_id = ${actor}`;
  assert.equal(row.c, '1');
  await assert.rejects(db.$executeRaw`UPDATE console_audit_event SET outcome = 'denied' WHERE id = ${row.id}`, (e) => errno(e) === '1142');
  await assert.rejects(db.$executeRaw`DELETE FROM console_audit_event WHERE id = ${row.id}`, (e) => errno(e) === '1142');
  await assert.rejects(db.$executeRaw`INSERT INTO console_audit_event (occurred_at, actor_user_id, action, subject_type, subject_id, outcome, request_id, detail) VALUES (NOW(3), ${actor}, 'x.y', 's', 'i', 'success', 'r', '[1,2]')`, (e) => errno(e) === '4025');
  await assert.rejects(db.$executeRaw`INSERT INTO console_audit_event (occurred_at, actor_user_id, action, subject_type, subject_id, outcome, request_id) VALUES (NOW(3), ${actor}, 'Bad Action!', 's', 'i', 'success', 'r')`, (e) => errno(e) === '4025');
});
