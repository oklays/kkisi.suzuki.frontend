import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteDeliveryProvider,DeliveryProviderError} from '../src/infrastructure/public-savings/remote-provider.ts';
const message={id:'delivery-123',kind:'OTP',destination:'recipient@example.invalid',code:'123456',expiresAt:Date.now()+300000};
const config={enabled:true,deliveryAuthorized:true,endpoint:'https://delivery.example.invalid/send',bearerToken:'synthetic-secret',timeoutMs:50};
test('disabled and unauthorized configuration cannot send',()=>{
 for(const value of [{},{...config,enabled:false},{...config,deliveryAuthorized:false}]) assert.throws(()=>createRemoteDeliveryProvider(value),{code:'DELIVERY_CONFIGURATION_INVALID'});
});
test('rejects unsafe endpoints, credentials and unbounded timeout',()=>{
 for(const patch of [{endpoint:'http://example.invalid'},{endpoint:'https://user:pass@example.invalid'},{endpoint:'https://example.invalid/?secret=x'},{endpoint:'https://example.invalid/#x'},{bearerToken:'bad\r\nsecret'},{timeoutMs:0},{timeoutMs:30001}]) assert.throws(()=>createRemoteDeliveryProvider({...config,...patch}),{code:'DELIVERY_CONFIGURATION_INVALID'});
});
test('sends fixed HTTPS request with stable opaque idempotency and explicit no redirect',async()=>{
 const calls=[];const provider=createRemoteDeliveryProvider(config,async(...args)=>{calls.push(args);return new Response(null,{status:202});});
 await provider.deliver(message);await provider.deliver(message);
 assert.equal(calls[0][0],config.endpoint);const request=calls[0][1];
 assert.equal(request.method,'POST');assert.equal(request.redirect,'error');assert.equal(request.headers.authorization,'Bearer synthetic-secret');assert.equal(request.headers['content-type'],'application/json');assert.equal(request.headers['idempotency-key'],calls[1][1].headers['idempotency-key']);assert.match(request.headers['idempotency-key'],/^[a-f0-9]{64}$/);assert.deepEqual(JSON.parse(request.body),message);assert.ok(request.signal);
});
test('validates message before any transport',async()=>{
 let calls=0;const provider=createRemoteDeliveryProvider(config,async()=>{calls++;return new Response();});
 for(const patch of [{id:''},{kind:'OTHER'},{code:'bad'},{expiresAt:0},{destination:'bad\r\n@example.invalid'},{destination:'a@b@example.invalid'}]) await assert.rejects(provider.deliver({...message,...patch}),{code:'DELIVERY_MESSAGE_INVALID'});
 assert.equal(calls,0);
});
test('safe typed failures never include provider body, destination or OTP',async()=>{
 for(const transport of [async()=>new Response('123456 recipient@example.invalid',{status:503}),async()=>{throw new Error('123456 recipient@example.invalid');}]){
  const provider=createRemoteDeliveryProvider(config,transport);await assert.rejects(provider.deliver(message),error=>error instanceof DeliveryProviderError&&error.code==='DELIVERY_UNAVAILABLE'&&!JSON.stringify(error).includes('123456')&&!error.message.includes('recipient'));
 }
});
test('timeout aborts and settles even when transport ignores abort',async()=>{
 const provider=createRemoteDeliveryProvider({...config,timeoutMs:5},()=>new Promise(()=>{}));await assert.rejects(provider.deliver(message),{code:'DELIVERY_TIMEOUT'});
});
test('confirmation payload has no OTP fields',async()=>{
 const calls=[];const provider=createRemoteDeliveryProvider(config,async(...args)=>{calls.push(args);return new Response();});
 await provider.deliver({id:'confirmation-1',kind:'SUBMISSION_CONFIRMATION',destination:message.destination,reference:'PSS-123'});assert.equal(JSON.parse(calls[0][1].body).code,undefined);
 await assert.rejects(provider.deliver({...message,kind:'SUBMISSION_CONFIRMATION',reference:'PSS-123'}),{code:'DELIVERY_MESSAGE_INVALID'});
});
