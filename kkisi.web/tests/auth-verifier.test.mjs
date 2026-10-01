import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { WorkerPasswordVerifier } from '../src/infrastructure/auth/password-verifier.ts';
import { DUMMY_HASH } from '../src/domain/auth/password-candidates.ts';
import { legacyStyleHash } from './helpers/auth-fakes.mjs';

test('worker verifier: $2y$ legacy-style hashes verify; wrong password, junk and md5-like values do not', async () => {
  const v = new WorkerPasswordVerifier({ workers: 2 });
  try {
    const hash = legacyStyleHash('Synthetic-Pw-1');
    assert.equal(hash.startsWith('$2y$'), true);
    assert.equal(await v.verify('Synthetic-Pw-1', hash), true);
    assert.equal(await v.verify('Synthetic-Pw-2', hash), false);
    assert.equal(await v.verify('x', '900150983cd24fb0d6963f7d28e17f72'), false);
    assert.equal(await v.verify('x', ''), false);
    assert.equal(await v.verify('Pässwörd-日本', legacyStyleHash('Pässwörd-日本')), true);
    assert.equal(await v.verify('A'.repeat(100), legacyStyleHash('A'.repeat(72))), true, 'bcrypt uses the first 72 bytes, like PHP');
    assert.equal(await v.verify('anything', DUMMY_HASH), false);
  } finally { await v.close(); }
});

test('worker verifier: it never blocks the main event loop (cost 10, 4 concurrent verifications)', async () => {
  const v = new WorkerPasswordVerifier({ workers: 2 });
  const hash = '$2y$' + bcrypt.hashSync('cost-ten', 10).slice(4);
  let maxGap = 0, last = performance.now();
  const timer = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 5);
  try {
    await v.verify('warm-up', hash);                                     // spawn cost is not part of steady state
    maxGap = 0; last = performance.now();
    const results = await Promise.all([1, 2, 3, 4].map((i) => v.verify(i === 1 ? 'cost-ten' : 'nope' + i, hash)));
    assert.deepEqual(results, [true, false, false, false]);
    assert.ok(maxGap < 60, `event loop stalled ${maxGap.toFixed(0)} ms (bcryptjs on the main thread stalls ~420 ms)`);
  } finally { clearInterval(timer); await v.close(); }
});

test('worker verifier sheds load: beyond running + queue capacity the caller gets VerifierBusy (-> 503)', async () => {
  const v = new WorkerPasswordVerifier({ workers: 1, maxQueue: 1 });
  const hash = '$2y$' + bcrypt.hashSync('slow', 10).slice(4);
  try {
    const jobs = [v.verify('a', hash), v.verify('b', hash), v.verify('c', hash)];
    const settled = await Promise.allSettled(jobs);
    assert.equal(settled[0].status, 'fulfilled'); assert.equal(settled[1].status, 'fulfilled');
    assert.equal(settled[2].status, 'rejected'); assert.equal(settled[2].reason.message, 'VERIFIER_BUSY');
    assert.equal(await v.verify('slow', hash), true, 'and it recovers');
  } finally { await v.close(); }
});

test('worker verifier: a job that exceeds its timeout is rejected as busy and the slot recovers', async () => {
  const v = new WorkerPasswordVerifier({ workers: 1, timeoutMs: 300 });
  const hash = '$2y$' + bcrypt.hashSync('slow', 13).slice(4);          // ~900 ms: beyond the 300 ms budget
  try {
    await assert.rejects(v.verify('slow', hash), { message: 'VERIFIER_BUSY' });
    assert.equal(await v.verify('quick', legacyStyleHash('quick')), true, 'a fresh worker serves the next job after the stuck one was terminated');
  } finally { await v.close(); }
});
