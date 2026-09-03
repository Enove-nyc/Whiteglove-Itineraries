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
const CACHE = "wg-cache-v7";

/**
 * The day's documents, kept on purpose.
 *
 * SEPARATE FROM EVERYTHING ELSE, AND NEVER FILLED BY ACCIDENT. A boarding pass
 * carries a full name and a booking reference; the route that serves one says
 * `private, no-store` and means it, and nothing here changes that for the
 * ordinary case. This cache is written ONLY when a traveller has explicitly
 * asked for their documents to be available without signal — see the
 * wg-offline-keep message below and components/OfflineDocuments.tsx for the
 * words they agree to.
 *
 * It is its own cache so it can be emptied on its own: turning the offer off,
 * or signing out, deletes exactly this and nothing else.
 */
const OFFLINE_DOCS = "wg-offline-docs-v1";
const ATTACHMENTS = "/api/account/attachments";
const PRECACHE = ["/", "/offline", "/icon-192.png", "/icon-512.png"];

/**
 * Pages that belong to one signed-in person, and must not outlive their session.
 *
 * Every successful navigation is cached by networkFirst below — which is what
 * makes a trip readable at a gate with no signal — and also meant a rendered
 * itinerary, carrying its flight numbers, hotel and the client's name, stayed
 * on the device after they signed out. Nothing deliberate put it there:
 * visiting the page was enough.
 *
 * These prefixes are swept on sign-out (see forgetPrivate + the wg-offline-forget
 * message). Public pages are left alone — a cached destination guide is nobody's
 * business but the site's, and clearing the whole cache would take the offline
 * shell (/offline) with it.
 */
const PRIVATE_PREFIXES = [
  "/command-center",
  "/itinerary",
  "/my-route",
  "/account",
  "/advisor",
  "/clients",
  "/commissions",
  "/library",
  "/forms",
  "/form/",
  "/pipeline",
  "/payments",
  "/pay/",
  "/proposal",
  "/group",
  "/app",
  "/i/",
  "/f/",
  "/p/",
  "/t/",
  "/r/",
];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Deleting every other cache clears any stale app code a browser is holding.
    caches
      .keys()
      // Everything EXCEPT the current cache and the documents a traveller asked
      // to keep. Sweeping that one away on a routine release would empty their
      // passes the morning of a flight, which is the one moment this exists for.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== OFFLINE_DOCS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first: use the network when we can, fall back to the cache offline.
//
// `cache: "reload"` is the crucial part, not a detail — and it is stronger than
// the `no-cache` this used to use. The app's JS under /_next/static keeps
// STABLE filenames across releases but is served `Cache-Control: immutable,
// max-age=1y`. `immutable` tells the browser never even to REVALIDATE for a
// year, so an already-cached chunk is frozen: `no-cache` asks it to revalidate,
// which an aggressive HTTP cache can still answer from its own frozen copy.
// `reload` bypasses the HTTP cache for the request outright and repopulates it,
// which is what actually forces a new deploy's code into an already-installed
// app. (The proper server-side fix — not serving a stable filename as immutable
// — rides in next.config alongside this; this is the belt to that suspenders,
// and the only half that can un-freeze a copy already cached as immutable.)
function networkFirst(req) {
  // A navigation Request cannot be rebuilt through `new Request(req, init)`
  // (the constructor rejects a navigate-mode request with a non-empty init),
  // so those reload by URL; everything else keeps the original request but
  // with the cache mode overridden.
  const fresh =
    req.mode === "navigate"
      ? fetch(req.url, { cache: "reload", credentials: "same-origin" })
      : fetch(new Request(req, { cache: "reload" }));
  return fresh
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("/offline") : undefined)));
}

/**
 * Put the trip's documents in the offline cache, on request.
 *
 * Fetched with credentials, because the route answers only to the account that
 * uploaded the file — an unauthenticated fetch would cache a 401 and hand it
 * back at the airport as though it were the pass. Only a real 200 is stored.
 */
async function keepDocuments(urls, pages) {
  const cache = await caches.open(OFFLINE_DOCS);
  let kept = 0;
  for (const url of urls || []) {
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      if (response && response.ok) {
        await cache.put(url, response.clone());
        kept += 1;
      }
    } catch {
      // One unreachable file must not abandon the rest.
    }
  }

  // The page that lists them, too — otherwise the files are on the device and
  // there is no way to reach them. Kept in the SAME cache as the documents, so
  // "remove them" and signing out take the itinerary with the passes rather
  // than leaving half of it behind. Its own failure is not counted against
  // `kept`, which is about the documents somebody asked for.
  for (const page of pages || []) {
    try {
      const response = await fetch(page, { credentials: "include", cache: "no-store" });
      if (response && response.ok) await cache.put(page, response.clone());
    } catch {
      // The page is already cached by ordinary navigation in most cases.
    }
  }

  return { kept, asked: (urls || []).length };
}

/**
 * Sweep every cached page belonging to the session that has just ended.
 *
 * Across every app-shell cache, whatever its version — this worker bumps its
 * cache name on its own release schedule, so a sweep pinned to one name would
 * miss a rendered itinerary sitting in the current one. The private pages are
 * the only ones removed; the public site and the /offline shell stay cached.
 */
async function forgetPrivate() {
  // The documents somebody chose to keep go wholesale — this cache holds
  // nothing else, so there is nothing to sift.
  await caches.delete(OFFLINE_DOCS);
  try {
    const names = await caches.keys();
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        await Promise.all(
          requests.filter((req) => isPrivatePath(new URL(req.url).pathname)).map((req) => cache.delete(req)),
        );
      }),
    );
  } catch {
    // A browser that will not open the cache has nothing in it to leak.
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  // Signing out. The private navigation cache holds a rendered itinerary with
  // its flight numbers, hotel and client's name; leaving it on a borrowed or
  // shared computer after sign-out is the whole risk. The page also sweeps and
  // deletes the offline database directly — this is the tidy path for when the
  // worker is awake.
  if (data.type === "wg-offline-keep") {
    event.waitUntil(
      keepDocuments(data.urls, data.pages).then(
        (result) => reply({ ok: true, ...result }),
        () => reply({ ok: false }),
      ),
    );
    return;
  }

  if (data.type === "wg-offline-forget") {
    const reply = (payload) => {
      const port = event.ports && event.ports[0];
      if (port) port.postMessage(payload);
    };
    event.waitUntil(forgetPrivate().then(() => reply({ ok: true }), () => reply({ ok: false })));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave partner/API/cross-origin alone

  /**
   * The one API path with an offline answer — and only ever as a fallback.
   *
   * BEFORE the /api/ bail-out below, which would otherwise return first and
   * leave this branch dead. The network is always tried first and its response
   * is never written here; this cache is filled only by wg-offline-keep above.
   * So a traveller who never asked for offline documents gets exactly the
   * behaviour they had before: the request goes out, and if there is no signal
   * it fails.
   */
  if (url.pathname === ATTACHMENTS) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.open(OFFLINE_DOCS).then((c) => c.match(req));
        return (
          cached ||
          new Response("This document was not kept for offline use.", {
            status: 504,
            headers: { "content-type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/access")) return;

  // Pages and app code: always prefer the network so a new release takes effect
  // immediately. Matched by PATH as well as request destination — in a
  // WebView a dynamically-imported chunk or a preload can arrive with an empty
  // `destination`, so keying only on `=== "script"` let exactly the frozen
  // /_next/static chunks slip through to the immutable HTTP cache. The path
  // check closes that.
  if (
    req.mode === "navigate" ||
    req.destination === "script" ||
    req.destination === "style" ||
    url.pathname.startsWith("/_next/static/")
  ) {
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
