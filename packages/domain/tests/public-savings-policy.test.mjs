import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSavingsSubmission,
  inspectPublicSavingsPolicy,
  evaluatePublicSavingsSubmission,
} from '../src/kosipa/savings-application.ts';

// Synthetic contract fixtures only: neither a business policy nor approval evidence.
const SUBMISSION_VERSION = 'public-savings-submission/v1';
const POLICY_VERSION = 'public-savings-policy/v1';
const draft = (overrides = {}) => ({
  amountRupiah: '0000', sectionId: 'synthetic-section', startMonth: '13', startYear: '0000',
  consent: false, consentVersion: 'synthetic-consent', formVersion: 'synthetic-form',
  signature: { reference: 'synthetic-private-reference', contentHash: 'synthetic-hash' },
  ...overrides,
});
const policy = (overrides = {}) => ({
  contractVersion: POLICY_VERSION, policyVersion: 'synthetic-contract-only/v1',
  approvalState: 'APPROVED',
  approval: { approverRole: 'synthetic-reviewer', approvedAt: 'synthetic-date', scope: 'SYNTHETIC_TEST', evidenceRef: 'not-real-approval' },
  rules: {}, ...overrides,
});
const parse = (input) => parseSavingsSubmission(input, SUBMISSION_VERSION);
const failure = (result, code, field) => {
  assert.deepEqual(result, { ok: false, error: { code, ...(field === undefined ? {} : { field }) } });
  assert.equal('value' in result, false);
};

test('structural parse preserves exact strings and does not approve zero, consent or a payroll period', () => {
  const input = draft();
  assert.deepEqual(parse(input), { ok: true, value: input });
  assert.deepEqual(parse(draft({ amountRupiah: '9'.repeat(400) })), { ok: true, value: draft({ amountRupiah: '9'.repeat(400) }) });
});

for (const version of [undefined, null, '', 1, 'public-savings-submission/v2']) {
  test(`unsupported submission contract ${String(version)} is rejected before payload inspection`, () => {
    failure(parseSavingsSubmission(null, version), 'CONTRACT_VERSION_UNSUPPORTED', 'contractVersion');
  });
}

for (const input of [undefined, null, [], 'payload', 1, true, new Date(0), new Map()]) {
  test(`malformed payload ${Object.prototype.toString.call(input)} returns a typed error`, () => {
    failure(parse(input), 'INVALID_INPUT', 'submission');
  });
}

for (const field of Object.keys(draft())) {
  test(`missing structural field ${field} is rejected`, () => {
    const input = draft(); delete input[field];
    failure(parse(input), 'INVALID_INPUT', field);
  });
  test(`incorrect primitive type for ${field} is rejected without coercion`, () => {
    failure(parse(draft({ [field]: field === 'consent' ? 'false' : 1 })), 'INVALID_INPUT', field);
  });
}

for (const field of ['sectionId', 'consentVersion', 'formVersion']) {
  test(`empty ${field} is rejected`, () => failure(parse(draft({ [field]: '' })), 'INVALID_INPUT', field));
}

for (const amount of ['', '-1', '+1', '1.0', '1,000', '1_000', '1e3', ' 1', '1 ', '1\n', '１', '١', 'NaN', 'Infinity', NaN, Infinity, -Infinity, 1, 1n, null]) {
  test(`amount representation ${String(amount)} (${typeof amount}) is rejected`, () => {
    failure(parse(draft({ amountRupiah: amount })), 'INVALID_INPUT', 'amountRupiah');
  });
}

for (const [field, value] of [['startMonth', '001'], ['startMonth', '-1'], ['startMonth', '1.0'], ['startYear', '202'], ['startYear', '20260'], ['startYear', '２０２６'], ['startYear', '2026\n']]) {
  test(`period representation ${field}=${value} is rejected without resolving a calendar`, () => {
    failure(parse(draft({ [field]: value })), 'INVALID_INPUT', field);
  });
}

for (const signature of [undefined, null, [], 'signature', {}, { reference: 'x' }, { reference: 'x', contentHash: '' }, { reference: 1, contentHash: 'x' }, { reference: 'x', contentHash: 'x', publicUrl: 'synthetic' }]) {
  test(`malformed signature descriptor ${JSON.stringify(signature)} is rejected`, () => {
    const result = parse(draft({ signature }));
    assert.equal(result.ok, false); assert.equal(result.error.code, 'INVALID_INPUT');
    assert.ok(['signature', 'signature.reference', 'signature.contentHash'].includes(result.error.field));
  });
}

for (const field of ['nik', 'memberId', 'phone', 'status', 'docNo', 'policy', 'amountOld']) {
  test(`caller override ${field} is rejected without echoing data`, () => {
    failure(parse(draft({ [field]: 'PRIVATE_SYNTHETIC_MARKER' })), 'INVALID_INPUT', 'submission');
    assert.equal(JSON.stringify(parse(draft({ [field]: 'PRIVATE_SYNTHETIC_MARKER' }))).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  });
}

test('inherited fields, accessors, hidden keys, symbols and hostile objects are rejected without getter execution', () => {
  let reads = 0;
  const accessor = draft(); Object.defineProperty(accessor, 'amountRupiah', { enumerable: true, get() { reads++; throw new Error('must not execute'); } });
  const hidden = draft(); Object.defineProperty(hidden, 'hidden', { value: true });
  const symbol = draft(); symbol[Symbol('hidden')] = true;
  const inherited = Object.create(draft());
  const hostile = new Proxy({}, { ownKeys() { throw new Error('untrusted object'); } });
  for (const input of [accessor, hidden, symbol, inherited, hostile]) failure(parse(input), 'INVALID_INPUT', 'submission');
  assert.equal(reads, 0);
});

test('validation error order is deterministic and parsing leaves frozen inputs untouched', () => {
  const input = Object.freeze({ ...draft(), amountRupiah: 'bad', sectionId: '', signature: Object.freeze(draft().signature) });
  const before = JSON.stringify(input);
  failure(parse(input), 'INVALID_INPUT', 'amountRupiah');
  assert.deepEqual(parse(input), parse(input)); assert.equal(JSON.stringify(input), before);
});

test('revoked proxies fail with typed errors rather than escaping as exceptions', () => {
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  failure(parse(proxy), 'INVALID_INPUT', 'submission');
  failure(inspectPublicSavingsPolicy(proxy), 'POLICY_UNAPPROVED', 'policy');
  failure(evaluatePublicSavingsSubmission(draft(), proxy), 'POLICY_UNAPPROVED', 'policy');
});

test('polluted Object.prototype cannot supply missing required submission or policy fields', () => {
  const cases = [
    ['amountRupiah', '123', () => { const input = draft(); delete input.amountRupiah; return parse(input); }],
    ['reference', 'polluted-reference', () => { const input = draft(); delete input.signature.reference; return parse(input); }],
    ['approvalState', 'APPROVED', () => { const input = policy(); delete input.approvalState; return inspectPublicSavingsPolicy(input); }],
    ['evidenceRef', 'polluted-evidence', () => { const input = policy(); delete input.approval.evidenceRef; return inspectPublicSavingsPolicy(input); }],
  ];
  for (const [field, value, inspect] of cases) {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, field);
    try {
      Object.defineProperty(Object.prototype, field, { value, configurable: true });
      assert.equal(inspect().ok, false, `inherited ${field} is not an own required field`);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, field, previous);
      else delete Object.prototype[field];
    }
  }
});

test('null-prototype data and JSON __proto__ keys preserve own-field validation without prototype mutation', () => {
  const input = Object.assign(Object.create(null), draft());
  input.signature = Object.assign(Object.create(null), input.signature);
  assert.deepEqual(parse(input), { ok: true, value: draft() });
  const metadata = policy({ rules: JSON.parse('{"__proto__":{"reviewMarker":true}}') });
  const result = inspectPublicSavingsPolicy(metadata);
  assert.equal(result.ok, true);
  assert.equal(Object.getPrototypeOf(result.value.rules), Object.prototype);
  assert.equal(Object.hasOwn(result.value.rules, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(result.value.rules).reviewMarker, undefined);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const unexpected = JSON.parse(JSON.stringify(draft()).replace(/^\{/, `{${JSON.stringify(key)}:{"reviewMarker":true},`));
    failure(parse(unexpected), 'INVALID_INPUT', 'submission');
  }
});

test('large structural inputs receive no invented business ceiling and never authorise submission', () => {
  const input = draft({ amountRupiah: '9'.repeat(100_000) });
  assert.equal(parse(input).ok, true);
  failure(evaluatePublicSavingsSubmission(input, policy()), 'POLICY_NOT_IMPLEMENTED');
  failure(parse(draft({ amountRupiah: input.amountRupiah + 'e3' })), 'INVALID_INPUT', 'amountRupiah');
  failure(parse({ ...input, unexpected: Array(10_000).fill('synthetic') }), 'INVALID_INPUT', 'submission');
});

for (const input of [undefined, null, {}, [], 'policy', NaN, Infinity]) {
  test(`missing or malformed policy ${Object.prototype.toString.call(input)} fails closed`, () => {
    failure(inspectPublicSavingsPolicy(input), 'POLICY_UNAPPROVED', 'policy');
    failure(evaluatePublicSavingsSubmission(draft(), input), 'POLICY_UNAPPROVED', 'policy');
  });
}

for (const approvalState of ['PROPOSED', 'REJECTED', 'REVOKED', 'UNRECOGNISED']) {
  test(`policy state ${approvalState} cannot pass inspection or evaluation`, () => {
    const input = policy({ approvalState, approval: null });
    failure(inspectPublicSavingsPolicy(input), 'POLICY_UNAPPROVED', 'approvalState');
    failure(evaluatePublicSavingsSubmission(draft(), input), 'POLICY_UNAPPROVED', 'approvalState');
  });
}

for (const contractVersion of ['', 1, 'public-savings-policy/v2']) {
  test(`unknown policy contract ${String(contractVersion)} is rejected`, () => {
    failure(inspectPublicSavingsPolicy(policy({ contractVersion })), 'CONTRACT_VERSION_UNSUPPORTED', 'contractVersion');
    failure(evaluatePublicSavingsSubmission(draft(), policy({ contractVersion })), 'CONTRACT_VERSION_UNSUPPORTED', 'contractVersion');
  });
}

for (const field of ['contractVersion', 'policyVersion', 'approvalState', 'approval', 'rules']) {
  test(`missing policy field ${field} cannot become a default`, () => {
    const input = policy(); delete input[field];
    const result = inspectPublicSavingsPolicy(input);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'POLICY_UNAPPROVED');
  });
}

for (const field of ['approverRole', 'approvedAt', 'scope', 'evidenceRef']) {
  test(`APPROVED label with missing or empty ${field} is rejected`, () => {
    for (const value of [undefined, '', 1, null]) {
      const input = policy(); input.approval[field] = value;
      failure(inspectPublicSavingsPolicy(input), 'POLICY_UNAPPROVED', `approval.${field}`);
    }
  });
}

test('malformed metadata and unrecognised envelope keys are not approval evidence', () => {
  for (const input of [policy({ policyVersion: '' }), policy({ approval: null }), policy({ rules: [] }), policy({ rules: null }), policy({ extra: true }), policy({ approval: { ...policy().approval, extra: true } })]) {
    assert.equal(inspectPublicSavingsPolicy(input).ok, false);
    assert.equal(evaluatePublicSavingsSubmission(draft(), input).ok, false);
  }
});

test('APPROVED-looking metadata may pass shape inspection but NEVER authorises submission', () => {
  const input = policy();
  assert.deepEqual(inspectPublicSavingsPolicy(input), { ok: true, value: input });
  failure(evaluatePublicSavingsSubmission(draft(), input), 'POLICY_NOT_IMPLEMENTED');
  failure(evaluatePublicSavingsSubmission(null, input), 'INVALID_INPUT', 'submission');
});

test('opaque synthetic business values cannot activate policy behavior or introduce defaults', () => {
  for (const rules of [{}, { minimum: 123, eligible: true, cutoff: 'synthetic' }, { authorise: true, bypass: true }]) {
    failure(evaluatePublicSavingsSubmission(draft(), policy({ rules })), 'POLICY_NOT_IMPLEMENTED');
  }
});

test('inspection and evaluation are deterministic, do not mutate input, and do not expose synthetic private rules', () => {
  const input = Object.freeze({ ...policy(), approval: Object.freeze(policy().approval), rules: Object.freeze({ marker: 'PRIVATE_SYNTHETIC_MARKER' }) });
  const before = JSON.stringify(input);
  assert.deepEqual(inspectPublicSavingsPolicy(input), inspectPublicSavingsPolicy(input));
  assert.deepEqual(evaluatePublicSavingsSubmission(draft(), input), evaluatePublicSavingsSubmission(draft(), input));
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(evaluatePublicSavingsSubmission(draft(), input)).includes('PRIVATE_SYNTHETIC_MARKER'), false);
});
