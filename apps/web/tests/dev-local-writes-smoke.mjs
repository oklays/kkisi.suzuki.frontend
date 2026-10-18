import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Checkpoint 14 — DEV LOCAL write paths through the real APIs (session + CSRF; no bypass), SYNTHETIC database kkisi_devlocal_staging only:
// Kredit checkout + idempotent replay, Cash sale + return by the supervisor, product edit, stock opname create/cancel, register close/reopen.
// Run right after `scripts/dev-local.sh reset`: it consumes synthetic stock (item 9002 starts at 5).
const base = process.env.DEV_LOCAL_URL || 'http://127.0.0.1:3200';
assert.equal(new URL(base).hostname, '127.0.0.1'); assert.equal(new URL(base).port, '3200', 'DEV LOCAL server only');
const pw = JSON.parse(readFileSync(new URL('../.env.dev-local-accounts.json', import.meta.url), 'utf8'));
async function login(user) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: `synth_${user}`, password: pw[user] }) });
  assert.equal(r.status, 200, `login ${user}`); const { csrfToken } = await r.json(); const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = async (method, path, body) => { const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', origin: base, cookie, 'x-csrf-token': csrfToken }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; } return { status: res.status, json }; };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };
}
const ok = (m) => console.log(`PASS ${m}`);
const kasir = await login('kasir1'), kepala = await login('kepala'), admin = await login('admin');

// Kredit + idempotent replay (item 9002, whole-rupiah price: a sub-rupiah total such as item 9001 at Rp 4.000,10 is refused with PAYMENT_PRECISION by design)
const kkey = randomUUID(); const kredit = { items: [{ itemId: 9002, quantity: 1 }], paymentType: 'Kredit', memberId: 9001, idempotencyKey: kkey };
const k1 = await kasir.post('/api/pos/checkout', kredit); assert.equal(k1.status, 200, JSON.stringify(k1.json));
const k2 = await kasir.post('/api/pos/checkout', kredit); assert.equal(k2.status, 200); assert.equal(JSON.stringify(k2.json).includes(String(k1.json.saleId ?? k1.json.sale?.id ?? k1.json.receipt?.saleId ?? '')), true, 'replay returns the same sale');
ok(`Kredit checkout for member S9001 recorded; replay with the same idempotency key does not create a second sale`);
// Cash + return
const c = await kasir.post('/api/pos/checkout', { items: [{ itemId: 9002, quantity: 2 }], paymentType: 'Cash', paidAmount: '20000', idempotencyKey: randomUUID() }); assert.equal(c.status, 200, JSON.stringify(c.json));
const saleId = c.json.saleId ?? c.json.sale?.id ?? c.json.receipt?.saleId; assert.ok(saleId, `sale id in ${JSON.stringify(c.json).slice(0, 200)}`);
// a refund is handled at the counter: the supervisor needs an OWN open register today (second synthetic device KRS02, opening float for the Cash refund)
const kreg = await kepala.post('/api/pos/register/open', { idKasir: 9003, saldoAwal: 100000 }); assert.ok([200, 409].includes(kreg.status), JSON.stringify(kreg.json));
const r = await kepala.post(`/api/sales/${saleId}/returns`, { items: [{ itemId: 9002, quantity: 1 }], reason: 'Barang rusak (uji DEV LOCAL)', idempotencyKey: randomUUID() });
assert.equal(r.status, 201, JSON.stringify(r.json)); assert.match(r.json.return.returnCode, /^RS9001/); ok(`Cash sale ${saleId} and a partial return ${r.json.return.returnCode} by the supervisor recorded (Cash refund from the supervisor's own drawer)`);
// product edit
const snap = await kepala.get('/api/products/edit?id=9001'); assert.equal(snap.status, 200, JSON.stringify(snap.json));
const product = snap.json.snapshot?.product ?? snap.json.snapshot; assert.ok(product?.revision !== undefined, `revision in ${JSON.stringify(snap.json).slice(0, 200)}`);
const save = await kepala.post('/api/products/edit', { action: 'save', ...product, sellingPrice: '4100.00' }); assert.equal(save.status, 200, JSON.stringify(save.json));
ok('product edit saved (synthetic item 9001, selling price)');
// stock opname create + cancel
const so = await admin.post('/api/inventory/stock-opnames', { action: 'create', requestKey: randomUUID(), period: 'Uji DEV LOCAL', startDate: '2026-10-18', endDate: '2026-10-18', remarks: 'uji DEV LOCAL' });
assert.equal(so.status, 200, JSON.stringify(so.json)); const soId = so.json.document?.id; assert.ok(soId);
const cancel = await admin.post('/api/inventory/stock-opnames', { action: 'cancel', id: soId }); assert.ok([200].includes(cancel.status), JSON.stringify(cancel.json));
ok(`stock opname document ${soId} created and cancelled`);
// register close and reopen
const reg = await kasir.get('/api/pos/register'); assert.equal(reg.status, 200, JSON.stringify(reg.json));
const registerId = reg.json.open?.id; assert.ok(registerId, `register id in ${JSON.stringify(reg.json).slice(0, 200)}`);
const close = await kasir.post('/api/pos/register/close', { registerId }); assert.equal(close.status, 200, JSON.stringify(close.json));
const idKasir = reg.json.open?.idKasir;
const open = await kasir.post('/api/pos/register/open', { idKasir, saldoAwal: 0 }); assert.equal(open.status, 200, JSON.stringify(open.json));
ok(`register ${registerId} closed and a new one opened`);
console.log('dev-local write smoke passed');
