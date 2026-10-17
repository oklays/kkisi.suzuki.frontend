import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Checkpoint 13 — login credential-exposure closeout. Synthetic accounts only (fixture passwords of the synthetic schema; no real credential is used or stored).
// For every scenario: neither the username nor the password may appear in ANY request URL (navigations, fetches, redirects), in a redirect destination,
// in the visible page, or in the application log (APP_LOG), and no request may leave 127.0.0.1 (no client-side telemetry).
// Run against the built app as in scripts/uat-run.sh phase 1 (console flag on), after a fresh seed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL || 'http://127.0.0.1:3100';
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
assert.equal(new URL(base).hostname, '127.0.0.1');
const USER = 'synth_admin', PASS = pw.admin, WRONG = `Wrong-${PASS.slice(0, 3)}-Synthetic-9`;
const SECRETS = [PASS, WRONG, encodeURIComponent(PASS), encodeURIComponent(WRONG)];
const browser = await chromium.launch({ headless: true });
const leaks = [];
async function ctx(opts = {}, delayMs = 0) {
  const context = await browser.newContext(opts);
  if (delayMs) await context.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (r) => { await new Promise((x) => setTimeout(x, delayMs)); await r.continue(); });
  const page = await context.newPage(); const requests = [];
  page.on('request', (r) => { requests.push({ url: r.url(), method: r.method(), nav: r.isNavigationRequest(), body: r.postData() ?? '' }); });
  page.on('framenavigated', (f) => requests.push({ url: f.url(), method: 'NAV', nav: true, body: '' }));
  const check = (label) => {
    for (const r of requests) {
      if (new URL(r.url).hostname !== '127.0.0.1') leaks.push(`${label}: request left the host (${new URL(r.url).hostname})`);
      if ([USER, ...SECRETS].some((s) => r.url.includes(s)) || /[?&](username|password)=/i.test(r.url)) leaks.push(`${label}: credential in URL ${r.method}`);
    }
  };
  return { context, page, requests, check };
}
const loginApiPosts = (reqs) => reqs.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/auth/login');
const fill = async (page, user, pass) => { await page.getByLabel('Username').fill(user); await page.getByLabel('Password').fill(pass); };
const button = (page) => page.getByRole('button', { name: /Masuk|Memeriksa/ });

try {
  console.log('LS-1. before hydration (JS delayed 8 s): the submit control is disabled in the server HTML; Enter does nothing; a forced native submit is a POST to the JSON-only API');
  { const { context, page, requests, check } = await ctx({}, 8000);
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    assert.equal(await button(page).isDisabled(), true, 'disabled before hydration');
    assert.equal(await page.locator('form.login-card').evaluate((f) => [f.method, new URL(f.action).pathname].join(' ')), 'post /api/auth/login', 'server-rendered fallback is a POST to the API');
    await fill(page, USER, PASS); await page.getByLabel('Password').press('Enter'); await page.waitForTimeout(800);
    assert.equal(new URL(page.url()).pathname, '/login'); assert.equal(new URL(page.url()).search, '', 'Enter before hydration did not navigate');
    // simulate a bypassed disabled attribute (extension, devtools, future regression)
    const [resp] = await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.locator('form.login-card').evaluate((f) => { f.querySelector('button[type=submit]').disabled = false; HTMLFormElement.prototype.submit.call(f); })]);
    assert.equal(new URL(page.url()).pathname, '/api/auth/login'); assert.equal(new URL(page.url()).search, '', 'forced native submit carries nothing in the URL');
    assert.ok(resp.status() >= 400, `the JSON-only API refuses a form post (got ${resp.status()})`);
    assert.equal((await context.cookies()).some((c) => c.name.includes('sid')), false, 'no session from a native form post');
    check('LS-1'); await context.close(); }

  console.log('LS-2. JavaScript disabled: control disabled, Enter inert, forced submit is a refused POST; nothing in any URL');
  { const { context, page, check } = await ctx({ javaScriptEnabled: false });
    await page.goto(`${base}/login`); assert.equal(await button(page).isDisabled(), true);
    await fill(page, USER, PASS); await page.getByLabel('Password').press('Enter'); await page.waitForTimeout(800); assert.equal(new URL(page.url()).search, '');
    await page.locator('button[type=submit]').evaluate((b) => b.removeAttribute('disabled'));
    await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.locator('button[type=submit]').click()]);
    assert.equal(new URL(page.url()).pathname, '/api/auth/login'); assert.equal(new URL(page.url()).search, '');
    check('LS-2'); await context.close(); }

  console.log('LS-3. slow initialisation (JS delayed 3 s): the user waits for the enabled control, then signs in normally');
  { const { context, page, requests, check } = await ctx({}, 3000);
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' }); await fill(page, USER, PASS);
    await button(page).click(); await page.waitForURL(/\/(console(\?entry=login)?|pos)$/, { timeout: 20000 });
    assert.equal(loginApiPosts(requests).length, 1); check('LS-3'); await context.close(); }

  console.log('LS-4/5. Enter after hydration signs in with ONE JSON request; a double-click also sends exactly one');
  for (const how of ['enter', 'dblclick']) {
    const { context, page, requests, check } = await ctx();
    await page.goto(`${base}/login`); await page.waitForLoadState('networkidle'); await fill(page, USER, PASS);
    if (how === 'enter') await page.getByLabel('Password').press('Enter'); else await button(page).dblclick();
    await page.waitForURL(/\/(console(\?entry=login)?|pos)$/);
    const posts = loginApiPosts(requests); assert.equal(posts.length, 1, `${how}: one login request`); assert.ok(posts[0].body.startsWith('{'), 'JSON body');
    check(`LS-4/5 ${how}`); await context.close();
  }

  console.log('LS-6/7. failed authentication: generic message without the username or password; refresh resends nothing and keeps no password');
  { const { context, page, requests, check } = await ctx();
    await page.goto(`${base}/login`); await page.waitForLoadState('networkidle'); await fill(page, USER, WRONG); await button(page).click();
    await page.locator('.login-error').waitFor(); const text = await page.locator('main').innerText();
    assert.match(text, /Username atau password salah\./); assert.ok(![USER, WRONG].some((s) => text.includes(s)), 'no credential echoed in the page');
    const before = loginApiPosts(requests).length; await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(loginApiPosts(requests).length, before, 'refresh did not resubmit'); assert.equal(await page.getByLabel('Password').inputValue(), '', 'password field empty after refresh');
    assert.equal(new URL(page.url()).search, ''); check('LS-6/7'); await context.close(); }

  console.log('LS-8. malformed, foreign or looping redirect targets fall back; a valid deep link (e.g. after an expired session) is preserved');
  for (const next of ['https://evil.test/', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login?next=/pos', '/login/', '/api/auth/session', `/${'a'.repeat(300)}`]) {
    const { context, page, check } = await ctx();
    await page.goto(`${base}/login?next=${encodeURIComponent(next)}`); await page.waitForLoadState('networkidle'); await fill(page, USER, PASS); await button(page).click();
    await page.waitForURL((u) => u.pathname !== '/login', { timeout: 15000 });
    const u = new URL(page.url()); assert.equal(u.hostname, '127.0.0.1', `${next}: stayed on site`); assert.ok(['/console', '/pos'].includes(u.pathname), `${next}: safe fallback, got ${u.pathname}`);
    check(`LS-8 ${next}`); await context.close();
  }
  { const { context, page, check } = await ctx();
    await page.goto(`${base}/login?next=${encodeURIComponent('/sales')}`); await page.waitForLoadState('networkidle'); await fill(page, USER, PASS); await button(page).click();
    await page.waitForURL((u) => u.pathname === '/sales'); check('LS-8 deep link'); await context.close(); }

  if (process.env.APP_LOG && existsSync(process.env.APP_LOG)) {
    console.log('LS-L. application log: no username, password or credential query string');
    const log = readFileSync(process.env.APP_LOG, 'utf8');
    for (const s of [USER, ...SECRETS]) assert.ok(!log.includes(s), 'a credential value appears in the application log');
    assert.doesNotMatch(log, /[?&](username|password)=/i);
  } else console.log('LS-L. SKIPPED: APP_LOG not provided');
  assert.deepEqual(leaks, [], leaks.join('\n'));
  console.log('login security checks passed');
} finally { await browser.close(); }
