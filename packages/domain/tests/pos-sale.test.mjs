import assert from 'node:assert/strict';
import test from 'node:test';
const sale=await import('../src/pos/sale.ts').catch(()=>null);
test('checkout accepts only Cash/Kredit, bounded positive unique quantities and exact whole-rupiah tender',()=>{
  assert.ok(sale?.parseCheckout,'checkout domain policy is implemented');
  const input={items:[{itemId:7,quantity:2}],paymentType:'Cash',paidAmount:'25000',idempotencyKey:'12345678-1234-4123-8123-123456789012'};
  assert.equal(sale.parseCheckout(input).paidSen,2500000);
  for(const over of [{paymentType:'QRIS'},{paidAmount:'1e5'},{paidAmount:'1.5'},{paidAmount:'10000000000'},{items:[]},{items:[{itemId:7,quantity:-1}]},{items:[{itemId:7,quantity:1},{itemId:7,quantity:2}]},{paymentType:'Kredit',memberId:null}])assert.throws(()=>sale.parseCheckout({...input,...over}));
});
test('member credit uses salary override, month boundaries in UTC+7 and active unexpired contracts',()=>{
  assert.ok(sale?.memberCredit,'member credit policy is implemented');
  const now=new Date('2026-09-30T18:00:00Z');
  const member={id:1,nik:'123',name:'Synthetic',status:'AKTIVE',employment:'TETAP',exitOn:null,limitSen:100000,gajiMinusSen:80000};
  assert.equal(sale.memberCredit(member,30000,now).remainingSen,50000);
  assert.equal(sale.memberCredit({...member,gajiMinusSen:0},30000,now).remainingSen,70000);
  assert.deepEqual(sale.businessDates(now),{day:'2026-10-01',monthStart:'2026-10-01',monthEnd:'2026-11-01',monthCode:'2610',dayCode:'261001'});
  for(const over of [{status:'PENSIUN'},{nik:'0'},{employment:'KONTRAK',exitOn:'2026-10-01'},{employment:'KONTRAK',exitOn:null}]) assert.throws(()=>sale.memberCredit({...member,...over},0,now));
  assert.equal(sale.memberCredit({...member,employment:'KONTRAK',exitOn:'2026-10-02'},0,now).remainingSen,80000);
});
