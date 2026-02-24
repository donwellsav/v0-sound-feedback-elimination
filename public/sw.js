const CACHE_NAME = "feedbackkiller-v1";

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  "/",
  "/icons/icon-192x192.jpg",
  "/icons/icon-512x512.jpg",
  "/manifest.json",
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Claim clients immediately
  self.clients.claim();
});

// Fetch: network-first with cache fallback
// This ensures users get the latest version when online,
// but the app still works fully offline
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith("http")) return;

  // Skip analytics and external API calls
  if (
    request.url.includes("vitals.vercel-insights.com") ||
    request.url.includes("va.vercel-scripts.com")
  ) {
    return;
  }

  event.respondWith(
    // Try network first
    fetch(request)
      .then((response) => {
        // If valid response, clone and cache it
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return the cached index page
          if (request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable",
          });
        });
      })
  );
});
