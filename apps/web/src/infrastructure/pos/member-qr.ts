import { createDecipheriv, createHash } from 'node:crypto';
import { PosError } from '@koperasi/domain/pos/sale';

/** PHP openssl_decrypt(options=0) consumes base64; its passphrase is the HEX SHA256 truncated to AES key length. */
export function decodeMemberIdentifier(value: string, kind: 'identifier' | 'nik' | 'card' | 'id' | 'qr', env: Record<string, string | undefined> = process.env): string {
  const identifier = value.trim();
  if (!identifier || identifier.length > 512) throw new PosError('INVALID_INPUT');
  if (kind !== 'qr') {
    if (identifier.length > 50 || identifier === '0') throw new PosError('INVALID_INPUT');
    if (kind === 'id' && (!/^[1-9]\d{0,9}$/.test(identifier) || Number(identifier) > 2147483647)) throw new PosError('INVALID_INPUT');
    return identifier;
  }
  const secret = env.POS_QR_SECRET_KEY;
  const secretIv = env.POS_QR_SECRET_IV;
  const cipher = env.POS_QR_CIPHER ?? 'aes-256-cbc';
  if (!secret || !secretIv || !['aes-256-cbc', 'aes-128-cbc'].includes(cipher)) throw new PosError('QR_NOT_CONFIGURED');
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(identifier)) throw new Error('invalid encoding');
    const key = Buffer.from(createHash('sha256').update(secret).digest('hex').slice(0, cipher === 'aes-256-cbc' ? 32 : 16));
    const iv = Buffer.from(createHash('sha256').update(secretIv).digest('hex').slice(0, 16));
    const decipher = createDecipheriv(cipher, key, iv);
    const plain = Buffer.concat([decipher.update(Buffer.from(identifier, 'base64')), decipher.final()]).toString('utf8');
    if (!plain || plain.length > 50 || plain === '0' || /[\x00-\x1f\ufffd]/.test(plain)) throw new Error('invalid identifier');
    return plain;
  } catch { throw new PosError('INVALID_QR'); }
}
