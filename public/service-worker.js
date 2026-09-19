/**
 * ============================================================
 *  service-worker.js - what makes this installable
 * ============================================================
 *  A service worker is a small script the browser keeps running
 *  in the background, even when the page is closed. It sits
 *  between the app and the network and can answer requests from
 *  a cache instead of the internet.
 *
 *  Two different strategies here, on purpose:
 *
 *    APP FILES (html, css, js, icons)
 *      Cache first. These barely change, and a till that waits
 *      three seconds for a stylesheet is a till with a queue.
 *
 *    API CALLS (/api/...)
 *      Network only. Prices, stock and sales must be live. A
 *      cached stock number is a wrong stock number.
 *
 *  Bump CACHE_VERSION whenever you change any file in the app,
 *  otherwise browsers will keep serving the old one.
 * ============================================================
 */

const CACHE_VERSION = 'quickmart-v2.2.4';

const APP_SHELL = [
  './',
  'index.html',
  'register.html',
  'admin.html',
  'cashier.html',
  'inventory.html',
  'offline.html',
  'css/style.css',
  'css/admin.css',
  'css/cashier.css',
  'css/inventory.css',
  'css/register.css',
  'js/api.js',
  'js/auth.js',
  'js/shop.js',
  'js/db.js',
  'js/admin.js',
  'js/admin-extra.js',
  'js/cashier.js',
  'js/inventory.js',
  'js/register.js',
  'js/pwa.js',
  'icons/icon.svg',
  'icons/icon-maskable.svg',
  'manifest.json'
];


// ── Install: put the app files in the cache ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())      // take over straight away
  );
});


// ── Activate: throw away caches from older versions ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_VERSION)
             .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});


// ── Fetch: decide where each request is answered from ──
self.addEventListener('fetch', event => {
  const request = event.request;

  // Only GET requests can be cached. A sale must never be replayed
  // from a cache - that would charge a customer twice.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // API calls always go to the network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ message: 'You are offline. Reconnect to continue.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Uploaded logos: use the cache if we have it, otherwise fetch and keep it
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(request).then(hit =>
        hit || fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          return response;
        })
      )
    );
    return;
  }

  // Everything else: cache first, network as backup
  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) return hit;

      return fetch(request)
        .then(response => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached: show the offline page for page loads
          if (request.mode === 'navigate') {
            return caches.match('offline.html');
          }
        });
    })
  );
});
