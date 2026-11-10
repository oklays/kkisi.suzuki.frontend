// P2: in-process read cache, per-query metrics and alerts, request ids, member QR configuration (no database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { TtlCache } from '../../src/server/cache/ttl-cache.ts';
import { withCachedAccountState } from '../../src/server/cache/cached-reads.ts';
import { acceptRequestId, evaluateAlerts, querySummary, recordQuery, resetMetrics, sqlLabel, thresholdsFromEnv } from '../../src/server/observability/metrics.ts';
import { ConfigError, loadQrSigningKey } from '../../src/lib/config/env.ts';

test('TtlCache: hits within the TTL, single-flight on concurrent misses, failures are not cached, bounded size', async () => {
  const c = new TtlCache('t1', 50, 2);
  let loads = 0;
  const load = async () => { loads++; await new Promise((r) => setTimeout(r, 10)); return loads; };
  const [a, b] = await Promise.all([c.get('k', load), c.get('k', load)]);
  assert.deepEqual([a, b, loads], [1, 1, 1], 'one database read for concurrent misses');
  assert.equal(await c.get('k', load), 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(await c.get('k', load), 2, 'reloaded after the TTL');
  await assert.rejects(c.get('bad', async () => { throw new Error('db down'); }));
  assert.equal(await c.get('bad', async () => 'recovered'), 'recovered', 'an error is never cached');
  await c.get('x', async () => 'x');
  assert.ok(c.stats().size <= 2, 'bounded');
  assert.equal(c.stats().errors, 1);
});

test('account-state cache: only accountState is cached; PIN and account lookups always hit the reader; 0 disables it', async () => {
  const calls = { state: 0, pin: 0, find: 0 };
  const reader = {
    findAccounts: async () => { calls.find++; return []; }, storedPin: async () => { calls.pin++; return '2468'; },
    accountState: async () => { calls.state++; return { active: true, deleted: false }; }, memberByNik: async () => [],
  };
  const cached = withCachedAccountState(reader, 1000);
  await cached.accountState(1); await cached.accountState(1); await cached.storedPin(1); await cached.storedPin(1); await cached.findAccounts({}, 1);
  assert.deepEqual(calls, { state: 1, pin: 2, find: 1 });
  assert.equal(withCachedAccountState(reader, 0), reader, 'TTL 0 returns the reader itself');
});

test('metrics: labels never carry SQL text or values; percentiles; alerts on p95, error rate and pools down', () => {
  assert.equal(sqlLabel("SET STATEMENT max_statement_time=5 FOR SELECT id, nik FROM trans_simpanan_dtl WHERE nik_kar IN ('10234')"), 'select trans_simpanan_dtl');
  assert.equal(sqlLabel('INSERT INTO member_sessions (id_hash) VALUES (?)'), 'insert member_sessions');
  assert.equal(sqlLabel('UPDATE member_sessions SET x = ? WHERE id_hash = ?'), 'update member_sessions');
  assert.equal(sqlLabel('SELECT 1 AS ok'), 'select expr');
  resetMetrics();
  for (let i = 1; i <= 100; i++) recordQuery('select trans_pinjaman_dtl', i * 30, true);
  for (let i = 0; i < 30; i++) recordQuery('select m_anggota', 5, i % 5 !== 0);
  const q = querySummary();
  const loans = q.find((s) => s.label === 'select trans_pinjaman_dtl');
  assert.deepEqual([loans.count, loans.p50, loans.p95, loans.max], [100, 1500, 2850, 3000]);
  assert.equal(q[0].label, 'select trans_pinjaman_dtl', 'slowest first');
  const alerts = evaluateAlerts(q, thresholdsFromEnv({}), { readerDb: 'ok', authDb: 'down' });
  assert.deepEqual(alerts.map((a) => [a.level, a.code, a.subject]), [['critical', 'DB_DOWN', 'authDb'], ['warn', 'QUERY_P95', 'select trans_pinjaman_dtl'], ['warn', 'QUERY_ERRORS', 'select m_anggota']]);
  assert.equal(evaluateAlerts(q, thresholdsFromEnv({ METRICS_P95_CRITICAL_MS: '2000' }))[0].level, 'critical');
  assert.equal(thresholdsFromEnv({ METRICS_P95_WARN_MS: 'abc' }).p95WarnMs, 1000, 'invalid threshold falls back to the default');
  resetMetrics();
});

test('request id: nginx $request_id kept, anything else replaced', () => {
  assert.equal(acceptRequestId('5f2b7c9d0e1a4b3c8d7e6f5a4b3c2d1e', () => 'gen'), '5f2b7c9d0e1a4b3c8d7e6f5a4b3c2d1e');
  for (const bad of [null, '', 'short', 'x'.repeat(65), 'a b c d e f g h', '<script>alert(1)</script>']) assert.equal(acceptRequestId(bad, () => 'generated-id-0001'), 'generated-id-0001');
});

test('member QR signing key: optional, Ed25519 only, malformed fails closed', () => {
  assert.equal(loadQrSigningKey({}), null);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  assert.equal(loadQrSigningKey({ MEMBER_QR_SIGNING_KEY: `q1:${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}` }).kid, 'q1');
  assert.throws(() => loadQrSigningKey({ MEMBER_QR_SIGNING_KEY: `q1:${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}` }), ConfigError);
  assert.throws(() => loadQrSigningKey({ MEMBER_QR_SIGNING_KEY: 'q1:short' }), ConfigError);
});
