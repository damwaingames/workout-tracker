/* Service worker — offline app shell cache.
 * CACHE carries the app's semver (see APP_VERSION in constants.js) — keep the two
 * in lockstep. Bumping it on each release busts the old cache on the next activate,
 * so phones pick up the new index.html / styles.css / JS modules on next launch. */
const CACHE = "workout-tracker-v1.11.0";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  // The app is ES modules now — every module the browser fetches must be cached
  // or an offline launch serves a stale/incomplete shell (entry first, then deps).
  "./main.js",
  "./events.js",
  "./render.js",
  "./state.js",
  "./helpers.js",
  "./constants.js",
  "./off.js",
  "./scan.js",
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
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match("./index.html"))
    )
  );
});
