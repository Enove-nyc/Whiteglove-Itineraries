// White Glove service worker. Provides installability + basic offline
// resilience.
//
// IMPORTANT: this build emits stable (non content-hashed) filenames for the
// app's JavaScript under /_next/static. Serving those cache-first meant a
// browser kept running the first copy of the app it ever cached, so new
// releases never reached people even though the server had them. Code and
// styles are therefore network-first: the newest version always wins when
// online, and the cache is only a fallback when offline. Only truly static
// media (images, fonts) is cache-first.
const CACHE = "wg-cache-v3";
const PRECACHE = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Deleting every other cache clears any stale app code a browser is holding.
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first: use the network when we can, fall back to the cache offline.
//
// `cache: "no-cache"` is the crucial part, not a detail. The app's JS under
// /_next/static keeps STABLE filenames across releases but is served
// `Cache-Control: immutable, max-age=1y`, so a plain fetch() is answered from
// the browser's own HTTP cache — the same frozen copy — and the network is
// never really reached. New releases then never arrive, however "network-first"
// this looks. `no-cache` forces a revalidation against the server (a cheap 304
// when nothing changed, the new file when it did), which is what actually lets
// a deploy reach an already-open app.
function networkFirst(req) {
  // A navigation Request cannot be rebuilt through `new Request(req, init)`
  // (the constructor rejects a navigate-mode request with a non-empty init),
  // so those revalidate by URL; everything else keeps the original request but
  // with the cache mode overridden.
  const fresh =
    req.mode === "navigate"
      ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
      : fetch(new Request(req, { cache: "no-cache" }));
  return fresh
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("/") : undefined)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave partner/API/cross-origin alone
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/access")) return;

  // Pages and app code (scripts, styles): always prefer the network so a new
  // release takes effect immediately.
  if (req.mode === "navigate" || req.destination === "script" || req.destination === "style") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Images and fonts don't change behaviour — cache-first is safe here.
  if (req.destination === "image" || req.destination === "font") {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached),
      ),
    );
  }
});

// A flight delay, a cancellation, a gate change — see lib/push-notify.ts for
// what actually sends this and data/trip-alerts.ts for what earns one.
// Never shown for anything the traveler did not ask to be told about: the
// subscription this arrives on only exists because they turned it on inside
// their own trip's app.
self.addEventListener("push", (event) => {
  let payload = { title: "Your trip", body: "Something changed on your trip." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // A payload that doesn't parse as JSON is not a reason to show nothing.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

// Focus an already-open tab on the trip rather than always opening a new
// one — a traveler who taps a second delay notification should land back
// where they were, not accumulate tabs.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
