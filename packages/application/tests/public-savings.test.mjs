import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { evaluatePublicSavingsSubmission } from '../../domain/src/kosipa/savings-application.ts';

// Synthetic in-memory caller only, with no runtime use case, account or approval authority.
const draft = { amountRupiah: '0', sectionId: 'synthetic', startMonth: '99', startYear: '0000', consent: false, consentVersion: 'synthetic', formVersion: 'synthetic', signature: { reference: 'synthetic', contentHash: 'synthetic' } };
const fixture = {
  contractVersion: 'public-savings-policy/v1', policyVersion: 'synthetic/v1', approvalState: 'APPROVED', rules: {},
  approval: { approverRole: 'synthetic', approvedAt: 'synthetic', scope: 'SYNTHETIC_TEST', evidenceRef: 'not-real-approval' },
};

for (const [label, value, code] of [
  ['missing', undefined, 'POLICY_UNAPPROVED'],
  ['proposed', { ...fixture, approvalState: 'PROPOSED', approval: null }, 'POLICY_UNAPPROVED'],
  ['revoked', { ...fixture, approvalState: 'REVOKED', approval: null }, 'POLICY_UNAPPROVED'],
  ['approved-looking', fixture, 'POLICY_NOT_IMPLEMENTED'],
]) {
  test(`an in-memory policy source with ${label} metadata cannot authorise submission`, () => {
    const versions = [];
    const source = { read(version) { versions.push(version); return value; } };
    const clock = { nowEpochMs: () => 123456 };
    const result = evaluatePublicSavingsSubmission(draft, source.read('synthetic/v1'));
    assert.equal(result.ok, false); assert.equal(result.error.code, code);
    assert.deepEqual(versions, ['synthetic/v1']); assert.equal(clock.nowEpochMs(), 123456);
  });
}

test('application module exposes only erased port interfaces and no runtime submission implementation', async () => {
  assert.deepEqual(Object.keys(await import('../src/kosipa/public-savings.ts')), []);
});

test('policy and clock ports have strict signatures; evaluation cannot have a success value', () => {
  const filename = fileURLToPath(new URL('./synthetic-public-savings-contract.ts', import.meta.url));
  const source = `
    import type { PublicSavingsPolicySource, PublicSavingsClock } from '../src/kosipa/public-savings.ts';
    import type { PublicSavingsEvaluationResult, PublicSavingsPolicyEnvelope } from '../../domain/src/kosipa/savings-application.ts';
    const source: PublicSavingsPolicySource = { read: (_version: string): unknown => undefined };
    const clock: PublicSavingsClock = { nowEpochMs: () => 123456 };
    const metadata: unknown = source.read('synthetic/v1');
    const now: number = clock.nowEpochMs();
    // @ts-expect-error policy lookup requires an explicit string version
    source.read(1);
    // @ts-expect-error clock must return a number
    const invalidClock: PublicSavingsClock = { nowEpochMs: () => 'now' };
    // @ts-expect-error unknown policy source data cannot be treated as approved metadata
    const approved: PublicSavingsPolicyEnvelope = source.read('synthetic/v1');
    // @ts-expect-error T01B authority does not exist; successful evaluation cannot be constructed
    const success: PublicSavingsEvaluationResult = { ok: true, value: {} };
    const rejection: PublicSavingsEvaluationResult = { ok: false, error: { code: 'POLICY_NOT_IMPLEMENTED' } };
    // @ts-expect-error arbitrary error codes are not part of the contract
    const invalidError: PublicSavingsEvaluationResult = { ok: false, error: { code: 'ALLOW' } };
    void [metadata, now, invalidClock, approved, success, rejection, invalidError];
  `;
  const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, lib: ['lib.esnext.d.ts'] };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (path, version, onError, createNew) => path === filename ? ts.createSourceFile(path, source, version, true) : getSourceFile(path, version, onError, createNew);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
  assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), []);
});

test('isolated package exports identify the two planned contract modules', () => {
  const domain = JSON.parse(readFileSync(new URL('../../domain/package.json', import.meta.url), 'utf8'));
  const application = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(domain.exports['./kosipa/savings-application'], './src/kosipa/savings-application.ts');
  assert.equal(application.exports['./kosipa/public-savings'], './src/kosipa/public-savings.ts');
});
