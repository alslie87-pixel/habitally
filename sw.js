// HabiTally service worker: here to make the app installable, nothing else.
//
// Chrome offers its install prompt only to a page whose service worker has
// a fetch handler. This one hands every request straight to the network and
// caches nothing, so an app update and the habit data are never served
// stale. Writes (POST) are not touched at all.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // fetch() throws on this combination, so leave it to the browser
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  event.respondWith(fetch(req));
});
