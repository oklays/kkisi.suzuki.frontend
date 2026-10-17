import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget, revokeSyntheticConsoleLinks } from '../scripts/e2e-guards.mjs';

// Checkpoint 12 — deterministic reproduction of the cold-start race behind the intermittent identity-link UAT failure. Every request for a Next.js JS chunk is
// delayed (HYDRATION_DELAY_MS, default 1500), which is what a cold application/disk cache does: the server-rendered form is visible and clickable before React
// has hydrated it. A form that relies only on a React onSubmit then performs a NATIVE GET submit to the same URL: nothing is saved, the page reloads, and
// "Tautan dibuat." never appears. On the login form the same race would put the username and PASSWORD into the URL. Synthetic schema and local app only.
// Run with the built app as in scripts/uat-run.sh phase 1 (flags on, console store up), right after a fresh seed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
const DELAY = Number(process.env.HYDRATION_DELAY_MS || 1500);
assert.equal(new URL(base).hostname, '127.0.0.1');
const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL }); await assertE2eTarget(seed);
const consoleDb = new PrismaClient({ datasourceUrl: process.env.CONSOLE_STORE_TEST_URL });
const browser = await chromium.launch({ headless: true });
// Only JavaScript is delayed: delaying the (render-blocking) CSS as well makes the browser wait to paint, which hides the race being reproduced.
const slowChunks = async (context) => context.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => { await new Promise((r) => setTimeout(r, DELAY)); await route.continue(); });
const urls = (page) => { const seen = []; page.on('request', (r) => seen.push(r.url())); page.on('framenavigated', (f) => seen.push(f.url())); return seen; };

// The identity page needs the administrator's users_edit grant, as in console-uat-browser.mjs (synthetic role 1; removed by the next e2e cleanup).
await seed.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (1, ?)', 'users_edit');
const ONLY = process.env.HYD_ONLY || 'all';
try {
  if (ONLY === 'all' || ONLY === '1') {
    console.log(`HYD-1. login before hydration (JS chunks delayed ${DELAY} ms): credentials never appear in a URL, and the sign-in completes`);
    const context = await browser.newContext(); await slowChunks(context); const page = await context.newPage(); const seen = urls(page);
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Username').fill('synth_admin'); await page.getByLabel('Password').fill(pw.admin);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    assert.ok(!seen.some((u) => /[?&](password|username)=/.test(u)), 'credentials were put into a URL by a native form submission');
    await page.waitForURL(/\/(console(\?entry=login)?|pos)$/, { timeout: 20000 });
    assert.ok(!seen.some((u) => /[?&](password|username)=/.test(u)), 'credentials were put into a URL by a native form submission');
    await context.close();
  }
  if (ONLY === 'all' || ONLY === '2') {
    console.log('HYD-2. identity link submitted before hydration completes: exactly one link, confirmation shown, no native GET reload');
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(`${base}/login`); await page.getByLabel('Username').fill('synth_admin'); await page.getByLabel('Password').fill(pw.admin);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await page.waitForURL(/\/(console(\?entry=login)?|pos)$/); await page.waitForLoadState('networkidle');
    await slowChunks(context); const seen = urls(page);   // from here on the page is "cold"
    await page.goto(`${base}/console/settings/identitas`, { waitUntil: 'domcontentloaded' });
    const pick = async (label, text) => { const sel = page.getByLabel(label); await sel.selectOption(await sel.locator('option', { hasText: text }).first().getAttribute('value')); };
    await pick('Akun console', /synth_koperasi/); await pick('Akun KOSIPA', /synth_ksp\)/);
    await page.getByRole('button', { name: 'Tautkan' }).click();
    await page.getByText('Tautan dibuat.').waitFor({ timeout: 20000 });
    assert.ok(!seen.some((u) => /[?&](consoleUserId|kosipaUserId)=/.test(u)), 'the form was submitted natively (GET reload) instead of through the API');
    const active = await consoleDb.$queryRaw`SELECT COUNT(*) AS n FROM console_identity_link WHERE console_user_id = 900002 AND status = 'active'`;
    assert.equal(Number(active[0].n), 1, 'exactly one active link');
    await context.close();
  }
  console.log('console hydration checks passed');
} finally {
  await seed.$executeRawUnsafe('DELETE FROM db_permissions WHERE role_id = 1 AND permissions = ?', 'users_edit');
  await revokeSyntheticConsoleLinks(consoleDb);
  await browser.close(); await seed.$disconnect(); await consoleDb.$disconnect();
}
