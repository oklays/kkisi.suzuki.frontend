import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../scripts/e2e-guards.mjs';

// Checkpoint 13 — R1 landing policy on the built app, SYNTHETIC schema only. The synthetic cashier role (4) is given the management slugs the real
// 30 Sep cashier role carries, then:  LANDING_EXPECT=policy (app started with CONSOLE_LANDING_ROLES=4:pos,1:console): cashier -> /pos, admin -> /console;
//                                     LANDING_EXPECT=derived (variable unset or malformed): cashier -> /console, i.e. today's behaviour, unchanged.
// In both modes a valid deep link is preserved and the cashier's access is exactly what the slugs grant (landing is not a grant).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
const expect = process.env.LANDING_EXPECT || 'policy';
const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL }); await assertE2eTarget(seed);
const SLUGS = ['sales_view', 'sales_payment_view', 'sales_return_view', 'sales_return_add', 'items_view', 'items_add', 'items_edit', 'inventory_so', 'inventory_view'];
for (const s of SLUGS) await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) SELECT 4, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM db_permissions WHERE role_id = 4 AND permissions = ?)', s, s);
const browser = await chromium.launch({ headless: true });
async function signIn(user, next) {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(`${base}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`); await page.waitForLoadState('networkidle');
  await page.getByLabel('Username').fill(`synth_${user}`); await page.getByLabel('Password').fill(pw[user]); await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20000 }); await page.waitForLoadState('load');
  return { context, page };
}
// /console?entry=login delivers the landing redirect as a STREAMED redirect (NEXT_REDIRECT + meta refresh), completed client-side: wait for the end state.
async function landed(page, expected) {
  if (expected === '/console') { await page.locator('#console-nav').waitFor({ state: 'attached', timeout: 15000 }); assert.equal(await page.locator('meta#__next-page-redirect').count(), 0, 'no pending redirect'); assert.equal(new URL(page.url()).pathname, '/console'); }
  else await page.waitForURL((u) => u.pathname === expected, { timeout: 15000 });
}
try {
  console.log(`LP-1 (${expect}). fresh login without next`);
  { const k = await signIn('kasir1'); await landed(k.page, expect === 'policy' ? '/pos' : '/console'); await k.context.close(); }
  // the synthetic administrator holds only sales_add: the derived rule treats it as cashier-focused (/pos); the explicit mapping 1:console overrides that
  { const a = await signIn('admin'); await landed(a.page, expect === 'policy' ? '/console' : '/pos'); await a.context.close(); }
  console.log(`LP-2 (${expect}). a valid deep link wins over the landing policy; landing never widens access`);
  { const k = await signIn('kasir1', '/products'); await landed(k.page, '/products');
    await k.page.goto(`${base}/console/settings/identitas`); assert.equal(await k.page.getByRole('heading', { name: 'Buat tautan' }).count(), 0, 'no identity-link administration for the cashier');
    await k.context.close(); }
  console.log(`console landing checks (${expect}) passed`);
} finally {
  for (const s of SLUGS) await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = 4 AND permissions = ?', s);
  await browser.close(); await seed.$disconnect();
}
