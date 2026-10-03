import assert from 'node:assert/strict';
import test from 'node:test';
const m=await import('../src/inventory/management.ts').catch(()=>null);
test('inventory management strips authority and validates before repository calls',async()=>{
 assert.ok(m?.InventoryManagement,'inventory management exists');
 let calls=0; const repo={async count(ctx,input){calls++;assert.deepEqual(ctx,{userId:4,companyId:1,canSwitchBranch:false});assert.deepEqual(input,{id:1,itemId:2,actualQty:0,note:''});return{document:{id:1},lines:[]};}};
 const usecase=new m.InventoryManagement(repo);const ctx={userId:4,companyId:1,canSwitchBranch:false};
 await assert.rejects(()=>usecase.count(ctx,{id:1,itemId:2,actualQty:-1,note:''},new Date()),{code:'INVALID_INPUT'});
 assert.equal(calls,0);await usecase.count(ctx,{id:1,itemId:2,actualQty:0,note:'',stock:99,companyId:999,userId:999},new Date());assert.equal(calls,1);
});
test('branch users cannot read or write global warehouse data',async()=>{
 assert.ok(m?.InventoryManagement);let calls=0;const usecase=new m.InventoryManagement({async warehouses(){calls++;return[];},async saveWarehouse(){calls++;return{id:1};}});
 const ctx={userId:4,companyId:1,canSwitchBranch:false};
 await assert.rejects(()=>usecase.warehouses(ctx),{code:'FORBIDDEN'});await assert.rejects(()=>usecase.saveWarehouse(ctx,{name:'Main',mobile:'',email:'',status:1}),{code:'FORBIDDEN'});assert.equal(calls,0);
 assert.deepEqual(await usecase.warehouses({...ctx,canSwitchBranch:true}),[]);assert.equal(calls,1);
});
