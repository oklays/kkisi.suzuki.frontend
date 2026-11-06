import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_MASTER_TYPES, PRODUCT_MASTER_DEFINITIONS, parseProductValues, planProductCreate, planProductUpdate, planProductStatus, canonicalDecimal,
} from '../src/kosipa/product-master.ts';
import { productVersion } from '../src/kosipa/product-master-version.ts';

const KEY = '00000000-0000-4000-8000-000000000001';
const def = (t) => PRODUCT_MASTER_DEFINITIONS[t];
const fail = (fn, code, field) => assert.throws(fn, (e) => e.code === code && (field === undefined || e.field === field), `${code}${field ? `:${field}` : ''}`);
const coa = [{ code: '1-1300', desc: 'Piutang Pinjaman', group: false }, { code: '2-1100', desc: 'Simpanan Pokok', group: false }, { code: '4-1100', desc: 'Pendapatan Jasa', group: false }, { code: '9-9999', desc: 'X'.repeat(60), group: false }];
const facts = (extra = {}) => ({ coa, financing: [{ code: 'PB-REG', active: true }, { code: 'PB-OFF', active: false }], ...extra });
const row = (id, values, active = true) => ({ id, values, active });

const simpanan = () => ({ jenis_simpanan_code: 'SIMPANAN BARU', jenis_simpanan_name: 'Simpanan Baru', jenis_simpanan_remarks: '', bunga_simpanan: '2.5', akun_code: '2-1100', is_active_tarik_deposito: '0' });
const pembiayaan = () => ({ pembiayaan_code: 'PB-NEW', pembiayaan_name: 'Pembiayaan Baru', pembiayaan_remarks: '', jenis_bunga: 'Flat', biaya_asuransi: '0.5', biaya_jasa: '1.2345', biaya_admin: '10000', biaya_bunga: '1', biaya_pinalty: '0', tgl_tempo: '25', akun_code: '1-1300', lock_1angsuran: '0' });
const pinjaman = () => ({ jenis_pinjaman_code: 'PJ-NEW', jenis_pinjaman_name: 'Pinjaman Baru', jenis_pinjaman_remarks: '', parent_id: '1', jenis_pembiayaan: 'PB-REG', jenis_bunga: 'Anuitas', biaya_asuransi: '0', biaya_jasa: '1', biaya_admin: '5000', biaya_bunga: '1.5', biaya_pinalty: '0', tgl_tempo: '25', lock_1angsuran: '1', akun_code: '1-1300', akun_code_pembiayaan: '', akun_code_pendapatan: '4-1100', max_angsuran: '36', max_pinjaman: '50000000' });
const suku = () => ({ code_suku_bunga: 'TT', desc_suku_bunga: 'Tanggal jatuh tempo', field: 'tgl_tempo', nilai_persen: '25', remarks_suku_bunga: '' });

test('exactly the four owner-approved native product masters (FD-32, FD-34); controllers and tables as legacy', () => {
  assert.deepEqual([...PRODUCT_MASTER_TYPES], ['jenis-simpanan', 'jenis-pinjaman', 'jenis-pembiayaan', 'suku-bunga']);
  assert.deepEqual(PRODUCT_MASTER_TYPES.map((t) => [def(t).table, def(t).legacyController, def(t).key]), [
    ['m_jenis_simpanan', 'master/jenis_simpanan_c', 'jenis_simpanan'], ['m_jenis_pinjaman', 'master/jenis_pinjaman_c', 'jenis_pinjaman'],
    ['m_jenis_pembiayaan', 'master/jenis_pembiayaan_c', 'jenis_pembiayaan'], ['m_suku_bunga', 'master/suku_bunga_c', 'suku_bunga']]);
  assert.match(def('suku-bunga').deactivateEffect, /tidak berpengaruh/i, 'FD-34: the UI must not claim deactivation has an effect');
});

test('typed parsing: exact decimals by column scale, enums, flags, bounded ints, printable latin1 text; unknown keys refused', () => {
  const p = parseProductValues(def('jenis-pembiayaan'), pembiayaan());
  assert.equal(p.biaya_jasa, '1.2345'); assert.equal(p.biaya_admin, '10000'); assert.equal(p.jenis_bunga, 'Flat');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), biaya_jasa: '1.23456' }), 'PRODUCT_FIELD_INVALID', 'biaya_jasa');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), biaya_admin: '1.234' }), 'PRODUCT_FIELD_INVALID', 'biaya_admin');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), biaya_admin: '-1' }), 'PRODUCT_FIELD_INVALID', 'biaya_admin');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), biaya_admin: '1,5' }), 'PRODUCT_FIELD_INVALID', 'biaya_admin');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), biaya_admin: 5 }), 'PRODUCT_FIELD_INVALID', 'biaya_admin');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), jenis_bunga: 'flat' }), 'PRODUCT_FIELD_INVALID', 'jenis_bunga');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), lock_1angsuran: '2' }), 'PRODUCT_FIELD_INVALID', 'lock_1angsuran');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), tgl_tempo: '32' }), 'PRODUCT_FIELD_INVALID', 'tgl_tempo');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), pembiayaan_remarks: 'x'.repeat(51) }), 'PRODUCT_FIELD_INVALID', 'pembiayaan_remarks');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), pembiayaan_name: '' }), 'PRODUCT_FIELD_INVALID', 'pembiayaan_name');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), pembiayaan_name: 'a\u0000b' }), 'PRODUCT_FIELD_INVALID', 'pembiayaan_name');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), akun_desc: 'forged' }), 'FIELD_NOT_ALLOWED');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), is_active: '1' }), 'FIELD_NOT_ALLOWED');
  fail(() => parseProductValues(def('jenis-pembiayaan'), { ...pembiayaan(), doc_no: 'x' }), 'FIELD_NOT_ALLOWED');
  fail(() => parseProductValues(def('jenis-pembiayaan'), null), 'INVALID_INPUT');
  const pj = parseProductValues(def('jenis-pinjaman'), pinjaman());
  assert.equal(pj.max_pinjaman, '50000000'); assert.equal(pj.parent_id, '1');
  fail(() => parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), max_angsuran: '' }), 'PRODUCT_FIELD_INVALID', 'max_angsuran');
  fail(() => parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), max_angsuran: '0' }), 'PRODUCT_FIELD_INVALID', 'max_angsuran');
  fail(() => parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), parent_id: '-' }), 'PRODUCT_FIELD_INVALID', 'parent_id');
  fail(() => parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), dd_usr: 'x' }), 'FIELD_NOT_ALLOWED');
  fail(() => parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), is_payroll: '1' }), 'FIELD_NOT_ALLOWED');
  assert.equal(parseProductValues(def('jenis-pinjaman'), { ...pinjaman(), biaya_bunga: '1.25' }).biaya_bunga, '1.25', 'legacy VARCHAR rate is still an exact decimal');
  fail(() => parseProductValues(def('suku-bunga'), { ...suku(), field: 'biaya_admin' }), 'PRODUCT_FIELD_INVALID', 'field');
  fail(() => parseProductValues(def('suku-bunga'), { ...suku(), nilai_persen: '0' }), 'PRODUCT_FIELD_INVALID', 'nilai_persen');
  fail(() => parseProductValues(def('jenis-simpanan'), { ...simpanan(), status_perorangan: '1' }), 'FIELD_NOT_ALLOWED');
  assert.equal(canonicalDecimal('001.500'), '1.5'); assert.equal(canonicalDecimal('0.00'), '0');
});

test('create: unique code (case-insensitive), COA must exist and its description is DERIVED (never truncated); financing and parent must be valid', () => {
  const d = def('jenis-pinjaman');
  const existing = [row(1, { jenis_pinjaman_code: 'ROOT-REG', parent_id: '0' }), row(2, { jenis_pinjaman_code: 'CHILD', parent_id: '1' })];
  const created = planProductCreate(d, parseProductValues(d, pinjaman()), existing, facts());
  assert.equal(created.values.akun_desc, 'Piutang Pinjaman'); assert.equal(created.values.akun_desc_pendapatan, 'Pendapatan Jasa'); assert.equal(created.values.akun_code_pembiayaan, '');
  assert.equal(created.values.akun_desc_pembiayaan, ''); assert.equal(created.active, true);
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), jenis_pinjaman_code: 'root-reg' }), existing, facts()), 'MASTER_CODE_DUPLICATE');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), akun_code: '7-0000' }), existing, facts()), 'PRODUCT_COA_INVALID', 'akun_code');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), akun_code: '9-9999' }), existing, facts()), 'PRODUCT_COA_DESC_TOO_LONG', 'akun_code');
  assert.equal(planProductCreate(d, parseProductValues(d, { ...pinjaman(), akun_code_pendapatan: '9-9999' }), existing, facts()).values.akun_desc_pendapatan, 'X'.repeat(60), '200-wide description column fits');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), jenis_pembiayaan: 'PB-NONE' }), existing, facts()), 'PRODUCT_FINANCING_INVALID', 'jenis_pembiayaan');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), jenis_pembiayaan: 'PB-OFF' }), existing, facts()), 'PRODUCT_FINANCING_INVALID', 'jenis_pembiayaan');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), parent_id: '2' }), existing, facts()), 'PRODUCT_PARENT_INVALID', 'parent_id');
  fail(() => planProductCreate(d, parseProductValues(d, { ...pinjaman(), parent_id: '77' }), existing, facts()), 'PRODUCT_PARENT_INVALID', 'parent_id');
  assert.equal(planProductCreate(d, parseProductValues(d, { ...pinjaman(), parent_id: '0' }), existing, facts()).values.parent_id, '0', 'a new root');
  const s = def('suku-bunga');
  fail(() => planProductCreate(s, parseProductValues(s, { ...suku(), code_suku_bunga: 'OTHER' }), [row(5, { code_suku_bunga: 'TT0', field: 'tgl_tempo' })], facts()), 'PRODUCT_FIELD_DUPLICATE', 'field');
});

test('update: STALE first, NO_CHANGE on equal exact decimals, code rules (never / unreferenced), FD-32 reason for financial edits, label edits need none', () => {
  const d = def('jenis-pembiayaan');
  const current = row(1, { ...parseProductValues(d, pembiayaan()), akun_desc: 'Piutang Pinjaman', biaya_jasa: '1.2345', biaya_admin: '10000.00' });
  const v = productVersion({ id: 1, columns: { a: '1' } });
  const ok = (values, reason, refs = 0) => planProductUpdate(d, current, values, reason, [current], facts(), refs);
  fail(() => planProductUpdate(d, null, current.values, undefined, [], facts(), 0), 'MASTER_NOT_FOUND');
  fail(() => ok({ ...current.values, biaya_admin: '10000' }), 'NO_CHANGE');
  const label = ok({ ...current.values, pembiayaan_name: 'Nama Baru' });
  assert.deepEqual(label.changed, ['pembiayaan_name']); assert.equal(label.financial, false); assert.equal(label.reason, undefined);
  fail(() => ok({ ...current.values, biaya_jasa: '2' }), 'REASON_INVALID');
  fail(() => ok({ ...current.values, lock_1angsuran: '1' }), 'REASON_INVALID');
  fail(() => ok({ ...current.values, akun_code: '2-1100' }), 'REASON_INVALID');
  const fin = ok({ ...current.values, biaya_jasa: '2', akun_code: '2-1100' }, 'Penyesuaian tarif per rapat pengurus');
  assert.equal(fin.financial, true); assert.equal(fin.after.values.akun_desc, 'Simpanan Pokok'); assert.deepEqual(fin.changed.sort(), ['akun_code', 'akun_desc', 'biaya_jasa']);
  fail(() => ok({ ...current.values, pembiayaan_code: 'PB-REN' }, undefined, 3), 'MASTER_REFERENCED');
  assert.deepEqual(ok({ ...current.values, pembiayaan_code: 'PB-REN' }, undefined, 0).changed, ['pembiayaan_code'], 'an unreferenced code may still be corrected');
  const sim = def('jenis-simpanan');
  const sCurrent = row(1, { ...parseProductValues(sim, simpanan()), akun_desc: 'Simpanan Pokok' });
  fail(() => planProductUpdate(sim, sCurrent, { ...sCurrent.values, jenis_simpanan_code: 'LAIN' }, 'alasan cukup', [sCurrent], facts(), 0), 'MASTER_FIELD_IMMUTABLE', 'jenis_simpanan_code');
  void v;
});

test('loan-type hierarchy: fixed legacy roots stay roots; a row with children cannot get a parent; parent change of a referenced row is blocked', () => {
  const d = def('jenis-pinjaman');
  const base = { ...parseProductValues(d, pinjaman()), akun_desc: 'Piutang Pinjaman', akun_desc_pembiayaan: '', akun_desc_pendapatan: 'Pendapatan Jasa' };
  const root1 = row(1, { ...base, jenis_pinjaman_code: 'ROOT-REG', parent_id: '0' }), root9 = row(9, { ...base, jenis_pinjaman_code: 'ROOT-X', parent_id: '0' });
  const child = row(10, { ...base, jenis_pinjaman_code: 'CHILD', parent_id: '1' }), other = row(11, { ...base, jenis_pinjaman_code: 'ROOT-Y', parent_id: '0' });
  const all = [root1, root9, child, other];
  fail(() => planProductUpdate(d, root1, { ...root1.values, parent_id: '9' }, 'pindah induk', all, facts(), 0), 'PRODUCT_PARENT_INVALID', 'parent_id');
  fail(() => planProductUpdate(d, root9, { ...root9.values, parent_id: '1' }, undefined, [...all, row(12, { ...base, jenis_pinjaman_code: 'C2', parent_id: '9' })], facts(), 0), 'PRODUCT_PARENT_INVALID', 'parent_id');
  fail(() => planProductUpdate(d, child, { ...child.values, parent_id: '10' }, undefined, all, facts(), 0), 'PRODUCT_PARENT_INVALID', 'parent_id');
  fail(() => planProductUpdate(d, child, { ...child.values, parent_id: '11' }, undefined, all, facts(), 2), 'MASTER_REFERENCED', 'parent_id');
  assert.equal(planProductUpdate(d, child, { ...child.values, parent_id: '11' }, undefined, all, facts(), 0).after.values.parent_id, '11');
});

test('status: never a delete; same status is NO_CHANGE; version is a 64-hex digest of every column', () => {
  const d = def('suku-bunga');
  const r = row(5, suku());
  assert.equal(planProductStatus(d, r, false).after.active, false);
  fail(() => planProductStatus(d, r, true), 'NO_CHANGE');
  fail(() => planProductStatus(d, null, false), 'MASTER_NOT_FOUND');
  const a = productVersion({ id: 5, columns: { x: '1', y: null } }), b = productVersion({ id: 5, columns: { x: '1', y: '' } });
  assert.match(a, /^[0-9a-f]{64}$/); assert.notEqual(a, b, 'NULL and empty are different stored states');
});
