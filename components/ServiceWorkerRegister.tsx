"use client";

import { useEffect } from "react";

// Registers the service worker so the site is installable and works offline.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // When a newly installed worker takes control — sw.js calls skipWaiting on
    // install and clients.claim on activate — reload once so the page is drawn
    // by the NEW worker instead of left as whatever the old one put up. This is
    // what lets a device stuck on an old worker (e.g. one showing a stale
    // offline shell) heal itself the moment the fix reaches it, with nobody
    // clearing site data by hand. Guarded so it fires at most once per load, so
    // a claim can never turn into a reload loop.
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      // Force an update check on every load rather than waiting for the
      // browser's own schedule, so a shipped fix is picked up on the next visit.
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => undefined);

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}
