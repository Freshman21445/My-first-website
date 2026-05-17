const CACHE_NAME = 'ethiometric-v1';

// Files to cache for offline use
const FILES_TO_CACHE = [
  '/',
  '/index%20(5).html',
  '/exam%20(4).html',
  '/manifest.json'
];

// Install event – cache the files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  // Force the waiting service worker to become active
  self.skipWaiting();
});

// Fetch event – serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        // Otherwise fetch from network
        return fetch(event.request).catch(() => {
          // Optional: return a custom offline page
          return caches.match('/index%20(5).html');
        });
      })
  );
});

// Activate event – clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});
