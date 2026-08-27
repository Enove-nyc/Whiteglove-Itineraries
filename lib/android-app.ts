/**
 * Detecting a request that comes from the Android app.
 *
 * The app is a Trusted Web Activity wrapping this site. Its WebView tags every
 * request with the app's package name in `X-Requested-With`, and the launch
 * navigation additionally carries an `android-app://<package>` referrer. Either
 * one identifies the app; an ordinary browser sends neither.
 *
 * The package is registered in public/.well-known/assetlinks.json — keep the two
 * in step.
 */
/**
 * Both TWAs that wrap this domain: the traveller app and the Advisor app. They
 * are separate Play listings with separate package names, and BOTH launch on the
 * bare domain and want the planner app — so both must be recognised here.
 * (Recognising only the traveller package is why the Advisor app opened on the
 * marketing home page.) Both are registered in
 * public/.well-known/assetlinks.json — keep the lists in step.
 */
export const ANDROID_APP_PACKAGES = [
  "com.whitegloveitineraries.app",
  "com.whitegloveadvisor.app",
] as const;

/** The traveller package, kept as a named export for callers/tests. */
export const ANDROID_APP_PACKAGE = ANDROID_APP_PACKAGES[0];

/**
 * True when these request headers belong to one of the Android apps' WebViews.
 *
 * Takes a plain accessor rather than a Headers object so it is trivial to test
 * and works against any header source (Fetch Headers, NextRequest.headers).
 *
 * Best-effort on the server: current Chrome no longer sends X-Requested-With,
 * and the android-app:// referrer only rides the launch navigation. The reliable
 * catch is the client-side standalone check on the home page
 * (components/StandaloneAppRedirect.tsx), which needs no header at all.
 */
export function isAndroidAppHeaders(get: (name: string) => string | null): boolean {
  const requestedWith = get("x-requested-with")?.trim();
  if (requestedWith && (ANDROID_APP_PACKAGES as readonly string[]).includes(requestedWith)) {
    return true;
  }
  const referer = get("referer")?.trim() ?? "";
  return ANDROID_APP_PACKAGES.some((pkg) => referer.startsWith(`android-app://${pkg}`));
}
