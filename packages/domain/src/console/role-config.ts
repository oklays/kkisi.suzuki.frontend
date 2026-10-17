import { IAM_PERMISSION_SLUGS, KOSIPA_CAPABILITIES, TOKO_PERMISSION_SLUGS, iamCapabilities, postLoginLanding, tokoCapabilities, type Capability } from './capabilities.ts';
import { kosipaCapabilitiesFromMenus, KOSIPA_MENU_URLS } from './kosipa-access.ts';
import { visibleNavigation, type NavEntry } from './navigation.ts';

/**
 * Real role-configuration validation (checkpoint 12). Input: the pseudonymised export of docs/migration/sql/role-config-export-readonly.sql.
 * Every role and KOSIPA group is evaluated with the SAME rules the console uses at runtime (tokoCapabilities, iamCapabilities, kosipaCapabilitiesFromMenus,
 * visibleNavigation, postLoginLanding). Nothing is granted, invented or changed: the output says what each real configuration would see, which testing
 * persona it resembles, and which configurations need an owner's attention. Output carries ids, names of roles/groups and COUNTS only — never a user.
 */
export type RoleBundle = {
  version: 1; capturedAt?: string;
  tokoRoles: { roleId: number; name: string; active: boolean; slugs: string[] }[];
  branches: { companyId: number; active: boolean }[];
  tokoUsers: { u: string; roleId: number; companyId: number; active: boolean }[];
  kosipaGroups: { groupId: number; name: string; active: boolean; menus: string[] }[];
  kosipaUsers: { u: string; active: boolean; groups: { groupId: number; membershipActive: boolean }[] }[];
};
export type RoleFinding = { code: string; subject: string; message: string };
export type RoleRow = { roleId: number; name: string; active: boolean; activeUsers: number; branches: number; canSwitchBranch: boolean; capabilities: Capability[]; menu: string[]; landing: '/pos' | '/console'; resembles: string; ignoredSlugs: string[] };
export type GroupRow = { groupId: number; name: string; active: boolean; capabilities: Capability[]; resembles: string; activeMembers: number };
export type RoleConfigReport = { roles: RoleRow[]; groups: GroupRow[]; findings: RoleFinding[]; personaCoverage: Record<string, string[]>; counts: { roles: number; activeUsers: number; kosipaUsers: number; kosipaGroups: number } };

const CONSOLE_SLUGS = new Set<string>([...TOKO_PERMISSION_SLUGS, ...IAM_PERMISSION_SLUGS]);
const WRITE: Capability[] = ['toko.pos.checkout', 'toko.products.create', 'toko.products.edit', 'toko.returns.create', 'toko.inventory.so', 'iam.link.manage'];

function resemblesToko(caps: Set<Capability>, chooser: boolean, landing: string): string {
  if (caps.has('iam.link.manage')) return 'Console Administrator';
  if (caps.size === 0) return 'no console capability';
  if (landing === '/pos') return 'TOKO Cashier';
  if (!WRITE.some((c) => caps.has(c))) return caps.has('toko.inventory.warehouse') ? 'Read-only Auditor (TOKO part) / Warehouse Supervisor (closest)' : 'Read-only Auditor (TOKO part)';
  if (caps.has('toko.inventory.warehouse') && chooser) return 'Warehouse Supervisor (closest: global warehouse master)';
  return 'TOKO Supervisor';
}
function resemblesKosipa(caps: Set<Capability>): string {
  const k = KOSIPA_CAPABILITIES.filter((c) => caps.has(c));
  if (k.length === KOSIPA_CAPABILITIES.length) return 'KOSIPA Administrator (all views; export only via the allow-list)';
  if (k.length === 0) return 'no console KOSIPA capability';
  if (k.length === 1 && k[0] === 'kosipa.member.view') return 'member directory only';
  return 'KOSIPA Operational Staff';
}

export function evaluateRoleConfig(b: RoleBundle, nav: readonly NavEntry[]): RoleConfigReport {
  const findings: RoleFinding[] = [];
  const activeBranches = new Set(b.branches.filter((x) => x.active).map((x) => x.companyId));
  const roles: RoleRow[] = b.tokoRoles.map((r) => {
    const granted = new Set(r.slugs); const chooser = r.roleId <= 2;
    const caps = new Set<Capability>([...tokoCapabilities(granted, chooser), ...iamCapabilities(granted, chooser)]);
    const users = b.tokoUsers.filter((u) => u.roleId === r.roleId && u.active);
    const landing = postLoginLanding({ capabilities: caps, consoleEnabled: true });
    const ignored = r.slugs.filter((s) => !CONSOLE_SLUGS.has(s)).sort();
    if (!r.active && users.length) findings.push({ code: 'INACTIVE_ROLE_HAS_USERS', subject: `role ${r.roleId}`, message: `${users.length} active user(s) in an inactive role cannot sign in` });
    if (granted.has('users_edit') && !chooser) findings.push({ code: 'USERS_EDIT_WITHOUT_CHOOSER', subject: `role ${r.roleId}`, message: 'holds users_edit but is branch-bound (role > 2): it cannot manage identity links in the console (by design)' });
    if (granted.has('inventory_view') && !chooser) findings.push({ code: 'INVENTORY_VIEW_BRANCH_BOUND', subject: `role ${r.roleId}`, message: 'inventory_view without the branch chooser: no global warehouse master and no Warehouse preview (by design)' });
    const inactiveBranchUsers = users.filter((u) => !activeBranches.has(u.companyId)).length;
    if (inactiveBranchUsers) findings.push({ code: 'USERS_ON_INACTIVE_BRANCH', subject: `role ${r.roleId}`, message: `${inactiveBranchUsers} active user(s) assigned to an inactive or unknown branch cannot sign in` });
    return { roleId: r.roleId, name: r.name, active: r.active, activeUsers: users.length, branches: new Set(users.map((u) => u.companyId)).size, canSwitchBranch: chooser, capabilities: [...caps].sort(), menu: visibleNavigation(nav, caps).flatMap((g) => g.items.map((i) => i.id)), landing, resembles: resemblesToko(caps, chooser, landing), ignoredSlugs: ignored };
  });
  const groups: GroupRow[] = b.kosipaGroups.map((g) => {
    const caps = kosipaCapabilitiesFromMenus(g.menus);
    const tabsWithoutDirectory = g.menus.some((m) => ['anggota/trans_simpanan_c', 'simpanan/simpanan_c', 'simpanan/kas_anggota_c', 'anggota/trans_pinjaman_c', 'pinjaman/pinjaman_c', 'pinjaman/kartu_aktif_c', 'anggota/trans_toko_c'].includes(m)) && !caps.has('kosipa.member.view');
    if (tabsWithoutDirectory) findings.push({ code: 'TABS_WITHOUT_DIRECTORY', subject: `group ${g.groupId}`, message: 'grants savings/loan/credit controllers without the member directory: the console shows none of them (stricter than legacy)' });
    const members = b.kosipaUsers.filter((u) => u.active && u.groups.some((x) => x.groupId === g.groupId && x.membershipActive)).length;
    return { groupId: g.groupId, name: g.name, active: g.active, capabilities: [...caps].sort(), resembles: resemblesKosipa(caps), activeMembers: members };
  });
  // Accounts whose console-visible menus come ONLY through deactivated groups: the console menu query does not filter ref_group.status (legacy parity unverified).
  const groupById = new Map(b.kosipaGroups.map((g) => [g.groupId, g]));
  let viaInactiveOnly = 0;
  for (const u of b.kosipaUsers.filter((x) => x.active)) {
    const memberships = u.groups.filter((x) => x.membershipActive).map((x) => groupById.get(x.groupId)).filter((g): g is RoleBundle['kosipaGroups'][number] => !!g);
    const activeMenus = memberships.filter((g) => g.active).flatMap((g) => g.menus); const inactiveMenus = memberships.filter((g) => !g.active).flatMap((g) => g.menus);
    const extra = kosipaCapabilitiesFromMenus([...activeMenus, ...inactiveMenus]).size > kosipaCapabilitiesFromMenus(activeMenus).size;
    if (extra && memberships.some((g) => g.active)) viaInactiveOnly++;
  }
  if (viaInactiveOnly) findings.push({ code: 'MENUS_FROM_INACTIVE_GROUPS', subject: 'KOSIPA accounts', message: `${viaInactiveOnly} active account(s) would gain console capabilities only through a deactivated group (membership still active). The console menu query does not filter ref_group.status; confirm legacy cekstatushakakses() behaviour before staging acceptance` });
  findings.push({ code: 'NO_WAREHOUSE_ROLE_MAPPING', subject: 'Warehouse Operator / Supervisor', message: 'no role or group maps to warehouse.dispatch.* / toko.receiving.*: Warehouse features stay gated (decision W5)' });
  const unmapped = new Set(b.kosipaGroups.flatMap((g) => g.menus).filter((m) => !KOSIPA_MENU_URLS.includes(m)));
  if (unmapped.size) findings.push({ code: 'KOSIPA_MENUS_NOT_IN_CONSOLE', subject: 'KOSIPA groups', message: `${unmapped.size} distinct legacy controller URL(s) have no console equivalent yet (they grant nothing in the console)` });
  const personaCoverage: Record<string, string[]> = {};
  for (const r of roles.filter((x) => x.active && x.activeUsers > 0)) (personaCoverage[r.resembles] ??= []).push(`role ${r.roleId}`);
  for (const g of groups.filter((x) => x.active && x.activeMembers > 0)) (personaCoverage[g.resembles] ??= []).push(`group ${g.groupId}`);
  return { roles, groups, findings, personaCoverage, counts: { roles: roles.length, activeUsers: b.tokoUsers.filter((u) => u.active).length, kosipaUsers: b.kosipaUsers.filter((u) => u.active).length, kosipaGroups: groups.length } };
}

export function parseRoleBundle(raw: unknown): { ok: true; bundle: RoleBundle } | { ok: false; error: string } {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.version !== 1) return { ok: false, error: 'not a version-1 role bundle' };
  for (const k of ['tokoRoles', 'branches', 'tokoUsers', 'kosipaGroups', 'kosipaUsers']) if (!Array.isArray(o[k])) return { ok: false, error: `${k} must be an array` };
  const text = JSON.stringify(o);
  if (/"(username|fullname|nama_lengkap|email|password|nik)"/i.test(text) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) return { ok: false, error: 'refused: the bundle carries user-identifying fields; export it with role-config-export-readonly.sql (pseudonyms only)' };
  const b = (v: unknown) => v === true || v === 1 || v === '1';
  try {
    return { ok: true, bundle: {
      version: 1, capturedAt: typeof o.capturedAt === 'string' ? o.capturedAt : undefined,
      tokoRoles: (o.tokoRoles as Record<string, unknown>[]).map((r) => ({ roleId: Number(r.roleId), name: String(r.name ?? ''), active: b(r.active), slugs: (Array.isArray(r.slugs) ? r.slugs : []).map(String) })),
      branches: (o.branches as Record<string, unknown>[]).map((r) => ({ companyId: Number(r.companyId), active: b(r.active) })),
      tokoUsers: (o.tokoUsers as Record<string, unknown>[]).map((r) => { if (typeof r.u !== 'string' || !/^[0-9a-f]{8,64}$/.test(r.u)) throw new Error('tokoUsers.u must be a hex pseudonym'); return { u: r.u, roleId: Number(r.roleId), companyId: Number(r.companyId), active: b(r.active) }; }),
      kosipaGroups: (o.kosipaGroups as Record<string, unknown>[]).map((g) => ({ groupId: Number(g.groupId), name: String(g.name ?? ''), active: b(g.active), menus: (Array.isArray(g.menus) ? g.menus : []).map((m) => String(m).trim().toLowerCase()) })),
      kosipaUsers: (o.kosipaUsers as Record<string, unknown>[]).map((u) => { if (typeof u.u !== 'string' || !/^[0-9a-f]{8,64}$/.test(u.u)) throw new Error('kosipaUsers.u must be a hex pseudonym'); return { u: u.u, active: b(u.active), groups: (Array.isArray(u.groups) ? u.groups : []).map((g: Record<string, unknown>) => ({ groupId: Number(g.groupId), membershipActive: b(g.membershipActive) })) }; }),
    } };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export function renderRoleConfigReport(r: RoleConfigReport): string {
  const out = ['# Real role configuration — console readiness', '', `Roles ${r.counts.roles} · active TOKO users ${r.counts.activeUsers} · KOSIPA groups ${r.counts.kosipaGroups} · active KOSIPA accounts ${r.counts.kosipaUsers}. Counts and role/group ids only; no user is identified.`, '',
    '## TOKO roles', '', '| Role | Active | Active users | Branches | Chooser | Resembles (testing persona) | Landing | Console menu | Ignored legacy slugs |', '|---|---|---|---|---|---|---|---|---|'];
  for (const x of r.roles) out.push(`| ${x.roleId} ${x.name} | ${x.active ? 'yes' : 'no'} | ${x.activeUsers} | ${x.branches} | ${x.canSwitchBranch ? 'yes' : 'no'} | ${x.resembles} | ${x.landing} | ${x.menu.join(', ')} | ${x.ignoredSlugs.length} |`);
  out.push('', '## KOSIPA groups', '', '| Group | Active | Active members | Console capabilities | Resembles |', '|---|---|---|---|---|');
  for (const g of r.groups) out.push(`| ${g.groupId} ${g.name} | ${g.active ? 'yes' : 'no'} | ${g.activeMembers} | ${g.capabilities.join(', ') || '—'} | ${g.resembles} |`);
  out.push('', '## Persona coverage (which real configurations a staging walk-through can use)', '');
  for (const p of ['Console Administrator', 'KOSIPA Administrator (all views; export only via the allow-list)', 'KOSIPA Operational Staff', 'TOKO Cashier', 'TOKO Supervisor', 'Warehouse Supervisor (closest: global warehouse master)', 'Read-only Auditor (TOKO part)']) out.push(`- ${p}: ${r.personaCoverage[p]?.join(', ') ?? '**no real configuration**'}`);
  out.push('- Warehouse Operator: **no real configuration possible** (W5)');
  out.push('', '## Findings', '', ...r.findings.map((f) => `- \`${f.code}\` ${f.subject}: ${f.message}`), '');
  return out.join('\n');
}
