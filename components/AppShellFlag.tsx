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
 * `data-app-shell` to <html> for the cases that media query misses:
 *
 *  - the native Capacitor shells (the traveller and advisor apps, migrated off
 *    TWA), which load the remote site through `server.url` and inject the
 *    `window.Capacitor` bridge but do NOT report display-mode standalone — so
 *    without this the footer would still show inside the actual app;
 *  - an iOS installed PWA, which reports `navigator.standalone`;
 *  - the android-app:// launch referrer (the remaining TWA case).
 *
 * The last three are the same signal set as StandaloneAppRedirect, kept in step.
 * An ordinary browser tab matches none of these and the attribute is never set,
 * so the website keeps its footer.
 */
export default function AppShellFlag() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    // Capacitor native shell — the bridge is injected whether it loads bundled
    // assets or (as our apps do) a remote URL, so its presence is a reliable
    // "running inside the app" even though a Capacitor WebView does not report
    // display-mode standalone.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const inCapacitor = cap != null && (cap.isNativePlatform?.() ?? true);
    const inApp =
      inCapacitor ||
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      nav.standalone === true ||
      document.referrer.startsWith("android-app://");
    if (!inApp) return;
    document.documentElement.setAttribute("data-app-shell", "1");

    /**
     * AND THE SAFE AREAS BECOME REAL NUMBERS.
     *
     * `env(safe-area-inset-*)` is ZERO unless the viewport is declared
     * `viewport-fit=cover` — that is in the spec, not a browser quirk. So every
     * inset already written into this site was writing nothing. And with
     * Android 15 forcing apps edge to edge, the web view now draws behind the
     * status bar, which put the header under the clock.
     *
     * Set HERE rather than in the viewport export, so it applies inside the app
     * and nowhere else. On the open website `cover` would also put a page under
     * an iPhone's notch in landscape, where every gutter is 20px and the inset
     * is 44 — a regression on the website to fix something only the app has.
     */
    const meta = document.querySelector('meta[name="viewport"]');
    const content = meta?.getAttribute("content");
    if (meta && content && !/viewport-fit/.test(content)) {
      meta.setAttribute("content", `${content}, viewport-fit=cover`);
    }
  }, []);
  return null;
}
