/* Service Worker — Contador de Calorías
   Estrategia:
   - HTML (navegación): network-first → ve cambios al primer reload con red.
   - CSS/JS/manifest/iconos: stale-while-revalidate.
   - ZXing (CDN): stale-while-revalidate.
   - APIs (Anthropic, Open Food Facts): pasan directo a la red (no se cachean).
*/

const CACHE = 'cal-counter-v5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Permite que el cliente fuerce la activación inmediata de un SW nuevo.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No cachear APIs externas
  if (
    url.host.includes('api.anthropic.com') ||
    url.host.includes('openfoodfacts.org') ||
    url.host.includes('static.openfoodfacts.org') ||
    url.host.includes('images.openfoodfacts.org')
  ) {
    return;
  }

  // Network-first para navegación (HTML) — así los updates se ven al primer reload.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate para el resto (CSS/JS/imágenes/CDN)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
