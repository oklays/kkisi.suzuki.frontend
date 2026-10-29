import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { submitPublicSavingsChange } from '../src/kosipa/public-savings-submit.ts';
import { PSS_POLICY_V1 } from '../../domain/src/kosipa/savings-policy.ts';

// CP1-T01B contract test (06 T01 test group I) with a FAKE unit of work. It proves the orchestration contract only; it is not DB atomicity proof.
const NOW = Date.UTC(2026, 9, 24, 3); const H = 3600000; const MIN = 60000; const DAY = 24 * H;
const facts = { membershipStatus: 'AKTIVE', identity: 'UNIQUE', identifierMappingConflict: false, payrollRoster: 'ACTIVE', groupCode: 'G1', activePayrollEligibleGroups: ['G1'],
  branch: 'VALID', conflictingActiveSubmission: false, contact: { status: 'VERIFIED', verifiedAtEpochMs: NOW - DAY, provenanceRef: 'm:1', changedSinceVerification: false } };
const locked = (o = {}) => ({
  form: { contractVersion: 'pss-form-facts/v1', referenceStatus: 'VERIFIED', sourceEvidenceRef: 'fixture:legacy-reference', memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', formVersion: 'form-v1', consentTextVersion: 'consent-v1' },
  calendar: { source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified: true, periods: [{ year: 2026, month: 11, state: 'OPEN' }] },
  eligibility: facts, existing: { kind: 'AMOUNT', value: '100000' }, requests: [], branch: 'B1',
  link: { memberRef: 'm1', purpose: 'PUBLIC_SAVINGS_DEDUCTION_CHANGE', issuedAtEpochMs: NOW - H, expiresAtEpochMs: NOW - H + 48 * H, consumedAtEpochMs: null, revokedAtEpochMs: null },
  proof: { memberRef: 'm1', linkRef: 'l1', contactVersion: 'c3', verifiedAtEpochMs: NOW - MIN }, contactVersion: 'c3', ...o,
});
const snapshotInput = (o = {}) => ({
  memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', originalDeduction: '100000', requestedAmount: '150000', requestedPeriod: { year: 2026, month: 11 }, effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL',
  consentTextVersion: 'consent-v1', formVersion: 'form-v1', consent: true, submittedAtEpochMs: NOW,
  verification: { proofRef: 'proof-1', contactVersion: 'c3', method: 'WHATSAPP_OTP_CHANNEL_POSSESSION' },
  signature: { format: 'PNG', decodedBytes: 2048, width: 400, height: 150, contentDigest: 'sha256:s', storageRef: 'private:sig/1' }, ...o,
});

/** Fake UoW: writes are buffered and become visible only if the work resolves (rollback on throw). */
function harness({ activation = true, lock = locked(), receipt = null, failure = null, onLock } = {}) {
  const log = []; const committed = []; let inTx = false;
  const deps = {
    policies: { read: () => PSS_POLICY_V1 }, clock: { nowEpochMs: () => NOW },
    activation: { publicSubmissionEnabled: () => activation },
    digest: { payloadDigest: async (s) => { log.push(['digest', inTx]); return `sha256:${s.length}`; } },
    uow: { run: async (work) => {
      if (failure === 'before') throw new Error('ECONNREFUSED secret-host');
      const buffer = []; inTx = true;
      const tx = {
        findReceipt: async () => { log.push(['findReceipt']); return receipt; },
        lockFacts: async (m, l) => { log.push(['lockFacts', m, l]); onLock?.(); return lock; },
        appendSubmission: async (snapshot, digest, intents) => { buffer.push(['append', snapshot.requestedAmount, digest, intents.map((i) => i.kind)]); return { submissionRef: 's-1' }; },
        consumeLink: async (l, s) => { buffer.push(['consume', l, s]); },
        saveReceipt: async (req, r) => { buffer.push(['receipt', req.key, r]); },
      };
      try { const out = await work(tx); if (failure === 'lost-ack') { committed.push(...buffer); throw Object.assign(new Error('lost'), { commitOutcome: 'UNKNOWN' }); } committed.push(...buffer); return out; }
      finally { inTx = false; }
    } },
  };
  return { deps, log, committed };
}
const command = (o = {}) => ({ memberRef: 'm1', linkRef: 'l1', idempotencyKey: 'k-1', snapshotInput: snapshotInput(), ...o });
const code = (r) => (r.ok ? 'OK' : r.error.code);

test('activation gate closed (default under U-01): nothing is read or written', async () => {
  const h = harness({ activation: false });
  const r = await submitPublicSavingsChange(h.deps, command());
  assert.equal(code(r), 'ACTIVATION_BLOCKED'); assert.deepEqual(h.log, []); assert.deepEqual(h.committed, []);
});

test('happy path (fake): digest outside the transaction; re-check after lock; one append with outbox intents, consume and receipt in the same unit', async () => {
  const h = harness();
  const r = await submitPublicSavingsChange(h.deps, command());
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.value, { kind: 'SUBMITTED', receiptRef: 's-1', submissionAuthorized: false });
  assert.deepEqual(h.log[0], ['digest', false], 'digest/crypto happens before the transaction');
  assert.deepEqual(h.log.slice(1), [['findReceipt'], ['lockFacts', 'm1', 'l1']]);
  assert.deepEqual(h.committed.map((c) => c[0]), ['append', 'consume', 'receipt']);
  assert.deepEqual(h.committed[0][3], ['NOTIFY_OPERATIONS', 'RENDER_PDF'], 'notification and PDF are durable intents, executed after commit');
});

test('idempotency: same key + payload replays without writing; same key + other payload conflicts', async () => {
  const first = harness(); await submitPublicSavingsChange(first.deps, command());
  const fp = first.committed[0][2];
  const replay = harness({ receipt: { receiptRef: 's-1', payloadFingerprint: fp } });
  const r = await submitPublicSavingsChange(replay.deps, command());
  assert.deepEqual(r.value, { kind: 'REPLAY', receiptRef: 's-1', submissionAuthorized: false }); assert.deepEqual(replay.committed, []);
  const conflict = harness({ receipt: { receiptRef: 's-1', payloadFingerprint: 'sha256:other' } });
  assert.equal(code(await submitPublicSavingsChange(conflict.deps, command())), 'IDEMPOTENCY_CONFLICT'); assert.deepEqual(conflict.committed, []);
});

test('rules are re-evaluated on locked facts; any rejection rolls back every write', async () => {
  const cases = [
    [{ existing: { kind: 'AMOUNT', value: '150000' } }, 'FORM_CHANGED'],          // authoritative deduction changed after review
    [{ requests: [{ memberRef: 'm1', channel: 'MOBILE', state: 'OPEN', period: null }] }, 'PENDING_CONFLICT'],
    [{ link: { ...locked().link, consumedAtEpochMs: NOW - 1 } }, 'LINK_CONSUMED'],
    [{ proof: { ...locked().proof, verifiedAtEpochMs: NOW - 16 * MIN } }, 'PROOF_EXPIRED'],
    [{ contactVersion: 'c4' }, 'VERIFICATION_REQUIRED'],
    [{ eligibility: { ...facts, payrollRoster: 'INACTIVE' } }, 'MEMBER_NOT_ELIGIBLE'],
  ];
  for (const [o, expected] of cases) {
    const h = harness({ lock: locked(o) });
    assert.equal(code(await submitPublicSavingsChange(h.deps, command())), expected); assert.deepEqual(h.committed, [], `${expected}: rolled back`);
  }
});

test('lost commit acknowledgement -> COMMIT_OUTCOME_UNKNOWN (look up before any retry); adapter failure -> DEPENDENCY_UNAVAILABLE without detail', async () => {
  const lost = harness({ failure: 'lost-ack' });
  assert.deepEqual(await submitPublicSavingsChange(lost.deps, command()), { ok: false, error: { code: 'COMMIT_OUTCOME_UNKNOWN' } });
  const down = harness({ failure: 'before' });
  assert.deepEqual(await submitPublicSavingsChange(down.deps, command()), { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE' } });
});

test('invalid snapshot input (no explicit consent) is refused before the transaction', async () => {
  const h = harness();
  assert.equal(code(await submitPublicSavingsChange(h.deps, command({ snapshotInput: snapshotInput({ consent: false }) }))), 'CONSENT_REQUIRED'); assert.deepEqual(h.log, []);
});

test('payroll calendar is rechecked under lock; closed, changed or unverified periods never write', async () => {
  for (const [calendar, expected] of [
    [undefined, 'PERIOD_UNVERIFIED'],
    [{ source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified: false, periods: [] }, 'PERIOD_UNVERIFIED'],
    [{ source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified: true, periods: [{ year: 2026, month: 11, state: 'CLOSED' }, { year: 2026, month: 12, state: 'OPEN' }] }, 'FORM_CHANGED'],
  ]) {
    const h = harness({ lock: locked({ calendar }) });
    assert.equal(code(await submitPublicSavingsChange(h.deps, command())), expected);
    assert.deepEqual(h.committed, []);
  }
});

test('proof expiration uses the clock after waiting for locks, not a stale pretransaction instant', async () => {
  let now = NOW;
  const h = harness({ onLock: () => { now += 16 * MIN; } });
  h.deps.clock.nowEpochMs = () => now;
  assert.equal(code(await submitPublicSavingsChange(h.deps, command())), 'PROOF_EXPIRED');
  assert.deepEqual(h.committed, []);
});

test('authoritative section/type/form/consent binding is mandatory under lock before any write', async () => {
  for (const [form, expected] of [
    [undefined, 'AUTHORITATIVE_FORM_UNVERIFIED'],
    [{ ...locked().form, memberRef: 'm2' }, 'AUTHORITATIVE_FORM_UNVERIFIED'],
    [{ ...locked().form, sectionId: 'section:2' }, 'FORM_CHANGED'],
    [{ ...locked().form, formVersion: 'form-v2' }, 'FORM_CHANGED'],
    [{ ...locked().form, consentTextVersion: 'consent-v2' }, 'FORM_CHANGED'],
    [{ ...locked().form, savingsType: 'SIMPANAN WAJIB' }, 'AUTHORITATIVE_FORM_UNVERIFIED'],
  ]) {
    const h = harness({ lock: locked({ form }) });
    assert.equal(code(await submitPublicSavingsChange(h.deps, command())), expected);
    assert.deepEqual(h.committed, []);
  }
});

test('ports expose no payroll processing, approval, profile/config mutation or generic SQL', () => {
  const src = readFileSync(new URL('../src/kosipa/public-savings.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /approve|payroll\w*\(|process\w*\(|updateProfile|updateConfig|execute\w*\(|query\w*\(|raw\w*\(/i);
});
