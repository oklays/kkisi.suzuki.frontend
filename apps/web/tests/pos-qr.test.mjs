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
