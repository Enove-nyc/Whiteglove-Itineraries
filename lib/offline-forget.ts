import { forgetAllOffline } from "@/lib/offline-trip-store";

/**
 * Emptying everything the ending session left on this device.
 *
 * ONE FUNCTION, BECAUSE THIS IS THE FAILURE THAT MATTERS. The trip companion
 * app keeps a trip on the device so it opens at a gate with no signal — the
 * itinerary in the service worker's navigation cache, and the wallet's boarding
 * passes and documents in IndexedDB. All of that is fine while it is somebody's
 * own phone and they are signed in. Any of it left behind after they sign out —
 * on a borrowed laptop, a hotel business centre, a shared family iPad — is the
 * one way this hurts somebody, and it is not a thing to leave anybody to
 * remember.
 *
 * So every sign-out calls this. It clears three things:
 *   1. the on-device database (saved trips, wallet document bytes, cached chat)
 *      — deleted outright by forgetAllOffline();
 *   2. the private pages the service worker's navigation cache picked up on its
 *      own — a rendered itinerary carries flight numbers, a hotel and the
 *      client's name — swept by path, both by asking the worker (the tidy path)
 *      and directly here (the one that still works when the worker is asleep,
 *      unregistered or mid-update).
 *
 * Best effort by design: a browser with no service worker, or one that refuses
 * the cache or IndexedDB APIs, must not turn signing out into an error. There is
 * nothing to clear in that case anyway, because there was nothing to save it
 * with.
 */
export async function forgetOfflineData(): Promise<void> {
  // The on-device database first — it holds the boarding-pass bytes, and it
  // does not depend on a worker being awake.
  await forgetAllOffline();

  try {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.active?.postMessage({ type: "wg-offline-forget" });
    }
    if (!("caches" in window)) return;
    await sweepPrivatePages();
  } catch {
    // Signing out must succeed regardless.
  }
}

/**
 * The prefixes the worker sweeps, kept here as well.
 *
 * Two copies of one list is normally a mistake. Here it is the point: the worker
 * cannot be relied on to be awake at the moment somebody signs out, and this is
 * a page that is definitely running. Kept identical to PRIVATE_PREFIXES in
 * public/sw.js.
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

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Delete every cached page belonging to the session that has just ended, across
 * every app-shell cache whatever its version — the worker bumps its cache name
 * on its own release schedule, so a page that opened one pinned version would
 * sweep an empty cache the morning after a deploy while the rendered itinerary
 * sat in the new one. The public site and the /offline shell stay cached.
 */
async function sweepPrivatePages(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => isPrivatePath(new URL(request.url).pathname))
          .map((request) => cache.delete(request)),
      );
    }),
  );
}
