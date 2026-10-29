/** Child-process synthetic race probe. All bearer/proof material enters through a private ephemeral file. */
import { lstat, readFile } from 'node:fs/promises';
import { loadConfig } from './staging.mjs';
import { createPublicSavingsService } from '../../apps/web/src/infrastructure/public-savings/service.ts';

let service;
try {
  const [file, rawCount] = process.argv.slice(2);
  const count = Number(rawCount);
  if (!file || !Number.isInteger(count) || count < 1 || count > 20) throw new Error('INVALID_WORKER_INPUT');
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o777) !== 0o600 || st.size > 1_500_000) throw new Error('INVALID_WORKER_INPUT');
  const input = JSON.parse(await readFile(file, 'utf8'));
  service = createPublicSavingsService(await loadConfig());
  const command = { ...input.command, signature: Buffer.from(input.signatureBase64, 'base64') };
  const outcomes = await Promise.all(Array.from({ length: count }, async () => {
    try { const value = await service.submit(input.token, input.proof, command); return { ok: true, reference: value.reference }; }
    catch (error) { return { ok: false, code: typeof error.code === 'string' && /^[A-Z_]+$/u.test(error.code) ? error.code : 'WORKER_SUBMISSION_FAILED' }; }
  }));
  process.stdout.write(JSON.stringify(outcomes));
} catch {
  process.stdout.write(JSON.stringify([{ ok: false, code: 'WORKER_FAILED' }]));
  process.exitCode = 1;
} finally { await service?.close(); }
