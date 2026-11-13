/* WriteLater service worker.
 *
 * Source template: artifacts/writelater/sw/service-worker.js. The build
 * (sw/plugin.ts) replaces __VERSION__ and __PRECACHE__ and emits /sw.js.
 *
 * Strategy:
 * - Install precaches the whole app shell (HTML, hashed JS/CSS, icons) into a
 *   versioned cache. The new worker then WAITS: an open tab never mixes code
 *   from two versions. The page shows "Reload to update" and posts
 *   SKIP_WAITING when the person chooses to.
 * - Navigations are served the cached index.html (cache-first), so the app
 *   opens offline and instantly. New versions arrive through the update flow.
 * - Same-origin assets: precache first, then network.
 * - Google Fonts: stale-while-revalidate in a small runtime cache.
 * - Writing never passes through here: it lives in IndexedDB.
 */

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `writelater-shell-${VERSION}`;
const FONT_CACHE = "writelater-fonts-v1";
const SCOPE = self.registration.scope;
const INDEX_URL = new URL("index.html", SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, SCOPE).href))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("writelater-shell-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(INDEX_URL, { cacheName: SHELL_CACHE, ignoreVary: true });
        return cached || fetch(request);
      })(),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        // ignoreVary: servers may send "Vary: Origin", and module scripts are
        // requested with an Origin header the precache request didn't have.
        const cached = await caches.match(request, {
          cacheName: SHELL_CACHE,
          ignoreSearch: true,
          ignoreVary: true,
        });
        return cached || fetch(request);
      })(),
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
