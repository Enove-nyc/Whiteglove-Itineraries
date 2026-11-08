"use client";

import { useEffect } from "react";

// Registers the service worker so the site is installable and works offline.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // A replacement worker must reload an already-controlled page to replace
    // stale cached code. The first installation has no old code to replace:
    // reloading then can interrupt the first tap, a draft or a wallet upload.
    let hadController = navigator.serviceWorker.controller !== null;
    let refreshing = false;
    const onControllerChange = () => {
      const replacingController = hadController;
      hadController = navigator.serviceWorker.controller !== null;
      // Joining has already removed its private fragment; a reload loses it.
      if (!replacingController || refreshing || /^\/join(?:\/|$)/.test(window.location.pathname)) return;
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

