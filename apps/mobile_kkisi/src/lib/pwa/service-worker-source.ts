import { classifyRequest } from './cache-policy.js';

/** Files precached at install: the offline fallback and the brand assets it shows. No personalised content. */
export const PRECACHE = ['/offline.html', '/icons/smart-icon-192.png', '/images/logo-landscape.png'];
export const STATIC_LIMIT = 150;

/**
 * The service worker script. The cache name carries the build id, so a new deployment installs a new worker that deletes the
 * previous static cache on activation. The new worker waits until the member chooses "Muat ulang" (no reload mid-form).
 */
export function serviceWorkerSource(build: string): string {
  return `'use strict';
const VERSION = ${JSON.stringify(build)};
const STATIC_CACHE = 'kkisi-static-' + VERSION;
const PRECACHE = ${JSON.stringify(PRECACHE)};
const STATIC_LIMIT = ${STATIC_LIMIT};
const classifyRequest = ${classifyRequest.toString()};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('kkisi-') && key !== STATIC_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Only complete, same-origin, explicitly cacheable responses are stored.
  const cc = response.headers.get('Cache-Control') || '';
  if (response.ok && response.type === 'basic' && !/no-store|private/i.test(cc)) { await cache.put(request, response.clone()); trim(cache); }
  return response;
}

async function navigate(request) {
  try { return await fetch(request); }
  catch (e) {
    const offline = await caches.match('/offline.html', { cacheName: STATIC_CACHE });
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

self.addEventListener('fetch', (event) => {
  const r = event.request;
  const kind = classifyRequest(r.method, r.url, r.mode, self.location.origin, r.headers.get('RSC') === '1');
  if (kind === 'static') event.respondWith(cacheFirst(r));
  else if (kind === 'navigate') event.respondWith(navigate(r));
  // 'network' and 'bypass': the browser fetches normally; nothing is stored by the worker.
});
`;
}
