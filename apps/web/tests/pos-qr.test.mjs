import assert from 'node:assert/strict';
import test from 'node:test';
import {createCipheriv,createHash} from 'node:crypto';
const qr=await import('../src/infrastructure/pos/member-qr.ts').catch(()=>null);
test('legacy PHP AES QR decrypts with truncated hex passphrase and hex IV, and fails closed without secrets',()=>{
 assert.ok(qr?.decodeMemberIdentifier,'legacy QR decoder is implemented');
 const env={POS_QR_SECRET_KEY:'synthetic-key',POS_QR_SECRET_IV:'synthetic-iv'};
 const key=Buffer.from(createHash('sha256').update(env.POS_QR_SECRET_KEY).digest('hex').slice(0,32));
 const iv=Buffer.from(createHash('sha256').update(env.POS_QR_SECRET_IV).digest('hex').slice(0,16));
 const cipher=createCipheriv('aes-256-cbc',key,iv);
 const code=Buffer.concat([cipher.update('NIK-123'),cipher.final()]).toString('base64');
 assert.equal(qr.decodeMemberIdentifier(code,'qr',env),'NIK-123');
 assert.equal(qr.decodeMemberIdentifier('NIK-123','identifier',{}),'NIK-123');
 assert.throws(()=>qr.decodeMemberIdentifier(code,'qr',{}),e=>e.code==='QR_NOT_CONFIGURED');
 assert.throws(()=>qr.decodeMemberIdentifier('invalid','qr',env));
});

test('P2 dynamic member QR: signed token -> member id, single use, expiry, no legacy fallback, legacy cards still work', async () => {
 const { generateKeyPairSync } = await import('node:crypto');
 const { issueMemberQr, parseMemberQrSigningKey, MemberQrReplayGuard } = await import('@koperasi/application/member-qr/token');
 const { privateKey, publicKey } = generateKeyPairSync('ed25519');
 const signing = parseMemberQrSigningKey(`q1:${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`);
 const env = { MEMBER_QR_VERIFY_KEYS: `q1:${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}`, POS_QR_SECRET_KEY: 'synthetic-key', POS_QR_SECRET_IV: 'synthetic-iv' };
 const now = new Date('2026-11-11T03:00:00Z');
 const guard = new MemberQrReplayGuard();
 const { token } = issueMemberQr(signing, 9001, now);
 assert.deepEqual(qr.resolveMemberQr(token, env, now, guard), { identifier: '9001', kind: 'id' });
 assert.throws(() => qr.resolveMemberQr(token, env, now, guard), (e) => e.code === 'QR_ALREADY_USED');
 assert.throws(() => qr.resolveMemberQr(issueMemberQr(signing, 9001, now).token, env, new Date(now.getTime() + 120_000), guard), (e) => e.code === 'QR_EXPIRED');
 assert.throws(() => qr.resolveMemberQr(`${token.slice(0, -2)}AA`, env, now, guard), (e) => e.code === 'INVALID_QR');
 assert.throws(() => qr.resolveMemberQr(issueMemberQr(signing, 9001, now).token, { POS_QR_SECRET_KEY: 'k', POS_QR_SECRET_IV: 'i' }, now, guard), (e) => e.code === 'QR_NOT_CONFIGURED', 'a dynamic token never falls back to the legacy decoder');
 const key = Buffer.from(createHash('sha256').update(env.POS_QR_SECRET_KEY).digest('hex').slice(0, 32));
 const iv = Buffer.from(createHash('sha256').update(env.POS_QR_SECRET_IV).digest('hex').slice(0, 16));
 const c = createCipheriv('aes-256-cbc', key, iv);
 const legacy = Buffer.concat([c.update('NIK-123'), c.final()]).toString('base64');
 assert.deepEqual(qr.resolveMemberQr(legacy, env, now, guard), { identifier: 'NIK-123', kind: 'nik' });
});
