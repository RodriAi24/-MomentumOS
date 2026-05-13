// MomentumOS Service Worker
// Strategy: network-first para HTML/JS/CSS (siempre busca update),
// cache-first para assets externos (fonts, Chart.js CDN).
// Auto-update: cuando hay versión nueva, se aplica inmediatamente.

const VERSION = 'momentum-v2.0.0-awakening';
const CACHE_NAME = `momentumos-${VERSION}`;

// Archivos core de la app
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// Assets externos (CDN) que se cachean cache-first
const EXTERNAL_CACHE = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
];

// ============================================================
// INSTALL — precachea los assets core
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial fail:', err);
      });
    }).then(() => {
      // Activa el SW nuevo inmediatamente, sin esperar a que se cierren tabs viejas
      return self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE — limpia caches viejos
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('momentumos-') && k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(() => {
      // Toma control de todas las páginas abiertas inmediatamente
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — estrategia híbrida
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET requests
  if (req.method !== 'GET') return;

  // Ignorar chrome-extension, devtools, etc.
  if (!url.protocol.startsWith('http')) return;

  // === ESTRATEGIA 1: External CDN assets → cache-first ===
  // Fonts y Chart.js no cambian seguido, cacheamos agresivo
  const isExternal = EXTERNAL_CACHE.some((origin) => url.href.startsWith(origin));
  if (isExternal) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // === ESTRATEGIA 2: App assets (HTML/JS/CSS propios) → network-first ===
  // Siempre intenta bajar la última versión. Si falla, usa cache.
  event.respondWith(networkFirst(req));
});

// ============================================================
// STRATEGIES
// ============================================================
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Intenta bajar de la red con timeout de 4 segundos
    const networkResp = await fetchWithTimeout(req, 4000);
    if (networkResp && networkResp.ok) {
      // Cachea la versión nueva
      cache.put(req, networkResp.clone());
      return networkResp;
    }
    throw new Error('Network response not ok');
  } catch (err) {
    // Sin red o timeout → cache
    const cached = await cache.match(req);
    if (cached) {
      console.log('[SW] Serving from cache (offline):', req.url);
      return cached;
    }
    // Si tampoco hay cache, fallback al index para SPA
    if (req.mode === 'navigate') {
      return cache.match('./index.html') || cache.match('./');
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) {
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

function fetchWithTimeout(req, ms) {
  return Promise.race([
    fetch(req),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    ),
  ]);
}

// ============================================================
// MESSAGE — permite que la app fuerce un update
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

