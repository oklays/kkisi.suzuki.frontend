import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Sidebar redesign: the registry is the single source of the hierarchy, and EVERY actionable row (module parents, entries, nested entries,
// flyout rows, rail rows, footer actions) carries its own icon. Components are rendered for real (react-dom/server) with Next primitives stubbed.
const reactPath = new URL('../node_modules/react/index.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    const stubs = {
      'next/link': `import React from '${reactPath}';export default function Link({prefetch,children,...p}){return React.createElement('a',p,children)}`,
      'next/image': `import React from '${reactPath}';export default function Image({unoptimized,...p}){return React.createElement('img',p)}`,
      'next/navigation': 'export function usePathname(){return globalThis.__sidebarPath}',
      '@/components/pos/SessionControls': `import React from '${reactPath}';export function SessionControls(){return React.createElement('div',{className:'pos-session'})}`,
    };
    if (specifier in stubs) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL('../src/' + specifier.slice(2), import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const u = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(u.pathname)) for (const ext of ['.tsx', '.ts']) if (existsSync(fileURLToPath(u) + ext)) return next(u.href + ext, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});

const { CONSOLE_NAVIGATION, SECTION_LABELS, SECTION_ICONS, deployedNavigation } = await import('../src/features/console/navigation.ts');
const { CONSOLE_ICONS } = await import('../src/components/console/icons.ts');
const { buildSidebarTree, trailTo, walkNodes, nodesWithoutIcon, defaultExpanded } = await import('../src/features/console/sidebar-model.ts');
const { visibleNavigation, currentEntryId } = await import('@koperasi/domain/console/navigation');
const { ALL_CAPABILITIES } = await import('@koperasi/domain/console/capabilities');
const { AppSidebar } = await import('../src/components/console/sidebar/AppSidebar.tsx');
const { SidebarNavNode } = await import('../src/components/console/sidebar/SidebarNavNode.tsx');
const { parseSidebarPrefs } = await import('../src/components/console/sidebar/prefs.ts');

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const groupsFor = (caps, entries = CONSOLE_NAVIGATION) => visibleNavigation(entries, new Set(caps)).map((g) => ({ section: g.section, label: SECTION_LABELS[g.section], items: g.items }));
const everything = groupsFor(ALL_CAPABILITIES);
const viewer = { userId: 1, userName: 'Okky', branchName: 'KKISI Tambun 2', companyId: 1, canSwitchBranch: false, companies: [], csrfToken: 'x' };
const noop = () => {};
const sidebar = (groups, { path = '/console', currentId = null, collapsed = false, theme = 'light' } = {}) => {
  globalThis.__sidebarPath = path;
  return renderToStaticMarkup(React.createElement(AppSidebar, { groups, viewer, currentId, collapsed, theme, drawerOpen: false, onToggleCollapsed: noop, onToggleTheme: noop, onCloseDrawer: noop, closeRef: { current: null } }));
};
/** Every actionable row: a link or a module-parent/help/menu button with the nav-link class (the nested expand toggles only control a row that has its own icon). */
const rows = (html) => [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].filter((m) => /console-nav-link/.test(m[2])).map((m) => ({ tag: m[1], attrs: m[2], inner: m[3] }));
const hasLeadingIcon = (row) => /^<span class="console-nav-icon" aria-hidden="true"><svg\b[\s\S]*?<\/svg><\/span>/.test(row.inner);
const hrefOf = (row) => /href="([^"]*)"/.exec(row.attrs)?.[1];

test('registry: every entry, every module parent and the footer help action map to a drawable icon in the one central map', () => {
  for (const e of CONSOLE_NAVIGATION) assert.ok(CONSOLE_ICONS[e.icon], `${e.id} icon "${e.icon}" is not in CONSOLE_ICONS`);
  for (const [section, icon] of Object.entries(SECTION_ICONS)) assert.ok(CONSOLE_ICONS[icon], `section ${section} icon "${icon}"`);
  assert.ok(CONSOLE_ICONS.help);
  for (const [key, Icon] of Object.entries(CONSOLE_ICONS)) assert.ok(Icon && (typeof Icon === 'function' || typeof Icon === 'object'), `${key} is not a component`);
});

test('registry: icons are meaningful, not one generic glyph: no two available entries of one module share an icon, and modules differ', () => {
  for (const section of ['kosipa', 'toko', 'warehouse']) {
    const icons = CONSOLE_NAVIGATION.filter((e) => e.section === section && e.readiness === 'available').map((e) => e.icon);
    const dup = icons.filter((i, n) => icons.indexOf(i) !== n);
    assert.deepEqual(dup, [], `${section}: duplicate icons ${dup}`);
  }
  assert.notEqual(SECTION_ICONS.kosipa, SECTION_ICONS.toko);
});

test('model: all authorised entries appear exactly once under their module, hierarchy and routes are unchanged, empty modules are dropped', () => {
  const tree = buildSidebarTree(everything);
  const nodes = walkNodes([...tree.main, ...tree.footer]);
  const hrefs = nodes.filter((n) => n.href).map((n) => n.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'no destination is rendered twice');
  const available = CONSOLE_NAVIGATION.filter((e) => e.readiness === 'available');
  assert.deepEqual([...hrefs].sort(), available.map((e) => e.href).sort(), 'exactly the authorised, available destinations');
  assert.deepEqual(nodes.filter((n) => !n.href).map((n) => n.id).sort(), ['section-kosipa', 'section-settings', 'section-toko', 'section-warehouse'], 'modules are parents without a route');
  assert.deepEqual(tree.main.map((n) => n.id), ['dashboard', 'section-kosipa', 'section-toko', 'section-warehouse']);
  assert.deepEqual(tree.footer.map((n) => n.id), ['section-settings']);
  const kosipa = tree.main.find((n) => n.id === 'section-kosipa');
  const reports = kosipa.children.find((n) => n.id === 'kosipa-reports');
  assert.deepEqual(reports.children.map((n) => n.id), ['kosipa-report-members', 'kosipa-report-savings', 'kosipa-report-loans', 'kosipa-report-payroll', 'kosipa-report-quality']);
  assert.equal(buildSidebarTree([]).main.length, 0);
  assert.deepEqual(buildSidebarTree([{ section: 'kosipa', label: 'KOSIPA', items: [] }]), { main: [], footer: [] });
});

test('model: every node of every persona has an icon the registry can draw (nodesWithoutIcon is empty)', () => {
  for (const caps of [ALL_CAPABILITIES, ['toko.pos.checkout'], ['kosipa.loan.view'], ['toko.products.view', 'toko.inventory.view']]) {
    const tree = buildSidebarTree(groupsFor(caps));
    assert.deepEqual(nodesWithoutIcon([...tree.main, ...tree.footer], CONSOLE_ICONS), []);
  }
  assert.deepEqual(nodesWithoutIcon([{ id: 'x', label: 'X', icon: 'nope', children: [] }], CONSOLE_ICONS), ['x'], 'the check really detects a missing icon');
});

test('model: trail opens the ancestors of the current page and nothing else; submenus start closed away from their pages', () => {
  const tree = buildSidebarTree(everything);
  const all = [...tree.main, ...tree.footer];
  assert.deepEqual(trailTo(all, 'kosipa-report-loans'), ['section-kosipa', 'kosipa-reports', 'kosipa-report-loans']);
  assert.deepEqual(trailTo(all, 'dashboard'), ['dashboard']);
  assert.deepEqual(trailTo(all, null), []);
  assert.deepEqual(trailTo(all, 'unknown'), []);
  const reports = walkNodes(all).find((n) => n.id === 'kosipa-reports');
  assert.equal(defaultExpanded(reports, new Set()), false, 'Laporan starts collapsed away from reports');
  assert.equal(defaultExpanded(reports, new Set(trailTo(all, 'kosipa-report-loans'))), true);
  assert.equal(defaultExpanded(all.find((n) => n.id === 'section-toko'), new Set()), true, 'modules start open');
  assert.equal(defaultExpanded(all.find((n) => n.id === 'section-settings'), new Set()), false, 'settings starts closed until used');
});

test('route awareness: the longest matching path wins and a sibling prefix never matches', () => {
  const e = CONSOLE_NAVIGATION.filter((x) => x.readiness === 'available');
  assert.equal(currentEntryId(e, '/sales'), 'toko-sales');
  assert.equal(currentEntryId(e, '/sales/returns'), 'toko-returns');
  assert.equal(currentEntryId(e, '/sales/returns/55'), 'toko-returns');
  assert.equal(currentEntryId(e, '/console/kosipa/laporan'), 'kosipa-reports');
  assert.equal(currentEntryId(e, '/console/kosipa/laporan/pinjaman'), 'kosipa-report-loans');
  assert.equal(currentEntryId(e, '/console/kosipa/laporanx'), 'kosipa-overview', 'a lookalike path is not the reports page');
  assert.equal(currentEntryId(e, '/console/kosipa/anggota/123'), 'kosipa-members');
});

test('expanded sidebar: EVERY actionable row, at every depth and in the footer, renders its own icon before its label', () => {
  const html = sidebar(everything, { path: '/console', currentId: 'dashboard' });
  const list = rows(html);
  const nodes = walkNodes([...buildSidebarTree(everything).main, ...buildSidebarTree(everything).footer]);
  assert.equal(list.length, nodes.length + 1, 'one row per registry node plus the Help action');
  for (const row of list) assert.ok(hasLeadingIcon(row), `row without a leading icon: ${row.inner.slice(0, 160)}`);
  const links = list.filter((r) => r.tag === 'a');
  assert.deepEqual(links.map(hrefOf).sort(), nodes.filter((n) => n.href).map((n) => n.href).sort());
  // icon markup is the same fixed slot for parents and children (one shared SidebarNavIcon)
  const slots = new Set(list.map((r) => /^<span class="console-nav-icon" aria-hidden="true"><svg ([^>]*)>/.exec(r.inner)[1].match(/width="(\d+)" height="(\d+)"/).slice(1).join('x')));
  assert.deepEqual([...slots], ['17x17'], 'one icon size at every level');
  // label comes after the icon, and chevrons stay on the right
  for (const r of list) assert.match(r.inner, /<\/span><span class="console-nav-text[^"]*"[^>]*>[^<]+<\/span>(<svg[^>]*console-nav-chevron[\s\S]*<\/svg>)?$/);
});

test('active page: exactly one aria-current, its trail is marked, only its submenu is open; icons survive in the active row', () => {
  const html = sidebar(everything, { path: '/console/kosipa/laporan/pinjaman', currentId: 'kosipa-report-loans' });
  const list = rows(html);
  const current = list.filter((r) => /aria-current="page"/.test(r.attrs));
  assert.equal(current.length, 1);
  assert.equal(hrefOf(current[0]), '/console/kosipa/laporan/pinjaman');
  assert.ok(hasLeadingIcon(current[0]));
  const trail = list.filter((r) => /data-trail="true"/.test(r.attrs)).map((r) => r.inner.match(/console-nav-text[^>]*>([^<]+)</)[1]);
  assert.deepEqual(trail, ['KOSIPA', 'Laporan', 'Pinjaman']);
  assert.match(html, /<button type="button" class="console-nav-toggle" aria-expanded="true"[^>]*aria-label="Submenu Laporan"/);
  const away = sidebar(everything, { path: '/console/kosipa/payroll', currentId: 'kosipa-payroll' });
  assert.match(away, /class="console-nav-toggle" aria-expanded="false"[^>]*aria-label="Submenu Laporan"/);
  assert.match(away, /aria-expanded="false"[^>]*aria-controls="nav-sub-section-settings"/, 'settings group closed');
});

test('flyout rows (collapsed sidebar): every child of every module, and the nested report entries, keep their icon and no row is text-only', () => {
  const tree = buildSidebarTree(everything);
  const ctx = { currentId: 'kosipa-report-loans', trail: new Set(trailTo([...tree.main, ...tree.footer], 'kosipa-report-loans')), toggled: {}, onToggle: noop };
  for (const parent of [...tree.main, ...tree.footer].filter((n) => !n.href)) {
    const html = renderToStaticMarkup(React.createElement('ul', null, parent.children.map((child) => React.createElement('li', { key: child.id }, React.createElement(SidebarNavNode, { node: child, depth: 0, ctx, flat: true })))));
    const list = rows(html);
    assert.equal(list.length, walkNodes(parent.children).length, `${parent.id}: one row per child`);
    for (const row of list) assert.ok(hasLeadingIcon(row), `${parent.id}: flyout row without icon`);
    assert.doesNotMatch(html, /console-nav-toggle/, 'a flyout has no expand toggles');
    assert.doesNotMatch(html, /data-open="false"/, 'everything in a flyout is open');
  }
});

test('collapsed rail: every top level row is an icon with its name still in the DOM, groups announce a popup, the active module is marked', () => {
  const html = sidebar(everything, { path: '/console/kosipa/payroll', currentId: 'kosipa-payroll', collapsed: true });
  assert.match(html, /data-collapsed="true"/);
  assert.match(html, /aria-label="Perluas sidebar"/);
  assert.match(html, /kopkar-emblem\.png/);
  const list = rows(html);
  const tree = buildSidebarTree(everything);
  assert.equal(list.length, tree.main.length + tree.footer.length + 1, 'rail rows + Help');
  for (const row of list) assert.ok(hasLeadingIcon(row), 'rail row without icon');
  for (const row of list.filter((r) => r.tag === 'button' && !/aria-controls/.test(r.attrs) && /aria-haspopup="true"/.test(r.attrs))) assert.match(row.inner, /console-nav-label/, 'the label text stays in the DOM for assistive tech');
  assert.equal(list.filter((r) => /aria-haspopup="true"/.test(r.attrs)).length, 4, 'KOSIPA, TOKO & POS, Warehouse and Pengaturan open flyouts');
  assert.match(list.find((r) => /data-trail="true"/.test(r.attrs)).inner, /KOSIPA/);
  assert.doesNotMatch(html, /class="console-nav-sub"/, 'children render only in the flyout');
});

test('mobile and desktop share the same tree; the collapse control and the drawer close control are both present for CSS to choose between', () => {
  const html = sidebar(everything);
  assert.match(html, /aria-label="Ciutkan sidebar"/);
  assert.match(html, /console-drawer-close" aria-label="Tutup menu"/);
  assert.match(html, /<aside id="console-nav" class="console-sidebar" aria-label="Navigasi console" data-collapsed="false">/);
  assert.match(html, /<nav aria-label="Menu utama" class="console-nav-body">/);
});

test('authorisation: the sidebar renders only what it is given; a cashier sees no KOSIPA, Warehouse or settings destination, a planned entry is never a link', () => {
  const cashier = groupsFor(['toko.pos.checkout', 'toko.sales.view']);
  const html = sidebar(cashier, { path: '/pos', currentId: 'toko-pos' });
  const links = rows(html).filter((r) => r.tag === 'a').map(hrefOf);
  assert.deepEqual(links.sort(), ['/console', '/pos', '/sales']);
  assert.doesNotMatch(html, /kosipa|Warehouse|settings\/identitas|Laporan/i);
  const full = sidebar(everything);
  assert.doesNotMatch(full, /\/console\/kosipa\/angsuran/);
  const kosipaOnly = rows(sidebar(groupsFor(['kosipa.loan.view']))).filter((r) => r.tag === 'a').map(hrefOf);
  assert.ok(kosipaOnly.includes('/console/kosipa/pinjaman') && kosipaOnly.includes('/console/kosipa/laporan'));
  assert.ok(!kosipaOnly.includes('/console/kosipa/payroll') && !kosipaOnly.includes('/console/kosipa/anggota'), 'capability filtering is unchanged');
  const flagOff = groupsFor(ALL_CAPABILITIES, deployedNavigation(false)).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(!flagOff.includes('/console/kosipa/simpanan-sukarela'), 'the deployment flag still removes the public-savings entry before the sidebar sees it');
});

test('the sidebar adds no authorisation logic of its own and no invented counters', () => {
  const dir = join(ROOT, 'src/components/console/sidebar');
  const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n') + read('src/features/console/sidebar-model.ts');
  assert.doesNotMatch(src, /hasPermission|capabilities\.has|anyOf|isAdmin|roleId/);
  assert.doesNotMatch(src, /badge|counter/i);
});

test('preferences: collapse and theme come from cookies the server layout reads (no hydration flash); unknown values fall back to expanded and light', () => {
  assert.deepEqual(parseSidebarPrefs('collapsed', 'dark'), { collapsed: true, theme: 'dark' });
  assert.deepEqual(parseSidebarPrefs(undefined, undefined), { collapsed: false, theme: 'light' });
  assert.deepEqual(parseSidebarPrefs('weird', '<script>'), { collapsed: false, theme: 'light' });
  const layout = read('src/app/console/layout.tsx');
  assert.match(layout, /parseSidebarPrefs\(jar\.get\(SIDEBAR_COOKIE\)/);
  assert.match(layout, /prefs=\{prefs\}/);
  assert.match(layout, /import '\.\/sidebar\.css'/);
});

test('styles: both themes define the same token set; mobile drawer, tablet rail, reduced motion and visible focus are covered', () => {
  const css = read('src/app/console/sidebar.css');
  const tokens = (block) => [...block.matchAll(/--sb-[a-z-]+:/g)].map((m) => m[0]);
  const light = /\.console-sidebar \{([^}]*)\}/.exec(css)[1];
  const dark = /data-sidebar-theme="dark"\] \.console-sidebar \{([^}]*)\}/.exec(css)[1];
  const colourTokens = (t) => tokens(t).filter((x) => !/(row|icon|gap|pad|radius|ease):/.test(x));
  assert.deepEqual(colourTokens(dark).sort(), colourTokens(light).sort(), 'dark redefines every colour token');
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /@media \(min-width:768px\) and \(max-width:1023px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.console-sidebar \.console-nav-link:focus-visible/);
  assert.match(css, /\.console-nav-collapse\[data-open="true"\]/);
});
