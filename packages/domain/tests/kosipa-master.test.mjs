import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '../src/kosipa/errors.ts';
import {
  MASTER_DEFINITIONS, MASTER_TYPES, masterLedgerValues, masterVersion, needsReferenceCount, parseMasterId, parseMasterType, parseMasterValues, parseVersion,
  planMasterCreate, planMasterStatus, planMasterUpdate, sameMasterText,
} from '../src/kosipa/master.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e)); return e.code; } };
const D = MASTER_DEFINITIONS;
const tambun = { id: 1, values: { code: 'TMB1', name: 'Tambun I' }, active: true };
const pulo = { id: 2, values: { code: 'PLG', name: 'Pulo Gadung' }, active: false };
const lokasi = [tambun, pulo];

test('master type and id are parsed before any query (VAL-112); every definition is well formed', () => {
  assert.equal(parseMasterType('lokasi').key, 'lokasi');
  assert.equal(parseMasterType('rekening-bank').key, 'rekening_bank');
  for (const bad of ['LOKASI', '', '../lokasi', 'jenis_pinjaman', 'suku-bunga']) assert.equal(code(() => parseMasterType(bad)), 'MASTER_TYPE_UNKNOWN');
  assert.equal(parseMasterId('2147483647'), 2147483647);
  for (const bad of ['0', '-1', '01', '1.5', '2147483648', '1 OR 1=1', '']) assert.equal(code(() => parseMasterId(bad)), 'MASTER_ID_INVALID', bad);
  for (const type of MASTER_TYPES) {
    const def = D[type];
    assert.match(def.key, /^[a-z_]+$/, 'command grammar has no hyphen');
    assert.match(def.legacyController, /^master\/[a-z_]+_c$/);
    assert.ok(def.fields.some((f) => f.key === 'name'));
    if (def.referenced) assert.ok(def.fields.some((f) => f.key === def.referenced && f.change !== 'free'), `${type}: a referenced field is protected`);
  }
});

test('fields: trimmed, whitespace collapsed, printable ASCII, required, within column limits', () => {
  assert.deepEqual(parseMasterValues(D.lokasi, { code: ' TMB2 ', name: ' Tambun   II ' }), { code: 'TMB2', name: 'Tambun II' });
  assert.equal(code(() => parseMasterValues(D.lokasi, { code: '', name: 'X' })), 'MASTER_CODE_INVALID');
  assert.equal(code(() => parseMasterValues(D.lokasi, { code: 'x'.repeat(51), name: 'X' })), 'MASTER_CODE_INVALID');
  assert.equal(code(() => parseMasterValues(D.lokasi, { code: 'A', name: '' })), 'MASTER_NAME_INVALID', 'members select by name');
  assert.equal(code(() => parseMasterValues(D.lokasi, { code: 'A', name: 'Café' })), 'MASTER_NAME_INVALID', 'latin1 table: ASCII only');
  assert.equal(code(() => parseMasterValues(D.lokasi, { code: 5, name: 'X' })), 'MASTER_CODE_INVALID');
  assert.deepEqual(parseMasterValues(D.bagian, { name: 'Production Preparation' }), { name: 'Production Preparation' });
  assert.equal(code(() => parseMasterValues(D.bagian, { name: 'x'.repeat(101) })), 'MASTER_NAME_INVALID', 'm_anggota.bagian is VARCHAR(100)');
  assert.deepEqual(parseMasterValues(D['jenis-dokumen'], { code: 'KTP', name: 'KTP' }), { code: 'KTP', name: 'KTP', remarks: '' }, 'remarks optional');
  assert.equal(code(() => parseMasterValues(D['jenis-dokumen'], { code: 'x'.repeat(21), name: 'A' })), 'MASTER_CODE_INVALID');
  assert.equal(code(() => parseMasterValues(D['rekening-bank'], { code: 'BANK BSI', name: 'x'.repeat(51) })), 'MASTER_NAME_INVALID');
  assert.equal(code(() => parseMasterValues(D['rekening-bank'], { code: 'BANK BSI', name: 'BSI', remarks: 'x'.repeat(151) })), 'MASTER_REMARKS_INVALID');
  assert.deepEqual(parseMasterValues(D['periode-angsuran'], { code: '36', name: '36 X', remarks: '3 TAHUN' }), { code: '36', name: '36 X', remarks: '3 TAHUN' });
  for (const bad of ['0', '361', '012', '1.5', '12 bulan', '']) assert.equal(code(() => parseMasterValues(D['periode-angsuran'], { code: bad, name: 'X' })), 'MASTER_CODE_INVALID', bad);
});

test('equality follows the case-insensitive table collation', () => {
  assert.ok(sameMasterText('Tambun I', 'TAMBUN I'));
  assert.ok(!sameMasterText('Tambun I', 'Tambun II'));
});

test('create: unique fields only, starts active', () => {
  assert.deepEqual(planMasterCreate(D.lokasi, { code: 'CKR', name: 'Cikarang' }, lokasi), { values: { code: 'CKR', name: 'Cikarang' }, active: true });
  assert.equal(code(() => planMasterCreate(D.lokasi, { code: 'tmb1', name: 'Cikarang' }, lokasi)), 'MASTER_CODE_DUPLICATE');
  assert.equal(code(() => planMasterCreate(D.lokasi, { code: 'CKR', name: 'pulo gadung' }, lokasi)), 'MASTER_NAME_DUPLICATE', 'inactive rows still count');
  const banks = [{ id: 1, values: { code: 'BANK BSI', name: 'BANK BSI', remarks: '' }, active: true }];
  assert.equal(code(() => planMasterCreate(D['rekening-bank'], { code: 'bank bsi', name: 'Lain', remarks: '' }, banks)), 'MASTER_CODE_DUPLICATE');
  assert.equal(planMasterCreate(D['rekening-bank'], { code: 'BANK BRI', name: 'BANK BSI', remarks: '' }, banks).active, true, 'bank descriptions need not be unique');
});

test('version changes with every visible column', () => {
  const v = masterVersion(D.lokasi, tambun);
  assert.match(v, /^[0-9a-f]{16}$/);
  assert.equal(parseVersion(v), v);
  for (const changed of [{ values: { ...tambun.values, code: 'X' } }, { values: { ...tambun.values, name: 'X' } }, { active: false }, { id: 9 }]) assert.notEqual(masterVersion(D.lokasi, { ...tambun, ...changed }), v);
  for (const bad of [undefined, 'ABCDEF0123456789', 'abc', 5]) assert.equal(code(() => parseVersion(bad)), 'VERSION_INVALID');
});

test('update: stale, no-change, duplicates only for changed fields, referenced value protected', () => {
  const v = masterVersion(D.lokasi, tambun);
  assert.equal(code(() => planMasterUpdate(D.lokasi, null, { code: 'A', name: 'B' }, v, lokasi, 0)), 'MASTER_NOT_FOUND');
  assert.equal(code(() => planMasterUpdate(D.lokasi, tambun, { code: 'TMB9', name: 'Tambun I' }, masterVersion(D.lokasi, pulo), lokasi, 0)), 'STALE');
  assert.equal(code(() => planMasterUpdate(D.lokasi, tambun, { code: 'TMB1', name: 'Tambun I' }, v, lokasi, 0)), 'NO_CHANGE');
  assert.equal(code(() => planMasterUpdate(D.lokasi, tambun, { code: 'PLG', name: 'Tambun I' }, v, lokasi, 0)), 'MASTER_CODE_DUPLICATE');
  assert.equal(code(() => planMasterUpdate(D.lokasi, tambun, { code: 'TMB1', name: 'PULO GADUNG' }, v, lokasi, 0)), 'MASTER_NAME_DUPLICATE');
  assert.equal(code(() => planMasterUpdate(D.lokasi, tambun, { code: 'TMB1', name: 'Tambun Satu' }, v, lokasi, 3)), 'MASTER_REFERENCED');
  assert.deepEqual(planMasterUpdate(D.lokasi, tambun, { code: 'TMB-1', name: 'Tambun I' }, v, lokasi, 3).changed, ['code'], 'code is not what members store');
  assert.deepEqual(planMasterUpdate(D.lokasi, tambun, { code: 'tmb1', name: 'Tambun I' }, v, lokasi, 0).changed, ['code'], 'case-only change of its own code');
  assert.deepEqual(planMasterUpdate(D.lokasi, tambun, { code: 'TMB1', name: 'Tambun Satu' }, v, [tambun, { ...pulo, values: { code: 'TMB1', name: 'Pulo' } }], 0).changed, ['name'], 'existing duplicate does not block an unrelated edit');
});

test('Rekening Bank: the stored code is protected while loans use it; descriptions stay editable', () => {
  const def = D['rekening-bank'];
  const bsi = { id: 2, values: { code: 'BANK BSI', name: 'BANK BSI', remarks: '' }, active: true };
  const v = masterVersion(def, bsi);
  assert.ok(needsReferenceCount(def, bsi, { ...bsi.values, code: 'BSI' }));
  assert.ok(!needsReferenceCount(def, bsi, { ...bsi.values, name: 'Bank Syariah Indonesia' }), 'no loan scan for a label change');
  assert.equal(code(() => planMasterUpdate(def, bsi, { ...bsi.values, code: 'BSI' }, v, [bsi], 183)), 'MASTER_REFERENCED');
  assert.deepEqual(planMasterUpdate(def, bsi, { ...bsi.values, code: 'BSI' }, v, [bsi], 0).changed, ['code'], 'unused bank code may still be corrected');
  assert.deepEqual(planMasterUpdate(def, bsi, { ...bsi.values, name: 'Bank Syariah Indonesia' }, v, [bsi], 183).changed, ['name']);
});

test('Periode Angsuran: the month count is fixed at creation; labels editable; status changes only', () => {
  const def = D['periode-angsuran'];
  const twelve = { id: 23, values: { code: '12', name: '12 X', remarks: '1 TAHUN' }, active: true };
  const v = masterVersion(def, twelve);
  assert.equal(code(() => planMasterUpdate(def, twelve, { ...twelve.values, code: '18' }, v, [twelve], 0)), 'MASTER_FIELD_IMMUTABLE', 'never, even when nothing references it');
  assert.ok(!needsReferenceCount(def, twelve, { ...twelve.values, code: '18' }));
  assert.deepEqual(planMasterUpdate(def, twelve, { ...twelve.values, remarks: 'SATU TAHUN' }, v, [twelve], 0).changed, ['remarks']);
  assert.equal(code(() => planMasterCreate(def, { code: '12', name: 'Duplikat', remarks: '' }, [twelve])), 'MASTER_CODE_DUPLICATE');
});

test('status: deactivate/reactivate with version, never a no-op; ledger values are reference data only', () => {
  const v = masterVersion(D.lokasi, tambun);
  assert.deepEqual(planMasterStatus(D.lokasi, tambun, false, v).after, { ...tambun, active: false });
  assert.equal(code(() => planMasterStatus(D.lokasi, tambun, true, v)), 'NO_CHANGE');
  assert.equal(code(() => planMasterStatus(D.lokasi, tambun, false, 'ffffffffffffffff')), 'STALE');
  assert.equal(code(() => planMasterStatus(D.lokasi, null, false, v)), 'MASTER_NOT_FOUND');
  assert.deepEqual(masterLedgerValues(pulo), { id: 2, code: 'PLG', name: 'Pulo Gadung', status: 0 });
});
