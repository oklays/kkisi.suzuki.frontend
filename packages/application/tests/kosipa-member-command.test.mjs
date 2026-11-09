import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMember, updateMemberProfile, changeMemberStatus } from '../src/kosipa/commands/member.ts';
import { KosipaError } from '../../domain/src/kosipa/errors.ts';
import { GRANTABLE_KOSIPA_CAPABILITIES } from '../../domain/src/console/capabilities.ts';
import { AUDIT_ACTIONS } from '../../domain/src/console/identity-link.ts';
const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const version = 'a'.repeat(64);
const actor = { userId: 7, kosipaUserId: 70, capabilities: new Set(['kosipa.member.view','kosipa.member.create','kosipa.member.update']), requestId: 'req-1' };
const registration = () => ({ fields: { nik_kar:'00123', nama_kar:'José', bagian:'Produksi', lokasi:'Tambun', kd_group:'ANGGOTA', status_anggota:'AKTIVE', no_rek:'123456', gaji:'100' }, initialDeductions:{ pokok:'0', wajib:'1', sukarela:'0' }, idempotencyKey:KEY() });
const profile = (extra = {}) => ({ fields:{ alamat:'Private address', no_rek:'456', gaji:'200' }, expectedVersion:version, reason:'Verified correction', idempotencyKey:KEY(2), ...extra });
function world(owns = true) {
  const calls = [], events = [], ledger = new Map();
  const execute = async (method, envelope, ...input) => {
    calls.push({ method, envelope, input });
    const key = `${envelope.actorConsoleUserId}:${envelope.idempotencyKey}`;
    const old = ledger.get(key);
    if (old) {
      if (old.hash !== envelope.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT');
      return { result:old.result, replayed:true, ledgerId:old.id };
    }
    const result = { id:42, version };
    ledger.set(key, { result, hash:envelope.requestHash, id:ledger.size+1 });
    return { result, replayed:false, ledgerId:ledger.size };
  };
  const ports = { ownership:{ owns:(f) => owns && f === 'member' }, audit:{ async append(e) { events.push(e); } }, now:() => new Date('2026-11-05T18:00:00Z'), members:{ create:(...i) => execute('create',...i), update:(...i) => execute('update',...i), changeStatus:(...i) => execute('status',...i) } };
  return { ports, calls, events, ledger };
}
test('ownership/capability/view/live link gates both member commands before repository or parsing', async () => {
  const off = world(false);
  await assert.rejects(registerMember(off.ports,actor,null), { code:'WRITE_DISABLED' });
  assert.equal(off.calls.length,0); assert.equal(off.events.length,0);
  for (const candidate of [{ ...actor, kosipaUserId:null }, { ...actor, capabilities:new Set(['kosipa.member.view']) }, { ...actor, capabilities:new Set(['kosipa.member.create','kosipa.member.update']) }, { ...actor, capabilities:new Set(['iam.kosipa.grant']) }]) {
    const w=world();
    await assert.rejects(registerMember(w.ports,candidate,null), { code:'FORBIDDEN' });
    await assert.rejects(updateMemberProfile(w.ports,candidate,'PII-FORGED',null), { code:'FORBIDDEN' });
    assert.equal(w.calls.length,0); assert.equal(w.events.length,2); assert.ok(w.events.every((e)=>e.action==='kosipa.command.denied'));
    assert.ok(!JSON.stringify(w.events).includes('PII-FORGED'));
  }
});
test('register uses Jakarta port clock, member feature and private-free new subject', async () => {
  const w=world(); const b=registration(); b.fields.tgl_daftar='2026-11-06';
  const r=await registerMember(w.ports,actor,b);
  assert.deepEqual(r.result,{ id:42, version });
  const { envelope,input }=w.calls[0];
  assert.equal(envelope.command,'member.register'); assert.equal(envelope.capability,'kosipa.member.create');
  assert.equal(envelope.subjectType,'member'); assert.equal(envelope.subjectRef,'new');
  assert.equal(input[0].fields.nik_kar,'123'); assert.equal(input[0].initialDeductions.wajib,'1');
  assert.equal(w.events[0].action,'kosipa.member.register');
  b.fields.tgl_daftar='2026-11-07'; b.idempotencyKey=KEY(3);
  await assert.rejects(registerMember(w.ports,actor,b), { code:'MEMBER_DATE_INVALID' });
});
test('update passes locked-record identity, full parsed patch, opaque version and reason to repository', async () => {
  const w=world(); const r=await updateMemberProfile(w.ports,actor,'42',profile());
  assert.deepEqual(r.result,{ id:42,version });
  const { envelope,input }=w.calls[0];
  assert.equal(envelope.command,'member.update_profile'); assert.equal(envelope.capability,'kosipa.member.update');
  assert.equal(envelope.subjectRef,'42'); assert.equal(input[0],42);
  assert.deepEqual(input[1],{ fields:profile().fields, expectedVersion:version, reason:'Verified correction', idempotencyKey:KEY(2) });
  assert.equal(w.events[0].action,'kosipa.member.updateProfile');
});
test('strict key, route id, body and forbidden field refusals occur before repository', async () => {
  const w=world();
  for (const rawId of ['0','-1','1 OR 1=1','001','2147483648','secret-name']) await assert.rejects(updateMemberProfile(w.ports,actor,rawId,profile()), { code:'MEMBER_ID_INVALID' });
  for (const bad of [null, []]) await assert.rejects(registerMember(w.ports,actor,bad), { code:'INVALID_INPUT' });
  for (const [bad,code] of [[{ ...registration(), fields:{ ...registration().fields, limit_toko:'1' } },'FIELD_NOT_ALLOWED'], [{ ...registration(), extra:1 },'FIELD_NOT_ALLOWED'], [{ ...registration(), idempotencyKey:'x' },'IDEMPOTENCY_KEY_INVALID']]) await assert.rejects(registerMember(w.ports,actor,bad), { code });
  assert.equal(w.calls.length,0); assert.ok(!JSON.stringify(w.events).includes('secret-name'));
});
test('fingerprint binds all validated fields, deductions, expectedVersion and reason; replay suppresses audit', async () => {
  const w=world(); const b=registration();
  const one=await registerMember(w.ports,actor,b); const two=await registerMember(w.ports,actor,{ ...b, fields:{ ...b.fields, nik_kar:'123', gaji:'100.00' } });
  assert.equal(one.replayed,false); assert.equal(two.replayed,true); assert.equal(w.events.length,1); assert.equal(w.ledger.size,1);
  for (const changed of [{ ...b, fields:{ ...b.fields,nama_kar:'Other' } },{ ...b,initialDeductions:{ ...b.initialDeductions,wajib:'2' } }]) await assert.rejects(registerMember(w.ports,actor,changed), { code:'IDEMPOTENCY_CONFLICT' });
  await updateMemberProfile(w.ports,actor,'42',profile());
  for (const changed of [profile({ reason:'Different correction' }),profile({ expectedVersion:'b'.repeat(64) }),profile({ fields:{ alamat:'Other' } })]) await assert.rejects(updateMemberProfile(w.ports,actor,'42',changed), { code:'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(updateMemberProfile(w.ports,actor,'43',profile()), { code:'IDEMPOTENCY_CONFLICT' });
  assert.ok(w.calls.every((c)=>/^[0-9a-f]{64}$/.test(c.envelope.requestHash)));
});
test('result, subject, envelope and audit exclude member values and reason; grants cover masters and members only', async () => {
  const w=world(); await registerMember(w.ports,actor,registration()); await updateMemberProfile(w.ports,actor,'42',profile());
  const safe=JSON.stringify({ events:w.events,envelopes:w.calls.map((c)=>c.envelope),results:[...w.ledger.values()].map((l)=>l.result) });
  for (const pii of ['José','00123','123456','Private address','Verified correction','no_rek','gaji']) assert.ok(!safe.includes(pii),pii);
  assert.deepEqual(GRANTABLE_KOSIPA_CAPABILITIES,['kosipa.master.manage','kosipa.member.create','kosipa.member.update','kosipa.member.status','kosipa.savings.prepare','kosipa.savings.approve','kosipa.loan.prepare','kosipa.loan.approve']);
  assert.ok(AUDIT_ACTIONS.includes('kosipa.member.register')); assert.ok(AUDIT_ACTIONS.includes('kosipa.member.updateProfile'));
});
test('repository stale/uniqueness/transaction rejection produces failure audit and no success', async () => {
  for (const code of ['STALE','MEMBER_NIK_DUPLICATE','MEMBER_MIRROR_CONFLICT','LEGACY_WRITE_UNFENCED']) {
    const w=world(); w.ports.members.update=async()=>{ throw new KosipaError(code); };
    await assert.rejects(updateMemberProfile(w.ports,actor,'42',profile()), { code });
    assert.deepEqual(w.events.map((e)=>[e.action,e.detail.code]),[['kosipa.command.failed',code]]);
    assert.equal(w.ledger.size,0);
  }
});
// Repository/database acceptance scenarios belong to later tasks; mock ports cannot prove them.
test.todo('repository create writes member + positive m_simpanan_aktif config rows atomically, sim_* = initialDeductions (including "0")');
test.todo('repository update mirrors exactly ktp/name/phone/email/street_address to an existing linked users row');
test.todo('repository update refuses a stale expectedVersion under the row lock (STALE) after replay lookup');
test.todo('repository replay of the same actor/key/fingerprint returns the stored result without a second write');

const statusBody = (extra = {}) => ({ status:'RESIGN', reason:'Karyawan mengundurkan diri', expectedVersion:version, idempotencyKey:KEY(5), ...extra });
test('status: needs its own capability + view + live link; ownership first; invalid route/body refused before the repository', async () => {
  const off = world(false);
  await assert.rejects(changeMemberStatus(off.ports, actor, '42', statusBody()), { code:'WRITE_DISABLED' });
  for (const candidate of [{ ...actor, kosipaUserId:null }, { ...actor, capabilities:new Set(['kosipa.member.view','kosipa.member.create','kosipa.member.update']) }, { ...actor, capabilities:new Set(['kosipa.member.status']) }]) {
    const w = world();
    await assert.rejects(changeMemberStatus(w.ports, candidate, 'PII-FORGED', statusBody()), { code:'FORBIDDEN' });
    assert.equal(w.calls.length, 0); assert.ok(!JSON.stringify(w.events).includes('PII-FORGED'));
  }
  const w = world(); const ok = { ...actor, capabilities:new Set(['kosipa.member.view','kosipa.member.status']) };
  for (const rawId of ['0','1 OR 1=1','001','secret-name']) await assert.rejects(changeMemberStatus(w.ports, ok, rawId, statusBody()), { code:'MEMBER_ID_INVALID' });
  for (const [bad, code] of [[statusBody({ status:'DELETED' }),'MEMBER_STATUS_INVALID'],[statusBody({ reason:'' }),'REASON_INVALID'],[statusBody({ limit_toko:'1' }),'FIELD_NOT_ALLOWED'],[statusBody({ expectedVersion:'x' }),'VERSION_INVALID'],[null,'INVALID_INPUT']])
    await assert.rejects(changeMemberStatus(w.ports, ok, '42', bad), { code });
  assert.equal(w.calls.length, 0);
});
test('status: passes the locked-record id, parsed input and the member feature; audit names only the command; replay suppresses a second audit event', async () => {
  const w = world(); const ok = { ...actor, capabilities:new Set(['kosipa.member.view','kosipa.member.status']) };
  const first = await changeMemberStatus(w.ports, ok, '42', statusBody());
  assert.deepEqual(first.result, { id:42, version });
  const { envelope, input } = w.calls[0];
  assert.equal(envelope.command,'member.change_status'); assert.equal(envelope.capability,'kosipa.member.status'); assert.equal(envelope.subjectRef,'42');
  assert.equal(input[0], 42); assert.deepEqual(input[1], { status:'RESIGN', reason:'Karyawan mengundurkan diri', expectedVersion:version, idempotencyKey:KEY(5) });
  assert.equal(w.events[0].action, 'kosipa.member.changeStatus');
  assert.ok(!JSON.stringify(w.events).includes('mengundurkan'), 'the reason never reaches the console audit');
  const again = await changeMemberStatus(w.ports, ok, '42', statusBody());
  assert.equal(again.replayed, true); assert.equal(w.events.length, 1);
  await assert.rejects(changeMemberStatus(w.ports, ok, '42', statusBody({ status:'PENSIUN' })), { code:'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(changeMemberStatus(w.ports, ok, '43', statusBody()), { code:'IDEMPOTENCY_CONFLICT' });
});
