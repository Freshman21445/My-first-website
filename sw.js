/* ============================================================
   EthioMetric Service Worker — sw.js
   ============================================================
   Strategy:
   - index.html  → Network-First (always fetch fresh, fall back to cache)
   - Firebase    → Always network, never cached
   - Assets      → Cache-First with background update
   - SKIP_WAITING supported so checkAndUpdate() works from the app
   ============================================================ */

const CACHE_NAME = 'ethiometric-v' + Date.now();
const OFFLINE_URL = '/My-first-website/index.html';

const PRE_CACHE = [
  '/My-first-website/index.html',
  '/My-first-website/manifest.json'
];

/* ── INSTALL ── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRE_CACHE);
    }).then(function() {
      console.log('[SW] Install complete');
      /* Do NOT call self.skipWaiting() here — let activate handle it
         only after the app explicitly asks via SKIP_WAITING message    */
    })
  );
});

/* ── ACTIVATE: wipe all old caches ── */
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

/* ── MESSAGE: handle SKIP_WAITING from checkAndUpdate() ── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received — activating new SW now');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_FIREBASE') {
    /* no-op: Firebase SDK files are not cached intentionally */
  }
});

/* ── FETCH ── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  /* Skip non-GET */
  if (event.request.method !== 'GET') return;

  /* ── Firebase / Google APIs — always network, never cache ── */
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase.googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'offline', message: 'No internet connection' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  /* ── index.html — NETWORK-FIRST ──
     Always fetch the latest version from the server.
     Only fall back to cache when offline.
     This is what makes the update banner reach PWA users.        */
  if (url.includes('/My-first-website/index.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          /* Update the cache with the fresh copy */
          var clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      }).catch(function() {
        /* Offline — serve cached version */
        console.log('[SW] Offline — serving cached index.html');
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  /* ── Unsplash images — Cache-First ── */
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
          return new Response('', { status: 200 });
        });
      })
    );
    return;
  }

  /* ── Everything else — Cache-First with background update ── */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      /* Background update — refresh cache silently */
      var networkFetch = fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(function() { return null; });

      if (cachedResponse) {
        return cachedResponse; /* serve from cache while updating in background */
      }

      /* Not cached — wait for network */
      return networkFetch.then(function(response) {
        if (response) return response;
        /* Total failure — offline fallback */
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
