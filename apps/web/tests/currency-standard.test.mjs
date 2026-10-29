import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { toMinorUnits } from '@koperasi/domain/money';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export {};' };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { CurrencyText } = await import('../src/components/money/CurrencyText.tsx');
const { CurrencyInput } = await import('../src/components/money/CurrencyInput.tsx');
const money = await import('../src/components/money/format.ts');
const preview = await import('../src/components/pos/preview.ts');
const payroll = await import('../src/components/console/kosipa/payroll-format.ts');
const presentation = await import('../src/components/console/kosipa/presentation.ts');
const html = (props) => renderToStaticMarkup(React.createElement(CurrencyText, props));

test('CurrencyText renders every variant in the standard format with tabular, non-wrapping markup', () => {
  assert.equal(html({ value: '1250000.75' }), '<span class="money">Rp1.250.000,75</span>');
  assert.equal(html({ value: 25000, variant: 'document' }), '<span class="money">Rp25.000,00</span>');
  assert.equal(html({ value: 125000, variant: 'number' }), '<span class="money">125.000</span>');
  assert.equal(html({ value: -1250000, variant: 'accounting' }), '<span class="money" data-negative="true">(Rp1.250.000,00)</span>');
  assert.equal(html({ value: -5 }), '<span class="money" data-negative="true">-Rp5</span>');
  assert.equal(html({ value: null }), '<span class="money">—</span>');
  assert.equal(html({ value: undefined, placeholder: 'Tidak tersedia' }), '<span class="money">Tidak tersedia</span>');
});

test('CurrencyText converts integer minor units exactly', () => {
  assert.equal(html({ value: 400010, unit: 'sen' }), '<span class="money">Rp4.000,10</span>');
  assert.equal(html({ value: 500006666, unit: 'amount4' }), '<span class="money">Rp50.000,6666</span>');
  assert.equal(html({ value: null, unit: 'sen' }), '<span class="money">—</span>');
});

test('compact amounts expose the exact value as a tooltip and to screen readers', () => {
  const out = html({ value: '1250000', variant: 'compact' });
  assert.match(out, /title="Rp1\.250\.000"/);
  assert.match(out, /<span aria-hidden="true">Rp1,25 juta<\/span><span class="sr-only">Rp1\.250\.000<\/span>/);
  assert.equal(html({ value: 999999, variant: 'compact' }), '<span class="money money-compact">Rp999.999</span>');
});

test('an unusable amount is shown as invalid, never as a wrong number', () => {
  const out = html({ value: '1e10' });
  assert.match(out, /money-invalid/);
  assert.match(out, /aria-label="Nominal tidak valid"/);
  assert.doesNotMatch(out, /Rp/);
});

test('CurrencyInput renders a separate Rp prefix, grouped text, numeric keyboard hints and the canonical posted value', () => {
  const out = renderToStaticMarkup(React.createElement(CurrencyInput, { id: 'x', name: 'price', defaultValue: '1250000.75', required: true }));
  assert.match(out, /<span class="money-input-prefix" aria-hidden="true">Rp<\/span>/);
  assert.match(out, /type="text"[^>]*inputMode="decimal"|inputMode="decimal"[^>]*type="text"/);
  assert.match(out, /value="1\.250\.000,75"/);
  assert.match(out, /<input type="hidden" name="price" value="1250000.75"\/>/);
  assert.match(out, /aria-describedby="x-hint"/);
  const whole = renderToStaticMarkup(React.createElement(CurrencyInput, { value: '5000', onValueChange() {}, allowDecimals: false }));
  assert.match(whole, /inputMode="numeric"/);
  assert.match(whole, /value="5\.000"/);
  const empty = renderToStaticMarkup(React.createElement(CurrencyInput, { value: '', onValueChange() {} }));
  assert.match(empty, /value=""/, 'an empty field stays empty, not zero');
  const disabled = renderToStaticMarkup(React.createElement(CurrencyInput, { value: '1', onValueChange() {}, disabled: true, readOnly: true, 'aria-invalid': true }));
  assert.match(disabled, /disabled=""/); assert.match(disabled, /readOnly=""/); assert.match(disabled, /aria-invalid="true"/);
});

test('existing module adapters now emit the one standard format', () => {
  assert.equal(preview.formatRupiah(350000), 'Rp3.500');
  assert.equal(preview.formatRupiah(400010), 'Rp4.000,10');
  assert.equal(payroll.formatAmount4(0), 'Rp0');
  assert.equal(payroll.formatAmount4(1500000000), 'Rp150.000');
  assert.equal(payroll.formatAmount4(500006666), 'Rp50.000,6666');
  assert.equal(payroll.formatAmount4(-12500), '-Rp1,25');
  assert.equal(presentation.formatExactRupiah('1000.2300'), 'Rp1.000,23');
  assert.equal(presentation.formatExactRupiah(null), 'Tidak tersedia');
  assert.equal(money.formatSenDocument(125000), 'Rp1.250,00');
  assert.equal(money.formatSen(null), '—');
});

test('financial integrity: formatting is display-only and the shown text parses back to the exact stored amount', () => {
  for (const sen of [0, 1, 5, 99, 100, 350000, 400010, 990990, 125000075, 999999999999]) {
    const canonical = money.rupiahFromSen(sen);
    assert.equal(toMinorUnits(canonical), sen, 'sen -> decimal -> sen is lossless');
    const shown = money.formatRupiahNumberOnly(canonical, { minFractionDigits: 2 });
    const parsed = money.parseRupiahInput(shown, { maxFractionDigits: 2 });
    assert.deepEqual(parsed, { ok: true, value: canonical }, shown);
  }
  const stored = ['4000.10', '1250000.75', '0.05'];
  const before = [...stored];
  for (const value of stored) { money.formatRupiah(value); money.formatRupiahDocument(value); money.formatRupiahCompact(value); }
  assert.deepEqual(stored, before);
});

test('the typed field value that is submitted is the original canonical amount, never the display text', () => {
  for (const [typed, submitted] of [['1.250.000', '1250000'], ['1.250.000,75', '1250000.75'], ['4000,5', '4000.5'], ['0,05', '0.05']]) {
    assert.equal(money.draftRupiahInput(typed).canonical, submitted);
    assert.deepEqual(money.parseRupiahInput(typed), { ok: true, value: submitted });
  }
});

// Guard against regressions: the old per-module formatters must not come back.
const root = fileURLToPath(new URL('../src/', import.meta.url));
function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}
test('the scan flags display formatting but allows a valid IDR code in a machine-readable contract', () => {
  const display = [/style:\s*['"]currency['"]/, /['"`>]IDR\s?[\d$]/];
  assert.ok(display.some((p) => p.test("new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })")));
  assert.ok(display.some((p) => p.test('<b>IDR 1,250,000</b>')));
  assert.ok(!display.some((p) => p.test("const payload = { amount: '1250000.00', currency: 'IDR' }")));
});

test('no source formats Rupiah outside the shared standard', () => {
  const offenders = [];
  for (const file of sources(root)) {
    const rel = relative(root, file);
    const code = readFileSync(file, 'utf8');
    const checks = [
      // Display-only rules. A bare `currency: 'IDR'` code in a machine-readable contract is valid and deliberately not flagged.
      [/style:\s*['"]currency['"]/, 'Intl currency style (emits "Rp " with NBSP)'],
      [/['"`]Rp\s[\d$]|`Rp \$\{|>Rp \d/, 'Rp followed by a space'],
      [/['"`>]Rp\.\s?[\d$]/, '"Rp." notation'],
      [/['"`>]IDR\s?[\d$]/, 'IDR as a display prefix'],
    ];
    for (const [pattern, why] of checks) if (pattern.test(code)) offenders.push(`${rel}: ${why}`);
  }
  assert.deepEqual(offenders, []);
});
