const APP_CACHE = "norway-planner-app-v2";
const RUNTIME_CACHE = "norway-planner-runtime-v1";
const TILE_CACHE = "norway-planner-tiles-v1";
const ROUTE_CACHE = "norway-planner-routes-v1";
const BASE_PATH = new URL(self.registration.scope).pathname;
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icon.svg`,
  `${BASE_PATH}images/city.svg`,
  `${BASE_PATH}images/coast.svg`,
  `${BASE_PATH}images/fjord.svg`,
  `${BASE_PATH}images/hike.svg`,
  `${BASE_PATH}images/scenic-road.svg`,
  `${BASE_PATH}images/stave-church.svg`,
  `${BASE_PATH}images/waterfall.svg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_CACHE, RUNTIME_CACHE, TILE_CACHE, ROUTE_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;

  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      Promise.allSettled(
        event.data.urls.map((url) =>
          cache.add(url).catch(() => {
            // Best-effort warm cache; one failed asset should not break offline readiness.
          }),
        ),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, APP_CACHE, `${BASE_PATH}index.html`));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(cacheFirst(request, TILE_CACHE, 260));
    return;
  }

  if (url.hostname === "router.project-osrm.org") {
    event.respondWith(networkFirst(request, ROUTE_CACHE));
  }
});

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (maxEntries) await trimCache(cacheName, maxEntries);
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) return cache.match(fallbackUrl);
    throw new Error("Offline and no cached response available");
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await cache.delete(keys[0]);
  await trimCache(cacheName, maxEntries);
}
