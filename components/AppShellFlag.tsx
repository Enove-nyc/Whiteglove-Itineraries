"use client";

import { useEffect } from "react";

/**
 * Mark the document as running inside the installed app.
 *
 * The website footer, the corner launcher and other website-only chrome have no
 * place in the app — it has its own navigation, and the footer in particular is
 * the marketing surface for the site, not something an app should show. The
 * CSS hides `footer#contact` under `@media (display-mode: standalone)` on its
 * own, with no flash, for every TWA and installed PWA. This adds
 * `data-app-shell` to <html> for the two cases that media query misses: an iOS
 * installed PWA (which reports `navigator.standalone`, not always the media
 * query) and the android-app:// launch referrer. Same signal set as
 * StandaloneAppRedirect, so the two stay in step.
 *
 * An ordinary browser tab matches none of these and the attribute is never set,
 * so the website keeps its footer.
 */
export default function AppShellFlag() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const installed =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      nav.standalone === true ||
      document.referrer.startsWith("android-app://");
    if (installed) document.documentElement.setAttribute("data-app-shell", "1");
  }, []);
  return null;
}
