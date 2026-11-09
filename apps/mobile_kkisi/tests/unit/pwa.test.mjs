import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { classifyRequest } from '../../src/lib/pwa/cache-policy.js';
import { PRECACHE, serviceWorkerSource } from '../../src/lib/pwa/service-worker-source.ts';

const O = 'https://app.kkisitb2.id';

test('only public build/brand assets are cached; member data never is', () => {
  const c = (path, mode = 'cors', rsc = false, method = 'GET') => classifyRequest(method, O + path, mode, O, rsc);
  assert.equal(c('/_next/static/chunks/app-1a2b.js'), 'static');
  assert.equal(c('/icons/icon-192.png'), 'static');
  assert.equal(c('/offline.html'), 'static');
  for (const p of ['/api/belanja/harga?items=1:1', '/api/auth/login', '/beranda?_rsc=abc', '/simpanan']) assert.equal(c(p), 'network', p);
  assert.equal(c('/beranda', 'cors', true), 'network', 'RSC payloads carry member data');
  assert.equal(c('/simpanan', 'navigate'), 'navigate', 'pages: network-only with offline fallback');
  assert.equal(c('/simpanan?_rsc=1', 'navigate'), 'network');
  assert.equal(c('/api/auth/logout', 'cors', false, 'POST'), 'bypass');
  assert.equal(classifyRequest('GET', 'https://fonts.example/x.woff2', 'cors', O, false), 'bypass');
  assert.equal(c('/icons/../api/x'), 'network', 'normalised paths cannot escape the static allow-list');
});

test('service worker: versioned cache, precache list is public only, policy embedded verbatim', () => {
  const src = serviceWorkerSource('0.1.0-test');
  assert.match(src, /kkisi-static-' \+ VERSION/);
  assert.ok(src.includes(classifyRequest.toString()));
  for (const p of PRECACHE) assert.match(p, /^\/(offline\.html|icons\/|images\/)/);
  assert.match(src, /no-store\|private/);
  assert.equal(src.match(/self\.skipWaiting\(\)/g).length, 1, 'skipWaiting only on the member\'s explicit SKIP_WAITING message');
  assert.match(src, /type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  new vm.Script(src);   // syntactically valid JavaScript
});

test('service worker fetch routing in a simulated worker scope', async () => {
  const handlers = {};
  const responded = [];
  const self = { location: { origin: O }, addEventListener: (t, h) => { handlers[t] = h; }, clients: { claim: async () => {} }, skipWaiting: () => {} };
  vm.runInNewContext(serviceWorkerSource('t'), { self, caches: {}, fetch: async () => new Response('x'), Response, Request, URL, console });
  const fire = (url, mode, method = 'GET', headers = {}) => handlers.fetch({ request: { url, mode, method, headers: new Headers(headers) }, respondWith: () => responded.push(url) });
  fire(O + '/api/belanja/harga', 'cors');
  fire(O + '/beranda', 'cors', 'GET', { RSC: '1' });
  fire(O + '/beranda', 'navigate');
  assert.deepEqual(responded, [O + '/beranda'], 'API and RSC requests are left to the network untouched');
});
