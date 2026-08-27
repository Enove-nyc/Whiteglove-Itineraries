"use client";

import { useSyncExternalStore } from "react";
import { brandForHost, configuredBrand, type SiteBrand } from "@/lib/site-brand-core";

/**
 * Which of the two sites this browser is on.
 *
 * WHY A HOOK AND NOT ANOTHER EFFECT. Four components had written the same six
 * lines by hand — a `useState(false)` and a `useEffect` that corrects it after
 * mount — and that shape is a synchronous setState inside an effect, which
 * React 19's lint rule refuses and is right to: it is an extra render pass on
 * every mount to learn something that never changes.
 *
 * A HOSTNAME IS AN EXTERNAL STORE THAT NEVER CHANGES, which is exactly what
 * useSyncExternalStore is for. Subscribing is a no-op because nothing will ever
 * fire — the address bar cannot change brand without a navigation — and the
 * server snapshot is the build's own brand, so the first paint is already
 * right on both deployments rather than starting kosher and correcting itself.
 *
 * The hostname is still what the client reads, because one build can be served
 * on a preview host or behind a proxy that rewrites the Host — see
 * brandForHost.
 */

const subscribe = () => () => {};

function onThisHost(): SiteBrand {
  return brandForHost(window.location.hostname);
}

function onThisBuild(): SiteBrand {
  return configuredBrand() ?? "kosher";
}

export function useSiteBrand(): SiteBrand {
  return useSyncExternalStore(subscribe, onThisHost, onThisBuild);
}

/** The common question, asked the way the call sites ask it. */
export function useIsItineraries(): boolean {
  return useSiteBrand() === "itineraries";
}
