import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { createMaster, setMasterStatus, updateMaster } from '@koperasi/application/kosipa/commands/master';
import { MASTER_DEFINITIONS, masterVersion } from '@koperasi/domain/kosipa/master';
import { PrismaKosipaMasterRepository } from '../src/infrastructure/repositories/kosipa-master-write.repository.ts';
import { runCommandTransaction } from '../src/infrastructure/db/kosipa-unit-of-work.ts';
import { PrismaAuditLog } from '../src/infrastructure/console/console-store.ts';
import { PrismaKosipaGrantStore } from '../src/infrastructure/console/kosipa-grant-store.ts';
import { validateKosipaMasterWriteConfig } from '../src/infrastructure/db/prisma-kosipa-master-write.ts';
import { decideKosipaGrant, requestKosipaGrant } from '@koperasi/application/console/kosipa-grants';
import { PrismaIdentityLinkStore } from '../src/infrastructure/console/console-store.ts';
import { PrismaKosipaDirectory } from '../src/infrastructure/console/kosipa-directory.ts';
import { PrismaPermissionRepository } from '../src/infrastructure/auth/prisma-legacy-repositories.ts';
import { resolveConsoleAccess } from '@koperasi/application/console/capabilities';

// FA-01 foundation against the ISOLATED synthetic stack only (integration/kosipa-full-access/local-stack.mjs setup).
// Opt-in: KOSIPA_FA01=1, with the FA-01 app server STOPPED (the writer account allows 2 connections in total: MAX_USER_CONNECTIONS, NFR-102).
// Every connection is loopback:3322 with the application's least-privilege accounts; the writer DSN must pass
// the production guard (validateKosipaMasterWriteConfig) before anything runs. Rows written here are synthetic and stay (append-only ledger).
const ENABLED = process.env.KOSIPA_FA01 === '1';
const options = { skip: ENABLED ? false : 'set KOSIPA_FA01=1 after `node integration/kosipa-full-access/local-stack.mjs setup`', timeout: 120_000 };
const stack = ENABLED ? await import('../../../integration/kosipa-full-access/local-stack.mjs') : null;
const config = stack ? await stack.loadConfig() : null;
const writeUrl = config ? stack.dsn(config, 'masterWrite', stack.DB, 2) : null;
if (config) validateKosipaMasterWriteConfig({ KOSIPA_MASTER_WRITES_ENABLED: 'true', DATABASE_URL_KOSIPA_MASTER_WRITE: writeUrl, DATABASE_URL: stack.dsn(config, 'read', stack.DB, 3) });
const read = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'read', stack.DB, 3) }) : null;
const write = config ? new PrismaClient({ datasourceUrl: writeUrl }) : null;
const consoleDb = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'console', stack.CONSOLE_DB, 1) }) : null;
const mysql = createRequire(new URL('../package.json', import.meta.url))('mysql2/promise');

test.after(async () => { await Promise.all([read, write, consoleDb].filter(Boolean).map((c) => c.$disconnect())); });

const RUN = randomUUID().slice(0, 6).toUpperCase();
const code = (s) => `T${RUN}-${s}`.slice(0, 50);
const actor = (userId = stack?.USERS.operator) => ({ userId, kosipaUserId: 9102, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: randomUUID() });
const ports = (hooks, client = write) => ({ ownership: { owns: () => true }, audit: new PrismaAuditLog(consoleDb), now: () => new Date(), masters: new PrismaKosipaMasterRepository(read, client, { ledgerDatabase: stack.LEDGER_DB, hooks }) });
const createLocation = (p, a, body) => createMaster(p, a, 'lokasi', body);
const updateLocation = (p, a, id, body) => updateMaster(p, a, 'lokasi', id, body);
const setLocationStatus = (p, a, id, body, active) => setMasterStatus(p, a, 'lokasi', id, body, active);
const locationVersion = (row) => masterVersion(MASTER_DEFINITIONS.lokasi, { id: Number(row.id), values: { code: row.code_lokasi, name: row.name_lokasi }, active: Number(row.status) === 1 });
const LEDGER = () => `\`${stack.LEDGER_DB}\`.kosipa_command_ledger`;
const errno = (e) => (/\b(1142|1143|1062|4025|1644)\b/.exec(String(e?.message)) ?? [])[1];
const rowsWithCode = async (c) => Number((await read.$queryRaw`SELECT COUNT(*) AS n FROM m_lokasi WHERE code_lokasi = ${c}`)[0].n);
// The ledger lives in its own database (FD-01b); the application reader has no access there, the writer has SELECT.
const ledgerFor = (key) => write.$queryRawUnsafe(`SELECT id, command, capability, actor_console_user_id, actor_kosipa_user_id, subject_type, subject_ref, from_state, to_state, reason, before_json, after_json, result_json, request_id FROM ${LEDGER()} WHERE idempotency_key = ?`, key);

test('writer account: ledger is append-only, no DELETE anywhere, personal columns unreadable (grant enforcement)', options, async () => {
  await assert.rejects(write.$executeRawUnsafe(`UPDATE ${LEDGER()} SET reason = 'x' WHERE id = 1`), (e) => errno(e) === '1142');
  await assert.rejects(write.$executeRawUnsafe(`DELETE FROM ${LEDGER()} WHERE id = 1`), (e) => errno(e) === '1142');
  await assert.rejects(read.$queryRawUnsafe(`SELECT id FROM ${LEDGER()} LIMIT 1`), (e) => errno(e) === '1142', 'the application reader cannot even read the ledger database');
  await assert.rejects(write.$executeRaw`DELETE FROM m_lokasi WHERE id = 3`, (e) => errno(e) === '1142');
  await assert.rejects(write.$executeRaw`UPDATE m_lokasi SET id = id WHERE id = 3`, (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(write.$queryRaw`SELECT nik_kar FROM m_anggota LIMIT 1`, (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(write.$executeRaw`UPDATE m_anggota SET lokasi = 'x' WHERE id = 9101`, (e) => ['1142', '1143'].includes(errno(e)));
  await assert.rejects(read.$executeRaw`INSERT INTO m_lokasi (code_lokasi) VALUES ('x')`, (e) => errno(e) === '1142', 'reader stays SELECT-only');
});

test('create commits the business row and its ledger row together; a retry replays without a second effect', options, async () => {
  const key = randomUUID(); const a = actor();
  const body = { idempotencyKey: key, code: code('C1'), name: `SYNTH ${RUN} Cikarang` };
  const first = await createLocation(ports(), a, body);
  assert.equal(first.replayed, false);
  const again = await createLocation(ports(), { ...a, requestId: randomUUID() }, body);
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal(await rowsWithCode(body.code), 1);
  const [ledger, ...extra] = await ledgerFor(key);
  assert.equal(extra.length, 0);
  assert.equal(ledger.command, 'master.lokasi.create'); assert.equal(ledger.capability, 'kosipa.master.manage');
  assert.equal(Number(ledger.actor_console_user_id), stack.USERS.operator); assert.equal(Number(ledger.actor_kosipa_user_id), 9102);
  assert.equal(ledger.subject_ref, 'new'); assert.equal(ledger.to_state, 'ACTIVE'); assert.equal(ledger.request_id, a.requestId);
  assert.deepEqual(JSON.parse(ledger.after_json), { id: first.result.id, code: body.code, name: body.name, status: 1 });
  assert.deepEqual(first.result.values, { code: body.code, name: body.name });
  assert.deepEqual(JSON.parse(ledger.result_json), first.result);
  const audit = await consoleDb.$queryRaw`SELECT action, outcome, subject_id FROM console_audit_event WHERE request_id = ${a.requestId}`;
  assert.deepEqual(audit.map((r) => `${r.action}:${r.outcome}`), ['kosipa.master.create:success'], 'one audit event, none for the replay');
  await assert.rejects(createLocation(ports(), a, { ...body, name: `SYNTH ${RUN} Lain` }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('20 concurrent submissions with ONE key -> exactly one row and one ledger row; every caller gets that same result', options, async () => {
  const key = randomUUID(); const a = actor();
  const body = { idempotencyKey: key, code: code('C20'), name: `SYNTH ${RUN} Konkuren` };
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => createLocation(ports(), { ...a, requestId: randomUUID() }, body)));
  const done = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.code);
  assert.ok(failed.every((c) => c === 'BUSY_RETRY'), `only BUSY_RETRY may fail: ${failed}`);
  assert.equal(done.filter((r) => !r.replayed).length, 1, 'exactly one execution');
  assert.ok(done.every((r) => r.result.id === done[0].result.id));
  assert.equal(await rowsWithCode(body.code), 1);
  assert.equal((await ledgerFor(key)).length, 1);
});

test('20 concurrent creates of the SAME code with different keys -> one row; the rest refused as duplicates', options, async () => {
  const c = code('DUP');
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => createLocation(ports(), actor(), { idempotencyKey: randomUUID(), code: c, name: `SYNTH ${RUN} Dup ${i}` })));
  const ok = results.filter((r) => r.status === 'fulfilled');
  const codes = results.filter((r) => r.status === 'rejected').map((r) => r.reason.code);
  assert.equal(ok.length, 1, `codes: ${codes}`);
  assert.ok(codes.every((x) => x === 'MASTER_CODE_DUPLICATE' || x === 'BUSY_RETRY'));
  assert.equal(await rowsWithCode(c), 1);
});

test('failure injected after the business write -> nothing committed (no row, no ledger); the same key then succeeds once', options, async () => {
  const key = randomUUID(); const body = { idempotencyKey: key, code: code('RB'), name: `SYNTH ${RUN} Rollback` };
  const boom = { afterBusinessWrite: async (tx) => {
    assert.equal(Number((await tx.$queryRaw`SELECT COUNT(*) AS n FROM m_lokasi WHERE code_lokasi = ${body.code}`)[0].n), 1, 'written inside the transaction');
    throw new Error('INJECTED_FAILURE');
  } };
  await assert.rejects(createLocation(ports(boom), actor(), body), /INJECTED_FAILURE/);
  assert.equal(await rowsWithCode(body.code), 0);
  assert.equal((await ledgerFor(key)).length, 0, 'idempotency state never claims an effect that rolled back');
  const retry = await createLocation(ports(), actor(), body);
  assert.equal(retry.replayed, false);
  assert.equal(await rowsWithCode(body.code), 1);
});

test('concurrent edits of one version -> one wins, the other is STALE; referenced names cannot be renamed; status changes carry reason', options, async () => {
  const created = await createLocation(ports(), actor(), { idempotencyKey: randomUUID(), code: code('ED'), name: `SYNTH ${RUN} Edit` });
  const v = created.result.version; const id = String(created.result.id);
  const both = await Promise.allSettled([
    updateLocation(ports(), actor(), id, { idempotencyKey: randomUUID(), code: code('ED-A'), name: created.result.values.name, expectedVersion: v }),
    updateLocation(ports(), actor(), id, { idempotencyKey: randomUUID(), code: code('ED-B'), name: created.result.values.name, expectedVersion: v }),
  ]);
  assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(both.filter((r) => r.status === 'rejected').map((r) => r.reason.code), ['STALE']);

  const [tambun] = await read.$queryRaw`SELECT id, code_lokasi, name_lokasi, status FROM m_lokasi WHERE name_lokasi = 'SYNTH Tambun'`;
  const tv = locationVersion(tambun);
  await assert.rejects(updateLocation(ports(), actor(), String(tambun.id), { idempotencyKey: randomUUID(), code: tambun.code_lokasi, name: 'SYNTH Tambun Baru', expectedVersion: tv }), { code: 'MASTER_REFERENCED' });
  const [plg] = await read.$queryRaw`SELECT id, code_lokasi, name_lokasi, status FROM m_lokasi WHERE name_lokasi = 'SYNTH Pulo Gadung'`;
  const pv = locationVersion(plg);
  await assert.rejects(updateLocation(ports(), actor(), String(plg.id), { idempotencyKey: randomUUID(), code: plg.code_lokasi, name: 'SYNTH Pulo Baru', expectedVersion: pv }), { code: 'MASTER_REFERENCED' }, 'a member mobile account (users.lokasi) also counts');

  const winner = both.find((r) => r.status === 'fulfilled').value.result;
  const key = randomUUID();
  const off = await setLocationStatus(ports(), actor(), id, { idempotencyKey: key, expectedVersion: winner.version, reason: 'lokasi ditutup sintetis' }, false);
  assert.equal(off.result.active, false);
  const [ledger] = await ledgerFor(key);
  assert.equal(ledger.from_state, 'ACTIVE'); assert.equal(ledger.to_state, 'INACTIVE'); assert.equal(ledger.reason, 'lokasi ditutup sintetis');
  assert.equal(JSON.parse(ledger.before_json).status, 1); assert.equal(JSON.parse(ledger.after_json).status, 0);
  await assert.rejects(setLocationStatus(ports(), actor(), id, { idempotencyKey: randomUUID(), expectedVersion: off.result.version, reason: 'sekali lagi saja' }, false), { code: 'NO_CHANGE' });
  await assert.rejects(setLocationStatus(ports(), actor(), '2147483000', { idempotencyKey: randomUUID(), expectedVersion: off.result.version, reason: 'id palsu sintetis' }, true), { code: 'MASTER_NOT_FOUND' });
});

test('a real lock-wait timeout (1205) is retried inside the unit of work and then succeeds', options, async () => {
  const holder = await mysql.createConnection({ host: '127.0.0.1', port: stack.PORT, user: 'root', password: config.rootPassword, database: stack.DB });
  try {
    await holder.query('START TRANSACTION');
    await holder.query('SELECT id FROM m_lokasi WHERE id = 1 FOR UPDATE');
    const release = setTimeout(() => { holder.query('ROLLBACK').catch(() => undefined); }, 10_000);   // > capLockWait (8 s): attempt 1 times out
    const started = Date.now();
    const body = { idempotencyKey: randomUUID(), code: code('LW'), name: `SYNTH ${RUN} Lock wait` };
    const result = await createLocation(ports(), actor(), body);
    clearTimeout(release);
    assert.equal(result.replayed, false);
    assert.ok(Date.now() - started >= 8_000, 'the first attempt really waited and timed out');
    assert.equal(await rowsWithCode(body.code), 1);
  } finally { await holder.end(); }
});

test('retry policy: deadlock-class errors are retried at most 3 times, then BUSY_RETRY; other errors are not retried', options, async () => {
  let attempts = 0;
  const envelope = { command: 'master.lokasi.create', capability: 'kosipa.master.manage', idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64), requestId: 'deadlock-test', actorConsoleUserId: stack.USERS.operator, actorKosipaUserId: 9102, subjectType: 'master.lokasi', subjectRef: 'new' };
  const deadlock = () => Object.assign(new Error('Deadlock found when trying to get lock (1213)'), { code: 'P2010', meta: { code: '1213' } });
  const uow = { ledgerDatabase: stack.LEDGER_DB, legacyControllers: ['master/lokasi_c'] };
  const ok = await runCommandTransaction(write, envelope, { lock: async () => { if (++attempts < 3) throw deadlock(); }, run: async () => ({ result: { ok: true }, ledger: {} }) }, uow);
  assert.equal(attempts, 3); assert.equal(ok.replayed, false);
  attempts = 0;
  await assert.rejects(runCommandTransaction(write, { ...envelope, idempotencyKey: randomUUID() }, { lock: async () => { attempts++; throw deadlock(); }, run: async () => ({ result: {}, ledger: {} }) }, uow), { code: 'BUSY_RETRY' });
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(runCommandTransaction(write, { ...envelope, idempotencyKey: randomUUID() }, { lock: async () => { attempts++; throw new Error('other'); }, run: async () => ({ result: {}, ledger: {} }) }, uow), /other/);
  assert.equal(attempts, 1);
});

test('console grant store: two-administrator workflow enforced by the database (open key, CHECKs, transition trigger)', options, async () => {
  const store = new PrismaKosipaGrantStore(consoleDb);
  const target = 4_000_000_000 + Math.floor(Math.random() * 200_000_000);
  const A = stack.USERS.admin, C = stack.USERS.second;
  const now = new Date(); const later = new Date(now.getTime() + 3600_000);
  const req = (o = {}) => store.request({ consoleUserId: target, capability: 'kosipa.master.manage', requestedBy: A, requestedAt: now, expiresAt: later, reason: 'synthetic grant test', ...o });
  const id = await req();
  await assert.rejects(req(), { code: 'ALREADY_GRANTED' }, 'one open request per user + capability (unique open key)');
  await assert.rejects(req({ consoleUserId: target + 1, requestedBy: target + 1 }), { code: 'SELF_GRANT' });
  assert.deepEqual(await store.activeCapabilities(target), [], 'pending grants nothing');
  assert.equal(await store.decide(id, 'active', A, new Date(), null), false, 'the requester cannot approve (WHERE + CHECK)');
  assert.equal(await store.decide(id, 'active', target, new Date(), null), false, 'the beneficiary cannot approve');
  await assert.rejects(consoleDb.$executeRaw`UPDATE console_kosipa_grant SET status = 'active', decided_by = ${A}, decided_at = UTC_TIMESTAMP() WHERE id = ${id}`, (e) => ['4025', '1644'].includes(errno(e)), 'a direct UPDATE bypassing the application is refused too');
  const both = await Promise.all([store.decide(id, 'active', C, new Date(), null), store.decide(id, 'active', C + 1, new Date(), null)]);
  assert.deepEqual(both.sort(), [false, true], 'concurrent approvals: exactly one');
  assert.deepEqual(await store.activeCapabilities(target), ['kosipa.master.manage']);
  await assert.rejects(consoleDb.$executeRaw`UPDATE console_kosipa_grant SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE id = ${id}`, (e) => ['4025', '1644', '1143'].includes(errno(e)), 'no way back to pending');
  await assert.rejects(consoleDb.$executeRaw`DELETE FROM console_kosipa_grant WHERE id = ${id}`, (e) => errno(e) === '1142');
  await assert.rejects(consoleDb.$executeRaw`UPDATE console_kosipa_grant SET capability = 'kosipa.loan.disburse' WHERE id = ${id}`, (e) => errno(e) === '1143');
  assert.equal(await store.revoke(id, A, new Date(), 'synthetic cleanup'), true);
  assert.equal(await store.revoke(id, A, new Date(), 'synthetic cleanup'), false);
  const expiring = await req({ requestedAt: new Date(now.getTime() - 7200_000), expiresAt: new Date(now.getTime() - 3600_000) });
  assert.equal(await store.decide(expiring, 'active', C, new Date(), null), false, 'an expired request cannot be approved');
  assert.equal(await store.openFor(target, 'kosipa.master.manage', new Date()), null, 'expired requests are closed lazily');
  assert.equal((await store.find(expiring)).status, 'expired');
});

// ---- FD-01b: ledger in its own database, under the privilege model cPanel can express ---------------------------------------------------
const cpanel = config ? new PrismaClient({ datasourceUrl: stack.dsn(config, 'cpanelModel', stack.DB, 2) }) : null;
test.after(async () => { await cpanel?.$disconnect(); });

test('grant staleness (FA-03A): a pending request is not approvable once its requester lost authority in the live tables; restored -> approvable', options, async () => {
  // Real stores and directory: console_kosipa_grant + console_identity_link (console store), db_users/db_roles/db_permissions (business reader).
  const store = new PrismaKosipaGrantStore(consoleDb); const directory = new PrismaKosipaDirectory(read);
  const ports = { grants: store, links: new PrismaIdentityLinkStore(consoleDb), consoleUsers: directory, audit: new PrismaAuditLog(consoleDb), now: () => new Date(),
    grantAdmins: new Set(stack.GRANT_ADMINS), permissions: new PrismaPermissionRepository(read, () => undefined) };
  const grantAdmin = (userId) => ({ userId, capabilities: new Set(['iam.link.manage', 'iam.kosipa.grant']), requestId: randomUUID() });
  const A = stack.USERS.admin, C = stack.USERS.second, target = stack.USERS.viewer;
  const capability = 'kosipa.master.manage';
  // Leftovers of an earlier run on this stack: close them first (synthetic rows only).
  const open = await store.openFor(target, capability, new Date());
  if (open?.status === 'active') await store.revoke(open.id, C, new Date(), 'synthetic cleanup');
  if (open?.status === 'pending') await store.decide(open.id, 'rejected', open.requestedBy === C ? A : C, new Date(), 'synthetic cleanup');
  const root = await stack.rootConnection(config);
  try {
    const { id } = await requestKosipaGrant(ports, grantAdmin(A), { consoleUserId: target, capability, reason: 'synthetic staleness test' });
    await root.query('UPDATE db_users SET role_id = 4 WHERE id = ?', [A]);                    // requester demoted to a branch role
    await assert.rejects(decideKosipaGrant(ports, grantAdmin(C), { grantId: id, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
    await root.query('UPDATE db_users SET role_id = 1 WHERE id = ?', [A]);
    await root.query("DELETE FROM db_permissions WHERE role_id = 1 AND permissions = 'users_edit'");   // users_edit withdrawn from the role
    await assert.rejects(decideKosipaGrant(ports, grantAdmin(C), { grantId: id, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
    await root.query("INSERT INTO db_permissions (role_id, permissions) VALUES (1, 'users_edit')");
    await root.query('UPDATE db_users SET status = 0 WHERE id = ?', [A]);                     // requester deactivated
    await assert.rejects(decideKosipaGrant(ports, grantAdmin(C), { grantId: id, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
    await root.query('UPDATE db_users SET status = 1 WHERE id = ?', [A]);
    assert.deepEqual(await store.activeCapabilities(target), [], 'no refused approval granted anything');
    assert.deepEqual(await decideKosipaGrant(ports, grantAdmin(C), { grantId: id, decision: 'approve' }), { id, status: 'active' });
    assert.ok(await store.revoke(id, C, new Date(), 'synthetic staleness test done'));
  } finally {
    await root.query('UPDATE db_users SET role_id = 1, status = 1 WHERE id = ?', [A]);
    const [[{ n }]] = await root.query("SELECT COUNT(*) AS n FROM db_permissions WHERE role_id = 1 AND permissions = 'users_edit'");
    if (Number(n) === 0) await root.query("INSERT INTO db_permissions (role_id, permissions) VALUES (1, 'users_edit')");
    await root.end();
  }
});

test('permission revalidation: disabled granting group cannot supply master access through an unrelated active group', options, async () => {
  const root = await stack.rootConnection(config);
  const directory = new PrismaKosipaDirectory(read);
  const store = new PrismaKosipaGrantStore(consoleDb);
  const target = stack.USERS.viewer, kosipaUserId = stack.KOSIPA_USERS.viewer;
  const groupId = 980000 + Math.floor(Math.random() * 10000);
  const [groups] = await root.query('SELECT DISTINCT g.id, g.status FROM ref_group g JOIN ref_group_akses ga ON ga.id_group = g.id WHERE ga.id_user = ? AND ga.status = 1', [kosipaUserId]);
  let grantId;
  let membershipId;
  let groupCreated = false;
  try {
    const now = new Date();
    grantId = await store.request({ consoleUserId: target, capability: 'kosipa.master.manage', requestedBy: stack.USERS.admin, requestedAt: now,
      expiresAt: new Date(now.getTime() + 3600_000), reason: 'synthetic inactive group regression' });
    assert.equal(await store.decide(grantId, 'active', stack.USERS.second, new Date(), null), true);
    const resolve = () => resolveConsoleAccess({ permissions: new PrismaPermissionRepository(read, () => undefined),
      kosipa: { links: new PrismaIdentityLinkStore(consoleDb), kosipa: directory, grants: store } }, { userId: target, roleId: 4, canSwitchBranch: false });
    assert.equal((await resolve()).capabilities.has('kosipa.master.manage'), true, 'baseline active group and grant allow master writes');
    await root.query("INSERT INTO ref_group (id, nama_group, status) VALUES (?, 'SYNTH unrelated active group', 1)", [groupId]);
    groupCreated = true;
    const [membership] = await root.query('INSERT INTO ref_group_akses (id_user, id_group, status) VALUES (?, ?, 1)', [kosipaUserId, groupId]);
    membershipId = membership.insertId;
    for (const group of groups) await root.query('UPDATE ref_group SET status = 0 WHERE id = ?', [group.id]);
    assert.equal((await directory.kosipaUser(kosipaUserId)).activeGroups, 1, 'unrelated group keeps the linked identity active');
    assert.deepEqual(await store.activeCapabilities(target), ['kosipa.master.manage'], 'explicit grant remains active');
    const access = await resolve();
    assert.equal(access.kosipaUserId, kosipaUserId);
    assert.equal(access.capabilities.has('kosipa.member.view'), false, 'disabled group contributes no view permission');
    assert.equal(access.capabilities.has('kosipa.master.manage'), false, 'grant without its live view prerequisite grants no write access');
  } finally {
    for (const group of groups) await root.query('UPDATE ref_group SET status = ? WHERE id = ?', [group.status, group.id]);
    if (membershipId) await root.query('DELETE FROM ref_group_akses WHERE id = ?', [membershipId]);
    if (groupCreated) await root.query('DELETE FROM ref_group WHERE id = ?', [groupId]);
    if (grantId) {
      const grant = await store.find(grantId);
      if (grant?.status === 'active') await store.revoke(grantId, stack.USERS.second, new Date(), 'synthetic regression cleanup');
      if (grant?.status === 'pending') await store.decide(grantId, 'rejected', stack.USERS.second, new Date(), 'synthetic regression cleanup');
    }
    await root.end();
  }
});

test('FD-01b: with database-level grants only (cPanel model) the ledger cannot be changed, replaced, truncated, altered or extended', options, async () => {
  const [grants] = [await cpanel.$queryRawUnsafe('SHOW GRANTS')];
  const lines = grants.map((g) => String(Object.values(g)[0]));
  assert.ok(lines.some((l) => /GRANT SELECT, INSERT ON `kkisi_kfa_ledger`\.\*/.test(l)), lines.join(' | '));
  assert.ok(!lines.some((l) => / ON `kkisi_kfa_ledger`\.`/.test(l)), 'no table- or column-level privilege is needed');
  const L = LEDGER();
  const refused = [
    `UPDATE ${L} SET reason = 'x'`, `DELETE FROM ${L}`, `TRUNCATE TABLE ${L}`, `ALTER TABLE ${L} ADD COLUMN x INT`, `DROP TABLE ${L}`,
    `CREATE TABLE \`${stack.LEDGER_DB}\`.shadow (id INT)`, `RENAME TABLE ${L} TO \`${stack.LEDGER_DB}\`.moved`,
    `REPLACE INTO ${L} (id, command, capability, idempotency_key, request_hash, request_id, actor_console_user_id, actor_kosipa_user_id, subject_type, subject_ref, result_json, created_at) SELECT id, command, capability, idempotency_key, request_hash, request_id, actor_console_user_id, actor_kosipa_user_id, subject_type, subject_ref, '{}', created_at FROM ${L} LIMIT 1`,
    `INSERT INTO ${L} (command, capability, idempotency_key, request_hash, request_id, actor_console_user_id, actor_kosipa_user_id, subject_type, subject_ref, result_json, created_at) VALUES ('x.y.z','kosipa.master.manage','00000000-0000-4000-8000-000000000001','${'b'.repeat(64)}','r',1,1,'s','r','{}',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE result_json = '{}'`,
    `CREATE TRIGGER \`${stack.LEDGER_DB}\`.t BEFORE INSERT ON ${L} FOR EACH ROW SET NEW.reason = 'x'`,
  ];
  for (const sql of refused) await assert.rejects(cpanel.$executeRawUnsafe(sql), (e) => /\b(1142|1143|1044|1227|1419)\b/.test(String(e?.message)), sql.slice(0, 60));
});

test('FD-01b: one transaction spans the business and ledger databases under the cPanel model; a failure after the ledger row rolls back both', options, async () => {
  const body = { idempotencyKey: randomUUID(), code: code('XDB'), name: `SYNTH ${RUN} Cross DB` };
  await assert.rejects(createLocation(ports({ afterLedgerWrite: async () => { throw new Error('INJECTED_AFTER_LEDGER'); } }, cpanel), actor(), body), /INJECTED_AFTER_LEDGER/);
  assert.equal(await rowsWithCode(body.code), 0, 'business row rolled back');
  assert.equal((await ledgerFor(body.idempotencyKey)).length, 0, 'ledger row rolled back');
  const ok = await createLocation(ports(undefined, cpanel), actor(), body);
  assert.equal(ok.replayed, false);
  assert.equal(await rowsWithCode(body.code), 1);
  assert.equal((await ledgerFor(body.idempotencyKey)).length, 1);
  const replay = await createLocation(ports(undefined, cpanel), actor(), body);
  assert.equal(replay.replayed, true, 'idempotency also holds across databases');
});

// ---- FD-03 hardening: legacy re-enable (admin/adm_menu_c) makes native writes fail closed ------------------------------------------------
test('FD-03: re-enabling the legacy controller in any way adm_menu_c can (status, new row, renamed URL) stops native writes; re-fencing resumes them', options, async () => {
  const root = await stack.rootConnection(config);
  const attempt = () => createLocation(ports(), actor(), { idempotencyKey: randomUUID(), code: code(`F${randomUUID().slice(0, 4)}`), name: `SYNTH ${RUN} Fence ${randomUUID().slice(0, 6)}` });
  try {
    assert.equal((await attempt()).replayed, false, 'fenced: native writes');
    await root.query("UPDATE ref_menu SET status = 1 WHERE id = 9102");                                  // adm_menu_m::updateRecords (status by id)
    await assert.rejects(attempt(), { code: 'LEGACY_ACTIVE' });
    await root.query("UPDATE ref_menu SET status = 0 WHERE id = 9102");
    await root.query("INSERT INTO ref_menu (id, nama_menu, url, status) VALUES (9190, 'dup', 'MASTER/Lokasi_c', 1)");    // insertRecords: duplicate URL
    await assert.rejects(attempt(), { code: 'LEGACY_ACTIVE' });
    await root.query("UPDATE ref_menu SET status = 0 WHERE id = 9190");
    await root.query("UPDATE ref_menu SET url = 'master/lokasi_c' WHERE id = 9107");                       // updateRecords: another row renamed
    await assert.rejects(attempt(), { code: 'LEGACY_ACTIVE' });
    await root.query("UPDATE ref_menu SET url = 'admin/adm_menu_c' WHERE id = 9107");
    await root.query("UPDATE ref_menu SET url = ' master/lokasi_c', status = 1 WHERE id = 9190");          // whitespace: the legacy gate does not match it either
    assert.equal((await attempt()).replayed, false);
  } finally {
    await root.query("DELETE FROM ref_menu WHERE id = 9190"); await root.query("UPDATE ref_menu SET status = 0, url = 'master/lokasi_c' WHERE id = 9102"); await root.end();
  }
});

test('FD-03: a legacy re-enable racing a native command waits for it (share lock); afterwards native refuses — never two writers at once', options, async () => {
  const root = await stack.rootConnection(config);
  try {
    let releaseNative; const nativeHolding = new Promise((r) => { releaseNative = r; });
    let signalStarted; const started = new Promise((r) => { signalStarted = r; });
    const slow = { afterBusinessWrite: async () => { signalStarted(); await nativeHolding; } };
    const native = createLocation(ports(slow), actor(), { idempotencyKey: randomUUID(), code: code('RACE'), name: `SYNTH ${RUN} Race` });
    await started;
    const t0 = Date.now();
    const reenable = root.query("UPDATE ref_menu SET status = 1 WHERE id = 9102");                        // admin re-enables while native is mid-transaction
    await new Promise((r) => setTimeout(r, 1500));
    releaseNative();
    const result = await native;
    await reenable;
    assert.ok(Date.now() - t0 >= 1400, 'the legacy re-enable waited for the native transaction to finish');
    assert.equal(result.replayed, false, 'the native command that was already inside committed');
    await assert.rejects(createLocation(ports(), actor(), { idempotencyKey: randomUUID(), code: code('RACE2'), name: `SYNTH ${RUN} Race 2` }), { code: 'LEGACY_ACTIVE' });
  } finally { await root.query("UPDATE ref_menu SET status = 0 WHERE id = 9102"); await root.end(); }
});
