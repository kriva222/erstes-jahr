// Keeps the app working offline. It only ever caches the app's own files, never photos,
// which stay in the on-device database. Raise VERSION whenever a file changes.
const VERSION = 'erstes-jahr-1';
const FILES = [
  './',
  'animals.js', 'app.js', 'backup.js', 'birth.js', 'dates.js', 'db.js', 'gift.js', 'image.js', 'theme.js', 'zip.js',
  'gift.enc.json',
  'styles.css', 'manifest.webmanifest',
  'fonts/young-serif-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./').then((page) => page || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)));
});
