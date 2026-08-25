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
export const ANDROID_APP_PACKAGE = "com.whitegloveitineraries.app";

/**
 * True when these request headers belong to the Android app's WebView.
 *
 * Takes a plain accessor rather than a Headers object so it is trivial to test
 * and works against any header source (Fetch Headers, NextRequest.headers).
 */
export function isAndroidAppHeaders(get: (name: string) => string | null): boolean {
  if (get("x-requested-with")?.trim() === ANDROID_APP_PACKAGE) {
    return true;
  }
  const referer = get("referer")?.trim() ?? "";
  return referer.startsWith(`android-app://${ANDROID_APP_PACKAGE}`);
}
