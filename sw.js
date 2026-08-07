const CACHE = 'usareise-v3';
const ASSETS = [
  './', './index.html', './exifr.js', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/plan.js', './js/store.js', './js/analyze.js', './js/firebase-config.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Nur eigene Assets aus Cache bedienen; CDN/Firebase immer live.
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => r)));
});
