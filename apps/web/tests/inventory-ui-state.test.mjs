import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export const useRouter=()=>({replace(){},refresh(){}});export const usePathname=()=>globalThis.__testPath??"/"', shortCircuit: true };
    if (specifier === 'next/link') return nextResolve('next/link.js', context);
    if (specifier === 'next/image') return { url: 'data:text/javascript,export default function Image(){return null}', shortCircuit: true };
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) {
        for (const extension of ['.tsx', '.ts']) if (existsSync(fileURLToPath(url) + extension)) return nextResolve(url.href + extension, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return nextLoad(url, context);
  },
});
const ui = await import('../src/components/inventory/InventoryScreen.tsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const detail = { document: { id: 17, managed: true, status: 0, createdBy: 'owner' }, lines: [] };

test('a failed detail retains selected ID and can be retried without a loaded document', () => {
  assert.equal(typeof ui.inventoryDocumentSelection, 'function');
  const reduce = ui.inventoryDocumentSelection;
  const selected = reduce({ id: null, detail: null, loading: false }, { type: 'select', id: 17 });
  assert.deepEqual(selected, { id: 17, detail: null, loading: true });
  const failed = reduce(selected, { type: 'failed' });
  assert.deepEqual(failed, { id: 17, detail: null, loading: false });
  const retried = reduce(failed, { type: 'select', id: failed.id });
  assert.equal(retried.loading, true);
  assert.deepEqual(reduce(retried, { type: 'loaded', detail }), { id: 17, detail, loading: false });
});

test('remounted uncertain create form shows the exact frozen request fields', () => {
  assert.equal(typeof ui.InventoryDraftFields, 'function');
  const attempt = { requestKey: 'same-key', period: 'Count original', startDate: '2026-09-01', endDate: '2026-09-18', remarks: 'Keep original note' };
  const html = render(ui.InventoryDraftFields, { date: '2026-10-03', attempt, disabled: true });
  for (const value of [attempt.period, attempt.startDate, attempt.endDate, attempt.remarks]) assert.ok(html.includes(value), `visible frozen value ${value}`);
  assert.match(html, /<fieldset disabled=""/);
  assert.doesNotMatch(html, /2026-10-03/);
});

test('draft edit capability uses the authoritative username and excludes other creators', () => {
  assert.equal(typeof ui.canEditInventoryDraft, 'function');
  assert.equal(ui.canEditInventoryDraft(detail.document, 'owner'), true);
  assert.equal(ui.canEditInventoryDraft(detail.document, 'different-owner'), false);
  assert.equal(ui.canEditInventoryDraft(detail.document, undefined), false);
  assert.equal(ui.canEditInventoryDraft({ ...detail.document, managed: false }, 'owner'), false);
  assert.equal(ui.canEditInventoryDraft({ ...detail.document, status: 1 }, 'owner'), false);
});

test('inventory tabs have one keyboard tab stop and a focusable active panel', () => {
  const session = { userId: 1, userName: 'Tester', userLogin: 'tester', companyId: 1, branchName: 'Test', companies: [], register: { open: null, multiple: false } };
  const html = render(ui.InventoryScreen, { session, capabilities: { stockOpname: true, warehouse: true, writes: true } });
  assert.match(html, /id="inventory-stock-tab"[^>]*tabindex="0"/);
  assert.match(html, /id="inventory-warehouse-tab"[^>]*tabindex="-1"/);
  assert.match(html, /id="inventory-stock-panel"[^>]*tabindex="0"/);
});
