const CACHE = 'usareise-v12';
const ASSETS = [
  './', './index.html', './exifr.js', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/plan.js', './js/store.js', './js/analyze.js', './js/firebase-config.js',
  './assets/pfp/dorothee.jpg', './assets/pfp/jens.jpg', './assets/pfp/alex.jpg',
  './assets/pfp/hannah.jpg', './assets/pfp/maxi.jpg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Network-first für eigene Dateien: online immer die aktuelle Version, offline aus dem Cache.
// Fremd-Hosts (Firebase/CDN/Fonts) immer direkt live.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
