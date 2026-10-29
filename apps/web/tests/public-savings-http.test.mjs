import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicSavingsRequest} from '../src/infrastructure/public-savings/http.ts';
test('public HTTP is disabled by default, errors do not disclose configuration',async()=>{
 const before=process.env.PSS_LOCAL_STAGING;delete process.env.PSS_LOCAL_STAGING;
 try{const response=await handlePublicSavingsRequest(new Request('http://127.0.0.1:3489/api/public/simpanan-sukarela/validate',{method:'POST'}),'validate');assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'ACTIVATION_BLOCKED'}});assert.equal(response.headers.get('cache-control'),'no-store');}finally{if(before!==undefined)process.env.PSS_LOCAL_STAGING=before;}
});
test('cross-origin requests and oversized request bodies are rejected before dependencies',async()=>{
 const foreign=await handlePublicSavingsRequest(new Request('http://127.0.0.1:3489/api/public/simpanan-sukarela/validate',{method:'POST',headers:{origin:'https://attacker.invalid'}}),'validate');assert.equal(foreign.status,403);
 const large=await handlePublicSavingsRequest(new Request('http://127.0.0.1:3489/api/public/simpanan-sukarela/validate',{method:'POST',headers:{'content-length':'2000000'}}),'validate');assert.equal(large.status,413);
});
test('local Next request URL normalization uses validated direct Host for origin comparison',async()=>{
 const before=process.env.PSS_LOCAL_STAGING;delete process.env.PSS_LOCAL_STAGING;
 try{
  const response=await handlePublicSavingsRequest(new Request('http://localhost:3489/api/public/simpanan-sukarela/validate',{method:'POST',headers:{host:'127.0.0.1:3489',origin:'http://127.0.0.1:3489'}}),'validate');
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'ACTIVATION_BLOCKED');
 }finally{if(before!==undefined)process.env.PSS_LOCAL_STAGING=before;}
});
