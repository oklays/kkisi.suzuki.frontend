import {createHash} from 'node:crypto';
import type {Delivery,PublicSavingsDeliveryProvider} from './providers.ts';

type FailureCode='DELIVERY_CONFIGURATION_INVALID'|'DELIVERY_MESSAGE_INVALID'|'DELIVERY_UNAVAILABLE'|'DELIVERY_TIMEOUT';
/** Contains only a safe operational code; never preserves provider bodies or causes. */
export class DeliveryProviderError extends Error {
 readonly code:FailureCode;
 constructor(code:FailureCode){super(code);this.name='DeliveryProviderError';this.code=code;}
}
export interface RemoteDeliveryConfig {
 enabled?:boolean;
 /** Explicit deployment authorization, separate from technical configuration. */
 deliveryAuthorized?:boolean;
 endpoint?:string;
 bearerToken?:string;
 timeoutMs?:number;
}
/** Generic transactional webhook contract. Requires a gateway accepting Delivery JSON
 * and honoring Idempotency-Key. HTTP acceptance does not prove recipient delivery.
 * Disabled by default; no retries here because timeout may mean accepted delivery. */
export function createRemoteDeliveryProvider(config:RemoteDeliveryConfig={},transport:typeof fetch=fetch):PublicSavingsDeliveryProvider {
 const {endpoint,bearerToken}=config,timeoutMs=config.timeoutMs??5000;
 let url:URL;try{url=new URL(endpoint??'');}catch{throw new DeliveryProviderError('DELIVERY_CONFIGURATION_INVALID');}
 if(config.enabled!==true||config.deliveryAuthorized!==true||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!bearerToken||!/^[\x21-\x7e]+$/.test(bearerToken)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new DeliveryProviderError('DELIVERY_CONFIGURATION_INVALID');
 return {async deliver(message){
  if(!/^[a-zA-Z0-9-]{1,128}$/.test(message.id)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(message.destination)||message.destination.length>254||
   (message.kind==='OTP'? !/^\d{6}$/.test(message.code??'')||!Number.isSafeInteger(message.expiresAt)||message.expiresAt!<=Date.now()||message.reference!==undefined : message.kind!=='SUBMISSION_CONFIRMATION'||!message.reference||message.reference.length>128||/[\r\n]/.test(message.reference)||message.code!==undefined||message.expiresAt!==undefined))throw new DeliveryProviderError('DELIVERY_MESSAGE_INVALID');
  // Whitelist fields: unexpected caller properties must never become provider metadata.
  const payload:Delivery={id:message.id,kind:message.kind,destination:message.destination,...(message.kind==='OTP'?{code:message.code,expiresAt:message.expiresAt}:{reference:message.reference})};
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new DeliveryProviderError('DELIVERY_TIMEOUT'));},timeoutMs);});
   const response=await Promise.race([transport(url.href,{method:'POST',redirect:'error',signal:controller.signal,headers:{authorization:`Bearer ${bearerToken}`,'content-type':'application/json','idempotency-key':createHash('sha256').update('public-savings:'+message.id).digest('hex')},body:JSON.stringify(payload)}),deadline]);
   // Do not parse response content: it may contain provider diagnostics or secrets.
   if(response.body)void response.body.cancel().catch(()=>{});
   if(!response.ok)throw new DeliveryProviderError('DELIVERY_UNAVAILABLE');
  }catch(error){throw error instanceof DeliveryProviderError?error:new DeliveryProviderError('DELIVERY_UNAVAILABLE');}
  finally{if(timer!==undefined)clearTimeout(timer);}
 }};
}
