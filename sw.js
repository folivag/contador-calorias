/* Service Worker — Contador de Calorías
   Estrategia:
   - App shell (HTML/CSS/JS/manifest/icon): cache-first con actualización en background.
   - ZXing (CDN): cache-first después del primer load.
   - APIs (Anthropic, Open Food Facts): pasan directo a la red (no se cachean).
*/

const CACHE = 'cal-counter-v2';
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
    return; // pasa a la red por defecto
  }

  // Stale-while-revalidate para todo lo demás (incluye ZXing CDN)
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
