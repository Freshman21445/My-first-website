/* ============================================================
   EthioMetric Service Worker — sw.js
   Strategy: Cache-First for assets, Network-First for Firebase
   ============================================================ */

const CACHE_NAME = 'ethiometric-v1';
const OFFLINE_URL = '/My-first-website/index.html';
/* Files to cache immediately on install */
const PRE_CACHE = [
  '/My-first-website/index.html',
  '/My-first-website/manifest.json'
];

/* ── INSTALL: pre-cache core files ── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing EthioMetric Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching core files');
      return cache.addAll(PRE_CACHE);
    }).then(function() {
      console.log('[SW] Install complete');
      return self.skipWaiting(); // activate immediately
    })
  );
});

/* ── ACTIVATE: clean up old caches ── */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      console.log('[SW] Activated — claiming clients');
      return self.clients.claim();
    })
  );
});

/* ── FETCH: smart caching strategy ── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  /* Skip non-GET requests */
  if (event.request.method !== 'GET') return;

  /* Skip Firebase / Firestore / Auth — always need network */
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase.googleapis.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(function() {
        /* Firebase offline — return a JSON error so app can handle it */
        return new Response(
          JSON.stringify({ error: 'offline', message: 'No internet connection' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  /* Unsplash background image — cache when first loaded */
  if (url.includes('unsplash.com') || url.includes('images.unsplash')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          /* Offline & not cached — return nothing (CSS fallback color shows) */
          return new Response('', { status: 200 });
        });
      })
    );
    return;
  }

  /* ── MAIN STRATEGY: Cache-First, fall back to network, fall back to offline page ── */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        /* Serve from cache, update cache in background */
        fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(function() {});
        return cachedResponse;
      }

      /* Not in cache — try network */
      return fetch(event.request).then(function(networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        /* Save to cache for future offline use */
        var responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(function() {
  /* Network failed — serve offline fallback page */
  if (event.request.mode === 'navigate') {
    return caches.match(OFFLINE_URL);
  }
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
});
    })
  );
});

/* ── PUSH NOTIFICATIONS (future use) ── */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  self.registration.showNotification(data.title || 'EthioMetric', {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  });
});
