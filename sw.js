/* ============================================================
   EthioMetric Service Worker — sw.js
   GitHub Pages: https://freshman21445.github.io/My-first-website/
   ============================================================ */

const CACHE_NAME = 'ethiometric-v1003';
const OFFLINE_URL = '/My-first-website/index.html';

const PRE_CACHE = [
  '/My-first-website/',
  '/My-first-website/index.html',
  '/My-first-website/manifest.json'
];

const MAX_CACHE_ENTRIES = 60;

/* ── INSTALL ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRE_CACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── MESSAGE ── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── helper: trim cache ── */
function trimCache(cacheName, maxEntries) {
  caches.open(cacheName).then(function(cache) {
    cache.keys().then(function(keys) {
      if (keys.length > maxEntries) {
        cache.delete(keys[0]).then(function() {
          trimCache(cacheName, maxEntries);
        });
      }
    });
  });
}

/* ── FETCH ── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  if (event.request.method !== 'GET') return;

  /* Firebase / Cloudinary — always network, silent fail */
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase.googleapis.com') ||
    url.includes('gstatic.com/firebasejs') ||
    url.includes('cloudinary.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  /* index.html and navigation — CACHE-FIRST, network only to update cache in background */
  if (url.includes('/My-first-website/index.html') || event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(OFFLINE_URL).then(function(cached) {
        /* Always serve from cache instantly */
        var networkUpdate = fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(function() { /* silent — no internet is fine */ });
        /* Return cache immediately, update happens silently in background */
        return cached || networkUpdate;
      })
    );
    return;
  }

  /* Everything else — Cache-First, silent background update */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      /* Silently update cache in background */
      fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, networkResponse.clone());
            trimCache(CACHE_NAME, MAX_CACHE_ENTRIES);
          });
        }
      }).catch(function() { /* silent */ });

      if (cachedResponse) return cachedResponse;

      /* Not in cache yet — try network */
      return fetch(event.request).catch(function() {
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_URL);
        return new Response('', { status: 503 });
      });
    })
  );
});

/* ── PUSH NOTIFICATIONS ── */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  self.registration.showNotification(data.title || 'EthioMetric', {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  });
});
