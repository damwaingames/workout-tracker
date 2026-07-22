/* Service worker — offline app shell cache, NETWORK-FIRST.
 * CACHE carries the app's semver (see APP_VERSION in constants.js) — keep the two in lockstep; the
 * activate handler still sweeps older caches. The fetch handler is network-first: a launch with any
 * connectivity always fetches the live app shell (so a new deploy shows up immediately, no waiting on
 * the service-worker update cycle), refreshing the cache with what it gets; the cache is the OFFLINE
 * fallback, not the primary source. This replaced a cache-first handler that served the last-cached
 * shell until the SW fully cycled — which could strand a device on an old version (v5.8.1). */
const CACHE = "workout-tracker-v5.8.1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  // The app is ES modules now — every module the browser fetches must be cached
  // or an offline launch serves a stale/incomplete shell (entry first, then deps).
  "./main.js",
  "./events.js",
  "./io.js",
  "./render.js",
  "./compose.js",
  "./state.js",
  "./migrate.js",
  "./helpers.js",
  "./constants.js",
  "./drive.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Cache the app shell only — let every cross-origin request (Google Drive auth + API) pass straight
  // to the network untouched. Without this guard the cache writes below would pollute the cache with
  // API responses, and a failed Drive call would fall back to index.html instead of erroring. (ADR-0006.)
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Network-first: fetch the live asset, refresh the cache with a successful (ok) response, and serve
  // it — so every online launch is current. Only when the network is unreachable do we fall back to
  // the cache, then to index.html for a navigation, so the app still opens offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
