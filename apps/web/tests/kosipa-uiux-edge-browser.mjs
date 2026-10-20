import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEV_LOCAL_URL || 'http://127.0.0.1:3201';
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.ok(['3200', '3201', '3203'].includes(new URL(base).port));
const out = process.env.KOSIPA_EDGE_OUT || '/private/tmp/kkisi-kosipa-uiux-edge';
await mkdir(out, { recursive: true });
const pw = JSON.parse(await readFile(new URL('../.env.dev-local-accounts.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
const results = [];
async function step(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message.slice(0, 1500) }); }
  console.log(results.at(-1).status, name, results.at(-1).error || '');
}
async function open(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const response = await context.request.post(base + '/api/auth/login', { headers: { origin: base }, data: { username: 'synth_' + role, password: pw[role] } });
  assert.equal(response.status(), 200);
  return { context, page: await context.newPage() };
}
try {
  await step('forged private search rechecks payroll capability at the server boundary', async () => {
    const { context, page } = await open('kasir2');
    await page.goto(base + '/console/kosipa/anggota');
    await page.locator('.kosipa-workspace-fields:not([disabled])').waitFor();
    await page.locator('form[data-kosipa-private]').evaluate(form => form.setAttribute('action', '/console/kosipa/payroll/POTSYN202608A'));
    await page.locator('input[name=q]').fill('S9001');
    await page.getByRole('button', { name: 'Cari anggota', exact: true }).click();
    await page.getByRole('heading', { name: 'Akses ditolak', exact: true }).waitFor();
    assert.equal(await page.locator('main table').count(), 0);
    assert.doesNotMatch(await page.locator('main').innerText(), /SYNTH ANGGOTA|Rp /);
    assert.equal((await context.request.get(base + '/api/kosipa/payroll')).status(), 403);
    await context.close();
  });
  const { context, page } = await open('koperasi');
  await step('valid report years without records stay selected and invalid years fail closed', async () => {
    for (const report of ['pinjaman', 'payroll', 'simpanan']) {
      await page.goto(base + '/console/kosipa/laporan/' + report + '?tahun=2027');
      await page.locator('.kosipa-workspace-fields:not([disabled])').waitFor();
      assert.equal(await page.locator('select[name=tahun]').inputValue(), '2027');
      await page.screenshot({ path: `${out}/empty-year-${report}-1440.png`, fullPage: true });
      await page.goto(base + '/console/kosipa/laporan/' + report + '?tahun=1999');
      await page.getByRole('heading', { name: 'Tahun tidak valid', exact: true }).waitFor();
      assert.equal(await page.locator('main table').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Unduh CSV', exact: true }).count(), 0);
    }
  });
  await step('invalid loan status does not present an empty or zero-valued financial result', async () => {
    await page.goto(base + '/console/kosipa/pinjaman?status=FORGED');
    await page.getByRole('heading', { name: 'Filter tidak valid', exact: true }).waitFor();
    assert.equal(await page.locator('main table').count(), 0);
  });
  await step('private search pending uses skeletons while preserving request-body privacy', async () => {
    await page.goto(base + '/console/kosipa/anggota');
    await page.locator('.kosipa-workspace-fields:not([disabled])').waitFor();
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    await page.route('**/console/kosipa/anggota', async route => {
      if (route.request().method() === 'POST') {
        assert.equal(new URL(route.request().url()).search, '');
        await barrier;
      }
      await route.continue();
    });
    await page.locator('input[name=q]').fill('S9001');
    await page.getByRole('button', { name: 'Cari anggota', exact: true }).click();
    await page.locator('.kosipa-loading[aria-busy=true]').waitFor();
    assert.equal(await page.locator('main table').count(), 0);
    await page.screenshot({ path: `${out}/private-search-loading.png` });
    release();
    await page.getByRole('cell', { name: 'SYNTH ANGGOTA SATU', exact: true }).waitFor();
    await page.unroute('**/console/kosipa/anggota');
    assert.equal(new URL(page.url()).search, '');
  });
  await step('table scroll hints reflect real overflow at desktop and mobile widths', async () => {
    for (const route of ['/laporan/keanggotaan', '/pinjaman', '/anggota/9001']) {
      await page.goto(base + '/console/kosipa' + route);
      await page.locator('.kosipa-workspace-fields:not([disabled])').waitFor();
      await page.locator('main table').first().waitFor();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 960 });
        await page.waitForFunction(() => [...document.querySelectorAll('.kosipa-table-frame')].every(frame => {
          const region = frame.querySelector('.kosipa-table-scroll');
          const hint = frame.querySelector('.kosipa-table-hint');
          return Boolean(hint && !hint.hidden) === (region.scrollWidth > region.clientWidth + 1);
        }), undefined, { timeout: 5000 });
      }
    }
  });
  await context.close();
} finally {
  await browser.close();
  await writeFile(out + '/results.json', JSON.stringify(results, null, 2));
}
process.exitCode = results.some(result => result.status === 'FAIL') ? 1 : 0;
