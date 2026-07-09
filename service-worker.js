const CACHE_NAME = 'bio231-flashcards-v9';
const CORE_ASSETS = ['./', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFromNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cache.match(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return cacheFromNetwork(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(cacheFromNetwork(request).then(response => response || caches.match('./index.html')));
    return;
  }

  event.respondWith(cacheFirst(request));
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_URLS') return;
  const port = event.ports && event.ports[0];
  const urls = Array.from(new Set((event.data.urls || []).filter(Boolean)));

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let cached = 0;
    let failed = 0;

    for (const rawUrl of urls) {
      const absoluteUrl = new URL(rawUrl, self.location.href).toString();
      const cacheRequest = new Request(absoluteUrl);
      const networkRequest = new Request(absoluteUrl, { cache: 'reload' });
      try {
        const response = await fetch(networkRequest);
        if (response && response.ok) {
          await cache.put(cacheRequest, response.clone());
          cached++;
        } else if (await cache.match(cacheRequest)) {
          cached++;
        } else {
          failed++;
        }
      } catch (error) {
        if (await cache.match(cacheRequest)) cached++;
        else failed++;
      }
    }

    if (port) port.postMessage({ cached, failed, total: urls.length });
  })());
});
