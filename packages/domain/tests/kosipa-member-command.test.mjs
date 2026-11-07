import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_FIELD_CLASSES, MEMBER_PROFILE_FIELDS, MEMBER_REGISTRATION_FIELDS, parseMemberRegistration, parseMemberProfile, memberNikUniquenessKey, planMemberRegistration, planMemberProfile } from '../src/kosipa/member-command.ts';

const KEY = '00000000-0000-4000-8000-000000000001';
const version = 'a'.repeat(64);
const today = '2026-11-06';
const fields = () => ({ nama_kar: 'José', nik_kar: '00123', kd_group: 'ANGGOTA', bagian: 'produksi', lokasi: 'tambun', status_anggota: 'AKTIVE' });
const register = (f = {}, deductions = { pokok: '0', wajib: '0', sukarela: '0' }) => ({ fields: { ...fields(), ...f }, initialDeductions: deductions, idempotencyKey: KEY });
const profile = (f, extra = {}) => ({ fields: f, expectedVersion: version, idempotencyKey: KEY, ...extra });
const facts = { bagian: [{ name: 'Produksi', active: true }], lokasi: [{ name: 'Tambun', active: true }] };
const fail = (fn, code) => assert.throws(fn, { code });
const columns = `id doc_no id_card no_anggota password tgl_daftar nama_kar nik_kar ktp email jenis_kel tgl_lahir tempat_lahir alamat rt rw provinsi kabupaten kecamatan kelurahan kode_pos alamat_tinggal kelurahan_tinggal kecamatan_tinggal kabupaten_tinggal kode_pos_tinggal no_telp no_telp1 status_rumah pendidikan status_nikah nama_istri ibu_kandung npwp divisi dept bagian kd_group jabatan cd cd_usr ud ud_usr tgl_karyawan tgl_masuk tgl_keluar status_anggota sim_wajib sim_pokok sim_sukarela gaji limit_toko_old limit_toko gaji_minus limit_persen no_rek bank_rek nama_rek batas_pinjaman lokasi foto_profile limit_ppob status_pot_pokok status_pot_wajib status_pot_sukarela foto_ktp foto_ttd surat_kuasa persetujuan status_karyawan foto_kk foto_bukti_biaya_sekolah`.split(' ');

test('all actual 72 columns classified exactly once; forbidden column sweeps in both commands', () => {
  const all = Object.values(MEMBER_FIELD_CLASSES).flat();
  assert.equal(all.length, 72); assert.equal(new Set(all).size, 72); assert.deepEqual([...all].sort(), [...columns].sort());
  for (const key of columns) {
    if (!MEMBER_REGISTRATION_FIELDS.includes(key)) fail(() => parseMemberRegistration(register({ [key]: 'forged' }), today), 'FIELD_NOT_ALLOWED');
    if (!MEMBER_PROFILE_FIELDS.includes(key)) fail(() => parseMemberProfile(profile({ [key]: 'forged' })), 'FIELD_NOT_ALLOWED');
  }
});
test('registration keeps salary explicit zero, requires explicit config/status and canonical identity', () => {
  const p = parseMemberRegistration(register(), today);
  assert.equal(p.fields.nik_kar, '123'); assert.equal(p.fields.gaji, '0'); assert.deepEqual(p.initialDeductions, { pokok: '0', wajib: '0', sukarela: '0' });
  for (const key of ['nama_kar', 'nik_kar', 'kd_group', 'bagian', 'lokasi', 'status_anggota']) {
    const b = register(); delete b.fields[key]; fail(() => parseMemberRegistration(b, today), 'MEMBER_FIELD_INVALID');
  }
  for (const b of [{ ...register(), initialDeductions: undefined }, register({}, { pokok: '0', wajib: '0' }), register({}, { pokok: '0', wajib: '0', sukarela: '0', extra: '0' })]) assert.throws(() => parseMemberRegistration(b, today), (e) => ['INVALID_INPUT', 'MEMBER_AMOUNT_INVALID', 'FIELD_NOT_ALLOWED'].includes(e.code));
  fail(() => parseMemberRegistration({ ...register(), initialDeductions: undefined }, today), 'INVALID_INPUT');
  fail(() => parseMemberRegistration(register({}, { pokok: '0', wajib: '0' }), today), 'MEMBER_AMOUNT_INVALID');
  fail(() => parseMemberRegistration(register({}, { pokok: '0', wajib: '0', sukarela: '0', extra: '0' }), today), 'FIELD_NOT_ALLOWED');
  for (const status_anggota of ['AKTIVE', 'LUAR BIASA', 'KONTRAK', 'RESIGN', 'PENSIUN']) assert.equal(parseMemberRegistration(register({ status_anggota }), today).fields.status_anggota, status_anggota);
  fail(() => parseMemberRegistration(register({ status_anggota: 'ACTIVE' }), today), 'MEMBER_FIELD_INVALID');
  for (const kd_group of ['ANGGOTA', 'NON ANGGOTA', 'BMP', 'KOPERASI']) assert.equal(parseMemberRegistration(register({ kd_group }), today).fields.kd_group, kd_group);
  fail(() => parseMemberRegistration(register({ kd_group: 'anggota' }), today), 'MEMBER_FIELD_INVALID');
});
test('write uniqueness canonicalizes numeric aliases and ASCII case without changing read normalization', () => {
  assert.equal(memberNikUniquenessKey('0000123'), memberNikUniquenessKey('123'));
  assert.equal(memberNikUniquenessKey('aB12'), memberNikUniquenessKey('Ab12'));
  assert.notEqual(memberNikUniquenessKey('A1'), memberNikUniquenessKey('B1'));
});
test('strict decimal strings preserve exact value and reject coercion, excess scale and over-bound amounts', () => {
  for (const amount of ['0', '0.01', '10000000000000', '10000000000000.00']) {
    const p = parseMemberRegistration(register({ gaji: amount }, { pokok: amount, wajib: '0', sukarela: '0' }), today);
    assert.ok(typeof p.fields.gaji === 'string');
  }
  assert.equal(parseMemberProfile(profile({ gaji: '00012.50' })).fields.gaji, '12.5');
  for (const value of [null, 1, '', '-1', '+1', '1e2', ' 1', '1 ', '1,00', '1.000', '10000000000000.01', '1_000', '.5', '1.', '9'.repeat(100)]) {
    fail(() => parseMemberProfile(profile({ gaji: value })), 'MEMBER_AMOUNT_INVALID');
    fail(() => parseMemberRegistration(register({}, { pokok: value, wajib: '0', sukarela: '0' }), today), 'MEMBER_AMOUNT_INVALID');
  }
});
test('dates are real ISO calendar dates, independent, and registration cannot be future-dated', () => {
  const p = parseMemberRegistration(register({ tgl_daftar: today, tgl_karyawan: '2024-02-29', tgl_masuk: '2023-01-01', tgl_lahir: '', tgl_keluar: null }), today);
  assert.equal(p.fields.tgl_karyawan, '2024-02-29'); assert.equal(p.fields.tgl_masuk, '2023-01-01'); assert.equal(p.fields.tgl_lahir, null); assert.equal(p.fields.tgl_keluar, null);
  for (const d of ['2023-02-29', '2024-02-30', '2026-13-01', '0000-01-01', '2026-1-01', 20260101]) fail(() => parseMemberProfile(profile({ tgl_masuk: d })), 'MEMBER_DATE_INVALID');
  fail(() => parseMemberRegistration(register({ tgl_daftar: '2026-11-07' }), today), 'MEMBER_DATE_INVALID');
});
test('actual widths, mirror NOT NULL constraints and printable Windows-1252 representability', () => {
  for (const [key, max] of [['nama_kar',50], ['ktp',50], ['email',50], ['no_telp',25], ['alamat_tinggal',250], ['bank_rek',20], ['nama_rek',100], ['dept',250], ['lokasi',100]]) {
    assert.doesNotThrow(() => parseMemberProfile(profile({ [key]: 'a'.repeat(max) })));
    fail(() => parseMemberProfile(profile({ [key]: 'a'.repeat(max + 1) })), 'MEMBER_FIELD_INVALID');
  }
  for (const key of ['ktp', 'email', 'no_telp']) fail(() => parseMemberProfile(profile({ [key]: null })), 'MEMBER_FIELD_INVALID');
  assert.deepEqual(parseMemberProfile(profile({ alamat: null, alamat_tinggal: '', nama_istri: 'Élodie € Š Œ – ™' })).fields, { alamat: null, alamat_tinggal: '', nama_istri: 'Élodie € Š Œ – ™' });
  for (const value of ['漢字','😀','a\r', 'a\t', '\u0080', '\u009f', '\u007f', '\u0000']) fail(() => parseMemberProfile(profile({ alamat: value })), 'MEMBER_FIELD_INVALID');
});
test('legacy textarea addresses accept LF/CRLF lines; every other field still refuses controls', () => {
  for (const key of ['alamat', 'alamat_tinggal']) {
    assert.equal(parseMemberProfile(profile({ [key]: 'Jl. Satu\nRT 01' })).fields[key], 'Jl. Satu\nRT 01');
    assert.equal(parseMemberProfile(profile({ [key]: 'Jl. Satu\r\nRT 01\r\n' })).fields[key], 'Jl. Satu\r\nRT 01\r\n');
    fail(() => parseMemberProfile(profile({ [key]: 'Jl. Satu\rRT 01' })), 'MEMBER_FIELD_INVALID');
  }
  assert.equal(parseMemberRegistration(register({ alamat: 'A\nB' }), today).fields.alamat, 'A\nB');
  for (const key of ['nama_kar', 'kelurahan_tinggal', 'nama_rek', 'email']) fail(() => parseMemberProfile(profile({ [key]: 'a\nb' })), 'MEMBER_FIELD_INVALID');
  fail(() => parseMemberRegistration(register({ nama_kar: 'a\r\nb' }), today), 'MEMBER_FIELD_INVALID');
});
test('positive registration config enforces stored canonical NIK width ten, zero config permits width twenty', () => {
  assert.doesNotThrow(() => parseMemberRegistration(register({ nik_kar: '1234567890' }, { pokok: '0.01', wajib: '0', sukarela: '0' }), today));
  fail(() => parseMemberRegistration(register({ nik_kar: '12345678901' }, { pokok: '1', wajib: '0', sukarela: '0' }), today), 'MEMBER_DEDUCTION_NIK_TOO_LONG');
  assert.doesNotThrow(() => parseMemberRegistration(register({ nik_kar: 'A'.repeat(20) }), today));
  assert.equal(parseMemberRegistration(register({ nik_kar: '00000000000000000001' }, { pokok: '1', wajib: '0', sukarela: '0' }), today).fields.nik_kar, '1');
});
test('strict plain data shapes, unknown keys at both levels, idempotency and version validation', () => {
  const evil = Object.defineProperty({}, 'nama_kar', { enumerable: true, get() { throw Error('getter invoked'); } });
  for (const fields of [null, [], 'x', Object.create({ nama_kar: 'inherited' }), evil, { [Symbol('x')]: 'x' }]) fail(() => parseMemberProfile(profile(fields)), 'INVALID_INPUT');
  for (const body of [null, [], Object.create(null)]) fail(() => parseMemberProfile(body), 'INVALID_INPUT');
  fail(() => parseMemberProfile(profile({ constructor: 'x' })), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberProfile({ ...profile({ alamat: 'x' }), forged: 1 }), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberProfile(profile({})), 'NO_CHANGE');
  for (const expectedVersion of ['', 'a'.repeat(16), 'A'.repeat(64), null]) fail(() => parseMemberProfile(profile({ alamat: 'x' }, { expectedVersion })), 'VERSION_INVALID');
  fail(() => parseMemberProfile(profile({ alamat: 'x' }, { idempotencyKey: 'x' })), 'IDEMPOTENCY_KEY_INVALID');
});
test('registration resolves active master names and profile checks only actual changes', () => {
  const p = planMemberRegistration(parseMemberRegistration(register(), today), facts);
  assert.equal(p.fields.bagian, 'Produksi'); assert.equal(p.fields.lokasi, 'Tambun');
  fail(() => planMemberRegistration(parseMemberRegistration(register(), today), { ...facts, bagian: [{ name: 'Produksi', active: false }] }), 'MEMBER_MASTER_INVALID');
  const current = { id: 42, fields: { nama_kar: 'Old', bagian: 'Historical', lokasi: 'Closed' } };
  const update = planMemberProfile(current, parseMemberProfile(profile({ nama_kar: 'New' })), facts);
  assert.deepEqual(update.changed, ['nama_kar']); assert.equal(update.after.fields.bagian, 'Historical');
  assert.doesNotThrow(() => planMemberProfile(current, parseMemberProfile(profile({ bagian: 'Historical', nama_kar: 'New' })), facts));
  fail(() => planMemberProfile(current, parseMemberProfile(profile({ bagian: 'Missing' })), facts), 'MEMBER_MASTER_INVALID');
  fail(() => planMemberProfile(current, parseMemberProfile(profile({ nama_kar: 'Old' })), facts), 'NO_CHANGE');
  fail(() => planMemberProfile(null, parseMemberProfile(profile({ nama_kar: 'New' })), facts), 'MEMBER_NOT_FOUND');
});
test('actual bank change alone demands reason, unchanged bank field and salary/profile change do not', () => {
  const current = { id: 42, fields: { no_rek: '123', bank_rek: 'BANK', nama_rek: 'Old', alamat: 'Old address', gaji: '100.00' } };
  const p = planMemberProfile(current, parseMemberProfile(profile({ no_rek: '123', alamat: 'New address', gaji: '100' })), facts);
  assert.deepEqual(p.changed, ['alamat']);
  fail(() => planMemberProfile(current, parseMemberProfile(profile({ no_rek: '456' })), facts), 'REASON_INVALID');
  const changed = planMemberProfile(current, parseMemberProfile(profile({ no_rek: '456' }, { reason: 'Verified bank correction' })), facts);
  assert.equal(changed.reason, 'Verified bank correction'); assert.equal(changed.summary.bankChanged, true);
  const summary = JSON.stringify(changed.summary);
  for (const sensitive of ['123','456','Old','Verified bank correction','100']) assert.ok(!summary.includes(sensitive));
  assert.equal(changed.summary.id, 42); assert.ok(changed.summary.presence.no_rek); assert.ok(changed.summary.changes.no_rek);
  fail(() => parseMemberProfile(profile({ no_rek: 123 })), 'MEMBER_FIELD_INVALID');
});

test('registration ledger summary is keyed by generated record id and contains only field presence/change flags', async () => {
  const { memberFieldSummary } = await import('../src/kosipa/member-command.ts');
  const p = parseMemberRegistration(register({ no_rek: 'secret-account', gaji: '999' }), today);
  const summary = memberFieldSummary(72, p.fields);
  assert.equal(summary.id, 72); assert.equal(summary.presence.nik_kar, true); assert.equal(summary.changes.gaji, true);
  assert.equal(summary.bankChanged, true); assert.equal(summary.salaryChanged, true);
  const text = JSON.stringify(summary);
  for (const value of ['secret-account','José','999','00123']) assert.ok(!text.includes(value));
});

test('NIK syntax and whitespace-only required fields are refused at registration', () => {
  for (const nik_kar of ['1'.repeat(21), '12-3', '12.3', 'A B']) fail(() => parseMemberRegistration(register({ nik_kar }), today), 'NIK_INVALID');
  for (const key of ['nama_kar', 'nik_kar', 'kd_group', 'bagian', 'lokasi', 'status_anggota']) fail(() => parseMemberRegistration(register({ [key]: '   ' }), today), 'MEMBER_FIELD_INVALID');
});
test('stored legacy salary is compared tolerantly so malformed rows can be corrected', () => {
  const plan = (gaji, patch) => planMemberProfile({ id: 9, fields: { gaji } }, parseMemberProfile(profile({ gaji: patch })), facts);
  for (const stored of ['-5000', '99999999999999999', '1e3', 'abc', -5000, null]) {
    const p = plan(stored, '5000');
    assert.deepEqual(p.changed, ['gaji']); assert.equal(p.after.fields.gaji, '5000'); assert.equal(p.summary.salaryChanged, true);
  }
  fail(() => plan(100, '100'), 'NO_CHANGE');
  fail(() => plan(100.5, '100.50'), 'NO_CHANGE');
  fail(() => plan('100.00', '100'), 'NO_CHANGE');
});
test('NULL and empty nullable text are equal for change detection but the submitted value is written', () => {
  const current = { id: 9, fields: { no_rek: null, bank_rek: '', alamat: 'Old', tgl_lahir: '' } };
  const p = planMemberProfile(current, parseMemberProfile(profile({ no_rek: '', bank_rek: null, alamat: 'New', tgl_lahir: null })), facts);
  assert.deepEqual(p.changed, ['alamat']); assert.equal(p.summary.bankChanged, false); assert.equal(p.reason, undefined);
  assert.equal(p.after.fields.no_rek, ''); assert.equal(p.after.fields.bank_rek, null);
  fail(() => planMemberProfile(current, parseMemberProfile(profile({ no_rek: '' })), facts), 'NO_CHANGE');
});
test('bank reason is required for bank_rek or nama_rek alone', () => {
  const current = { id: 9, fields: { no_rek: '1', bank_rek: 'BANK', nama_rek: 'Old' } };
  for (const f of [{ bank_rek: 'OTHER' }, { nama_rek: 'New' }]) {
    fail(() => planMemberProfile(current, parseMemberProfile(profile(f)), facts), 'REASON_INVALID');
    assert.equal(planMemberProfile(current, parseMemberProfile(profile(f, { reason: 'Verified bank correction' })), facts).summary.bankChanged, true);
  }
});
test('unchanged master check is case-insensitive and keeps stored spelling of an inactive historical value', () => {
  const current = { id: 9, fields: { bagian: 'Historical', lokasi: 'Closed', alamat: 'Old' } };
  const inactive = { bagian: [{ name: 'Historical', active: false }], lokasi: [] };
  fail(() => planMemberProfile(current, parseMemberProfile(profile({ bagian: 'historical' })), inactive), 'NO_CHANGE');
  const p = planMemberProfile(current, parseMemberProfile(profile({ bagian: ' historical ', lokasi: 'CLOSED', alamat: 'New' })), inactive);
  assert.deepEqual(p.changed, ['alamat']); assert.equal(p.after.fields.bagian, 'Historical'); assert.equal(p.after.fields.lokasi, 'Closed');
});
