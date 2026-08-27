"use client";

import { useEffect } from "react";

/**
 * Land the installed apps on the planner app, not the marketing home page.
 *
 * The itineraries Android apps — the traveller app and the Advisor app — are
 * Trusted Web Activities whose launch URL, baked into the published binary, is
 * the bare domain. The owner wants them to open on /app. The server-side
 * middleware redirect depends on an X-Requested-With header that current Chrome
 * no longer sends (and never knew the Advisor package), so it quietly stopped
 * firing and the apps opened on the home page — website header, website footer,
 * no planner tab bar.
 *
 * This catches it on the client, where "running as an installed app" is visible
 * without any header: display-mode standalone (every TWA and installed PWA), the
 * iOS navigator.standalone flag, or an android-app:// referrer on the launch
 * navigation. An ordinary browser tab at "/" matches none of them and is left on
 * the home page untouched. Rendered only on the itineraries home page, so the
 * pathname is "/" by construction; the guard is belt-and-suspenders against a
 * redirect loop.
 *
 * The clean permanent fix is a rebuilt binary whose launch URL is /app — then
 * there is no home-page paint to redirect away from. Until then, this is the
 * reliable catch.
 */
export default function StandaloneAppRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const installed =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      nav.standalone === true ||
      document.referrer.startsWith("android-app://");
    if (installed) window.location.replace("/app");
  }, []);
  return null;
}
