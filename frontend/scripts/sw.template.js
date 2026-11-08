/* Generated for each production build. Never cache API responses, session cookies, or uploads. */
const SHELL_CACHE = "culinary-app-__VERSION__";
const SHELL_PREFIX = "culinary-app-";
const PHOTO_CACHE = "culinary-downloaded-recipe-images-v1";
const SHELL_URLS = __PRECACHE_ASSETS__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(SHELL_PREFIX) && name !== SHELL_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never store or replay authenticated API requests. Offline data comes from IndexedDB.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/index.html")) || Response.error()));
    return;
  }
  if (request.destination === "image") {
    event.respondWith((async () => {
      const downloaded = await caches.open(PHOTO_CACHE);
      return (await downloaded.match(request.url)) || fetch(request);
    })());
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return fetch(request); // Never runtime-cache unknown paths or data.
    })());
  }
});
