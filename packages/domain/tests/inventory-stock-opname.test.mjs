import assert from 'node:assert/strict';
import test from 'node:test';
const d=await import('../src/inventory/stock-opname.ts').catch(()=>null);
const create={requestKey:'12345678-1234-4123-8123-123456789012',period:'2026-10',startDate:'2026-10-01',endDate:'2026-10-31',remarks:''};
test('inventory validates real dates, UUIDs and bounded metadata',()=>{
 assert.ok(d?.parseStockOpnameCreate,'inventory parsers exist');
 assert.deepEqual(d.parseStockOpnameCreate(create),create);
 for(const change of [{startDate:'2026-02-30'},{endDate:'2026-09-30'},{requestKey:'bad'},{period:''},{period:'a'.repeat(51)},{remarks:'a'.repeat(1001)}])assert.throws(()=>d.parseStockOpnameCreate({...create,...change}),{code:'INVALID_INPUT'});
});
test('physical zero and signed stock adjustments use exact money and INT bounds',()=>{
 assert.ok(d?.calculateStockCount,'inventory calculation exists');
 assert.deepEqual(d.calculateStockCount(5,0,'12.34'),{adjustmentQty:-5,subtotal:'0.00'});
 assert.deepEqual(d.calculateStockCount(-3,4,'0.10'),{adjustmentQty:7,subtotal:'0.40'});
 for(const [s,a,p]of [[-2147483648,0,'1.00'],[0,2147483648,'1.00'],[0,-1,'1.00'],[0,1.5,'1.00'],[0,NaN,'1.00'],[0,2147483647,'99999999999999.99'],[0,1,'-1.00']])assert.throws(()=>d.calculateStockCount(s,a,p),{code:'INVALID_INPUT'});
 assert.equal(d.parseStockOpnameCount({id:1,itemId:2,actualQty:0,note:'ok',companyId:999}).actualQty,0);
 for(const actualQty of [undefined,'0',-1,1.2,NaN,Infinity])assert.throws(()=>d.parseStockOpnameCount({id:1,itemId:2,actualQty,note:''}),{code:'INVALID_INPUT'});
});
test('global warehouse parser validates contacts and restricts status',()=>{
 assert.ok(d?.parseWarehouse,'warehouse parser exists');
 assert.deepEqual(d.parseWarehouse({name:' Main ',mobile:'',email:'',status:1}),{name:'Main',mobile:'',email:'',status:1});
 for(const change of [{name:''},{name:'a'.repeat(101)},{mobile:'1'.repeat(21)},{email:'bad'},{status:2},{id:0}])assert.throws(()=>d.parseWarehouse({name:'Main',mobile:'',email:'',status:1,...change}),{code:'INVALID_INPUT'});
});
test('physical valuation must survive legacy DOUBLE storage without changing cents',()=>{
 assert.throws(()=>d.calculateStockCount(0,2147483604,'40000.01'),{code:'INVALID_INPUT'});
 assert.deepEqual(d.calculateStockCount(0,2147483604,'40000.00'),{adjustmentQty:2147483604,subtotal:'85899344160000.00'});
});
