import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Optional browser verification of the unified console (spec TASK-012..014) on the SYNTHETIC e2e schema only.
// The app must already run on 127.0.0.1 against kkisi_e2e_legacy (see scripts/e2e-run.sh) with CONSOLE_ENABLED set to
// match CONSOLE_EXPECT ('on' | 'off'). Personas are built by temporarily granting synthetic permission rows through the
// e2e seed account; every change is reverted in `finally`.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const expect = process.env.CONSOLE_EXPECT || 'on';
const output = process.env.CONSOLE_SCREENSHOTS || '/private/tmp/ksm-console-verification';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
assert.equal(new URL(base).hostname, '127.0.0.1', 'the app under test must be on loopback');
assert.ok(process.env.E2E_SEED_URL?.includes('/kkisi_e2e_legacy'), 'E2E_SEED_URL must target the synthetic schema');
await mkdir(output, { recursive: true });

const db = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
await assertE2eTarget(db);
const synthUsers = Number((await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM db_users WHERE username LIKE 'synth\\_%'"))[0].n);
assert.ok(synthUsers > 0, 'synthetic users missing: run scripts/e2e-seed.mjs first');
const granted = [['1', 'sales_view'], ['1', 'sales_return_view'], ['1', 'items_view'], ['1', 'inventory_view'], ['2', 'sales_view']];
const removed = [['2', 'sales_add']];
const actuallyRemoved = [];

const browser = await chromium.launch({ headless: true });
const errors = [];
async function session(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|404)|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { context, page };
}
async function login(page, user, path = '/login') {
  await page.goto(`${base}${path}`);
  await page.getByLabel('Username').fill(`synth_${user}`); await page.getByLabel('Password').fill(pw[user]);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
}
const sidebarLinks = (page) => page.locator('#console-nav nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));

try {
  for (const [role, slug] of granted) await db.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', Number(role), slug);
  for (const [role, slug] of removed) {
    if (await db.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', Number(role), slug) > 0) actuallyRemoved.push([role, slug]);
  }

  if (expect === 'off') {
    console.log('OFF-1. console disabled: /console is 404 and login keeps the /pos fallback');
    const { context, page } = await session();
    await login(page, 'admin'); await page.waitForURL(`${base}/pos`);
    const res = await page.goto(`${base}/console`); assert.equal(res.status(), 404);
    assert.equal((await context.request.get(`${base}/api/console/capabilities`)).status(), 404);
    assert.equal(await page.goto(`${base}/pos`).then(() => page.getByRole('link', { name: 'Dashboard', exact: true }).count()), 0, 'no console link while off');
    await page.getByRole('button', { name: 'Dashboard Supervisor' }).waitFor();
    await context.close();
  } else {
    console.log('1. anonymous: /console -> login with next; the API refuses');
    { const { context, page } = await session();
      await page.goto(`${base}/console`); await page.waitForURL(/\/login\?next=%2Fconsole$/);
      assert.equal((await context.request.get(`${base}/api/console/capabilities`)).status(), 401);
      await context.close(); }

    console.log('2. cashier: fresh login lands on /pos; the POS shell links back to the dashboard');
    { const { context, page } = await session();
      await login(page, 'kasir1'); await page.waitForURL(`${base}/pos`);
      assert.equal(await page.locator('.console-shell').count(), 0, 'POS stays in focused mode');
      await page.getByRole('link', { name: 'Dashboard', exact: true }).click(); await page.waitForURL(`${base}/console`);
      assert.deepEqual(await sidebarLinks(page), ['/console', '/pos']);
      assert.equal(await page.locator('a[href^="/console/kosipa"], a[href^="/console/warehouse"]').count(), 0, 'roadmap items are not links');
      await context.close(); }

    console.log('3. cashier with an explicit safe next keeps it; an off-site next is ignored');
    { const { context, page } = await session();
      await login(page, 'kasir2', '/login?next=%2Fconsole'); await page.waitForURL(`${base}/console`);
      await context.close(); }
    { const { context, page } = await session();
      await login(page, 'kasir2', '/login?next=%2F%2Fevil.example%2Fx'); await page.waitForURL(`${base}/pos`);
      await context.close(); }

    console.log('4. manager: lands on /console with TOKO + Warehouse sections and honest module states');
    { const { context, page } = await session();
      await login(page, 'admin'); await page.waitForURL(/\/console(\?entry=login)?$/);
      assert.deepEqual(await sidebarLinks(page), ['/console', '/pos', '/sales', '/sales/returns', '/products', '/inventory']);
      assert.equal(await page.locator('#console-nav a[aria-current="page"]').innerText(), 'Dashboard');
      // An unlinked administrator is told the truth about KOSIPA (not linked), never "coming soon" for a module that exists.
      await page.getByText('Akun belum ditautkan').first().waitFor();
      assert.equal(await page.getByText('Segera hadir').count(), 0, 'no stale coming-soon state for KOSIPA');
      assert.equal(await page.getByText(/Rp\s?\d/).count(), 0, 'no fabricated money figures');
      const caps = await (await context.request.get(`${base}/api/console/capabilities`)).json();
      assert.ok(caps.capabilities.includes('toko.inventory.warehouse'), 'role 1 is a branch chooser with inventory_view');
      await page.screenshot({ path: `${output}/console-admin-1440.png`, fullPage: true });
      for (const width of [375, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 860 }); await page.goto(`${base}/console`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at ${width}`);
        if (width === 375) {
          const toggle = page.getByRole('button', { name: 'Buka menu' });
          await toggle.click(); await page.locator('#console-nav').getByRole('link', { name: 'Riwayat Transaksi' }).waitFor({ state: 'visible' });
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          // Visible to Playwright is not enough: the drawer must have finished sliding fully on-screen.
          await page.waitForFunction(() => { const r = document.getElementById('console-nav').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
          await page.screenshot({ path: `${output}/console-admin-375-drawer.png` });
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Buka menu', 'focus returns to the toggle');
          await toggle.click(); await page.locator('#console-nav').getByRole('link', { name: 'Riwayat Transaksi' }).click();
          await page.waitForURL(`${base}/sales`);
          await page.goto(`${base}/console`);
          await page.screenshot({ path: `${output}/console-admin-375.png`, fullPage: true });
        }
      }
      await context.close(); }

    console.log('5. staff without sales_add: console works, POS is refused on page and API');
    { const { context, page } = await session();
      await login(page, 'koperasi'); await page.waitForURL(/\/console(\?entry=login)?$/);
      assert.deepEqual(await sidebarLinks(page), ['/console', '/sales']);
      await page.goto(`${base}/pos`); await page.getByRole('heading', { name: 'Akses ditolak' }).waitFor();
      assert.equal((await context.request.get(`${base}/api/pos/products`)).status(), 403);
      await context.close(); }
  }
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`console browser checks (${expect}) passed; screenshots in ${output}`);
} finally {
  for (const [role, slug] of granted) await db.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = ? AND permissions = ?', Number(role), slug);
  for (const [role, slug] of actuallyRemoved) await db.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (?, ?)', Number(role), slug);
  await browser.close(); await db.$disconnect();
}
