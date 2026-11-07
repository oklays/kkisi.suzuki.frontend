import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { MASTER_TYPES, MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
import { PRODUCT_MASTER_TYPES, PRODUCT_MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/product-master';

// The optional management scenario grants then revokes a synthetic account through the existing two-admin UI. Master records stay unchanged.
const base = process.env.KFA_BASE_URL || 'http://127.0.0.1:3230';
assert.equal(new URL(base).hostname, '127.0.0.1');
const accounts = JSON.parse(await readFile(new URL('../../../.local/kosipa-fa01/accounts.json', import.meta.url), 'utf8'));
const output = process.env.KFA_SCREENSHOTS || new URL('../../../.local/kosipa-master-redesign/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const routes = [...MASTER_TYPES.map((type) => [type, MASTER_DEFINITIONS[type].title]), ...PRODUCT_MASTER_TYPES.map((type) => [type, PRODUCT_MASTER_DEFINITIONS[type].title])];
const index = `${base}/console/kosipa/master`;

async function session(name) {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/login`);
  await page.getByLabel('Username', { exact: true }).fill(accounts[name].username);
  await page.getByLabel('Password', { exact: true }).fill(accounts[name].password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(/\/console/);
  await page.goto(index);
  await page.waitForTimeout(250);
  return { context, page };
}

try {
  const { context, page } = await session('viewer');
  await page.getByText('Data referensi KOSIPA yang dikelola secara terpusat dan digunakan di seluruh modul sistem.', { exact: true }).waitFor({ timeout: 10000 });
  const cards = page.locator('[data-master-card]');
  const search = page.getByRole('searchbox', { name: 'Cari master data' });
  const group = page.getByLabel('Grup master data', { exact: true });
  assert.equal(await cards.count(), routes.length);
  assert.equal(await page.getByLabel('Status master data', { exact: true }).count(), 0, 'no unsupported lifecycle filter');
  assert.equal(await page.getByText('Perlu Review', { exact: true }).count(), 0, 'no invented review status');
  assert.equal(await page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0, 'reader cannot manage');
  assert.equal(await page.getByRole('link', { name: 'Riwayat perubahan', exact: true }).count(), 0, 'no fake audit destination');
  for (const [title, count] of [['Total Master', routes.length], ['Data Referensi', MASTER_TYPES.length], ['Produk Keuangan', PRODUCT_MASTER_TYPES.length], ['Dipensiunkan', 8]]) {
    assert.equal((await page.locator(`[data-master-summary="${title}"]`).getAttribute('data-count')), String(count));
  }
  await page.screenshot({ path: `${output}/desktop-1672.png`, animations: 'disabled' });
  await page.screenshot({ path: `${output}/desktop-1672-full.png`, fullPage: true, animations: 'disabled' });
  console.log('PASS: registry-derived totals, truthful lifecycle, reader actions');

  await search.fill('  LOKASI  ');
  assert.equal(await cards.count(), 1);
  await group.selectOption('product');
  await page.getByText('Tidak ada master data yang sesuai dengan pencarian.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset Filter', exact: true }).click();
  assert.equal(await cards.count(), routes.length);
  await search.fill('  jatuh   tempo  ');
  assert.equal(await cards.count(), 1, 'description and normalized whitespace search');
  await page.getByRole('button', { name: 'Hapus pencarian', exact: true }).click();
  await group.selectOption('reference');
  assert.equal(await cards.count(), MASTER_TYPES.length);
  await group.selectOption('product');
  assert.equal(await cards.count(), PRODUCT_MASTER_TYPES.length);
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'List View', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${output}/list-desktop.png`, fullPage: true, animations: 'disabled' });
  await group.selectOption('all');
  assert.equal(await cards.count(), routes.length);
  console.log('PASS: combined search/group filters, empty/reset/clear, grid/list');

  for (const view of ['Grid View', 'List View']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    for (const width of [320, 375, 768, 1024, 1295, 1296, 1349, 1439, 1440, 1672]) {
      await page.setViewportSize({ width, height: 941 });
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view}: overflow at ${width}`);
      const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
      const firstRow = boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 2);
      assert.equal(firstRow.length, view === 'List View' || width < 768 ? 1 : width < 1296 ? 2 : 4, `${view}: columns at ${width}`);
      if ([375, 768, 1349, 1440].includes(width)) await page.screenshot({ path: `${output}/${view === 'Grid View' ? 'grid' : 'list'}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await cards.first().evaluate((node) => getComputedStyle(node).transitionDuration), '0s');
  await search.focus();
  await search.press('Tab');
  assert.equal(await group.evaluate((node) => node === document.activeElement), true);
  await group.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Grid View', exact: true }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('button', { name: 'Grid View', exact: true }).getAttribute('aria-pressed'), 'true');
  await cards.first().focus();
  assert.equal(await cards.first().evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/master\/lokasi$/);
  console.log('PASS: responsive columns/overflow, reduced motion, keyboard controls and card navigation');

  for (const [type, title] of routes) {
    await page.goto(index);
    await page.locator(`[data-master-card="${type}"]`).click();
    await page.waitForURL(`${index}/${type}`);
    await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Tambah data', exact: true }).count(), 0);
    assert.equal(await page.locator('a[href$="/baru"]').count(), 0, `${type}: reader has no create link`);
  }
  await context.close();
  const denied = await session('unlinked');
  await denied.page.getByRole('heading', { name: 'Akun belum ditautkan ke KOSIPA', exact: true }).waitFor();
  assert.equal(await denied.page.locator('[data-master-card], [data-master-summary]').count(), 0, 'no restricted directory metadata');
  await denied.context.close();
  const admin = await session('admin');
  const capabilities = await admin.page.evaluate(async () => (await (await fetch('/api/console/capabilities')).json()).capabilities);
  const manage = admin.page.getByRole('button', { name: 'Kelola', exact: true });
  if (capabilities.includes('kosipa.master.manage')) {
    await manage.click();
    assert.equal(await admin.page.locator('[data-master-management] a').count(), routes.length);
    await admin.page.keyboard.press('Escape');
    assert.equal(await manage.getAttribute('aria-expanded'), 'false');
    await manage.press('Enter');
    await admin.page.locator('[data-master-management] a').first().click();
    await admin.page.waitForURL(/\/master\/lokasi$/);
  } else assert.equal(await manage.count(), 0);
  await admin.context.close();
  if (process.env.KFA_TEST_MANAGEMENT === '1') {
    const stack = await import('../../../integration/kosipa-full-access/local-stack.mjs');
    await stack.rootConnection(await stack.loadConfig()).then((db) => db.end()); // Refuse fixtures outside the LOCAL_SYNTHETIC installation.
    const requester = await session('admin');
    const approver = await session('second');
    let grantId;
    try {
      await requester.page.goto(`${base}/console/settings/akses-kosipa`);
      await requester.page.locator('select[name="consoleUserId"]').selectOption(String(accounts.viewer.id));
      await requester.page.locator('select[name="capability"]').selectOption('kosipa.master.manage');
      await requester.page.locator('input[name="reason"]').fill('Uji UI direktori master sintetis; dicabut setelah verifikasi');
      await requester.page.getByRole('button', { name: 'Ajukan', exact: true }).click();
      await requester.page.getByRole('status').getByText(/Permintaan diajukan/).waitFor();
      const pending = requester.page.locator('section[aria-labelledby="grant-pending"] tr').filter({ hasText: accounts.viewer.username }).filter({ hasText: 'Kelola master data KOSIPA' });
      grantId = await pending.getAttribute('data-grant-id');
      await approver.page.goto(`${base}/console/settings/akses-kosipa`);
      await approver.page.locator(`tr[data-grant-id="${grantId}"]`).getByRole('button', { name: 'Setujui', exact: true }).click();
      await approver.page.getByRole('status').getByText('Hak disetujui dan berlaku.', { exact: true }).waitFor();
      const manager = await session('viewer');
      try {
        const toggle = manager.page.getByRole('button', { name: 'Kelola', exact: true });
        await toggle.press('Enter');
        assert.equal(await manager.page.locator('[data-master-management] a').count(), routes.length);
        await toggle.press('Tab');
        assert.equal(await manager.page.locator('[data-master-management] a').first().evaluate((node) => node === document.activeElement), true);
        await manager.page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);
        await toggle.click();
        await manager.page.getByRole('heading', { name: 'Master Data', exact: true }).click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        for (const [type] of routes) {
          await manager.page.goto(index);
          await toggle.click();
          await manager.page.locator(`[data-master-management] a[href$="/${type}"]`).click();
          await manager.page.waitForURL(`${index}/${type}`);
        }
        await manager.page.goto(index);
        await toggle.click();
        await manager.page.screenshot({ path: `${output}/management-desktop.png`, animations: 'disabled' });
        await manager.page.keyboard.press('Escape');
        await manager.page.setViewportSize({ width: 375, height: 900 });
        await toggle.click();
        assert.ok(await manager.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await manager.page.screenshot({ path: `${output}/management-mobile.png`, animations: 'disabled', fullPage: true });
      } finally { await manager.context.close(); }
      console.log('PASS: granted management menu, all 9 links, keyboard/Escape/outside dismissal, desktop/mobile');
    } finally {
      if (grantId) {
        await requester.page.goto(`${base}/console/settings/akses-kosipa`);
        const row = requester.page.locator(`tr[data-grant-id="${grantId}"]`);
        if (await row.getByRole('button', { name: 'Cabut hak…', exact: true }).count()) {
          await row.getByRole('button', { name: 'Cabut hak…', exact: true }).click();
          await requester.page.getByPlaceholder('Alasan pencabutan', { exact: true }).fill('Selesai uji UI direktori master sintetis');
          await requester.page.getByRole('button', { name: 'Cabut', exact: true }).click();
          await requester.page.getByRole('status').getByText('Hak dicabut.', { exact: true }).waitFor();
        } else if (await row.getByRole('button', { name: 'Tolak…', exact: true }).count()) {
          await row.getByRole('button', { name: 'Tolak…', exact: true }).click();
          await requester.page.getByPlaceholder('Alasan penolakan', { exact: true }).fill('Selesai uji UI direktori master sintetis');
          await requester.page.getByRole('button', { name: 'Tolak', exact: true }).click();
          await requester.page.getByRole('status').getByText('Permintaan ditolak.', { exact: true }).waitFor();
        }
      }
      await requester.context.close(); await approver.context.close();
    }
    const restored = await session('viewer');
    assert.equal(await restored.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0, 'temporary fixture revoked');
    await restored.context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: all ${routes.length} existing routes, reader/denied permissions, server-derived management visibility, no browser exceptions. Screenshots: ${output}`);
} finally {
  await browser.close();
}
