import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, rm, readFile, writeFile, lstat, chmod, mkdir, symlink, link, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createPublicSavingsArtifactStore } from '../src/infrastructure/public-savings/artifacts.ts';

const KEY = '81'.repeat(32);
const digest = (v) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
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

test('stages canonical private PNG using authenticated encryption and opaque immutable references', async (t) => {
  const { directory, store } = await fixture(t);
  const s = await store.stageSignature(await png());
  assert.match(s.storageRef, /^pss-signature-[0-9a-f]{32}$/);
  assert.equal(s.width, 600); assert.equal(s.height, 180); assert.equal(s.format, 'PNG');
  assert.ok(s.decodedBytes <= 1048576);
  const bytes = await store.readPrivateArtifact(s.storageRef);
  assert.equal(digest(bytes), s.contentDigest);
  assert.equal((await sharp(bytes).metadata()).format, 'png');
  const ciphertext = await readFile(join(directory, s.storageRef));
  assert.equal(ciphertext.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), false);
  assert.equal(ciphertext.includes(bytes), false);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(directory, s.storageRef))).mode & 0o777, 0o600);
  const next = await store.stageSignature(await png());
  assert.notEqual(next.storageRef, s.storageRef);
  assert.equal(next.contentDigest, s.contentDigest);
  assert.deepEqual(await store.readPrivateArtifact(s.storageRef), bytes);
  assert.deepEqual(await readFile(join(directory, s.storageRef)), ciphertext);
  await writeFile(join(directory, next.storageRef), ciphertext);
  await assert.rejects(() => store.readPrivateArtifact(next.storageRef), /ARTIFACT_UNAVAILABLE/, 'ciphertext cannot be relabeled under a different opaque reference');
  const third = await store.stageSignature(await png());
  const tampered = await readFile(join(directory, third.storageRef)); tampered[tampered.length - 1] ^= 1;
  await writeFile(join(directory, third.storageRef), tampered);
  await assert.rejects(() => store.readPrivateArtifact(third.storageRef), /ARTIFACT_UNAVAILABLE/);
  const other = createPublicSavingsArtifactStore({ directory, encryptionKeyHex: '82'.repeat(32) });
  await assert.rejects(() => other.readPrivateArtifact(s.storageRef), /ARTIFACT_UNAVAILABLE/);
});

test('rejects malformed, blank, near-empty, solid, oversized and non-PNG signatures without creating artifacts', async (t) => {
  const { directory, store } = await fixture(t);
  const good = await store.stageSignature(await png());
  const bad = [Buffer.from('<svg/>'), Buffer.from('https://example.test/a.png'), (await png()).subarray(0, 70), Buffer.alloc(1048577), await png('white'), await png('transparent'), await png('dot'), await png('black'), await png('ink', 2049, 180), await png('ink', 1024, 1024)];
  for (const input of bad) await assert.rejects(() => store.stageSignature(input), /SIGNATURE_INVALID/);
  assert.equal((await readdir(directory)).length, 1);
  assert.equal(digest(await store.readPrivateArtifact(good.storageRef)), good.contentDigest);
});

test('rejects caller paths, directory/file symlinks, hard links, and insecure/public storage', async (t) => {
  const { parent, directory, store } = await fixture(t);
  const sig = await store.stageSignature(await png());
  for (const path of ['../secret', '/etc/passwd', sig.storageRef + '/x', 'https://x', 'pss-signature-' + 'a'.repeat(32) + '.png']) await assert.rejects(() => store.readPrivateArtifact(path), /ARTIFACT_UNAVAILABLE/);
  const duplicate = join(parent, 'hardlink'); await link(join(directory, sig.storageRef), duplicate);
  await assert.rejects(() => store.readPrivateArtifact(sig.storageRef), /ARTIFACT_UNAVAILABLE/);
  await rm(duplicate);
  const outside = join(parent, 'outside'); await writeFile(outside, 'private outside');
  await rm(join(directory, sig.storageRef)); await symlink(outside, join(directory, sig.storageRef));
  await assert.rejects(() => store.readPrivateArtifact(sig.storageRef), /ARTIFACT_UNAVAILABLE/);
  const insecure = join(parent, 'insecure'); await mkdir(insecure, { mode: 0o700 }); await chmod(insecure, 0o755);
  await assert.rejects(() => createPublicSavingsArtifactStore({ directory: insecure, encryptionKeyHex: KEY }).stageSignature(new Uint8Array([1])), /ARTIFACT_STORAGE_INVALID/);
  const directoryLink = join(parent, 'linked'); await symlink(directory, directoryLink);
  await assert.rejects(() => createPublicSavingsArtifactStore({ directory: directoryLink, encryptionKeyHex: KEY }).stageSignature(Buffer.alloc(1)), /ARTIFACT_STORAGE_INVALID/);
  await assert.rejects(() => createPublicSavingsArtifactStore({ directory: join(parent, 'public', 'files'), encryptionKeyHex: KEY }).stageSignature(new Uint8Array([1])), /ARTIFACT_STORAGE_INVALID/);
});

test('fails closed after private directory is replaced and never exposes paths or key in errors', async (t) => {
  const { parent, directory, store } = await fixture(t);
  const sig = await store.stageSignature(await png());
  await rename(directory, join(parent, 'original'));
  await symlink(join(parent, 'original'), directory);
  await assert.rejects(() => store.readPrivateArtifact(sig.storageRef), (e) => e.message === 'ARTIFACT_UNAVAILABLE' && !e.message.includes(parent) && !e.message.includes(KEY));
  assert.throws(() => createPublicSavingsArtifactStore({ directory, encryptionKeyHex: 'bad' }), /ARTIFACT_STORAGE_INVALID/);
});

test('renders reproducible A4 immutable evidence with PNG, exact amounts and frozen member fields', async (t) => {
  const { parent, directory, store } = await fixture(t);
  const sig = await store.stageSignature(await png());
  const suppliedMember = structuredClone(member);
  const input = { reference: 'PSS-SYNTHETIC-0001', snapshot: snapshot(sig), member: suppliedMember, consentText: 'Saya menyetujui pengajuan perubahan potongan simpanan sukarela ini.', verifiedAtEpochMs: Date.UTC(2026, 9, 29, 2, 59) };
  const first = await store.renderSubmissionPdf(input);
  const second = await store.renderSubmissionPdf(input);
  assert.equal(first.contentDigest, second.contentDigest);
  assert.notEqual(first.storageRef, second.storageRef);
  assert.match(first.templateVersion, /v1/); assert.match(first.rendererVersion, /pdf-lib/);
  const bytes = await store.readPrivateArtifact(first.storageRef);
  assert.equal(digest(bytes), first.contentDigest);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(bytes, await store.readPrivateArtifact(second.storageRef));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.28) < 0.1);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.89) < 0.1);
  const file = join(parent, 'synthetic.pdf'); await writeFile(file, bytes);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  for (const expected of ['PENGAJUAN', 'BELUM DISETUJUI', 'PSS-SYNTHETIC-0001', '100000.25', '9007199254740993', '11/2026', 'consent-v1', 'form-v1', 'SMS_OTP_CHANNEL_POSSESSION', 'ANGGOTA SINTETIS', '****1234', '2026-10-29', '02:59:00', 'Saya menyetujui', 'KKISI-PSS-2026-V1']) assert.ok(text.includes(expected), expected);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('/Subtype /Image')), 'signature embedded as image');
  assert.equal((await readFile(join(directory, first.storageRef))).includes(Buffer.from('ANGGOTA SINTETIS')), false);
  suppliedMember.name = 'MUTATED CURRENT MEMBER';
  assert.deepEqual(await store.readPrivateArtifact(first.storageRef), bytes, 'stored evidence never rebuilds from later member values');
  await assert.rejects(() => store.renderSubmissionPdf({ ...input, templateVersion: 'unsupported-v99' }), /PDF_TEMPLATE_UNSUPPORTED/);
  await assert.rejects(() => store.renderSubmissionPdf({ ...input, snapshot: snapshot({ ...sig, contentDigest: 'sha256:' + '0'.repeat(64) }) }), /SIGNATURE_INVALID/);
  await assert.rejects(() => store.renderSubmissionPdf({ ...input, snapshot: snapshot({ ...sig, storageRef: 'pss-signature-' + 'a'.repeat(32) }) }), /SIGNATURE_INVALID/);
  assert.equal((await readdir(directory)).length, 3, 'failed PDFs leave stored evidence unchanged');
});

test('freezes render input before async reads and supports full consent on numbered A4 pages', async (t) => {
  const { parent, store } = await fixture(t);
  const signature = await store.stageSignature(await png());
  const input = { reference: 'PSS-SYNTHETIC-LONG', snapshot: snapshot(signature), member: structuredClone(member), consentText: ('Persetujuan sintetis lengkap. '.repeat(330) + 'AKHIR PERSETUJUAN'), verifiedAtEpochMs: Date.UTC(2026, 9, 29, 2, 59) };
  const pending = store.renderSubmissionPdf(input);
  input.member.name = 'MUTATED CURRENT MEMBER';
  const result = await pending;
  const bytes = await store.readPrivateArtifact(result.storageRef);
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 1);
  for (const p of doc.getPages()) assert.ok(Math.abs(p.getWidth() - 595.28) < 0.1 && Math.abs(p.getHeight() - 841.89) < 0.1);
  const file = join(parent, 'long.pdf'); await writeFile(file, bytes);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  assert.match(text, /AKHIR\s+PERSETUJUAN/u, 'all consent words survive wrapping across lines');
  assert.ok(text.includes('ANGGOTA SINTETIS'));
  assert.equal(text.includes('MUTATED CURRENT MEMBER'), false);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('/Subtype /Image')));
});
