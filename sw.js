// Ascendency service worker — offline-first, versioned cache.
// BUMP CACHE_VERSION on every deploy: the app's "NEW VERSION · UPDATING" toast keys off controllerchange.
const CACHE_VERSION = 'ascendency-v4.0.0';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                       // license POSTs go straight to network
  if (url.origin !== location.origin) {                          // fonts: cache-first opportunistic
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(e.request, cp)); return res; }).catch(() => r)));
    return;
  }
  // App shell: network-first (so updates land), fallback to cache (offline)
  e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});


