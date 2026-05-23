/* ============================================================
   EthioMetric Service Worker — sw.js
   ============================================================ */

const CACHE_NAME = 'ethiometric-v1000';
const OFFLINE_URL = '/index.html';        // ✅ Fixed: no subfolder prefix

const PRE_CACHE = [
  '/index.html',                          // ✅ Fixed
  '/manifest.json'                        // ✅ Fixed
];

const MAX_CACHE_ENTRIES = 60;             // ✅ New: prevents unbounded growth

/* ── INSTALL ── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRE_CACHE);
    }).then(function() {
      console.log('[SW] Install complete');
    })
  );
});

/* ── ACTIVATE ── */
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

/* ── MESSAGE ── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received');
    self.skipWaiting();
  }
});

/* ── helper: trim cache to MAX_CACHE_ENTRIES ── */    // ✅ New
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

  /* Firebase / Google APIs — always network */
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase.googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
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

  /* index.html — Network-First */
  if (url.includes('/index.html') || event.request.mode === 'navigate') {  // ✅ Fixed
    event.respondWith(
      fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      }).catch(function() {
        console.log('[SW] Offline — serving cached index.html');
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  /* External images (placeholder, unsplash) — Cache-First */
  if (url.includes('placeholder.com') || url.includes('unsplash.com')) {  // ✅ Added placeholder
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        }).catch(function() {
          return new Response('', { status: 200 });
        });
      })
    );
    return;
  }

  /* Everything else — Cache-First with background update */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      var networkFetch = fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, networkResponse.clone());
            trimCache(CACHE_NAME, MAX_CACHE_ENTRIES);  // ✅ Trim after each write
          });
        }
        return networkResponse;
      }).catch(function() { return null; });

      if (cachedResponse) return cachedResponse;

      return networkFetch.then(function(response) {
        if (response) return response;
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        return new Response('Offline', { status: 503 });
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
    icon: '/icons/icon-192.png',   // ✅ Make sure this path exists in your project
    badge: '/icons/icon-192.png'
  });
});
