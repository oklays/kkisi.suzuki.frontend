import {publicSavingsStagingEnabled} from '../../features/public-savings/flags.ts';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface StagingConfig {
  mode: 'LOCAL_SYNTHETIC'; host: '127.0.0.1'; port: number; database: 'kkisi_public_savings'; installationId: string;
  app: {user:string;password:string}; legacy:{user:string;password:string};
  encryptionKeyHex:string; hashKey:string; operatorKey:string;
}
/** An intentionally local-only activation boundary. Production integration must supply a separately verified deployment adapter. */
export function validateStagingConfig(input: unknown): StagingConfig {
  const c=input as StagingConfig;
  if (!c || c.mode!=='LOCAL_SYNTHETIC' || c.host!=='127.0.0.1' || c.database!=='kkisi_public_savings'
    || !Number.isInteger(c.port) || c.port<3310 || c.port>3399 || !/^[0-9a-f]{32}$/.test(c.installationId)
    || !c.app || !['pss_app','pss_public'].includes(c.app.user) || c.app.password.length<16 || !c.legacy || c.legacy.user!=='pss_legacy'
    || ![c.encryptionKeyHex,c.hashKey,c.operatorKey].every(k=>typeof k==='string' && /^[0-9a-f]{64}$/.test(k))) throw new Error('STAGING_CONFIGURATION_INVALID');
  return c;
}
export const localDirectory=()=>path.resolve(process.env.PSS_LOCAL_DIRECTORY || (process.cwd().endsWith(`${path.sep}apps${path.sep}web`)?'../../.local/public-savings':'.local/public-savings'));
export async function loadStagingConfig():Promise<StagingConfig> {
  if(!publicSavingsStagingEnabled()) throw new Error('ACTIVATION_BLOCKED');
  const file=path.join(localDirectory(),'config.json');
  if((await stat(file)).mode & 0o077) throw new Error('STAGING_CONFIGURATION_INVALID');
  return validateStagingConfig(JSON.parse(await readFile(file,'utf8')));
}
export function keyedDigest(key:string,purpose:string,value:string):string {return createHmac('sha256',Buffer.from(key,'hex')).update(purpose+'\0'+value).digest('hex');}
export function secretMatches(a:string,b:string):boolean {return /^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function sealEvidence(value:unknown,key:string,identity:string):string {
  const nonce=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);cipher.setAAD(Buffer.from(identity));
  const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [nonce.toString('hex'),cipher.getAuthTag().toString('hex'),bytes.toString('hex')].join('.');
}
export function openEvidence<T>(value:string,key:string,identity:string):T {
  const [nonce,tag,bytes]=value.split('.');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(nonce,'hex'));decipher.setAAD(Buffer.from(identity));decipher.setAuthTag(Buffer.from(tag,'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(bytes,'hex')),decipher.final()]).toString('utf8')) as T;
}
