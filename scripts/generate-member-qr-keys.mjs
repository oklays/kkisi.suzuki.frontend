// Generates an Ed25519 key pair for the dynamic member QR (P2) and writes the two env values to files with mode 600.
//   node scripts/generate-member-qr-keys.mjs <kid> <out-dir>
// <out-dir>/MEMBER_QR_SIGNING_KEY  -> PWA (apps/mobile_kkisi) only        <out-dir>/MEMBER_QR_VERIFY_KEYS -> POS (apps/web)
// Nothing is printed except the public key fingerprint; the private key never leaves <out-dir>.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [kid, out] = process.argv.slice(2);
if (!/^[a-z0-9]{1,16}$/.test(kid ?? '') || !out) { console.error('usage: generate-member-qr-keys.mjs <kid a-z0-9> <out-dir>'); process.exit(2); }
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }), spki = publicKey.export({ format: 'der', type: 'spki' });
mkdirSync(out, { recursive: true, mode: 0o700 });
writeFileSync(join(out, 'MEMBER_QR_SIGNING_KEY'), `${kid}:${pkcs8.toString('base64')}\n`, { mode: 0o600 });
writeFileSync(join(out, 'MEMBER_QR_VERIFY_KEYS'), `${kid}:${spki.toString('base64')}\n`, { mode: 0o600 });
console.log(`kid ${kid}, public key SHA256:${createHash('sha256').update(spki).digest('base64')}`);
