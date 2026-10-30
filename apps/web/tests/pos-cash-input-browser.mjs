import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Real-browser check of the POS "Uang bayar" CurrencyInput on the LOCAL staging app (read-only: any /api/pos/checkout request is aborted
// inside the browser, so no payment, stock or sale row can ever be written). Needs the ignored cashier fixture and an app on 127.0.0.1.
// Proves the display text never becomes the amount: Kembalian is computed from the canonical value, and refused input is explained.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.POS_URL ?? 'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname, '127.0.0.1');
const fixture = JSON.parse(await readFile(new URL('../.e2e-kasirpos.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; let checkoutRequests = 0;
page.on('pageerror', (error) => errors.push(String(error.message)));
await page.route('**/api/pos/checkout', (route) => { checkoutRequests++; route.abort(); });
const change = async () => (await page.locator('.pos-change').innerText()).replace(/\s+/g, ' ');
const note = async () => (await page.locator('.pos-cash-payment .money-input-note').count()) ? (await page.locator('.pos-cash-payment .money-input-note').innerText()) : '';
try {
  await page.goto(`${base}/pos`);
  await page.fill('input[name=username]', fixture.username); await page.fill('input[name=password]', fixture.password); await page.click('.login-card button');
  await page.waitForURL('**/pos'); await page.waitForSelector('.pos-add'); await page.locator('.pos-add').first().click(); await page.waitForSelector('#pos-paid');
  const totalText = (await page.locator('.pos-price-summary strong').first().innerText()).trim();
  const total = Number(totalText.replace(/^Rp/, '').replace(/\./g, '').replace(',', '.'));
  assert.ok(total > 0 && /^Rp[\d.]+(,\d{2,})?$/.test(totalText), `cart total uses the standard format: ${totalText}`);

  await page.click('#pos-paid'); await page.keyboard.type('1000000');
  assert.equal(await page.inputValue('#pos-paid'), '1.000.000');
  const expectedChange = (1000000 - total).toLocaleString('id-ID', { minimumFractionDigits: total % 1 ? 2 : 0, maximumFractionDigits: 2 });
  assert.equal(await change(), `Kembalian Rp${expectedChange}`, 'change is computed from the canonical amount');

  await page.keyboard.type(',');
  assert.equal(await page.inputValue('#pos-paid'), '1.000.000', 'a comma never enters a whole-rupiah field');
  assert.match(await note(), /rupiah bulat, tanpa desimal/, 'and the refusal is explained, not silent');
  await page.keyboard.type('5'); assert.equal(await page.inputValue('#pos-paid'), '10.000.005');

  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
  assert.equal(await page.inputValue('#pos-paid'), '', 'empty is empty, never zero');
  assert.equal(await page.getAttribute('#pos-paid', 'inputmode'), 'numeric');
  assert.equal((await page.locator('.pos-cash-payment .money-input-prefix').innerText()).trim(), 'Rp');
  assert.doesNotMatch(await page.inputValue('#pos-paid'), /Rp/);

  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.equal(checkoutRequests, 0, 'no payment request was ever attempted');
  console.log('PASS: POS cash field groups live, computes change from the canonical amount, refuses decimals with a message, keeps empty empty, sends nothing');
} finally { await browser.close(); }
