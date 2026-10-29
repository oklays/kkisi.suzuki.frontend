import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createPublicSavingsArtifactStore } from '../src/infrastructure/public-savings/artifacts.ts';
import { createPublicSavingsArtifactStore as createFrozenV1Store } from './fixtures/pss-artifacts-v1.frozen.ts';
import { CURRENT_PDF_TEMPLATE, LEGACY_PDF_TEMPLATE, PDF_TEMPLATES } from '../src/infrastructure/public-savings/pdf-templates.ts';

const KEY = '81'.repeat(32);
async function fixture(t) {
  const parent = await mkdtemp(join(await realpath(tmpdir()), 'pss-artifact-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, 'private');
  return { parent, directory, store: createPublicSavingsArtifactStore({ directory, encryptionKeyHex: KEY }) };
}
async function png(kind = 'ink', width = 600, height = 180) {
  const bytes = Buffer.alloc(width * height * 4, 255);
  if (kind === 'transparent') bytes.fill(0);
  if (kind === 'black') for (let i = 0; i < bytes.length; i += 4) bytes.fill(0, i, i + 3);
  if (kind === 'ink' || kind === 'dot') {
    const end = kind === 'dot' ? 1 : 420;
    for (let x = 0; x < end; x++) for (let dy = 0; dy < 3; dy++) {
      const i = ((Math.round(height / 2 + Math.sin(x / 20) * 20) + dy) * width + x + 25) * 4;
      bytes[i] = 16; bytes[i + 1] = 30; bytes[i + 2] = 50;
    }
  }
  return sharp(bytes, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
function snapshot(signature) {
  return { contractVersion: 'pss-snapshot/v2', policyVersion: 'KKISI-PSS-2026-V1/v1.0.0', memberRef: 'synthetic-member', sectionId: 'section-1', savingsType: 'SIMPANAN SUKARELA', originalDeduction: '100000.25', requestedAmount: '9007199254740993', requestedPeriod: { year: 2026, month: 11 }, effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL', consentTextVersion: 'consent-v1', formVersion: 'form-v1', consent: true, submittedAtEpochMs: Date.UTC(2026, 9, 29, 3), verification: { proofRef: 'proof-1', contactVersion: 'contact-1', method: 'SMS_OTP_CHANNEL_POSSESSION' }, signature };
}

const member = { name: 'ANGGOTA SINTETIS', maskedIdentifier: '****1234', departmentName: 'Bagian Sintetis' };
const consentText = 'Saya menyetujui pengajuan perubahan potongan simpanan sukarela ini.';
const verifiedAtEpochMs = Date.UTC(2026, 9, 29, 2, 59);
const pdfText = (parent, name, bytes) => { const file = join(parent, name); return writeFile(file, bytes).then(() => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })); };
async function twoStores(t) {
  const { parent, directory } = await fixture(t);
  const live = createPublicSavingsArtifactStore({ directory, encryptionKeyHex: KEY });
  const frozen = createFrozenV1Store({ directory, encryptionKeyHex: KEY });
  const sig = await live.stageSignature(await png());
  return { parent, live, frozen, sig, input: { reference: 'PSS-SYNTHETIC-0001', snapshot: snapshot(sig), member: structuredClone(member), consentText, verifiedAtEpochMs } };
}

test('v1 compatibility: the live renderer produces byte-identical v1 PDFs to the frozen pre-v2 renderer', async (t) => {
  const { live, frozen, input } = await twoStores(t);
  const reference = await frozen.renderSubmissionPdf(input);
  for (const templateVersion of [undefined, 'kkisi-pss-a4/v1']) {
    const current = await live.renderSubmissionPdf({ ...input, templateVersion });
    assert.equal(current.contentDigest, reference.contentDigest, `digest for templateVersion=${templateVersion}`);
    assert.equal(current.templateVersion, 'kkisi-pss-a4/v1');
    assert.equal(current.rendererVersion, 'pdf-lib-1.17.1/kkisi-pss-v1');
    assert.deepEqual(await live.readPrivateArtifact(current.storageRef), await frozen.readPrivateArtifact(reference.storageRef));
  }
});

test('v1 output still prints raw stored decimals with no Rp formatting or terbilang', async (t) => {
  const { parent, live, input } = await twoStores(t);
  const text = await pdfText(parent, 'v1.pdf', await live.readPrivateArtifact((await live.renderSubmissionPdf({ ...input, templateVersion: LEGACY_PDF_TEMPLATE })).storageRef));
  assert.match(text, /Potongan sebelumnya \(Rp\): 100000\.25/);
  assert.match(text, /Potongan yang diminta \(Rp\): 9007199254740993/);
  assert.doesNotMatch(text, /Terbilang/);
  assert.match(text, /Template: kkisi-pss-a4\/v1 \| Renderer: pdf-lib-1\.17\.1\/kkisi-pss-v1/);
});

test('v2 prints the Rupiah document format and the requested amount in words, exactly', async (t) => {
  const { parent, live, input } = await twoStores(t);
  const out = await live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v2' });
  assert.equal(out.templateVersion, 'kkisi-pss-a4/v2');
  assert.equal(out.rendererVersion, 'pdf-lib-1.17.1/kkisi-pss-v2');
  const text = (await pdfText(parent, 'v2.pdf', await live.readPrivateArtifact(out.storageRef))).replace(/\s+/g, ' ');
  assert.match(text, /Potongan sebelumnya: Rp100\.000,25/);
  assert.match(text, /Potongan yang diminta: Rp9\.007\.199\.254\.740\.993,00/);
  assert.match(text, /Terbilang: Sembilan kuadriliun tujuh triliun seratus sembilan puluh sembilan miliar dua ratus lima puluh empat juta tujuh ratus empat puluh ribu sembilan ratus sembilan puluh tiga rupiah\./);
  assert.match(text, /Template: kkisi-pss-a4\/v2 \| Renderer: pdf-lib-1\.17\.1\/kkisi-pss-v2/);
  assert.doesNotMatch(text, /Rp\)|\(Rp/);
  for (const kept of ['PENGAJUAN', 'BELUM DISETUJUI', 'PSS-SYNTHETIC-0001', '11/2026', 'ANGGOTA SINTETIS', '****1234', 'Saya menyetujui']) assert.ok(text.includes(kept), kept);
  const doc = await PDFDocument.load(await live.readPrivateArtifact(out.storageRef));
  assert.equal(doc.getPageCount(), 1);
});

test('v2 is deterministic, differs from v1, and leaves snapshot, signature and consent evidence untouched', async (t) => {
  const { parent, live, input } = await twoStores(t);
  const a = await live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v2' });
  const b = await live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v2' });
  const v1 = await live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v1' });
  assert.equal(a.contentDigest, b.contentDigest);
  assert.notEqual(a.contentDigest, v1.contentDigest);
  const text = (name, bytes) => pdfText(parent, name, bytes);
  const [t1, t2] = [await text('a1.pdf', await live.readPrivateArtifact(v1.storageRef)), await text('a2.pdf', await live.readPrivateArtifact(a.storageRef))];
  for (const evidence of [/SHA-256 snapshot: [0-9a-f]{64}/, /SHA-256 tanda tangan: [0-9a-f]{64}/]) assert.equal(t1.match(evidence)[0], t2.match(evidence)[0], String(evidence));
});

test('v2 whole-rupiah, fractional and first-registration amounts read correctly', async (t) => {
  const { parent, live, input } = await twoStores(t);
  const render = async (patch, name) => (await pdfText(parent, name, await live.readPrivateArtifact((await live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v2', snapshot: { ...input.snapshot, ...patch } })).storageRef))).replace(/\s+/g, ' ');
  const first = await render({ originalDeduction: null, requestedAmount: '150000' }, 'first.pdf');
  assert.match(first, /Potongan sebelumnya: Belum terdaftar \(pendaftaran pertama\)/);
  assert.match(first, /Potongan yang diminta: Rp150\.000,00/);
  assert.match(first, /Terbilang: Seratus lima puluh ribu rupiah\./);
  const cents = await render({ originalDeduction: '99999.5000', requestedAmount: '1000.50' }, 'cents.pdf');
  assert.match(cents, /Potongan sebelumnya: Rp99\.999,50/);
  assert.match(cents, /Terbilang: Seribu rupiah lima puluh sen\./);
});

test('an unknown or malformed template version fails closed, and an unrepresentable amount is not printed', async (t) => {
  const { live, input } = await twoStores(t);
  for (const bad of ['kkisi-pss-a4/v3', 'unsupported-v99', '', 'toString', '__proto__', 'constructor']) {
    await assert.rejects(() => live.renderSubmissionPdf({ ...input, templateVersion: bad }), /PDF_TEMPLATE_UNSUPPORTED/, bad);
  }
  await assert.rejects(() => live.renderSubmissionPdf({ ...input, templateVersion: 'kkisi-pss-a4/v2', snapshot: { ...input.snapshot, requestedAmount: '1000.505' } }), /PDF_INPUT_INVALID/);
});

test('version registry: new submissions pin v2, v1 stays registered, and each version names its own renderer', () => {
  assert.equal(CURRENT_PDF_TEMPLATE, 'kkisi-pss-a4/v2');
  assert.equal(LEGACY_PDF_TEMPLATE, 'kkisi-pss-a4/v1');
  assert.deepEqual(Object.keys(PDF_TEMPLATES), ['kkisi-pss-a4/v1', 'kkisi-pss-a4/v2']);
  assert.equal(PDF_TEMPLATES['kkisi-pss-a4/v1'].renderer, 'pdf-lib-1.17.1/kkisi-pss-v1');
  assert.notEqual(PDF_TEMPLATES['kkisi-pss-a4/v1'].renderer, PDF_TEMPLATES['kkisi-pss-a4/v2'].renderer);
});

test('version binding: retries render with the persisted version, new submissions pin the current one', async () => {
  const { readFile } = await import('node:fs/promises');
  const service = await readFile(new URL('../src/infrastructure/public-savings/service.ts', import.meta.url), 'utf8');
  // The RENDER_PDF job (initial render and every retry) must use what the evidence envelope recorded, and refuse a renderer mismatch.
  assert.match(service, /renderSubmissionPdf\(\{[^}]*templateVersion:env\.templateVersion/);
  assert.match(service, /artifact\.rendererVersion!==env\.rendererVersion\)deny\('PDF_TEMPLATE_UNSUPPORTED'\)/);
  // Only a brand-new submission may choose a version, and it chooses the current one from the registry.
  assert.equal((service.match(/templateVersion:/g) ?? []).length, 3, 'envelope type, appendSubmission and the render job are the only places');
  assert.match(service, /templateVersion:CURRENT_PDF_TEMPLATE,rendererVersion:PDF_TEMPLATES\[CURRENT_PDF_TEMPLATE\]\.renderer/);
  assert.doesNotMatch(service, /kkisi-pss-a4\/v[0-9]/, 'no hard-coded template literal in the service');
});
