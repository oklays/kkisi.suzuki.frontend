import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleError, assertIdentityLinkAllowed, assertRevocationAllowed, sanitizeAuditDetail } from '../src/console/identity-link.ts';
import { kosipaCapabilitiesFromMenus, KOSIPA_MENU_URLS } from '../src/console/kosipa-access.ts';
import { ALL_CAPABILITIES, iamCapabilities, postLoginLanding } from '../src/console/capabilities.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof ConsoleError, String(e)); return e.code; } };
const ok = { actorUserId: 1, consoleUser: { id: 2, active: true }, kosipaUser: { id: 9, active: true, activeGroups: 1 }, consoleUserAlreadyLinked: false, kosipaUserAlreadyLinked: false };

test('identity link: allowed only for another active console user and an active KOSIPA account with access', () => {
  assert.equal(code(() => assertIdentityLinkAllowed(ok)), null);
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, consoleUser: null })), 'CONSOLE_USER_NOT_FOUND');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, actorUserId: 2 })), 'SELF_LINK');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, consoleUser: { id: 2, active: false } })), 'CONSOLE_USER_INACTIVE');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, kosipaUser: null })), 'KOSIPA_USER_NOT_FOUND');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, kosipaUser: { id: 9, active: false, activeGroups: 3 } })), 'KOSIPA_USER_INACTIVE');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, kosipaUser: { id: 9, active: true, activeGroups: 0 } })), 'KOSIPA_USER_NO_ACCESS');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, consoleUserAlreadyLinked: true })), 'CONSOLE_USER_ALREADY_LINKED');
  assert.equal(code(() => assertIdentityLinkAllowed({ ...ok, kosipaUserAlreadyLinked: true })), 'KOSIPA_USER_ALREADY_LINKED');
});

test('revocation: only an active link, with a real reason; control characters are flattened', () => {
  assert.equal(code(() => assertRevocationAllowed(null, 'pindah tugas')), 'LINK_NOT_FOUND');
  assert.equal(code(() => assertRevocationAllowed({ status: 'revoked' }, 'pindah tugas')), 'LINK_NOT_ACTIVE');
  assert.equal(code(() => assertRevocationAllowed({ status: 'active' }, '  ')), 'REASON_REQUIRED');
  assert.equal(assertRevocationAllowed({ status: 'active' }, ' pindah\ntugas '), 'pindah tugas');
});

test('audit detail keeps only safe flat identifiers and drops anything that could carry PII or secrets', () => {
  assert.deepEqual(sanitizeAuditDetail({ consoleUserId: 2, kosipaUserId: 9, code: 'SELF_LINK', ok: true, none: null }), { consoleUserId: 2, kosipaUserId: 9, code: 'SELF_LINK', ok: true, none: null });
  assert.equal(sanitizeAuditDetail({ password: 'x', nik: '123', memberName: 'Budi', email: 'a@b', token: 't', phoneNo: '0812' }), null);
  assert.deepEqual(sanitizeAuditDetail({ note: 'free text; DROP TABLE', nested: { a: 1 }, big: 1e300, n: 5 }), { n: 5 });
  assert.equal(sanitizeAuditDetail(undefined), null);
});

test('KOSIPA capabilities follow the legacy controller grants, case-insensitively; no member view -> nothing', () => {
  assert.deepEqual([...kosipaCapabilitiesFromMenus(['ANGGOTA/anggota_c', 'simpanan/kas_anggota_c ', 'pinjaman/pinjaman_c'])].sort(), ['kosipa.loan.view', 'kosipa.member.view', 'kosipa.savings.view']);
  assert.deepEqual([...kosipaCapabilitiesFromMenus(['simpanan/simpanan_c', 'payroll/matrix_c'])], [], 'detail tabs need the member directory');
  assert.deepEqual([...kosipaCapabilitiesFromMenus(['master/anggota_c', 'anggota/trans_toko_c', 'payroll/matrix_c'])].sort(), ['kosipa.member.view', 'kosipa.payroll.view', 'kosipa.store-credit.view']);
  assert.equal(kosipaCapabilitiesFromMenus(['admin/adm_menu_c', 'shu/shu_c']).size, 0);
  for (const cap of kosipaCapabilitiesFromMenus(KOSIPA_MENU_URLS)) assert.ok(ALL_CAPABILITIES.includes(cap));
});

test('link administration needs users_edit AND a branch chooser; KOSIPA access makes a user non-cashier on landing', () => {
  assert.deepEqual([...iamCapabilities(new Set(['users_edit']), true)], ['iam.link.manage']);
  assert.equal(iamCapabilities(new Set(['users_edit']), false).size, 0);
  assert.equal(iamCapabilities(new Set(['users_view']), true).size, 0);
  assert.equal(postLoginLanding({ capabilities: new Set(['toko.pos.checkout', 'kosipa.member.view']), consoleEnabled: true }), '/console');
});
