import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Optional browser verification: point PLAYWRIGHT_MODULE at an installed package.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.POS_URL || 'http://127.0.0.1:3100/pos';
const output = process.env.POS_SCREENSHOTS || '/private/tmp/ksm-pos-verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const writes = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', (request) => { if (request.method() !== 'GET') writes.push(request.method()); });

try {
  const response = await page.goto(baseUrl);
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'POS / Kasir', exact: true }).waitFor();
  assert.equal(await page.locator('.pos-product-card').count(), 9);
  assert.equal(await page.getByRole('button', { name: 'Proses Pembayaran', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Tambah Gula Pasir 1kg', exact: true }).isDisabled(), true);
  const sources = await page.locator('.pos-product-image img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  await page.locator('.pos-product-image img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.screenshot({ path: `${output}/pos-1440-empty.png` });

  await page.getByRole('button', { name: 'Minuman', exact: true }).click();
  assert.equal(await page.locator('.pos-product-card').count(), 2);
  await page.getByRole('button', { name: 'Semua', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Cari produk berdasarkan nama, kode, atau barcode' });
  for (const query of ['Air Mineral', 'MIN-001', 'DEMO899001']) {
    await search.fill(query);
    assert.equal(await page.locator('.pos-product-card').count(), 1);
    assert.equal(await page.locator('.pos-product-card h3').innerText(), 'Air Mineral 600ml');
  }
  await search.fill('does-not-exist');
  await page.getByRole('heading', { name: 'Produk tidak ditemukan' }).waitFor();
  await page.getByRole('button', { name: 'Tampilkan semua produk' }).click();
  await search.fill('DEMO899001');
  await search.press('Enter');
  await page.getByRole('button', { name: 'Tambah Air Mineral 600ml', exact: true }).click();
  assert.equal(await page.locator('.pos-cart-item').count(), 1);
  assert.equal(await page.locator('.pos-cart-item .pos-quantity span').innerText(), '2');
  assert.match(await page.locator('.pos-total').innerText(), /8\.000/);
  await page.getByRole('button', { name: 'Kurangi Air Mineral 600ml', exact: true }).click();
  assert.equal(await page.locator('.pos-cart-item .pos-quantity span').innerText(), '1');
  await page.getByRole('button', { name: 'Tambah Pulpen Biru', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah jumlah Pulpen Biru', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Tambah jumlah Pulpen Biru', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Tambah Pulpen Biru', exact: true }).isDisabled(), true);
  await page.getByText('Stok tidak mencukupi untuk menambah jumlah.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Hapus Pulpen Biru', exact: true }).click();
  assert.equal(await page.locator('.pos-cart-item').count(), 1);

  await page.getByRole('textbox', { name: 'Member · Pratinjau', exact: true }).fill('unknown');
  await page.getByRole('button', { name: 'Pilih', exact: true }).click();
  await page.getByText('Member tidak ditemukan dalam data contoh. Periksa NIK / ID card / QR.', { exact: true }).waitFor();
  for (const identifier of ['DEMO-12345', 'DEMO-CARD-01', 'DEMO-QR-01']) {
    await page.getByRole('textbox', { name: 'Member · Pratinjau', exact: true }).fill(identifier);
    await page.getByRole('button', { name: 'Pilih', exact: true }).click();
    await page.getByText('Anggota Contoh · DEMO-12345', { exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Kredit Anggota', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Kredit Anggota', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  for (const name of ['QRIS', 'Debit / Credit', 'Wallet / Point', 'Payroll', 'Kombinasi']) {
    assert.equal(await page.getByRole('button', { name: `${name} Belum tersedia`, exact: true }).isDisabled(), true);
  }
  assert.equal(await page.getByRole('button', { name: 'Proses Pembayaran', exact: true }).isDisabled(), true);
  await page.locator('.pos-catalog-scroll').evaluate((element) => { element.scrollTop = 0; });
  await page.locator('.pos-transaction').evaluate((element) => { element.scrollTop = 0; });
  assert.ok(await page.getByRole('button', { name: 'Proses Pembayaran', exact: true }).evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), 'Checkout state must remain visible with a populated cart');
  await page.screenshot({ path: `${output}/pos-1440-cart.png` });
  await page.getByRole('button', { name: 'Hapus Semua', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Hapus Semua Item?' }).isVisible(), true);
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  assert.equal(await page.locator('.pos-cart-item').count(), 1);
  await page.getByRole('button', { name: 'Hapus Semua', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, Hapus Semua', exact: true }).click();
  await page.getByText('Keranjang masih kosong', { exact: true }).waitFor();

  await page.reload();
  assert.deepEqual(await page.locator('.pos-product-image img').evaluateAll((images) => images.map((image) => image.getAttribute('src'))), sources);
  const layouts = [];
  for (const [width, height] of [[1600, 900], [1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      sidebar: document.querySelector('.pos-sidebar').getBoundingClientRect().width,
      cart: document.querySelector('.pos-transaction').getBoundingClientRect().width,
    }));
    assert.ok(layout.documentWidth <= width, `Horizontal overflow at ${width}: ${layout.documentWidth}`);
    layouts.push({ width, height, ...layout });
    await page.screenshot({ path: `${output}/pos-${width}.png`, fullPage: width < 900 });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(JSON.stringify({ result: 'PASS', checks: 'render/images/search/categories/barcode/cart bounds/member identifiers/payment/clear/refresh/layout/no writes', layouts, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
