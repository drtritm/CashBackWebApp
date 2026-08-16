/* Bump APP_VERSION here and in app.js + version.json together on every release. */
const APP_VERSION = "1.6.1";
const CACHE_NAME = "cashback-tracker-v" + APP_VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./mcc.js",
  "./banks.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // version.json is the update signal — it must never come from cache.
  if (url.pathname.endsWith("version.json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } }))
    );
    return;
  }

  // Network-first so a redeploy is picked up, with cache as the offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html")))
  );
});
