/** Immutable, encrypted private PNG/PDF evidence. Storage references are identifiers, never paths. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { canonicalSnapshot, type SubmissionSnapshot } from '@koperasi/domain/kosipa/savings-snapshot';
import { formatRupiahDocument } from '@koperasi/domain/money/rupiah';
import { formatRupiahTerbilang } from '@koperasi/domain/money/terbilang';
import { isPdfTemplate, LEGACY_PDF_TEMPLATE, PDF_TEMPLATES } from './pdf-templates.ts';

const MAX_BYTES = 1_048_576;
const MAX_PIXELS = MAX_BYTES / 4;
const MAX_ARTIFACT_BYTES = 8 * MAX_BYTES;
const MAGIC = Buffer.from('PSSART01');
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REF = /^pss-(signature|pdf)-[0-9a-f]{32}$/u;
const digest = (bytes: Uint8Array | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fail(code: string): never { throw new Error(code); }

export interface SubmissionPdfInput {
  reference: string;
  snapshot: SubmissionSnapshot;
  member: { name: string; maskedIdentifier: string; departmentName: string };
  consentText: string;
  templateVersion?: string;
  /** Immutable verification-event time, supplied by the persisted evidence envelope. */
  verifiedAtEpochMs?: number;
}

export function createPublicSavingsArtifactStore(config: { directory: string; encryptionKeyHex: string }) {
  if (!/^[0-9a-f]{64}$/iu.test(config.encryptionKeyHex)) fail('ARTIFACT_STORAGE_INVALID');
  const key = Buffer.from(config.encryptionKeyHex, 'hex');
  const directory = resolve(config.directory);
  let ready: Promise<void> | undefined;
  let identity: { dev: number; ino: number };

  async function checkComponents() {
    if (!isAbsolute(config.directory) || config.directory !== directory || directory.split(sep).some((part) => ['public', 'static'].includes(part.toLowerCase()))) fail('ARTIFACT_STORAGE_INVALID');
    let path = parse(directory).root;
    for (const part of directory.slice(path.length).split(sep)) {
      path = join(path, part);
      let st;
      try { st = await lstat(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(path, { mode: 0o700 });
        st = await lstat(path);
      }
      if (!st.isDirectory() || st.isSymbolicLink()) fail('ARTIFACT_STORAGE_INVALID');
    }
    const st = await lstat(directory);
    if ((st.mode & 0o077) !== 0 || (process.getuid && st.uid !== process.getuid()) || await realpath(directory) !== directory) fail('ARTIFACT_STORAGE_INVALID');
    identity = { dev: st.dev, ino: st.ino };
  }

  async function ensureDirectory() {
    try {
      ready ??= checkComponents();
      await ready;
      const st = await lstat(directory);
      if (!st.isDirectory() || st.isSymbolicLink() || st.dev !== identity.dev || st.ino !== identity.ino || (st.mode & 0o077) !== 0 || await realpath(directory) !== directory) fail('ARTIFACT_STORAGE_INVALID');
    } catch { fail('ARTIFACT_STORAGE_INVALID'); }
  }

  async function store(kind: 'signature' | 'pdf', plaintext: Uint8Array) {
    await ensureDirectory();
    if (plaintext.length > MAX_ARTIFACT_BYTES) fail('ARTIFACT_STORAGE_INVALID');
    const storageRef = `pss-${kind}-${randomBytes(16).toString('hex')}`;
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`KKISI-PSS-ARTIFACT/v1:${storageRef}`));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
    let handle;
    let created = false;
    try {
      handle = await open(join(directory, storageRef), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      await handle.writeFile(bytes);
      await handle.sync();
      await ensureDirectory();
      return storageRef;
    } catch {
      if (created) await unlink(join(directory, storageRef)).catch(() => undefined);
      fail('ARTIFACT_STORAGE_INVALID');
    } finally { await handle?.close(); }
  }

  async function readPrivateArtifact(storageRef: string): Promise<Uint8Array> {
    let handle;
    try {
      if (typeof storageRef !== 'string' || !REF.test(storageRef)) fail('ARTIFACT_UNAVAILABLE');
      await ensureDirectory();
      handle = await open(join(directory, storageRef), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const st = await handle.stat();
      if (!st.isFile() || st.nlink !== 1 || st.size < 36 || st.size > MAX_ARTIFACT_BYTES + 36 || (st.mode & 0o077) !== 0 || (process.getuid && st.uid !== process.getuid())) fail('ARTIFACT_UNAVAILABLE');
      const bytes = await handle.readFile();
      await ensureDirectory();
      if (!bytes.subarray(0, 8).equals(MAGIC)) fail('ARTIFACT_UNAVAILABLE');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
      decipher.setAAD(Buffer.from(`KKISI-PSS-ARTIFACT/v1:${storageRef}`));
      decipher.setAuthTag(bytes.subarray(20, 36));
      return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
    } catch { return fail('ARTIFACT_UNAVAILABLE'); }
    finally { await handle?.close(); }
  }

  async function stageSignature(bytes: Uint8Array): Promise<SubmissionSnapshot['signature']> {
    await ensureDirectory();
    let normalized: Buffer;
    let width: number;
    let height: number;
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BYTES || !Buffer.from(bytes.subarray(0, 8)).equals(PNG_MAGIC)) fail('SIGNATURE_INVALID');
      const image = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS, animated: false });
      const meta = await image.metadata();
      width = meta.width ?? 0; height = meta.height ?? 0;
      if (meta.format !== 'png' || (meta.pages ?? 1) !== 1 || width < 32 || height < 16 || width > 2048 || height > 1024 || width * height > MAX_PIXELS) fail('SIGNATURE_INVALID');
      const raw = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer();
      let ink = 0, left = width, right = 0, top = height, bottom = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = raw[i + 3]! / 255;
        const luminance = (raw[i]! * 0.2126 + raw[i + 1]! * 0.7152 + raw[i + 2]! * 0.0722) * alpha + 255 * (1 - alpha);
        if (luminance < 180) {
          ink++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (ink < Math.max(48, Math.ceil(width * height * 0.001)) || ink > width * height * 0.65 || right - left < 12 || bottom - top < 5) fail('SIGNATURE_INVALID');
      normalized = await sharp(raw, { raw: { width, height, channels: 4 } }).flatten({ background: '#ffffff' }).png({ compressionLevel: 9, palette: false }).toBuffer();
      if (normalized.length > MAX_BYTES) fail('SIGNATURE_INVALID');
    } catch { fail('SIGNATURE_INVALID'); }
    return Object.freeze({ format: 'PNG', decodedBytes: normalized.length, width, height, contentDigest: digest(normalized), storageRef: await store('signature', normalized) });
  }

  async function renderSubmissionPdf(input: SubmissionPdfInput) {
    // The persisted envelope names the template; no version means the original layout. Unknown versions fail closed.
    const templateVersion = input.templateVersion ?? LEGACY_PDF_TEMPLATE;
    if (!isPdfTemplate(templateVersion)) fail('PDF_TEMPLATE_UNSUPPORTED');
    const template = PDF_TEMPLATES[templateVersion];
    const RENDERER_VERSION: string = template.renderer;
    // Copy synchronously before I/O so later caller mutations cannot change the evidence being rendered.
    const evidence = structuredClone(input);
    const { snapshot, member } = evidence;
    const requiredText = [evidence.reference, member.name, member.maskedIdentifier, member.departmentName, evidence.consentText];
    if (requiredText.some((value) => typeof value !== 'string' || value.length === 0 || value.length > 12000) || snapshot.contractVersion !== 'pss-snapshot/v2' || snapshot.consent !== true) fail('PDF_INPUT_INVALID');
    if (evidence.verifiedAtEpochMs !== undefined && (!Number.isSafeInteger(evidence.verifiedAtEpochMs) || evidence.verifiedAtEpochMs < 0 || evidence.verifiedAtEpochMs > snapshot.submittedAtEpochMs)) fail('PDF_INPUT_INVALID');
    let signatureBytes: Uint8Array;
    try {
      if (!snapshot.signature.storageRef.startsWith('pss-signature-')) fail('SIGNATURE_INVALID');
      signatureBytes = await readPrivateArtifact(snapshot.signature.storageRef);
      if (digest(signatureBytes) !== snapshot.signature.contentDigest || signatureBytes.length !== snapshot.signature.decodedBytes) fail('SIGNATURE_INVALID');
      const meta = await sharp(signatureBytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS }).metadata();
      if (meta.format !== 'png' || meta.width !== snapshot.signature.width || meta.height !== snapshot.signature.height) fail('SIGNATURE_INVALID');
    } catch { fail('SIGNATURE_INVALID'); }

    let pdfBytes: Uint8Array;
    try {
      const doc = await PDFDocument.create({ updateMetadata: false });
      const submittedAt = new Date(snapshot.submittedAtEpochMs);
      doc.setCreationDate(submittedAt); doc.setModificationDate(submittedAt);
      doc.setCreator(RENDERER_VERSION); doc.setProducer(RENDERER_VERSION);
      doc.setTitle('Pengajuan Simpanan Sukarela - Belum Disetujui');
      const regular = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const blue = rgb(0, 0.2, 0.6), ink = rgb(0.12, 0.16, 0.22), gray = rgb(0.4, 0.44, 0.49);
      const W = 595.28, H = 841.89, margin = 44;
      let page = doc.addPage([W, H]), y = H - margin;
      const newPage = () => { page = doc.addPage([W, H]); y = H - margin; };
      const room = (height: number) => { if (y - height < 68) newPage(); };
      const line = (text: string, size = 10, strong = false, color = ink) => {
        room(size + 6); page.drawText(text, { x: margin, y: y - size, size, font: strong ? bold : regular, color }); y -= size + 6;
      };
      const wrapped = (text: string, size = 10, strong = false, color = ink) => {
        const font = strong ? bold : regular;
        for (const paragraph of text.split(/\r?\n/u)) {
          let current = '';
          for (const character of paragraph) {
            if (font.widthOfTextAtSize(current + character, size) > W - 2 * margin) {
              const breakAt = current.lastIndexOf(' ');
              line(breakAt > 0 ? current.slice(0, breakAt) : current, size, strong, color);
              current = breakAt > 0 ? current.slice(breakAt + 1) : '';
            }
            current += character;
          }
          line(current, size, strong, color);
        }
      };
      const section = (title: string) => { room(45); y -= 9; line(title, 10, true, blue); };
      const field = (label: string, value: string) => wrapped(`${label}: ${value}`);
      page.drawRectangle({ x: 0, y: H - 9, width: W, height: 9, color: blue });
      line('KKISI  /  KOSIPA', 11, true, blue);
      line('PENGAJUAN SIMPANAN SUKARELA', 18, true);
      line('PENGAJUAN / BELUM DISETUJUI', 10, true, blue);
      y -= 5; field('Referensi', evidence.reference);
      field('Diajukan (UTC)', submittedAt.toISOString().replace('T', ' ').replace('.000Z', ' UTC'));
      section('01  DATA ANGGOTA SAAT PENGAJUAN');
      field('Nama', member.name); field('Identitas anggota', member.maskedIdentifier); field('Bagian', member.departmentName);
      field('Jenis simpanan', snapshot.savingsType);
      section('02  PERUBAHAN POTONGAN YANG DIAJUKAN');
      if (template.amounts === 'raw') {
        field('Potongan sebelumnya (Rp)', snapshot.originalDeduction ?? 'Belum terdaftar (pendaftaran pertama)');
        field('Potongan yang diminta (Rp)', snapshot.requestedAmount);
      } else {
        field('Potongan sebelumnya', snapshot.originalDeduction === null ? 'Belum terdaftar (pendaftaran pertama)' : formatRupiahDocument(snapshot.originalDeduction));
        field('Potongan yang diminta', formatRupiahDocument(snapshot.requestedAmount));
        field('Terbilang', `${formatRupiahTerbilang(snapshot.requestedAmount)}.`);
      }
      field('Periode yang diminta', `${String(snapshot.requestedPeriod.month).padStart(2, '0')}/${snapshot.requestedPeriod.year}`);
      wrapped('Berlaku pada siklus payroll pertama yang memenuhi syarat setelah persetujuan. Pengajuan ini belum mengubah potongan dan bukan bukti persetujuan.', 9, false, gray);
      section('03  PERSETUJUAN ANGGOTA');
      wrapped(evidence.consentText, 10);
      section('04  BUKTI VERIFIKASI DAN TANDA TANGAN');
      field('Metode', snapshot.verification.method);
      field('Waktu verifikasi (UTC)', evidence.verifiedAtEpochMs === undefined ? 'Tidak tersedia dalam snapshot; waktu pengajuan tercantum di atas' : new Date(evidence.verifiedAtEpochMs).toISOString().replace('T', ' ').replace('.000Z', ' UTC'));
      field('Referensi bukti', snapshot.verification.proofRef);
      field('Versi kontak', snapshot.verification.contactVersion);
      room(95);
      const image = await doc.embedPng(signatureBytes);
      const scale = Math.min(210 / image.width, 65 / image.height);
      page.drawRectangle({ x: margin, y: y - 78, width: 230, height: 76, borderColor: rgb(0.79, 0.82, 0.87), borderWidth: 0.5 });
      page.drawImage(image, { x: margin + 10, y: y - 70, width: image.width * scale, height: image.height * scale }); y -= 90;
      section('05  VERSI DOKUMEN DAN INTEGRITAS');
      wrapped(`Kebijakan: ${snapshot.policyVersion} | Formulir: ${snapshot.formVersion} | Persetujuan: ${snapshot.consentTextVersion}`, 8);
      wrapped(`Snapshot: ${snapshot.contractVersion} | Template: ${templateVersion} | Renderer: ${RENDERER_VERSION}`, 8);
      wrapped(`SHA-256 snapshot: ${digest(canonicalSnapshot(snapshot)).slice(7)}`, 7);
      wrapped(`SHA-256 tanda tangan: ${snapshot.signature.contentDigest.slice(7)}`, 7);
      const pages = doc.getPages();
      pages.forEach((p, i) => {
        p.drawLine({ start: { x: margin, y: 48 }, end: { x: W - margin, y: 48 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.86) });
        p.drawText(`KKISI | PENGAJUAN / BELUM DISETUJUI | ${i + 1}/${pages.length}`, { x: margin, y: 33, size: 7, font: regular, color: gray });
      });
      pdfBytes = await doc.save({ useObjectStreams: false });
    } catch { fail('PDF_INPUT_INVALID'); }
    return { storageRef: await store('pdf', pdfBytes), contentDigest: digest(pdfBytes), templateVersion, rendererVersion: RENDERER_VERSION };
  }

  return { stageSignature, readPrivateArtifact, renderSubmissionPdf };
}
