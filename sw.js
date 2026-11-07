// Keeps the app working offline. It only ever caches the app's own files, never photos,
// which stay in the on-device database. Raise VERSION whenever a file changes.
// Other apps can live on the same web address and share this cache storage, so this
// worker only ever touches caches carrying its own prefix.
const PREFIX = 'erstes-jahr-';
const VERSION = `${PREFIX}5`;
const FILES = [
  './',
  'animals.js', 'app.js', 'backup.js', 'birth.js', 'dates.js', 'db.js', 'gift.js', 'image.js', 'lock.js', 'theme.js', 'zip.js',
  'gift.enc.json',
  'styles.css', 'manifest.webmanifest',
  'fonts/young-serif-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION)
    // cache: 'reload' skips the browser's normal web cache, so an update never stores old files.
    .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(PREFIX) && key !== VERSION)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Serves this app's own copy. If another app on the address removed it, the file comes
// from the network and is stored again, so offline use recovers by itself.
async function respond(request, lookup, options) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(lookup, options);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(lookup, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(respond(request, './'));
    return;
  }
  event.respondWith(respond(request, request, { ignoreSearch: true }));
});
