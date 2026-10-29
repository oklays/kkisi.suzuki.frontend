import {mkdir,readFile,readdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {localDirectory,openEvidence,sealEvidence} from './security.ts';

export interface Delivery {id:string;kind:'OTP'|'SUBMISSION_CONFIRMATION';destination:string;code?:string;reference?:string;expiresAt?:number}
export interface PublicSavingsDeliveryProvider {deliver(message:Delivery):Promise<void>}
type CaptureConfig={mode:string;encryptionKeyHex:string};
/** Explicit synthetic provider; this implementation has no network or real delivery capability. */
export function createLocalCaptureProvider(config:CaptureConfig,directory=path.join(localDirectory(),'capture')):PublicSavingsDeliveryProvider {
 return {async deliver(message){
  if(config.mode!=='LOCAL_SYNTHETIC'|| !/^[a-zA-Z0-9-]+$/.test(message.id) || !/^[^@\s]+@example\.invalid$/.test(message.destination)) throw new Error('CAPTURE_DESTINATION_INVALID');
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,message.id+'.capture');
  try {await writeFile(file,sealEvidence(message,config.encryptionKeyHex,message.id),{mode:0o600,flag:'wx'});} catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 }};
}
/** Local test harness only. Never exported through an HTTP route. Expired OTP plaintext is removed on access. */
export async function readLocalCaptures(config:CaptureConfig,directory=path.join(localDirectory(),'capture')):Promise<Delivery[]> {
 if(config.mode!=='LOCAL_SYNTHETIC')throw new Error('ACTIVATION_BLOCKED');
 let names:string[];try{names=await readdir(directory);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 const out:Delivery[]=[];
 for(const name of names.filter(n=>/^[a-zA-Z0-9-]+\.capture$/.test(n))){
  const file=path.join(directory,name),value=openEvidence<Delivery>(await readFile(file,'utf8'),config.encryptionKeyHex,name.slice(0,-8));
  if(value.kind==='OTP'&&value.expiresAt!==undefined&&value.expiresAt<=Date.now()){await unlink(file);continue;}
  out.push(value);
 }
 return out;
}
